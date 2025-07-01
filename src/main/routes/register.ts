import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {
  app.get('/register', (req, res) => {
    res.render('register');
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
    const fieldErrors: Record<string, string> = {};

    if (!username?.trim()) {
      fieldErrors.username = req.__('usernameRequired');
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = req.__('emailInvalid');
    }

    const dob = new Date(`${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`);
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

    // Prepare axios client with CSRF and lang cookie
    const jar = new CookieJar();
    jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
    const client = wrapper(
      axios.create({
        baseURL: 'http://localhost:4550',
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    try {
      // Fetch CSRF token
      const {
        data: { csrfToken },
      } = await client.get('/csrf');

      // Perform registration
      const dateOfBirth = dob.toISOString().slice(0, 10);
      await client.post(
        '/account/register',
        { username, email, password, confirmPassword, dateOfBirth },
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      // Redirect to login with success banner
      return res.redirect(`/login?created=true&lang=${lang}`);
    } catch (err: any) {
      logger.error('Registration error:', err.response || err.message);

      // Extract backend message or fallback
      const backendMsg = typeof err.response?.data === 'string' ? err.response.data : null;
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
}
