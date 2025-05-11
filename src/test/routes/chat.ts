import * as authModule from '../../main/modules/auth';
import chatRoutes from '../../main/routes/chat';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('POST /chat', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');
    sinon.stub(console, 'log');

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

  function mkApp(sessionCookie?: string, userCookie?: string) {
    const app: Application = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      (req as any).session = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
      }
      (req as any).user = {};
      if (userCookie) {
        (req as any).user.springSessionCookie = userCookie;
      }
      next();
    });
    chatRoutes(app);
    return app;
  }

  it('returns 401 when no session or user cookie is present', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/chat')
      .send({ message: 'hello' })
      .expect(401)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      error: 'Session expired or invalid. Please log in again.',
    });
  });

  it('forwards message to backend and returns its response', async () => {
    stubClient.get
      .withArgs('http://localhost:4550/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs(
        'http://localhost:4550/chat',
        { message: 'hi', chatId: 'abc' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({ data: { chatId: 'abc', message: 'hi', timestamp: 123456 } });

    const app = mkApp('SESSION=foo');
    const payload = { message: 'hi', chatId: 'abc' };
    const res = await request(app)
      .post('/chat')
      .send(payload)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      chatId: 'abc',
      message: 'hi',
      timestamp: 123456,
    });
  });

  it('returns 500 when CSRF retrieval fails', async () => {
    stubClient.get.rejects(new Error('csrf error'));

    const app = mkApp('SESSION=foo');
    const res = await request(app)
      .post('/chat')
      .send({ message: 'hello' })
      .expect(500)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      error: 'An error occurred while sending the chat message. Please try again later.',
    });
  });

  it('returns 500 when backend chat POST fails', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    stubClient.post.rejects(new Error('chat error'));

    const app = mkApp(undefined, 'SESSION=bar');
    const res = await request(app)
      .post('/chat')
      .send({ message: 'test', chatId: '123' })
      .expect(500)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      error: 'An error occurred while sending the chat message. Please try again later.',
    });
  });
});

describe('GET /chat', () => {
  let ensureStub: sinon.SinonStub;

  beforeEach(() => {
    // by default, simulate an authenticated user
    ensureStub = sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp() {
    const app: Application = express();

    // stub render → JSON
    app.use((req, res, next) => {
      res.render = (view: string) => res.json({ view });
      next();
    });

    chatRoutes(app);
    return app;
  }

  it('renders the chat view when authenticated', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/chat')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ view: 'chat' });
    expect(ensureStub.calledOnce).to.be.true;
  });

  it('redirects to /login when not authenticated', async () => {
    // simulate an unauthenticated user
    ensureStub.restore();
    sinon.stub(authModule, 'ensureAuthenticated').callsFake((_req: Request, res: any) => {res.redirect('/login');});

    const app = mkApp();
    await request(app)
      .get('/chat')
      .expect(302)
      .expect('Location', '/login');
  });
});
