import registerRoutes from '../../main/routes/register';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /register', () => {
  function mkApp() {
    const app: Application = express();

    // stub res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    registerRoutes(app);
    return app;
  }

  it('renders the register view', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/register')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'register',
    });
  });
});

describe('POST /register', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // silence console.error from the route
    sinon.stub(console, 'error');

    // fake axios client
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub cookies and translator
    app.use((req, _res, next) => {
      req.cookies = cookies;
      req.__ = (msg: string) => msg;
      next();
    });

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    registerRoutes(app);
    return app;
  }

  it('re-renders with validation errors when body is empty', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/register')
      .send({})
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('register');
    const errs = res.body.options.fieldErrors;
    expect(errs).to.include.keys(
      'username',
      'email',
      'dateOfBirth',
      'password',
      'confirmPassword'
    );
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders with confirmPassword error when passwords mismatch', async () => {
    const app = mkApp();
    const payload = {
      username: 'user1',
      email: 'user1@example.com',
      'date-of-birth-day': '1',
      'date-of-birth-month': '1',
      'date-of-birth-year': '1990',
      password: 'StrongP@ss1',
      confirmPassword: 'WrongP@ss2',
    };
    const res = await request(app)
      .post('/register')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('register');
    expect(res.body.options.fieldErrors).to.have.property(
      'confirmPassword',
      'passwordsMismatch'
    );
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to login?created=true&lang=en on successful registration', async () => {
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post.resolves({});

    const app = mkApp();
    const payload = {
      username: 'alice',
      email: 'alice@example.com',
      'date-of-birth-day': '2',
      'date-of-birth-month': '2',
      'date-of-birth-year': '1992',
      password: 'StrongP@ss1',
      confirmPassword: 'StrongP@ss1',
    };
    await request(app)
      .post('/register')
      .send(payload)
      .expect(302)
      .expect('Location', '/login?created=true&lang=en');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('redirects to login?created=true&lang=cy when lang cookie is cy', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokABC' } });
    stubClient.post.resolves({});

    const app = mkApp({ lang: 'cy' });
    const payload = {
      username: 'bob',
      email: 'bob@example.com',
      'date-of-birth-day': '3',
      'date-of-birth-month': '3',
      'date-of-birth-year': '1993',
      password: 'StrongP@ss1',
      confirmPassword: 'StrongP@ss1',
    };
    await request(app)
      .post('/register')
      .send(payload)
      .expect(302)
      .expect('Location', '/login?created=true&lang=cy');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with backend string error if registration fails', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: 'Username taken' };
    stubClient.post.rejects(err);

    const app = mkApp();
    const payload = {
      username: 'charlie',
      email: 'charlie@example.com',
      'date-of-birth-day': '4',
      'date-of-birth-month': '4',
      'date-of-birth-year': '1994',
      password: 'StrongP@ss1',
      confirmPassword: 'StrongP@ss1',
    };
    const res = await request(app)
      .post('/register')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('register');
    expect(res.body.options.fieldErrors).to.deep.include({
      general: 'Username taken',
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with fallback error if backend returns non-string', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    const err: any = new Error('fail');
    err.response = { data: { code: 'ERR' } };
    stubClient.post.rejects(err);

    const app = mkApp();
    const payload = {
      username: 'donna',
      email: 'donna@example.com',
      'date-of-birth-day': '5',
      'date-of-birth-month': '5',
      'date-of-birth-year': '1995',
      password: 'StrongP@ss1',
      confirmPassword: 'StrongP@ss1',
    };
    const res = await request(app)
      .post('/register')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('register');
    expect(res.body.options.fieldErrors).to.deep.include({
      general: 'registerError',
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});
