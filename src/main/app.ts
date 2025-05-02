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
  const { username, password } = req.body;
  // 1) Pick up the lang cookie (defaults to 'en')
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 2) Create a cookie‐jar and seed it with our lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');

  // 3) Wrap axios so it uses our jar AND auto‐handles XSRF from Spring
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 4) Fetch CSRF token
    const csrfResponse = await client.get('/csrf');
    const csrfToken = csrfResponse.data.csrfToken;

    // 5) Perform login
    const loginResponse = await client.post(
      '/login/chat',
      { username, password },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 6) Persist Spring’s session cookie & CSRF token in our Express session
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const loginCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : setCookieHeader;
    (req.session as any).springSessionCookie = loginCookie;
    (req.session as any).csrfToken = csrfToken;

    // 7) Save and complete passport login
    req.session.save(err => {
      if (err) {
        console.error('Error saving session:', err);
        return res.render('login', {
          error: req.__('loginSessionError'),
          username
        });
      }
      req.login({ username, springSessionCookie: loginCookie, csrfToken }, err => {
        if (err) {
          console.error('Passport login error:', err);
          return next(err);
        }
        return res.redirect('/chat');
      });
    });

  } catch (err: any) {
    console.error('Full login error:', err.response || err.message);

    // If Spring returned a text message, use it; otherwise fall back to our i18n key
    const backendMsg = typeof err.response?.data === 'string'
      ? err.response.data
      : null;
    const errorMessage = backendMsg || req.__('loginInvalidCredentials');

    return res.render('login', {
      error: errorMessage,
      username
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
  const { email } = req.body;
  // 1) Pick up the lang cookie (defaults to 'en')
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 2) Server-side validation
  const fieldErrors = {} as any;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    fieldErrors.email = req.__('emailInvalid');
  }

  if (Object.keys(fieldErrors).length) {
    // re-render with inline error
    return res.render('forgot-password', {
      lang,
      fieldErrors,
      email
    });
  }

  // 3) CSRF & axios client setup
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 4) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 5) Call backend forgot-password endpoint
    await client.post(
      '/forgot-password/enter-email',
      { email },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 6) Save email in session for OTP step
    (req.session as any).email = email;

    // 7) Redirect to OTP page
    return res.redirect('/forgot-password/verify-otp?lang=' + lang);

  } catch (err) {
    console.error('[ForgotPassword] Error:', err.response || err.message);

    // fallback general error
    fieldErrors.general = typeof err.response?.data === 'string'
      ? err.response.data
      : req.__('forgotPasswordError');

    return res.render('forgot-password', {
      lang,
      fieldErrors,
      email
    });
  }
});

app.post('/forgot-password/reset-password', async (req, res) => {
  const { password, confirmPassword } = req.body;
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
  const email = (req.session as any).email;
  const otp   = (req.session as any).verifiedOtp;

  // 1) Server-side validation
  const fieldErrors: Record<string,string> = {};

  if (!password) {
    fieldErrors.password = req.__('passwordRequired');
  } else {
    const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!strongPwd.test(password)) {
      fieldErrors.password = req.__('passwordCriteria');
    }
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = req.__('confirmPasswordRequired');
  } else if (password !== confirmPassword) {
    fieldErrors.confirmPassword = req.__('passwordsMismatch');
  }

  if (!email || !otp) {
    fieldErrors.general = req.__('resetSessionMissing');
  }

  // If any errors, re-render with those errors
  if (Object.keys(fieldErrors).length) {
    return res.render('reset-password', {
      lang,
      fieldErrors,
      password,
      confirmPassword
    });
  }

  // 2) Prepare Axios + CSRF + lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 3) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 4) Call backend to reset-password
    await client.post(
      '/forgot-password/reset-password',
      { email, otp, password, confirmPassword },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 5) On success, redirect to login with reset banner
    return res.redirect(`/login?passwordReset=true&lang=${lang}`);

  } catch (err: any) {
    console.error('[ForgotPassword] Reset error:', err.response || err.message);

    // backend error msg or fallback
    fieldErrors.general =
      typeof err.response?.data === 'string'
        ? err.response.data
        : req.__('resetError');

    return res.render('reset-password', {
      lang,
      fieldErrors,
      password,
      confirmPassword
    });
  }
});

// GET: show the OTP entry page (with optional “resent” banner)
app.get('/forgot-password/verify-otp', (req, res) => {
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
  const sent = req.query.sent === 'true';

  res.render('verify-otp', {
    lang,
    sent,
    fieldErrors: {},
    oneTimePassword: ''
  });
});

// POST: validate & submit OTP
app.post('/forgot-password/verify-otp', async (req, res) => {
  const { oneTimePassword } = req.body;
  const email = (req.session as any).email;
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 1) Server-side validation
  const fieldErrors: Record<string,string> = {};

  if (!email) {
    fieldErrors.general = req.__('noEmailInSession');
  }
  if (!oneTimePassword || !oneTimePassword.trim()) {
    fieldErrors.oneTimePassword = req.__('otpRequired');
  }

  // If any validation errors, re-render
  if (Object.keys(fieldErrors).length) {
    return res.render('verify-otp', {
      lang,
      sent: false,
      fieldErrors,
      oneTimePassword
    });
  }

  // 2) Prepare axios with CSRF & lang
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 3) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 4) Call backend verify-otp
    await client.post(
      '/forgot-password/verify-otp',
      { email, otp: oneTimePassword },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 5) Mark OTP as verified in session
    (req.session as any).verifiedOtp = oneTimePassword;

    // 6) Redirect to reset-password
    return res.redirect('/forgot-password/reset-password?lang=' + lang);

  } catch (err: any) {
    console.error('[ForgotPassword] OTP verify error:', err.response || err.message);

    // backend error (expired/invalid OTP)
    fieldErrors.general =
      typeof err.response?.data === 'string'
        ? err.response.data
        : req.__('otpVerifyError');

    return res.render('verify-otp', {
      lang,
      sent: false,
      fieldErrors,
      oneTimePassword
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

  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // Server-side validation
  const fieldErrors: Record<string,string> = {};

  if (!username?.trim()) {
    fieldErrors.username = req.__('usernameRequired');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = req.__('emailInvalid');
  }

  const dob = new Date(
    `${year}-${month?.padStart(2,'0')}-${day?.padStart(2,'0')}`
  );
  const isPast = d => d instanceof Date && !isNaN(d.getTime()) && d < new Date();
  if (!day || !month || !year || !isPast(dob)) {
    fieldErrors.dateOfBirth = req.__('dobInvalid');
  }

  const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
  if (!password || !strongPwd.test(password)) {
    fieldErrors.password = req.__('passwordCriteria');
  }

  // === Confirm-password validation ===
  if (!confirmPassword) {
    fieldErrors.confirmPassword = req.__('confirmPasswordRequired');
  } else if (password !== confirmPassword) {
    fieldErrors.confirmPassword = req.__('passwordsMismatch');
  }

  // If any errors, re-render with inline errors only
  if (Object.keys(fieldErrors).length) {
    return res.render('register', {
      lang,
      fieldErrors,
      username,
      email,
      day,
      month,
      year,
    });
  }

  // 3) Prepare axios client with CSRF and lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 4) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 5) Perform registration
    const dateOfBirth = dob.toISOString().slice(0,10);
    await client.post(
      '/account/register',
      { username, email, password, confirmPassword, dateOfBirth },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 6) Redirect to login with success banner
    return res.redirect(`/login?created=true&lang=${lang}`);

  } catch (err: any) {
    console.error('Registration error:', err.response || err.message);

    // Extract backend message or fallback
    const backendMsg = typeof err.response?.data === 'string'
      ? err.response.data
      : null;
    fieldErrors.general = backendMsg || req.__('registerError');

    // Re-render with just fieldErrors (no summary)
    return res.render('register', {
      lang,
      fieldErrors,
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

  // 1) Pick up the lang cookie (defaults to 'en')
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 2) Server-side validation
  const fieldErrors: Record<string,string> = {};

  // Username
  if (!username?.trim()) {
    fieldErrors.username = req.__('usernameRequired');
  }

  // Email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = req.__('emailInvalid');
  }

  // Date of birth
  const dob = new Date(
    `${year?.padStart(2,'0')}-${month?.padStart(2,'0')}-${day?.padStart(2,'0')}`
  );
  const isPast = (d: Date) => d instanceof Date && !isNaN(d.getTime()) && d < new Date();
  if (!day || !month || !year || !isPast(dob)) {
    fieldErrors.dateOfBirth = req.__('dobInvalid');
  }

  // Optional password change
  if (password || confirmPassword) {
    const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    // 1) Password required & strength
    if (!password) {
      fieldErrors.password = req.__('passwordRequired');
    } else if (!strongPwd.test(password)) {
      fieldErrors.password = req.__('passwordCriteria');
    }

    // 2) Confirm-password required, strength, & match
    if (!confirmPassword) {
      fieldErrors.confirmPassword = req.__('confirmPasswordRequired');
    } else if (!strongPwd.test(confirmPassword)) {
      fieldErrors.confirmPassword = req.__('passwordCriteria');
    } else if (password !== confirmPassword) {
      fieldErrors.confirmPassword = req.__('passwordsMismatch');
    }
  }

  // If any validation failed, re-render with inline errors
  if (Object.keys(fieldErrors).length) {
    return res.render('account', {
      lang,
      fieldErrors,
      username,
      email,
      day,
      month,
      year
    });
  }

  // 3) Prepare payload for backend
  const dateOfBirth = dob.toISOString().slice(0,10);
  const payload = { username, email, dateOfBirth, password, confirmPassword };

  // 4) Retrieve Spring session cookie
  const storedCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedCookie) {
    fieldErrors.general = req.__('sessionExpired');
    return res.status(401).render('account', {
      lang,
      fieldErrors,
      username,
      email,
      day,
      month,
      year
    });
  }

  // 5) Create axios client with CSRF and lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(storedCookie, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // Submit the update
    await client.post('/account/update', payload, {
      headers: { 'X-XSRF-TOKEN': csrfToken }
    });

    // On success, redirect back with a success flag
    return res.redirect(`/account?updated=true&lang=${lang}`);
  } catch (err: any) {
    console.error('Error updating account in backend:', err.response || err.message);
    fieldErrors.general = req.__('accountUpdateError');
    return res.render('account', {
      lang,
      fieldErrors,
      username,
      email,
      day,
      month,
      year
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
