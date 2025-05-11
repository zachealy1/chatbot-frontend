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
