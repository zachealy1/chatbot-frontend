import { ensureAuthenticated } from '../modules/auth';

import { Logger } from '@hmcts/nodejs-logging';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const logger = Logger.getLogger('app');

export default function (app: Application): void {
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
      logger.log('Retrieved CSRF token for chat-history:', csrfToken);

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
      logger.error('Error fetching chat histories:', error);
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
      logger.log('Retrieved CSRF token for delete-chat-history:', csrfToken);

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
      logger.error('Error deleting chat:', error);
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
      logger.error('Error retrieving chat history:', error);
      res.status(500).send('Error retrieving chat history.');
    }
  });
}
