import { app } from '../../main/app';

import { expect } from 'chai';
import request from 'supertest';

describe('Home Route', () => {
  describe('GET /', () => {
    it('should redirect (302) to /login', async () => {
      const res = await request(app).get('/');
      expect(res.status).to.equal(302);
      expect(res.headers).to.have.property('location', '/login');
    });
  });

  describe('Non-GET methods on /', () => {
    it('should return 404 for POST /', async () => {
      const res = await request(app).post('/');
      expect(res.status).to.equal(404);
    });

    it('should return 404 for PUT /', async () => {
      const res = await request(app).put('/');
      expect(res.status).to.equal(404);
    });
  });
});
