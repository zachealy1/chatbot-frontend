import * as path from 'path';

import { HTTPError } from './HttpError';
import { AppInsights } from './modules/appinsights';
import { Helmet } from './modules/helmet';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

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

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login/password', (req, res, next) => {
  passport.authenticate('local', (err: never, user: Express.User) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.render('login', {
        error: 'Invalid username or password.',
        username: req.body.username,
      });
    }
    req.logIn(user, loginErr => {
      if (loginErr) {
        return next(loginErr);
      }
      return res.redirect('/chat');
    });
  })(req, res, next);
});

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});
app.get('/enter-code', (req, res) => {
  res.render('enter-code');
});
app.get('/reset-password', (req, res) => {
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
