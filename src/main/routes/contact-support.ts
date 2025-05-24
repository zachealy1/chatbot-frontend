import { ensureAuthenticated } from '../modules/auth';

import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {
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
      logger.error('Error fetching support banner:', error);
      res.render('contact-support', {
        supportBanner: {
          titleText: 'Contact Support Team',
          html: "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
        },
      });
    }
  });
}
