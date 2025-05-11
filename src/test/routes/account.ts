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
