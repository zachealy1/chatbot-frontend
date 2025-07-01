import * as authModule from '../../main/modules/auth';
import contactSupportRoutes from '../../main/routes/contact-support';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /contact-support', () => {
  let ensureStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // silence logs
    sinon.stub(console, 'error');
    sinon.stub(console, 'log');

    // stub authentication middleware
    ensureStub = sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    stubClient = { get: sinon.stub() };
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(() => stubClient as any);
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

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    contactSupportRoutes(app);
    return app;
  }

  it('renders fallback banner when no session cookie', async () => {
    const app = mkApp();
    const res = await request(app).get('/contact-support').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'contact-support',
      options: {
        supportBanner: {
          titleText: 'Contact Support Team',
          html: "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
        },
      },
    });
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('fetches banner and renders it when session cookie present', async () => {
    const fetched = { title: 'Help', content: '<p>help content</p>' };
    stubClient.get.withArgs('http://localhost:4550/support-banner/1').resolves({ data: fetched });

    const app = mkApp('SESSION=abc');
    const res = await request(app).get('/contact-support').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'contact-support',
      options: {
        supportBanner: {
          titleText: 'Help',
          html: '<p>help content</p>',
        },
      },
    });
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('renders fallback banner when backend fetch fails', async () => {
    stubClient.get.rejects(new Error('fetch failed'));

    const app = mkApp('SESSION=abc');
    const res = await request(app).get('/contact-support').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'contact-support',
      options: {
        supportBanner: {
          titleText: 'Contact Support Team',
          html: "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
        },
      },
    });
    expect(ensureStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });
});
