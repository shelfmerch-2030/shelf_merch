/** Shared demo credentials and sample field values — used by seed + README. */
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_LOGIN_EMAIL = 'test@shelfmerch.io';

/** Internal Shelf Merch platform team (`tenantId: null`, `/platform/*`). */
export const PLATFORM_LOGINS = [
  {
    email: 'admin@shelfmerch.io',
    role: 'platform_super_admin',
    name: 'ShelfMerch Admin',
    scope: 'Full platform — all areas read/write, tenant impersonation',
  },
  {
    email: 'ops@shelfmerch.io',
    role: 'platform_ops_admin',
    name: 'Ops Admin',
    scope: 'Orders, production, shipments, support, inventory — write',
  },
  {
    email: 'catalog@shelfmerch.io',
    role: 'platform_catalog_admin',
    name: 'Catalog Admin',
    scope: 'Catalog products, variants, inventory, kits — write',
  },
  {
    email: 'production@shelfmerch.io',
    role: 'platform_production_manager',
    name: 'Production Manager',
    scope: 'Production board, QC tasks — write',
  },
  {
    email: 'finance@shelfmerch.io',
    role: 'platform_finance_admin',
    name: 'Finance Admin',
    scope: 'Funding approvals, wallet adjustments, invoices, reports — write',
  },
  {
    email: 'sales@shelfmerch.io',
    role: 'platform_sales_manager',
    name: 'Sales Manager',
    scope: 'Sales enquiries and platform pipeline — read',
  },
  {
    email: 'support@shelfmerch.io',
    role: 'platform_support_agent',
    name: 'Support Agent',
    scope: 'Support tickets, cross-tenant search — write',
  },
  {
    email: 'logistics@shelfmerch.io',
    role: 'platform_logistics_manager',
    name: 'Logistics Manager',
    scope: 'Shipments, AWB, courier events — write',
  },
  {
    email: 'auditor@shelfmerch.io',
    role: 'platform_readonly_auditor',
    name: 'Auditor',
    scope: 'Read-only across ops areas + audit logs',
  },
];

/** Rubix tenant workspace (`localhost:8080` / `/app`). */
export const TENANT_LOGINS = [
  {
    email: DEMO_LOGIN_EMAIL,
    role: 'company_admin',
    name: 'ShelfMerch Test Login',
    scope: 'Temporary /app demo login — generate a password from Platform Settings',
    generatedPasswordOnly: true,
  },
  {
    email: 'hr@rubix.net',
    role: 'company_admin',
    name: 'Chandra Sekhar',
    scope: 'Full Rubix workspace — wallets, departments, shops, all campaigns',
  },
  {
    email: 'jonnaml2015@gmail.com',
    role: 'company_admin',
    name: 'Jonna Madhavi',
    scope: 'Full Rubix workspace (owner account)',
  },
  {
    email: 'priya@rubix.net',
    role: 'entity_manager',
    name: 'Priya Sharma',
    department: 'Marketing',
    scope: 'Marketing budget ₹3,00,000 — campaigns, contacts, dept orders',
  },
  {
    email: 'ravi@rubix.net',
    role: 'entity_manager',
    name: 'Ravi Kumar',
    department: 'Sales',
    scope: 'Sales budget ₹2,00,000 — Q1 prospect gifting campaign',
  },
  {
    email: 'anita@rubix.net',
    role: 'entity_manager',
    name: 'Anita Rao',
    department: 'HR',
    scope: 'HR budget ₹2,00,000 — onboarding kit campaigns',
  },
  {
    email: 'karan@rubix.net',
    role: 'entity_manager',
    name: 'Karan Gupta',
    department: 'Admin',
    scope: 'Admin budget ₹1,50,000',
  },
  {
    email: 'amit@rubix.net',
    role: 'entity_manager',
    name: 'Amit Singh',
    department: 'Customer Success',
    scope: 'CS budget ₹1,50,000',
  },
  {
    email: 'husain@rubix.net',
    role: 'entity_manager',
    name: 'Husain',
    department: 'DevOps',
    scope: 'DevOps budget ₹1,00,000 — hackathon swag',
  },
];

export const DEPARTMENTS = [
  {
    name: 'Marketing',
    desc: 'Events, conferences, swag campaigns and promotions.',
    users: 25,
    allocated: 300_000,
    color: '#2563EB',
    mgr: { name: 'Priya Sharma', email: 'priya@rubix.net', mobile: '+91 98765 43210' },
  },
  {
    name: 'Sales',
    desc: 'Client gifting, field sales kits and prospect merchandise.',
    users: 40,
    allocated: 200_000,
    color: '#7C3AED',
    mgr: { name: 'Ravi Kumar', email: 'ravi@rubix.net', mobile: '+91 98220 11234' },
  },
  {
    name: 'HR',
    desc: 'Onboarding kits, employee rewards and recognition.',
    users: 30,
    allocated: 200_000,
    color: '#0E9CB5',
    mgr: { name: 'Anita Rao', email: 'anita@rubix.net', mobile: '+91 99001 22789' },
  },
  {
    name: 'Admin',
    desc: 'Office supplies, signage and facility merchandise.',
    users: 12,
    allocated: 150_000,
    color: '#E08600',
    mgr: { name: 'Karan Gupta', email: 'karan@rubix.net', mobile: '+91 90040 55678' },
  },
  {
    name: 'Customer Success',
    desc: 'Customer welcome kits and loyalty merchandise.',
    users: 18,
    allocated: 150_000,
    color: '#0A8F5B',
    mgr: { name: 'Amit Singh', email: 'amit@rubix.net', mobile: '+91 96320 99001' },
  },
  {
    name: 'DevOps',
    desc: 'Team swag, hackathon kits and internal engineering events.',
    users: 8,
    allocated: 100_000,
    color: '#DB2777',
    mgr: { name: 'Husain', email: 'husain@rubix.net', mobile: '+91 98765 11111' },
  },
];

export const DEMO_REDEMPTION_TOKEN = 'seedDemoRedemptionTokenRubix26!';
export const DEMO_ORDER_MOCKUP_TOKEN = 'seedDemoOrderMockupRubix26!';

export function formatLoginTable() {
  const rows = [
    ...PLATFORM_LOGINS.map((u) => `${u.email} / ${DEMO_PASSWORD} → ${u.role}`),
    ...TENANT_LOGINS.map((u) => {
      const dept = u.department ? ` — ${u.department}` : '';
      const passwordHint = u.generatedPasswordOnly ? 'generate in Platform Settings' : DEMO_PASSWORD;
      return `${u.email} / ${passwordHint} → ${u.role}${dept}`;
    }),
  ];
  return rows;
}
