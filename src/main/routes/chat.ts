import { ensureAuthenticated } from '../modules/auth';

import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {
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
      logger.log('Retrieved CSRF token for chat:', csrfToken);

      // Send the chat POST request with the CSRF token included in the headers.
      const chatResponse = await client.post('http://localhost:4550/chat', payload, {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      });

      // Return the backend's response (expected to be a JSON with chatId and message).
      return res.status(200).json(chatResponse.data);
    } catch (error) {
      logger.error('Error sending chat message to backend:', error);
      return res.status(500).json({
        error: 'An error occurred while sending the chat message. Please try again later.',
      });
    }
  });

  // GET route for the chat screen
  app.get('/chat', ensureAuthenticated, (req, res) => {
    res.render('chat');
  });
}
