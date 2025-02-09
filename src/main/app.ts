import * as path from 'path';

import { HTTPError } from './HttpError';
import { AppInsights } from './modules/appinsights';
import { Helmet } from './modules/helmet';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

import axios from 'axios';
import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import { glob } from 'glob';
import passport from 'passport';
import favicon from 'serve-favicon';

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

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate, no-store');
  next();
});

app.use(
  session({
    secret: 'yourSecretKeyHere',
    resave: false,
    saveUninitialized: false,
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

async function getCsrfToken(): Promise<string> {
  const csrfResponse = await axios.get('http://localhost:4550/csrf', { withCredentials: true });
  console.log('Retrieved CSRF token:', csrfResponse.data.csrfToken);
  return csrfResponse.data.csrfToken;
}

app.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Retrieve CSRF token and cookie from the /csrf endpoint
    const csrfResponse = await axios.get('http://localhost:4550/csrf', { withCredentials: true });
    const csrfToken = csrfResponse.data.csrfToken;
    const csrfCookieHeader = csrfResponse.headers['set-cookie'];
    const csrfCookie = Array.isArray(csrfCookieHeader)
      ? csrfCookieHeader.join('; ')
      : csrfCookieHeader;
    console.log('Retrieved CSRF token:', csrfToken);
    console.log('Retrieved CSRF cookie:', csrfCookie);

    // Use these values in your login POST:
    const response = await axios.post(
      'http://localhost:4550/login/chat',
      { username, password },
      {
        withCredentials: true,
        headers: {
          'X-XSRF-TOKEN': csrfToken,
          Cookie: csrfCookie
        }
      }
    );

    // Log the Set-Cookie header from the login response.
    console.log('Login response headers:', response.headers);
    const setCookieHeader = response.headers['set-cookie'];
    const loginCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : setCookieHeader;
    console.log('Login Set-Cookie header:', loginCookie);

    // Save the Spring Boot session cookie in the Express session.
    (req.session as any).springSessionCookie = loginCookie;
    console.log('Stored springSessionCookie:', (req.session as any).springSessionCookie);

    // Authenticate the user in Express as well.
    req.login({ username }, err => {
      if (err) {
        return next(err);
      }
      return res.redirect('/chat');
    });
  } catch (error: any) {
    console.error('Full login error:', error.response);
    const errorMessage = error.response?.data || 'Invalid username or password.';
    return res.render('login', { error: errorMessage, username: req.body.username });
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

app.post('/forgot-password/enter-email', (req, res) => {
  const email = req.body.email; // Retrieve the email from the form submission

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    // If no email or invalid email is provided, re-render the form with an error message
    return res.render('forgot-password', {
      errors: [
        {
          text: 'Please enter a valid email address.',
          href: '#email',
        },
      ],
    });
  }

  // Simulate email sending logic (replace with your actual logic)
  console.log(`Sending password reset email to: ${email}`);

  // Redirect to the next step (e.g., a page to enter the code)
  res.redirect('/forgot-password/verify-otp');
});

app.post('/forgot-password/reset-password', (req, res) => {
  const { password, confirmPassword } = req.body;

  // Validate that both passwords match
  if (password !== confirmPassword) {
    return res.render('reset-password', {
      error: 'Passwords do not match.',
    });
  }

  // Validate password criteria
  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordCriteriaRegex.test(password)) {
    return res.render('reset-password', {
      error:
        'Your password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.',
    });
  }

  // Simulate updating the password
  console.log('Password reset successfully for user.');

  // Redirect to success page
  res.redirect('/login?passwordReset=true');
});

app.post('/forgot-password/verify-otp', (req, res) => {
  const { oneTimePassword } = req.body;
  const expectedOTP = '123456'; // Replace with your actual logic

  if (!oneTimePassword || oneTimePassword !== expectedOTP) {
    return res.render('verify-otp', {
      error: 'The one-time password you entered is incorrect. Please try again.',
    });
  }

  res.redirect('/forgot-password/reset-password');
});

app.post('/forgot-password/resend-otp', (req, res) => {
  console.log('Resending OTP...');
  res.redirect('/forgot-password/verify-otp');
});

app.post('/register', async (req, res) => {
  // Destructure the expected fields from the request body.
  // Notice that the date-of-birth is split into day, month, and year.
  const {
    username,
    email,
    password,
    confirmPassword,
    'date-of-birth-day': day,
    'date-of-birth-month': month,
    'date-of-birth-year': year,
  } = req.body;

  // Array to hold any validation error messages.
  const errors: string[] = [];

  // Regex to enforce a strong password (minimum 8 characters, one lowercase, one uppercase, one digit, one special character)
  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  // Validate Username
  if (!username || username.trim() === '') {
    errors.push('Username is required.');
  }

  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push('Enter a valid email address.');
  }

  // Helper function to validate date of birth
  const isValidDate = (dobDay: string, dobMonth: string, dobYear: string): boolean => {
    // Ensure day and month are two digits (e.g. "05" instead of "5")
    const dateStr = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date < new Date();
  };

  if (!day || !month || !year || !isValidDate(day, month, year)) {
    errors.push('Enter a valid date of birth.');
  }

  // Validate Password
  if (!password || !passwordCriteriaRegex.test(password)) {
    errors.push('Password must meet the criteria.');
  }

  // Check if the passwords match
  if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  // If there are validation errors, re-render the registration page with error messages
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

  // Convert day, month, and year into the expected "YYYY-MM-DD" format
  const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  try {
    // Call the Spring Boot backend's register endpoint
    const response = await axios.post('http://localhost:4550/account/register', {
      username,
      email,
      password,
      confirmPassword,
      dateOfBirth,
    });

    console.log('User registered successfully in backend:', response.data);
    // Redirect to the login page (or another page) upon successful registration
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

// In your update route:
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

  try {
    // Retrieve the CSRF token from the backend
    const csrfToken = await getCsrfToken();

    // Retrieve the Spring Boot session cookie stored during login
    const cookieHeader = (req.session as any).springSessionCookie || '';

    // Make the update request including the CSRF token header
    const response = await axios.post('http://localhost:4550/account/update', payload, {
      withCredentials: true,
      headers: {
        // Include the CSRF token in the header (the name expected by CookieCsrfTokenRepository is X-XSRF-TOKEN)
        'X-XSRF-TOKEN': csrfToken,
        Cookie: cookieHeader,
      },
    });
    console.log('Account updated successfully in backend:', response.data);
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
    created: created === 'true', // Use 'created' to match the template
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
app.get('/chat', ensureAuthenticated, (req, res) => {
  res.render('chat');
});
app.get('/chat-history', ensureAuthenticated, (req, res) => {
  res.render('chat-history');
});
app.get('/contact-support', ensureAuthenticated, (req, res) => {
  res.render('contact-support');
});
app.get('/account', ensureAuthenticated, (req, res) => {
  res.render('account');
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
