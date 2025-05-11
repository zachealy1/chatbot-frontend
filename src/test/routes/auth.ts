import loginRoutes from '../../main/routes/auth';

import { expect } from 'chai';
import express, { Application } from 'express';
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
