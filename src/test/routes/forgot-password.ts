import forgotPasswordRoutes from '../../main/routes/forgot-password';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /forgot-password', () => {
  function mkApp() {
    const app: Application = express();

    // stub res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('renders the forgot-password view', async () => {
    const app = mkApp();
    const res = await request(app).get('/forgot-password').expect(200).expect('Content-Type', /json/);

    expect(res.body.view).to.equal('forgot-password');
    expect(res.body.options).to.be.undefined;
  });
});

describe('GET /forgot-password/verify-otp', () => {
  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();

    // stub cookies and render
    app.use((req, res, next) => {
      req.cookies = cookies;
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('renders default verify-otp view with lang=en and sent=false', async () => {
    const app = mkApp();
    const res = await request(app).get('/forgot-password/verify-otp').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: {},
        oneTimePassword: '',
      },
    });
  });

  it('renders with sent=true when query param is present', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/forgot-password/verify-otp?sent=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: true,
        fieldErrors: {},
        oneTimePassword: '',
      },
    });
  });

  it('renders with lang=cy when lang cookie is cy', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app).get('/forgot-password/verify-otp').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'cy',
        sent: false,
        fieldErrors: {},
        oneTimePassword: '',
      },
    });
  });

  it('handles both lang=cy and sent=true together', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app)
      .get('/forgot-password/verify-otp?sent=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'cy',
        sent: true,
        fieldErrors: {},
        oneTimePassword: '',
      },
    });
  });
});

describe('GET /forgot-password/reset-password', () => {
  function mkApp() {
    const app: Application = express();

    // stub res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('renders the reset-password view', async () => {
    const app = mkApp();
    const res = await request(app).get('/forgot-password/reset-password').expect(200).expect('Content-Type', /json/);

    expect(res.body.view).to.equal('reset-password');
    expect(res.body.options).to.be.undefined;
  });
});

describe('POST /forgot-password/enter-email', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');
    // stub axios-cookiejar-support.wrapper -> our fake client
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub cookies and session
    app.use((req, _res, next) => {
      req.cookies = cookies;
      (req as any).session = {};
      next();
    });

    // stub translator
    app.use((req, _res, next) => {
      req.__ = (msg: string) => msg;
      next();
    });

    // override render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('re-renders with emailInvalid when email is missing', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({})
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('forgot-password');
    expect(res.body.options).to.deep.equal({
      fieldErrors: { email: 'emailInvalid' },
      lang: 'en',
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders with emailInvalid when email is invalid', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email: 'not-an-email' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('forgot-password');
    expect(res.body.options).to.deep.equal({
      lang: 'en',
      fieldErrors: { email: 'emailInvalid' },
      email: 'not-an-email',
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to verify-otp on successful submit (lang=en)', async () => {
    const email = 'user@example.com';
    stubClient.get.withArgs('/csrf').resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs('/forgot-password/enter-email', { email }, sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } }))
      .resolves({});

    const app = mkApp(); // default lang=en
    await request(app)
      .post('/forgot-password/enter-email')
      .send({ email })
      .expect(302)
      .expect('Location', '/forgot-password/verify-otp?lang=en');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('redirects to verify-otp on successful submit (lang=cy)', async () => {
    const email = 'user2@example.com';
    stubClient.get.withArgs('/csrf').resolves({ data: { csrfToken: 'tokABC' } });
    stubClient.post.resolves({});

    const app = mkApp({ lang: 'cy' });
    await request(app)
      .post('/forgot-password/enter-email')
      .send({ email })
      .expect(302)
      .expect('Location', '/forgot-password/verify-otp?lang=cy');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('renders general error when backend post returns string error', async () => {
    const email = 'user3@example.com';
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: 'Backend down' };
    stubClient.post.rejects(err);

    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('forgot-password');
    expect(res.body.options).to.deep.equal({
      lang: 'en',
      fieldErrors: { general: 'Backend down' },
      email,
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('renders general error when backend post returns non-string error', async () => {
    const email = 'user4@example.com';
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: { foo: 'bar' } };
    stubClient.post.rejects(err);

    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('forgot-password');
    expect(res.body.options).to.deep.equal({
      lang: 'en',
      fieldErrors: { general: 'forgotPasswordError' },
      email,
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});

describe('POST /forgot-password/reset-password', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');
    // fake axios client
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(
    options: {
      session?: Record<string, any>;
      cookies?: Record<string, string>;
    } = {}
  ) {
    const { session = {}, cookies = {} } = options;
    const app: Application = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub session, cookies, and translator
    app.use((req, _res, next) => {
      req.cookies = cookies;
      (req as any).session = { ...session };
      req.__ = (msg: string) => msg;
      next();
    });

    // override render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('re-renders with all validation errors when fields and session missing', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({})
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('reset-password');
    expect(res.body.options).to.deep.equal({
      lang: 'en',
      fieldErrors: {
        password: 'passwordRequired',
        confirmPassword: 'confirmPasswordRequired',
        general: 'resetSessionMissing',
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders with confirmPassword error when passwords mismatch', async () => {
    const session = { email: 'user@example.com', verifiedOtp: 'otp123' };
    const app = mkApp({ session });
    const payload = { password: 'StrongP@ss1', confirmPassword: 'WrongP@ss2' };
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('reset-password');
    expect(res.body.options.fieldErrors).to.have.property('confirmPassword', 'passwordsMismatch');
    expect(res.body.options.fieldErrors).to.not.have.property('password');
    expect(res.body.options.fieldErrors).to.not.have.property('general');
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to login with reset banner on success (lang=en)', async () => {
    const session = { email: 'user@example.com', verifiedOtp: 'otp123' };
    stubClient.get.withArgs('/csrf').resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs(
        '/forgot-password/reset-password',
        { email: 'user@example.com', otp: 'otp123', password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    const app = mkApp({ session });
    await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(302)
      .expect('Location', '/login?passwordReset=true&lang=en');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('redirects to login with reset banner on success (lang=cy)', async () => {
    const session = { email: 'user2@example.com', verifiedOtp: 'otp456' };
    stubClient.get.resolves({ data: { csrfToken: 'tokABC' } });
    stubClient.post.resolves({});

    const app = mkApp({ session, cookies: { lang: 'cy' } });
    await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(302)
      .expect('Location', '/login?passwordReset=true&lang=cy');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with general error on backend string error', async () => {
    const session = { email: 'user3@example.com', verifiedOtp: 'otp789' };
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: 'Reset failed' };
    stubClient.post.rejects(err);

    const app = mkApp({ session });
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('reset-password');
    expect(res.body.options.fieldErrors).to.deep.equal({ general: 'Reset failed' });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with general error on backend non-string error', async () => {
    const session = { email: 'user4@example.com', verifiedOtp: 'otp012' };
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: { foo: 'bar' } };
    stubClient.post.rejects(err);

    const app = mkApp({ session });
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('reset-password');
    expect(res.body.options.fieldErrors).to.deep.equal({ general: 'resetError' });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});

describe('POST /forgot-password/verify-otp', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');

    // fake axios client with CSRF and verify-otp endpoints
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(
    options: {
      session?: Record<string, any>;
      cookies?: Record<string, string>;
    } = {}
  ) {
    const { session = {}, cookies = {} } = options;
    const app: Application = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub session, cookies, and translator
    app.use((req, _res, next) => {
      req.cookies = cookies;
      (req as any).session = { ...session };
      req.__ = (msg: string) => msg;
      next();
    });

    // override render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('re-renders with both general and OTP errors when session and OTP missing', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({})
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: {
          general: 'noEmailInSession',
          oneTimePassword: 'otpRequired',
        },
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders with OTP error when only session email present', async () => {
    const app = mkApp({ session: { email: 'user@example.com' } });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({})
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: {
          oneTimePassword: 'otpRequired',
        },
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders with general error when only OTP provided', async () => {
    const app = mkApp({ session: { email: 'user@example.com' } });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '  ' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: {
          oneTimePassword: 'otpRequired',
        },
        oneTimePassword: '  ',
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to reset-password on successful OTP verify (lang=en)', async () => {
    stubClient.get.withArgs('/csrf').resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs(
        '/forgot-password/verify-otp',
        { email: 'user@example.com', otp: '1234' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    const app = mkApp({ session: { email: 'user@example.com' }, cookies: {} });
    await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '1234' })
      .expect(302)
      .expect('Location', '/forgot-password/reset-password?lang=en');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('redirects to reset-password on successful OTP verify (lang=cy)', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokABC' } });
    stubClient.post.resolves({});

    const app = mkApp({
      session: { email: 'user2@example.com' },
      cookies: { lang: 'cy' },
    });
    await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '5678' })
      .expect(302)
      .expect('Location', '/forgot-password/reset-password?lang=cy');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with backend string error on verify failure', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: 'OTP expired' };
    stubClient.post.rejects(err);

    const app = mkApp({ session: { email: 'user3@example.com' } });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '9999' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: { general: 'OTP expired' },
        oneTimePassword: '9999',
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with fallback error on non-string backend error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: { code: 'ERR' } };
    stubClient.post.rejects(err);

    const app = mkApp({ session: { email: 'user4@example.com' } });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '0000' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: { general: 'otpVerifyError' },
        oneTimePassword: '0000',
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});

describe('POST /forgot-password/resend-otp', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // silence logs
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    // fake axios client
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(session: Record<string, any> = {}) {
    const app: Application = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub session and render
    app.use((req, res, next) => {
      (req as any).session = { ...session };
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('re-renders verify-otp with error when no email in session', async () => {
    const app = mkApp();
    const res = await request(app).post('/forgot-password/resend-otp').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        error: 'No valid email found. Please start the reset process again.',
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders verify-otp with error when email invalid', async () => {
    const app = mkApp({ email: 'not-an-email' });
    const res = await request(app).post('/forgot-password/resend-otp').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        error: 'No valid email found. Please start the reset process again.',
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to verify-otp on successful resend', async () => {
    // stub CSRF fetch
    stubClient.get.withArgs('http://localhost:4550/csrf').resolves({ data: { csrfToken: 'tok123' } });

    // stub resend-otp post
    stubClient.post
      .withArgs(
        'http://localhost:4550/forgot-password/resend-otp',
        { email: 'user@example.com' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({ data: {} });

    const app = mkApp({ email: 'user@example.com' });
    await request(app)
      .post('/forgot-password/resend-otp')
      .expect(302)
      .expect('Location', '/forgot-password/verify-otp');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders verify-otp with backend string error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokABC' } });
    const err: any = new Error('fail');
    err.response = { data: 'Service down' };
    stubClient.post.rejects(err);

    const app = mkApp({ email: 'user2@example.com' });
    const res = await request(app).post('/forgot-password/resend-otp').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        error: 'Service down',
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders verify-otp with fallback error on backend non-string error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: { code: 'ERR' } };
    stubClient.post.rejects(err);

    const app = mkApp({ email: 'user3@example.com' });
    const res = await request(app).post('/forgot-password/resend-otp').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        error: { code: 'ERR' },
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});
