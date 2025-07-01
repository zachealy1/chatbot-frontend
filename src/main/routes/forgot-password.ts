import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {
  app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
  });

  // GET: show the OTP entry page (with optional “resent” banner)
  app.get('/forgot-password/verify-otp', (req, res) => {
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
    const sent = req.query.sent === 'true';

    res.render('verify-otp', {
      lang,
      sent,
      fieldErrors: {},
      oneTimePassword: '',
    });
  });

  app.get('/forgot-password/reset-password', (req, res) => {
    res.render('reset-password');
  });

  app.post('/forgot-password/enter-email', async (req, res) => {
    const { email } = req.body;
    // Pick up the lang cookie (defaults to 'en')
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

    // Server-side validation
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
        email,
      });
    }

    // CSRF & axios client setup
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

      // Call backend forgot-password endpoint
      await client.post('/forgot-password/enter-email', { email }, { headers: { 'X-XSRF-TOKEN': csrfToken } });

      // Save email in session for OTP step
      (req.session as any).email = email;

      // Redirect to OTP page
      return res.redirect('/forgot-password/verify-otp?lang=' + lang);
    } catch (err) {
      logger.error('[ForgotPassword] Error:', err.response || err.message);

      // fallback general error
      fieldErrors.general = typeof err.response?.data === 'string' ? err.response.data : req.__('forgotPasswordError');

      return res.render('forgot-password', {
        lang,
        fieldErrors,
        email,
      });
    }
  });

  app.post('/forgot-password/reset-password', async (req, res) => {
    const { password, confirmPassword } = req.body;
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
    const email = (req.session as any).email;
    const otp = (req.session as any).verifiedOtp;

    // Server-side validation
    const fieldErrors: Record<string, string> = {};

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
        confirmPassword,
      });
    }

    // Prepare Axios + CSRF + lang cookie
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

      // Call backend to reset-password
      await client.post(
        '/forgot-password/reset-password',
        { email, otp, password, confirmPassword },
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      // On success, redirect to login with reset banner
      return res.redirect(`/login?passwordReset=true&lang=${lang}`);
    } catch (err: any) {
      logger.error('[ForgotPassword] Reset error:', err.response || err.message);

      // backend error msg or fallback
      fieldErrors.general = typeof err.response?.data === 'string' ? err.response.data : req.__('resetError');

      return res.render('reset-password', {
        lang,
        fieldErrors,
        password,
        confirmPassword,
      });
    }
  });

  // POST: validate & submit OTP
  app.post('/forgot-password/verify-otp', async (req, res) => {
    const { oneTimePassword } = req.body;
    const email = (req.session as any).email;
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

    // Server-side validation
    const fieldErrors: Record<string, string> = {};

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
        oneTimePassword,
      });
    }

    // Prepare axios with CSRF & lang
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

      // Call backend verify-otp
      await client.post(
        '/forgot-password/verify-otp',
        { email, otp: oneTimePassword },
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      // Mark OTP as verified in session
      (req.session as any).verifiedOtp = oneTimePassword;

      // Redirect to reset-password
      return res.redirect('/forgot-password/reset-password?lang=' + lang);
    } catch (err: any) {
      logger.error('[ForgotPassword] OTP verify error:', err.response || err.message);

      // backend error (expired/invalid OTP)
      fieldErrors.general = typeof err.response?.data === 'string' ? err.response.data : req.__('otpVerifyError');

      return res.render('verify-otp', {
        lang,
        sent: false,
        fieldErrors,
        oneTimePassword,
      });
    }
  });

  app.post('/forgot-password/resend-otp', async (req, res) => {
    logger.log('[ForgotPassword] Resend OTP requested.');

    const email = (req.session as any).email;
    logger.log('[ForgotPassword] Email from session:', email);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      logger.log('[ForgotPassword] Invalid or missing email in session.');
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

      logger.log('[ForgotPassword] Requesting CSRF token from /csrf...');
      const csrfResponse = await client.get('http://localhost:4550/csrf');
      const csrfToken = csrfResponse.data.csrfToken;
      logger.log('[ForgotPassword] Retrieved CSRF token for resend-otp:', csrfToken);

      const response = await client.post(
        'http://localhost:4550/forgot-password/resend-otp',
        { email },
        {
          headers: {
            'X-XSRF-TOKEN': csrfToken,
          },
        }
      );
      logger.log('[ForgotPassword] Resend-OTP call succeeded:', response.data);

      return res.redirect('/forgot-password/verify-otp');
    } catch (error) {
      logger.error('[ForgotPassword] Error calling backend /forgot-password/resend-otp:', error);

      let errorMsg = 'An error occurred while resending the OTP. Please try again.';
      if (error.response && error.response.data) {
        errorMsg = error.response.data;
      }
      logger.log('[ForgotPassword] Rendering verify-otp with error:', errorMsg);

      return res.render('verify-otp', {
        error: errorMsg,
      });
    }
  });
}
