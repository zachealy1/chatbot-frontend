import forgotPasswordRoutes from '../../main/routes/forgot-password';

import { expect } from 'chai';
import express, { Application } from 'express';
import request from 'supertest';

describe('GET /forgot-password', () => {
  function mkApp() {
    const app: Application = express();

    // stub res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotPasswordRoutes(app);
    return app;
  }

  it('renders the forgot-password view', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/forgot-password')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.view).to.equal('forgot-password');
    expect(res.body.options).to.be.undefined;
  });
});
