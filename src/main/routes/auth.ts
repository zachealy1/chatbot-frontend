import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application, NextFunction, Request, Response } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {

  app.get('/login', function (req, res) {
    const { created, passwordReset } = req.query;
    res.render('login', {
      created: created === 'true',
      passwordReset: passwordReset === 'true',
    });
  });

  app.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    const { username, password } = req.body;
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

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
      const csrfResponse = await client.get('/csrf');
      const csrfToken = csrfResponse.data.csrfToken;

      const loginResponse = await client.post(
        '/login/chat',
        { username, password },
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      const setCookieHeader = loginResponse.headers['set-cookie'];
      const loginCookie = Array.isArray(setCookieHeader)
        ? setCookieHeader.join('; ')
        : setCookieHeader;

      (req.session as any).springSessionCookie = loginCookie;
      (req.session as any).csrfToken = csrfToken;

      req.session.save(err => {
        if (err) {
          logger.error('Error saving session:', err);
          return res.render('login', {
            error: req.__('loginSessionError'),
            username
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-shadow
        req.login({ username, springSessionCookie: loginCookie, csrfToken }, err => {
          if (err) {return next(err);}
          return res.redirect('/chat');
        });
      });

    } catch (err: any) {
      logger.error('Full login error:', err.response || err.message);

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

  app.get('/logout', (req: Request, res: Response) => {
    req.logout(err => {
      if (err) {
        return res.status(500).send('Failed to logout');
      }
      req.session.destroy(() => {
        res.redirect('/login');
      });
    });
  });
}
