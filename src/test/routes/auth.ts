import loginRoutes from '../../main/routes/auth';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';


describe('GET /login', () => {
  function mkApp() {
    const app: Application = express();

    // stub res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, options?: any) => res.json({ view, options });
      next();
    });

    // mount the login routes
    loginRoutes(app);
    return app;
  }

  it('renders login with no query params (defaults false)', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/login')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      created: false,
      passwordReset: false
    });
  });

  it('sets created=true when ?created=true is provided', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/login?created=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      created: true,
      passwordReset: false
    });
  });

  it('sets passwordReset=true when ?passwordReset=true is provided', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/login?passwordReset=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      created: false,
      passwordReset: true
    });
  });

  it('sets both flags when both query params are true', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/login?created=true&passwordReset=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      created: true,
      passwordReset: true
    });
  });
});

describe('POST /login', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // silence console.error
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

  function mkApp(options: {
    sessionProps?: any;
    cookies?: Record<string,string>;
  } = {}) {
    const { sessionProps = {}, cookies = {} } = options;
    const app: Application = express();

    // parse bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub session / login
    app.use((req, _res, next) => {
      const sess: any = { ...sessionProps };
      sess.save = (cb: (err?: any) => void) => {
        if (sessionProps.saveError) {cb(sessionProps.saveError);}
        else {cb();}
      };
      (req as any).session = sess;
      (req as any).login = (user: any, cb: (err?: any) => void) => {
        if (sessionProps.loginError) {cb(sessionProps.loginError);}
        else {cb();}
      };
      next();
    });

    // stub cookies
    app.use((req, _res, next) => {
      req.cookies = cookies;
      next();
    });

    // stub translator
    app.use((req, _res, next) => {
      req.__ = (msg: string) => msg;
      next();
    });

    // override render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    // mount the routes
    loginRoutes(app);
    return app;
  }

  it('redirects to /chat on successful login', async () => {
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs(
        '/login/chat',
        { username: 'alice', password: 'pass' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({ headers: { 'set-cookie': ['SESSION=abc'] } });

    const app = mkApp({ cookies: { lang: 'en' } });
    await request(app)
      .post('/login')
      .send({ username: 'alice', password: 'pass' })
      .expect(302)
      .expect('Location', '/chat');
  });

  it('re-renders login on session.save error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post.resolves({ headers: { 'set-cookie': 'SESSION=xyz' } });

    const saveError = new Error('save failed');
    const app = mkApp({
      sessionProps: { saveError },
      cookies: { lang: 'cy' },
    });
    const res = await request(app)
      .post('/login')
      .send({ username: 'bob', password: 'pw' })
      .expect(200);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      error: 'loginSessionError',
      username: 'bob',
    });
  });

  it('re-renders login with backend error message', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tok123' } });
    const backendErr: any = new Error('fail');
    backendErr.response = { data: 'Bad credentials' };
    stubClient.post.rejects(backendErr);

    const app = mkApp();
    const res = await request(app)
      .post('/login')
      .send({ username: 'carol', password: 'pw' })
      .expect(200);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      error: 'Bad credentials',
      username: 'carol',
    });
  });

  it('re-renders login with default message on non-string backend error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tok123' } });
    const genericErr: any = new Error('fail');
    genericErr.response = { data: { foo: 'bar' } };
    stubClient.post.rejects(genericErr);

    const app = mkApp();
    const res = await request(app)
      .post('/login')
      .send({ username: 'dan', password: 'pw' })
      .expect(200);

    expect(res.body.view).to.equal('login');
    expect(res.body.options).to.deep.equal({
      error: 'loginInvalidCredentials',
      username: 'dan',
    });
  });
});
