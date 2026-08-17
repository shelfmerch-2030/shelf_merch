import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { DemoLead } from '../src/modules/demoLeads/demoLead.model.js';
import { makeUser } from './helpers.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

beforeEach(clearTestDb);
afterAll(disconnectTestDb);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('demo leads', () => {
  it('stores an interested client lead without authentication', async () => {
    const payload = {
      fullName: 'Asha Sharma',
      companyName: 'Acme India',
      workEmail: 'ASHA@ACME.IN',
      mobileNumber: '+91 98765 43210',
      requirement: 'Employee Onboarding Kits',
    };

    const res = await request(app).post('/api/v1/demo-leads').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'new' });

    const lead = await DemoLead.findById(res.body.id).lean();
    expect(lead).toMatchObject({
      fullName: 'Asha Sharma',
      companyName: 'Acme India',
      workEmail: 'asha@acme.in',
      mobileNumber: '+91 98765 43210',
      requirement: 'Employee Onboarding Kits',
      status: 'new',
      source: 'request-demo-page',
    });
  });

  it('rejects invalid public lead submissions', async () => {
    const res = await request(app).post('/api/v1/demo-leads').send({
      fullName: '',
      companyName: 'Acme India',
      workEmail: 'not-an-email',
      mobileNumber: 'abc',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await DemoLead.countDocuments()).toBe(0);
  });

  it('lists saved demo leads for the sales platform role', async () => {
    await DemoLead.create([
      {
        fullName: 'Asha Sharma',
        companyName: 'Acme India',
        workEmail: 'asha@acme.in',
        mobileNumber: '+91 98765 43210',
        requirement: 'Employee Onboarding Kits',
      },
      {
        fullName: 'Rohan Mehta',
        companyName: 'NovaWorks',
        workEmail: 'rohan@novaworks.in',
        mobileNumber: '+91 90000 11111',
        requirement: 'Prospect and Client Gifting',
      },
    ]);
    const sales = await makeUser(null, 'platform_sales_manager', 'platform');

    const res = await request(app).get('/api/v1/platform/demo-leads').set(auth(sales.token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.items.map((lead) => lead.workEmail).sort()).toEqual([
      'asha@acme.in',
      'rohan@novaworks.in',
    ]);
  });

  it('blocks unrelated platform roles from the sales lead list', async () => {
    await DemoLead.create({
      fullName: 'Asha Sharma',
      companyName: 'Acme India',
      workEmail: 'asha@acme.in',
      mobileNumber: '+91 98765 43210',
    });
    const support = await makeUser(null, 'platform_support_agent', 'platform');

    const res = await request(app).get('/api/v1/platform/demo-leads').set(auth(support.token));

    expect(res.status).toBe(403);
  });
});
