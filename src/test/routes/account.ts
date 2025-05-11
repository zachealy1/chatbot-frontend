import * as authModule from '../../main/modules/auth';
import accountRoutes from '../../main/routes/account';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /account', () => {
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // 1) Stub ensureAuthenticated so it always calls next()
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((req, res, next) => next());

    // 2) Stub axios-cookiejar-support.wrapper to return our fake client
    stubClient = { get: sinon.stub() };
    sinon
      .stub(axiosCookie, 'wrapper')
      .returns(stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('renders error when springSessionCookie is missing', async () => {
    const app: Application = express();

    // parse query (to read ?updated=)
    app.use(express.urlencoded({ extended: false }));

    // 3) Inject an empty session
    app.use((req, res, next) => {
      ;(req as any).session = {};
      next();
    });

    // 4) Stub out res.render so it just returns JSON
    app.use((req, res, next) => {
      res.render = (view: string, options?: any) =>
        res.json({ view, options });
      next();
    });

    // 5) Mount the real route under test
    accountRoutes(app);

    const res = await request(app)
      .get('/account')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('account');
    expect(res.body.options).to.deep.equal({
      errors: ['Error retrieving account details.'],
      updated: false
    });
  });

  it('fetches from backend and renders account when cookie is present', async () => {
    // 1) Stub each backend call
    stubClient.get
      .withArgs('http://localhost:4550/account/username')
      .resolves({ data: 'john' });
    stubClient.get
      .withArgs('http://localhost:4550/account/email')
      .resolves({ data: 'john@example.com' });
    stubClient.get
      .withArgs('http://localhost:4550/account/date-of-birth/day')
      .resolves({ data: '1' });
    stubClient.get
      .withArgs('http://localhost:4550/account/date-of-birth/month')
      .resolves({ data: '2' });
    stubClient.get
      .withArgs('http://localhost:4550/account/date-of-birth/year')
      .resolves({ data: '1990' });

    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));

    // 2) Inject a session that *does* have our fake Spring cookie
    app.use((req, res, next) => {
      ;(req as any).session = { springSessionCookie: 'SESSION=abc123' };
      next();
    });

    // 3) Stub out res.render → JSON again
    app.use((req, res, next) => {
      res.render = (view: string, options?: any) => res.json({ view, options });
      next();
    });

    accountRoutes(app);

    const res = await request(app)
      .get('/account?updated=true')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect('Cache-Control', 'no-store');

    expect(res.body.view).to.equal('account');
    expect(res.body.options).to.deep.equal({
      username: 'john',
      email: 'john@example.com',
      day: '1',
      month: '2',
      year: '1990',
      updated: true,
      errors: null
    });
  });
});

describe('POST /account/update', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // silence any console.error from the route handlers
    sinon.stub(console, 'error');

    // stub wrapper() → our fake client
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(setupSession: any = {}, setupCookies: any = {}) {
    const app: Application = express();

    // parse JSON bodies so .send({...}) actually populates req.body
    app.use(express.json());

    // parse urlencoded bodies
    app.use(express.urlencoded({ extended: false }));

    // stub req.session and req.user
    app.use((req, _res, next) => {
      (req as any).session = { ...setupSession };
      (req as any).user = setupSession;
      next();
    });

    // stub cookies
    app.use((req, _res, next) => {
      req.cookies = { ...setupCookies };
      next();
    });

    // stub i18n translator to echo keys
    app.use((req, _res, next) => {
      req.__ = (msg: string) => msg;
      next();
    });

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    // mount our route under test
    accountRoutes(app);
    return app;
  }

  it('should re-render with username, email, and dob errors when all fields are missing', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/account/update')
      .send({}) // empty body
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('account');
    expect(res.body.options.lang).to.equal('en');
    expect(res.body.options.fieldErrors).to.have.keys(
      'username',
      'email',
      'dateOfBirth'
    );
  });

  it('should flag confirmPassword when only password is provided', async () => {
    const app = mkApp();
    const payload = {
      username: 'alice',
      email: 'alice@example.com',
      'date-of-birth-day': '1',
      'date-of-birth-month': '1',
      'date-of-birth-year': '1990',
      password: 'StrongP@ss1',
      confirmPassword: '',
    };
    const res = await request(app)
      .post('/account/update')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('account');
    expect(res.body.options.lang).to.equal('en');
    expect(res.body.options.fieldErrors).to.have.property(
      'confirmPassword',
      'confirmPasswordRequired'
    );
  });

  it('should 401 + re-render when session cookie is missing', async () => {
    const app = mkApp({}, { lang: 'cy' });
    const payload = {
      username: 'bob',
      email: 'bob@example.com',
      'date-of-birth-day': '2',
      'date-of-birth-month': '2',
      'date-of-birth-year': '1990',
    };
    const res = await request(app)
      .post('/account/update')
      .send(payload)
      .expect(401)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('account');
    expect(res.body.options.lang).to.equal('cy');
    expect(res.body.options.fieldErrors).to.have.property(
      'general',
      'sessionExpired'
    );
  });

  it('should redirect on successful backend update (lang=cy)', async () => {
    // stub CSRF fetch + update post
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs(
        '/account/update',
        sinon.match.object,
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    // session must carry our springSessionCookie
    const app = mkApp({ springSessionCookie: 'S=1' }, { lang: 'cy' });
    const payload = {
      username: 'carol',
      email: 'carol@example.com',
      'date-of-birth-day': '3',
      'date-of-birth-month': '3',
      'date-of-birth-year': '1990',
    };

    await request(app)
      .post('/account/update')
      .send(payload)
      .expect(302)
      .expect('Location', '/account?updated=true&lang=cy');
  });

  it('should re-render with general error on backend failure', async () => {
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tokXYZ' } });
    stubClient.post
      .withArgs('/account/update')
      .rejects(new Error('boom'));

    const app = mkApp({ springSessionCookie: 'S=2' }, {});
    const payload = {
      username: 'dan',
      email: 'dan@example.com',
      'date-of-birth-day': '4',
      'date-of-birth-month': '4',
      'date-of-birth-year': '1990',
    };

    const res = await request(app)
      .post('/account/update')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('account');
    expect(res.body.options.lang).to.equal('en');
    expect(res.body.options.fieldErrors).to.have.property(
      'general',
      'accountUpdateError'
    );
  });
});

