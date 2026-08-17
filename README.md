# ShelfMerch

Multi-tenant B2B SaaS for corporate swag, gifting, budget wallets, and employee
redemption — India-first (INR, GST, Razorpay).

## Repository Layout (npm workspaces monorepo)

```text
shelf_merch/
├── apps/
│   ├── api/                ← Backend (Node.js + Express + Mongoose, modular monolith)
│   └── web/                ← Frontend (Vite + React SPA, TanStack Router)
├── docs/                   ← Build spec (shelfmerch_backend_integration_prompt.md)
├── docker-compose.yml      ← Optional local Redis only (MongoDB = Atlas via MONGO_URL)
├── package.json            ← workspace root
├── .env.example
└── README.md
```

## Quick Start

Prereqs: Node 20+, MongoDB Atlas cluster (M0+ — replica set required for ledger transactions).

```bash
# 1. Env — set MONGO_URL to your Atlas connection string
copy .env.example .env
# Edit .env: MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/shelfmerch

# 2. Install everything (workspaces)
npm install

# 3. (Optional) Local Redis for background job queues
docker compose up -d

# 4. Run
npm run seed       # WIPES and re-seeds demo data — only run on dev/staging Atlas DBs
npm run dev:api    # http://localhost:3001/api/v1
npm run dev:web    # http://localhost:8080

# Frontend talks to the API when VITE_USE_MOCKS is not "true" (see .env.example).
# Vite proxies /api → localhost:3001 in dev.
```

### Redemption portal (public)

After seeding, open `http://localhost:8080/redeem/seedDemoRedemptionTokenRubix26!`
to test the recipient flow (OTP → catalog → order).

### Demo logins (password: `demo1234`)

Run `npm run seed` first — it wipes and repopulates **every role** with sample data.

#### Platform team (`/platform/*`)

| Email | Role | Try this after login |
|---|---|---|
| `admin@shelfmerch.io` | `platform_super_admin` | Full access — tenants, impersonation, all modules |
| `ops@shelfmerch.io` | `platform_ops_admin` | **Orders** — 3 Rubix orders in pipeline |
| `catalog@shelfmerch.io` | `platform_catalog_admin` | **Catalog / Inventory** — 12 products, low-stock cap |
| `production@shelfmerch.io` | `platform_production_manager` | **Production** — hoodie order in `printing` |
| `finance@shelfmerch.io` | `platform_finance_admin` | **Finance** — proforma + tax invoice, credit note |
| `sales@shelfmerch.io` | `platform_sales_manager` | **Sales** — enquiries and platform pipeline |
| `support@shelfmerch.io` | `platform_support_agent` | **Support** — 2 tickets (address change + redemption) |
| `logistics@shelfmerch.io` | `platform_logistics_manager` | **Shipments** — Delhivery AWB in transit |
| `auditor@shelfmerch.io` | `platform_readonly_auditor` | Read-only — audit logs, no writes |

#### Rubix tenant (`localhost:8080`)

| Email | Role | Department | Budget | Sample data |
|---|---|---|---|---|
| `hr@rubix.net` | `company_admin` | — | Full wallet ₹11,00,000 | Wallets, all 6 departments, mockup approval |
| `jonnaml2015@gmail.com` | `company_admin` | — | (owner) | Same as admin + notifications |
| `priya@rubix.net` | `entity_manager` | Marketing | ₹3,00,000 | **Diwali Gift 2026** campaign (live) |
| `ravi@rubix.net` | `entity_manager` | Sales | ₹2,00,000 | **Q1 Prospect Gifting** campaign (live) |
| `anita@rubix.net` | `entity_manager` | HR | ₹2,00,000 | Dept budget view |
| `karan@rubix.net` | `entity_manager` | Admin | ₹1,50,000 | Dept budget view |
| `amit@rubix.net` | `entity_manager` | Customer Success | ₹1,50,000 | Dept budget view |
| `husain@rubix.net` | `entity_manager` | DevOps | ₹1,00,000 | Dept budget view |

#### Seeded entities (by module)

| Module | What's populated |
|---|---|
| **Wallet** | FY2026 budget, PO `PO-RUBIX-2026-0417`, 6 departments fully allocated |
| **Shops** | Rubix Dubai (points), Rubix Bengaluru (INR) |
| **Collections / Kits** | New employee swag, Welcome + New hire kits |
| **Catalog** | 12 products with cost, GST, HSN, inventory levels |
| **Contacts** | 7 contacts with roles, phones, addresses |
| **Campaigns** | Diwali Gift (Marketing), Q1 Prospect Gifting (Sales) |
| **Orders** | `SM-2026-100001` mockup pending · `100002` in production · `100003` shipped |
| **Platform ops** | 3 vendors, production task, shipment, 2 support tickets |
| **Finance** | Proforma, tax invoice, payment, credit note |
| **Notifications** | Tenant + platform in-app alerts |

#### Public redemption URLs

| URL | Purpose |
|---|---|
| `http://localhost:8080/redeem/seedDemoRedemptionTokenRubix26!` | Open redemption — Chandra (Diwali campaign) |
| `http://localhost:8080/redeem/seedDemoOrderMockupRubix26!` | Recipient who placed order SM-2026-100001 |

Reference source: `apps/api/src/seed/demoReference.js`

### Tests

```bash
npm test           # API suite (vitest) then web suite (vitest)
npm run test:api   # API only
npm run test:web   # frontend unit tests only
```

API tests prefer the Docker Mongo replica set (`shelfmerch_test` db) and fall back
to `mongodb-memory-server` when Docker isn't available. Web tests run in jsdom
via Vitest + Testing Library.

## Architecture Invariants (enforced in code)

- **Tenant isolation** — every tenant-scoped model uses a Mongoose plugin that
  rejects any query missing a `tenantId` filter (platform routes opt out
  explicitly with `skipTenantGuard`).
- **Ledger** — `WalletTransaction` is append-only (update/delete hooks throw);
  `wallet.balance` is a cached value, always recomputable via
  `ledger.recomputeBalance()`. All ledger writes run in MongoDB transactions.
- **State machines** — Wallet/Campaign/Order/Redemption status changes only
  flow through `stateMachine.service.js`; API responses include
  `validNextStatuses`.
- **RBAC + ABAC** — middleware order: `authenticate → resolveTenant →
  requireRole → requireScope`. Entity managers only see/touch their assigned
  entities.
- **Idempotency** — mutating money routes accept an `Idempotency-Key` header;
  replays return the cached response (24h TTL).
- **Audit + soft deletes** — every state-changing action writes an `AuditLog`;
  tenant data is never hard-deleted (`deletedAt`).

## Delivery Status (per §12 of the build spec)

- [x] **Phase 1 — Foundation**: scaffolding, env validation, Mongo/Redis,
      auth (login/refresh/logout/forgot/reset/invites), tenants, users, roles,
      RBAC/ABAC middleware, health check, seed
- [x] **Phase 2 — Wallet Ledger**: Wallet/WalletTransaction/Entity models,
      ledger service, full wallet setup wizard endpoints, transfers, paginated
      ledger, activation gating
- [x] **Phase 3 — Catalog & Store**: shops, platform catalog, collections, kits, R2/local uploads
- [x] **Phase 4 — Contacts & Campaigns**: CSV import (BullMQ + inline fallback), campaign state machine, launch debits
- [x] **Phase 5 — Redemption Portal**: public token routes, MSG91 OTP/SMS, session JWT on catalog/submit
- [x] **Phase 6 — Platform control plane**: orders API (list/detail, status transitions + ABAC), vendors, shipments, support tickets, platform ops routes (orders/production/shipments/audit), impersonation start/end.
- [x] **Phase 7 — Payments & Invoicing**: Razorpay order + signed webhook → wallet fund, GST invoices (PDF), in-app + SMS notifications
- [ ] Phase 8 — Hardening & deployment
- [x] **Frontend API integration (MVP)**: `apps/web/src/services/` API client,
      real login/session restore, workspace hydration (shops, contacts, kits,
      catalog, wallets/entities, campaigns), shop publish + contact create;
      public redemption portal at `/redeem/:token`. Set `VITE_USE_MOCKS=true`
      to fall back to in-memory demo data.
