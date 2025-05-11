import * as authModule from '../../main/modules/auth';
import chatHistoryRoutes from '../../main/routes/chat-history';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /chat-history', () => {
  let ensureStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // silence logs from the route
    sinon.stub(console, 'error');
    sinon.stub(console, 'log');

    // stub ensureAuthenticated to always allow through
    ensureStub = sinon
      .stub(require('../../main/modules/auth'), 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // stub axios-cookiejar-support.wrapper → our fake client
    stubClient = { get: sinon.stub() };
    sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();

    // stub session/user
    app.use((req, _res, next) => {
      (req as any).session = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
      }
      (req as any).user = {};
      next();
    });

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    chatHistoryRoutes(app);
    return app;
  }

  it('renders an error view when no session cookie is present', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/chat-history')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'chat-history',
      options: {
        chats: [],
        error: 'Unable to load chat history at this time.',
      },
    });
  });

  it('fetches chat history and renders it when session cookie is present', async () => {
    // stub CSRF token fetch
    stubClient.get
      .withArgs('http://localhost:4550/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });

    // stub chats fetch
    const sampleChats = [{ id: 1, message: 'hello' }, { id: 2, message: 'world' }];
    stubClient.get
      .withArgs('http://localhost:4550/chat/chats', sinon.match({
        headers: { 'X-XSRF-TOKEN': 'tok123' },
      }))
      .resolves({ data: sampleChats });

    const app = mkApp('SESSION=abc');
    const res = await request(app)
      .get('/chat-history')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'chat-history',
      options: { chats: sampleChats },
    });
    expect(ensureStub.calledOnce).to.be.true;
  });
});

describe('GET /delete-chat-history', () => {
  let ensureStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; delete: sinon.SinonStub };

  beforeEach(() => {
    // silence logging from the route
    sinon.stub(console, 'error');
    sinon.stub(console, 'log');

    // allow authentication to pass through
    ensureStub = sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client with get and delete methods
    stubClient = {
      get: sinon.stub(),
      delete: sinon.stub(),
    };
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();

    // stub session and user
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
      }
      next();
    });

    // mount routes under test
    chatHistoryRoutes(app);
    return app;
  }

  it('returns 400 if chatId is missing', async () => {
    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/delete-chat-history')
      .expect(400)
      .expect('Missing chatId parameter.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('returns 401 if no session cookie is present', async () => {
    const app = mkApp();  // no sessionCookie
    await request(app)
      .get('/delete-chat-history?chatId=123')
      .expect(401)
      .expect('User not authenticated or session expired.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to /chat-history?deleted=true on successful delete', async () => {
    // stub CSRF fetch
    stubClient.get
      .withArgs('http://localhost:4550/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    // stub DELETE call
    stubClient.delete
      .withArgs('http://localhost:4550/chat/chats/123', sinon.match({
        headers: { 'X-XSRF-TOKEN': 'tok123' },
      }))
      .resolves({});

    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/delete-chat-history?chatId=123')
      .expect(302)
      .expect('Location', '/chat-history?deleted=true');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('returns 500 if CSRF retrieval fails', async () => {
    stubClient.get.rejects(new Error('csrf failed'));
    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/delete-chat-history?chatId=123')
      .expect(500)
      .expect('An error occurred while deleting the chat.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('returns 500 if delete call fails', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    stubClient.delete.rejects(new Error('delete failed'));

    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/delete-chat-history?chatId=456')
      .expect(500)
      .expect('An error occurred while deleting the chat.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });
});

describe('GET /open-chat-history', () => {
  let ensureStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // suppress logs
    sinon.stub(console, 'error');
    sinon.stub(console, 'log');

    // allow authentication to pass
    ensureStub = sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    stubClient = { get: sinon.stub() };
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();

    // stub session and user
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
      }
      next();
    });

    // stub render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    chatHistoryRoutes(app);
    return app;
  }

  it('returns 400 if chatId is missing', async () => {
    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/open-chat-history')
      .expect(400)
      .expect('Missing chatId parameter.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('returns 400 if chatId is not a number', async () => {
    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/open-chat-history?chatId=foo')
      .expect(400)
      .expect('Invalid chatId parameter.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('returns 401 if no session cookie is present', async () => {
    const app = mkApp(); // no cookie
    await request(app)
      .get('/open-chat-history?chatId=123')
      .expect(401)
      .expect('User not authenticated or session expired.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('fetches messages and renders chat view when valid', async () => {
    const sampleMessages = [
      { id: 1, text: 'hello' },
      { id: 2, text: 'world' },
    ];
    stubClient.get
      .withArgs('http://localhost:4550/chat/messages/123')
      .resolves({ data: sampleMessages });

    const app = mkApp('SESSION=abc');
    const res = await request(app)
      .get('/open-chat-history?chatId=123')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'chat',
      options: { chatId: 123, messages: sampleMessages },
    });
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('returns 500 on backend error', async () => {
    stubClient.get.rejects(new Error('network error'));

    const app = mkApp('SESSION=abc');
    await request(app)
      .get('/open-chat-history?chatId=456')
      .expect(500)
      .expect('Error retrieving chat history.');
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });
});
