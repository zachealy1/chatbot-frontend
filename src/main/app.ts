
import * as path from 'path';

import { HTTPError } from './HttpError';
import { AppInsights } from './modules/appinsights';
import { Helmet } from './modules/helmet';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import { glob } from 'glob';
import favicon from 'serve-favicon';

const { setupDev } = require('./development');

const { Logger } = require('@hmcts/nodejs-logging');

const env = process.env.NODE_ENV || 'development';
const developmentMode = env === 'development';

export const app = express();
app.locals.ENV = env;

const logger = Logger.getLogger('app');

new PropertiesVolume().enableFor(app);
new AppInsights().enable();
new Nunjucks(developmentMode).enableFor(app);
// secure the application by adding various HTTP headers to its responses
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

// Add a route for /forgot-password
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password'); // Render the Nunjucks template for forgot password
});

// Add a route for /enter-code
app.get('/enter-code', (req, res) => {
  res.render('enter-code'); // Render the Nunjucks template for enter code
});

// Add a route for /reset-password
app.get('/reset-password', (req, res) => {
  res.render('reset-password'); // Render the Nunjucks template for reset password
});

// Add a route for /register
app.get('/register', (req, res) => {
  res.render('register'); // Render the Nunjucks template for register
});

// Add a route for /chat
app.get('/chat', (req, res) => {
  res.render('chat'); // Render the Nunjucks template for chat
});

// Add a route for /chat-history
app.get('/chat-history', (req, res) => {
  res.render('chat-history'); // Render the Nunjucks template for chat history
});

// Add a route for /contact-support
app.get('/contact-support', (req, res) => {
  res.render('contact-support'); // Render the Nunjucks template for contact support
});

// Add a route for /account
app.get('/account', (req, res) => {
  res.render('account'); // Render the Nunjucks template for account
});

// Add a route for /account/update
app.get('/account/update', (req, res) => {
  res.render('update'); // Render the Nunjucks template for update
});

glob
  .sync(__dirname + '/routes/**/*.+(ts|js)')
  .map(filename => require(filename))
  .forEach(route => route.default(app));

setupDev(app, developmentMode);
// returning "not found" page for requests with paths not resolved by the router
app.use((req, res) => {
  res.status(404);
  res.render('not-found');
});

// error handler
app.use((err: HTTPError, req: express.Request, res: express.Response) => {
  logger.error(`${err.stack || err}`);

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = env === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});
