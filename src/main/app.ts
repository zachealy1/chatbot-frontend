import * as path from 'path';

import { HTTPError } from './HttpError';
import { AppInsights } from './modules/appinsights';
import { Helmet } from './modules/helmet';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import { glob } from 'glob';
import i18n from 'i18n';
import passport from 'passport';
import favicon from 'serve-favicon';
import { CookieJar } from 'tough-cookie';

require('../../config/passport');

const { setupDev } = require('./development');

const { Logger } = require('@hmcts/nodejs-logging');

const env = process.env.NODE_ENV || 'development';
const developmentMode = env === 'development';
const logger = Logger.getLogger('app');

export const app = express();

// Store environment in locals so you can detect dev vs. production
app.locals.ENV = env;

new PropertiesVolume().enableFor(app);
new AppInsights().enable();
new Nunjucks(developmentMode).enableFor(app);
new Helmet(developmentMode).enableFor(app);

app.use(favicon(path.join(__dirname, '/public/assets/images/favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());


i18n.configure({
  locales:        ['en', 'cy'],
  directory:      path.join(__dirname, 'locales'),
  defaultLocale:  'en',
  cookie:         'lang',
  queryParameter: 'lang',
});
app.use(i18n.init);

// 3) only write the cookie when it really changes
app.use((req, res, next) => {
  // pick up from ?lang or existing cookie
  const requestedLang = (req.query.lang as string) || req.cookies.lang;

  // if it’s one of our supported locales, switch to it
  if (requestedLang && ['en', 'cy'].includes(requestedLang)) {
    // only re-set the cookie if it’s different
    if (req.cookies.lang !== requestedLang) {
      res.cookie('lang', requestedLang, {
        httpOnly: true,
        maxAge:   365 * 24 * 60 * 60 * 1000,
      });
    }
    req.setLocale(requestedLang);
    res.locals.lang = requestedLang;
  } else {
    // nothing in query or cookie→ fallback to defaultLocale
    req.setLocale(i18n.getLocale());
    res.locals.lang = i18n.getLocale();
  }

  // expose translation fn to Nunjucks
  res.locals.__ = req.__.bind(req);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate, no-store');
  next();
});

const session = require('express-session');

app.use(
  session({
    secret: 'your-secret-key',
    resave: false, // Only save the session if it is modified.
    saveUninitialized: false, // Do not create a session until something is stored.
    cookie: {
      httpOnly: true,
      secure: false, // Set to true if using HTTPS.
      path: '/',
      // You may also need to set domain if you're working with subdomains.
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

function ensureAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.isAuthenticated()) {
    return next(); // Proceed to the route
  }
  res.redirect('/login'); // Redirect to login if not authenticated
}

app.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // 1) fetch CSRF token…
    const csrfResponse = await axios.get('http://localhost:4550/csrf', { withCredentials: true });
    const csrfToken = csrfResponse.data.csrfToken;

    // 2) capture the cookie…
    const csrfCookieHeader = csrfResponse.headers['set-cookie'];
    const csrfCookie = Array.isArray(csrfCookieHeader) ? csrfCookieHeader.join('; ') : csrfCookieHeader;

    // 3) send login to Spring…
    const loginResponse = await axios.post(
      'http://localhost:4550/login/chat',
      { username, password },
      {
        withCredentials: true,
        headers: {
          'X-XSRF-TOKEN': csrfToken,
          Cookie: csrfCookie,
        },
      }
    );

    // 4) persist the returned cookie & CSRF token in session…
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const loginCookie = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : setCookieHeader;
    (req.session as any).springSessionCookie = loginCookie;
    (req.session as any).csrfToken = csrfToken;

    // 5) save the session and complete passport login…
    req.session.save(err => {
      if (err) console.error('Error saving session:', err);
      req.login({ username, springSessionCookie: loginCookie, csrfToken }, err => {
        if (err) return next(err);
        return res.redirect('/chat');
      });
    });

  } catch (err: any) {
    console.error('Full login error:', err.response || err.message);

    // Look for a message from the backend, otherwise fall back to our localized string
    const backendMsg = err.response?.data;
    const errorMessage = backendMsg
      ? backendMsg
      : req.__('loginInvalidCredentials');

    return res.render('login', {
      error: errorMessage,
      username: req.body.username
    });
  }
});

app.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      return res.status(500).send('Failed to logout');
    }
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
});

app.post('/forgot-password/enter-email', async (req, res) => {
  // Extract the email from the request body
  const { email } = req.body;
  console.log('[ForgotPassword] Received email:', email);

  // Basic local validation for the email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    console.log('[ForgotPassword] Invalid or missing email:', email);
    return res.render('forgot-password', {
      errors: ['Please enter a valid email address.'],
      email, // so the user doesn't lose what they typed
    });
  }

  try {
    // 1) Create a cookie jar & an axios client with CSRF config
    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // 2) Request the CSRF token from the backend
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token:', csrfToken);

    // 3) Make the POST request to the Spring Boot route
    //    which requires CSRF & possibly does not require authentication
    const response = await client.post(
      'http://localhost:4550/forgot-password/enter-email',
      { email },
      {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      }
    );

    console.log('[ForgotPassword] Forgot-password call succeeded:', response.data);

    // 4) Store the email in session so we can retrieve it when verifying OTP
    (req.session as any).email = email;

    // 5) If successful, redirect to the next step (e.g., OTP entry)
    return res.redirect('/forgot-password/verify-otp');
  } catch (error) {
    console.error('[ForgotPassword] Error during backend forgot-password:', error);

    // If the backend returned a specific error message, extract it
    let errorMsg = 'An error occurred during the forgot-password process. Please try again later.';
    if (error.response && error.response.data) {
      errorMsg = error.response.data;
    }

    // Re-render the forgot-password screen with an error
    return res.render('forgot-password', {
      errors: [errorMsg],
      email,
    });
  }
});

app.post('/forgot-password/reset-password', async (req, res) => {
  const { password, confirmPassword } = req.body;

  console.log('[ForgotPassword] Received new password & confirmPassword:', password, confirmPassword);

  if (password !== confirmPassword) {
    return res.render('reset-password', {
      error: 'Passwords do not match.',
    });
  }

  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordCriteriaRegex.test(password)) {
    return res.render('reset-password', {
      error:
        'Your password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.',
    });
  }

  const email = (req.session as any).email;
  const otp = (req.session as any).verifiedOtp;

  if (!email || !otp) {
    console.log('[ForgotPassword] Missing email or otp in session.');
    return res.render('reset-password', {
      error: 'Cannot reset password without a valid email and OTP. Please start again.',
    });
  }

  try {
    const jar = new CookieJar();

    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    console.log('[ForgotPassword] Requesting CSRF token from /csrf...');
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token for reset-password:', csrfToken);

    console.log('[ForgotPassword] Sending POST /forgot-password/reset-password to backend...');
    const response = await client.post(
      'http://localhost:4550/forgot-password/reset-password',
      {
        email,
        otp,
        password,
        confirmPassword,
      },
      {
        headers: { 'X-XSRF-TOKEN': csrfToken },
      }
    );

    console.log('[ForgotPassword] Password reset call succeeded:', response.data);

    return res.redirect('/login?passwordReset=true');
  } catch (error) {
    console.error('[ForgotPassword] Error calling backend /forgot-password/reset-password:', error);

    let errorMsg = 'An error occurred while resetting your password. Please try again.';
    if (error.response && error.response.data) {
      errorMsg = error.response.data;
    }
    console.log('[ForgotPassword] Rendering reset-password with error:', errorMsg);

    return res.render('reset-password', {
      error: errorMsg,
    });
  }
});

app.post('/forgot-password/verify-otp', async (req, res) => {
  const { oneTimePassword } = req.body;
  const email = (req.session as any).email;

  console.log('[ForgotPassword] Received OTP:', oneTimePassword);
  console.log('[ForgotPassword] Using email from session:', email);

  // Validate that both are present
  if (!email) {
    return res.render('verify-otp', {
      error: 'No email found in session. Please request a password reset first.',
    });
  }
  if (!oneTimePassword || oneTimePassword.trim() === '') {
    return res.render('verify-otp', {
      error: 'Please enter the one-time password (OTP).',
    });
  }

  try {
    // 1) Create a cookie jar & axios client for CSRF
    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // 2) Fetch CSRF token from Spring Boot
    console.log('[ForgotPassword] Requesting CSRF token for verify-otp...');
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token:', csrfToken);

    // 3) POST /forgot-password/verify-otp to backend with { email, otp }
    //    The backend verifies the OTP
    await client.post(
      'http://localhost:4550/forgot-password/verify-otp',
      { email, otp: oneTimePassword },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 4) If backend call succeeded, store the verified OTP in session
    //    So we can prove that the user is allowed to reset the password.
    (req.session as any).verifiedOtp = oneTimePassword;
    console.log('[ForgotPassword] OTP verified. Storing in session:', (req.session as any).verifiedOtp);

    // 5) Redirect to /forgot-password/reset-password
    return res.redirect('/forgot-password/reset-password');
  } catch (error) {
    console.error('[ForgotPassword] Error calling backend /forgot-password/verify-otp:', error);

    let errorMessage = 'An error occurred while verifying the OTP. Please try again.';
    if (error.response && error.response.data) {
      errorMessage = error.response.data; // e.g. "OTP incorrect", "OTP expired", etc.
    }

    return res.render('verify-otp', {
      error: errorMessage,
    });
  }
});

app.post('/forgot-password/resend-otp', async (req, res) => {
  console.log('[ForgotPassword] Resend OTP requested.');

  const email = (req.session as any).email;
  console.log('[ForgotPassword] Email from session:', email);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    console.log('[ForgotPassword] Invalid or missing email in session.');
    return res.render('verify-otp', {
      error: 'No valid email found. Please start the reset process again.',
    });
  }

  try {
    const jar = new CookieJar();

    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    console.log('[ForgotPassword] Requesting CSRF token from /csrf...');
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token for resend-otp:', csrfToken);

    const response = await client.post(
      'http://localhost:4550/forgot-password/resend-otp',
      { email },
      {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      }
    );
    console.log('[ForgotPassword] Resend-OTP call succeeded:', response.data);

    return res.redirect('/forgot-password/verify-otp');
  } catch (error) {
    console.error('[ForgotPassword] Error calling backend /forgot-password/resend-otp:', error);

    let errorMsg = 'An error occurred while resending the OTP. Please try again.';
    if (error.response && error.response.data) {
      errorMsg = error.response.data;
    }
    console.log('[ForgotPassword] Rendering verify-otp with error:', errorMsg);

    return res.render('verify-otp', {
      error: errorMsg,
    });
  }
});

app.post('/register', async (req, res) => {
  const {
    username,
    email,
    password,
    confirmPassword,
    'date-of-birth-day': day,
    'date-of-birth-month': month,
    'date-of-birth-year': year,
  } = req.body;

  const errors: string[] = [];

  // Regex to enforce a strong password.
  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  // Validate Username.
  if (!username || username.trim() === '') {
    errors.push('Username is required.');
  }

  // Validate Email.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push('Enter a valid email address.');
  }

  // Helper function to validate date of birth.
  const isValidDate = (dobDay: string, dobMonth: string, dobYear: string): boolean => {
    const dateStr = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date < new Date();
  };

  if (!day || !month || !year || !isValidDate(day, month, year)) {
    errors.push('Enter a valid date of birth.');
  }

  // Validate Password.
  if (!password || !passwordCriteriaRegex.test(password)) {
    errors.push('Password must meet the criteria.');
  }

  // Check if the passwords match.
  if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  // If there are validation errors, re-render the registration page with error messages.
  if (errors.length > 0) {
    return res.render('register', {
      errors,
      username,
      email,
      day,
      month,
      year,
    });
  }

  // Convert day, month, and year into the expected "YYYY-MM-DD" format.
  const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  try {
    // Create a cookie jar and an axios client that supports cookies.
    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // Request the CSRF token from the backend.
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token:', csrfToken);

    // Send the registration POST request using the response body token.
    const response = await client.post(
      'http://localhost:4550/account/register',
      {
        username,
        email,
        password,
        confirmPassword,
        dateOfBirth,
      },
      {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      }
    );

    console.log('User registered successfully in backend:', response.data);
    res.redirect('/login?created=true');
  } catch (error) {
    console.error('Error during backend registration:', error);
    errors.push('An error occurred during registration. Please try again later.');
    return res.render('register', {
      errors,
      username,
      email,
      day,
      month,
      year,
    });
  }
});

app.post('/account/update', async (req, res) => {
  const {
    username,
    email,
    password,
    confirmPassword,
    'date-of-birth-day': day,
    'date-of-birth-month': month,
    'date-of-birth-year': year,
  } = req.body;

  const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const payload = { email, username, dateOfBirth, password, confirmPassword };

  // Retrieve the stored Spring Boot session cookie from req.user or req.session.
  const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';

  if (!storedCookie) {
    return res.status(401).render('account', {
      errors: ['Session expired or invalid. Please log in again.'],
      username,
      email,
      day,
      month,
      year,
    });
  }

  try {
    // Create a cookie jar and add the stored session cookie.
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios client with cookie jar support.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // Request the CSRF token from the backend.
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token for update:', csrfToken);

    // Send the account update POST request with the CSRF token.
    await client.post('http://localhost:4550/account/update', payload, {
      headers: {
        'X-XSRF-TOKEN': csrfToken,
      },
    });

    return res.redirect('/account?updated=true');
  } catch (error) {
    console.error('Error updating account in backend:', error);
    return res.render('account', {
      errors: ['An error occurred during account update. Please try again later.'],
      username,
      email,
      day,
      month,
      year,
    });
  }
});

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', function (req, res) {
  const { created, passwordReset } = req.query;
  res.render('login', {
    created: created === 'true',
    passwordReset: passwordReset === 'true',
  });
});

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

app.get('/forgot-password/verify-otp', function (req, res) {
  const { sent } = req.query;
  res.render('verify-otp', {
    sent: sent === 'true',
  });
});

app.get('/forgot-password/reset-password', (req, res) => {
  res.render('reset-password');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/chat', async (req, res) => {
  // Extract the message (and optionally chatId) from the request body.
  const { message, chatId } = req.body;
  const payload = { message, chatId };

  // Retrieve the stored Spring Boot session cookie.
  // Adjust the property names as needed based on how you store it.
  const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';

  if (!storedCookie) {
    // If no cookie is available, consider the session invalid.
    return res.status(401).json({
      error: 'Session expired or invalid. Please log in again.',
    });
  }

  try {
    // Create a cookie jar and add the stored Spring Boot session cookie.
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios client with cookie jar support and proper XSRF configuration.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // Request the CSRF token from the backend.
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token for chat:', csrfToken);

    // Send the chat POST request with the CSRF token included in the headers.
    const chatResponse = await client.post('http://localhost:4550/chat', payload, {
      headers: {
        'X-XSRF-TOKEN': csrfToken,
      },
    });

    // Return the backend's response (expected to be a JSON with chatId and message).
    return res.status(200).json(chatResponse.data);
  } catch (error) {
    console.error('Error sending chat message to backend:', error);
    return res.status(500).json({
      error: 'An error occurred while sending the chat message. Please try again later.',
    });
  }
});

// GET route for the chat screen
app.get('/chat', ensureAuthenticated, (req, res) => {
  res.render('chat');
});

app.get('/chat-history', ensureAuthenticated, async (req, res) => {
  try {
    // Retrieve the stored Spring Boot session cookie
    const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';

    if (!storedCookie) {
      throw new Error('No Spring Boot session cookie found.');
    }

    // Create a cookie jar and add the stored cookie
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios client with cookie jar support and CSRF configuration.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // Retrieve the CSRF token from the backend.
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token for chat-history:', csrfToken);

    // Now call the backend endpoint to get the chat history, including the CSRF token in the headers.
    const chatsResponse = await client.get('http://localhost:4550/chat/chats', {
      headers: {
        'X-XSRF-TOKEN': csrfToken,
      },
    });
    const chats = chatsResponse.data; // Expected to be an array of chat objects

    // Render the chat history view, passing the chats to the template.
    res.render('chat-history', { chats });
  } catch (error) {
    console.error('Error fetching chat histories:', error);
    res.render('chat-history', {
      chats: [],
      error: 'Unable to load chat history at this time.',
    });
  }
});

app.get('/delete-chat-history', ensureAuthenticated, async (req, res) => {
  try {
    // Retrieve the chatId from the query parameters.
    const chatId = req.query.chatId;
    if (!chatId) {
      return res.status(400).send('Missing chatId parameter.');
    }

    // Retrieve the stored Spring Boot session cookie from req.user or req.session.
    const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';
    if (!storedCookie) {
      return res.status(401).send('User not authenticated or session expired.');
    }

    // Create a cookie jar and set the stored cookie for the backend.
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios client with cookie jar support and proper CSRF configuration.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // (Optional) Retrieve the CSRF token from the backend.
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token for delete-chat-history:', csrfToken);

    // Call the backend DELETE endpoint.
    // Assuming the backend delete route is at: DELETE http://localhost:4550/chat/chats/{chatId}
    await client.delete(`http://localhost:4550/chat/chats/${chatId}`, {
      headers: {
        'X-XSRF-TOKEN': csrfToken,
      },
    });

    // Redirect back to the chat history page (optionally with a query parameter to show a success message).
    return res.redirect('/chat-history?deleted=true');
  } catch (error) {
    console.error('Error deleting chat:', error);
    return res.status(500).send('An error occurred while deleting the chat.');
  }
});

app.get('/open-chat-history', ensureAuthenticated, async (req, res) => {
  try {
    // Retrieve the chatId from query parameters.
    const chatIdParam = req.query.chatId;
    if (!chatIdParam) {
      return res.status(400).send('Missing chatId parameter.');
    }

    // Convert chatIdParam to a number (if applicable)
    const chatId = parseInt(chatIdParam as string, 10);
    if (isNaN(chatId)) {
      return res.status(400).send('Invalid chatId parameter.');
    }

    // Retrieve the stored Spring Boot session cookie.
    const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';
    if (!storedCookie) {
      return res.status(401).send('User not authenticated or session expired.');
    }

    // Create a cookie jar and set the stored cookie for the backend.
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios client with cookie jar support and XSRF handling.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // Fetch messages for this chatId from your Spring Boot backend
    const messagesResponse = await client.get(`http://localhost:4550/chat/messages/${chatId}`);
    const messages = messagesResponse.data; // Expecting an array of message objects

    // Render the 'chat' template, passing both chatId and messages
    // If your chat.njk template is set up to display these, you'll see the conversation
    res.render('chat', { chatId, messages });
  } catch (error) {
    console.error('Error retrieving chat history:', error);
    res.status(500).send('Error retrieving chat history.');
  }
});

app.get('/contact-support', ensureAuthenticated, async (req, res) => {
  try {
    // Retrieve the Spring Boot session cookie from your session or user object.
    const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';
    if (!storedCookie) {
      throw new Error('No Spring Boot session cookie found.');
    }

    // Create a cookie jar and add the stored Spring Boot session cookie.
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios client with cookie jar support.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    const bannerResponse = await client.get('http://localhost:4550/support-banner/1');
    const fetchedBanner = bannerResponse.data;

    // Map the fetched properties to the ones expected by the template.
    const supportBanner = {
      titleText: fetchedBanner.title,
      html: fetchedBanner.content,
    };

    // Render the template with the mapped banner data.
    res.render('contact-support', { supportBanner });
  } catch (error) {
    console.error('Error fetching support banner:', error);
    res.render('contact-support', {
      supportBanner: {
        titleText: 'Contact Support Team',
        html: "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
      },
    });
  }
});

app.get('/account', ensureAuthenticated, async (req, res) => {
  try {
    const storedCookie = (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';
    if (!storedCookie) {
      throw new Error('No Spring Boot session cookie found.');
    }

    // Create a cookie jar and set the stored Spring Boot cookie.
    const jar = new CookieJar();
    jar.setCookieSync(storedCookie, 'http://localhost:4550');

    // Create an axios instance with cookie jar support.
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // Make parallel requests to your Spring Boot backend endpoints.
    const [usernameRes, emailRes, dayRes, monthRes, yearRes] = await Promise.all([
      client.get('http://localhost:4550/account/username'),
      client.get('http://localhost:4550/account/email'),
      client.get('http://localhost:4550/account/date-of-birth/day'),
      client.get('http://localhost:4550/account/date-of-birth/month'),
      client.get('http://localhost:4550/account/date-of-birth/year'),
    ]);

    const context = {
      username: usernameRes.data,
      email: emailRes.data,
      day: dayRes.data,
      month: monthRes.data,
      year: yearRes.data,
      updated: req.query.updated === 'true',
      errors: null,
    };

    // Disable caching so that the page reloads fresh each time.
    res.set('Cache-Control', 'no-store');
    res.render('account', context);
  } catch (error) {
    console.error('Error retrieving account details:', error);
    res.render('account', {
      errors: ['Error retrieving account details.'],
      updated: req.query.updated === 'true',
    });
  }
});

app.get('/account/update', ensureAuthenticated, (req, res) => {
  res.render('update');
});

glob
  .sync(__dirname + '/routes/**/*.+(ts|js)')
  .map(filename => require(filename))
  .forEach(routeModule => routeModule.default(app));

setupDev(app, developmentMode);

app.use((req, res) => {
  res.status(404);
  res.render('not-found');
});

app.use((err: HTTPError, req: express.Request, res: express.Response) => {
  logger.error(`${err.stack || err}`);
  res.locals.message = err.message;
  res.locals.error = developmentMode ? err : {};
  res.status(err.status || 500);
  res.render('error');
});
