import { ensureAuthenticated } from '../modules/auth';

import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {

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
      logger.error('Error retrieving account details:', error);
      res.render('account', {
        errors: ['Error retrieving account details.'],
        updated: req.query.updated === 'true',
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

    // Pick up the lang cookie (defaults to 'en')
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

    // Server-side validation
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

      // Password required & strength
      if (!password) {
        fieldErrors.password = req.__('passwordRequired');
      } else if (!strongPwd.test(password)) {
        fieldErrors.password = req.__('passwordCriteria');
      }

      // Confirm-password required, strength, & match
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

    // Prepare payload for backend
    const dateOfBirth = dob.toISOString().slice(0,10);
    const payload = { username, email, dateOfBirth, password, confirmPassword };

    // Retrieve Spring session cookie
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

    // Create axios client with CSRF and lang cookie
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
      logger.error('Error updating account in backend:', err.response || err.message);
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
}
