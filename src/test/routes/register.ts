import registerRoutes from '../../main/routes/register';

import { expect } from 'chai';
import express, { Application } from 'express';
import request from 'supertest';

describe('GET /register', () => {
  function mkApp() {
    const app: Application = express();

    // stub res.render → JSON
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
