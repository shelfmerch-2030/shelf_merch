import { ForbiddenError } from '../utils/errors.js';
import { PLATFORM_ROLES } from '../modules/roles/roleAssignment.model.js';

const SUPER = 'platform_super_admin';
const OPS = 'platform_ops_admin';
const CATALOG = 'platform_catalog_admin';
const PRODUCTION = 'platform_production_manager';
const FINANCE = 'platform_finance_admin';
const SALES = 'platform_sales_manager';
const SUPPORT = 'platform_support_agent';
const LOGISTICS = 'platform_logistics_manager';
const AUDITOR = 'platform_readonly_auditor';

/**
 * SUPER_ADMIN_FLOW §0 — role × area matrix. `write` lists the roles that may
 * mutate an area; `read` additionally always includes the super admin and the
 * read-only auditor. Operational areas are readable by every platform role
 * (the dashboard links across all of them); finance, settings and audit logs
 * are restricted even for reads. Team is readable by ops + support (ticket
 * assignment roster) but writable only by the super admin.
 */
const MATRIX = {
  dashboard: { write: [], read: PLATFORM_ROLES },
  catalog: { write: [CATALOG], read: PLATFORM_ROLES },
  inventory: { write: [CATALOG, OPS], read: PLATFORM_ROLES },
  kits: { write: [CATALOG], read: PLATFORM_ROLES },
  tenants: { write: [], read: PLATFORM_ROLES },
  orders: { write: [OPS, PRODUCTION], read: PLATFORM_ROLES },
  production: { write: [OPS, PRODUCTION], read: PLATFORM_ROLES },
  shipments: { write: [OPS, LOGISTICS], read: PLATFORM_ROLES },
  finance: { write: [FINANCE], read: [FINANCE] },
  sales: { write: [SALES], read: [SALES] },
  support: { write: [OPS, SUPPORT], read: PLATFORM_ROLES },
  // Ops + support need a read-only roster to assign tickets; invite/role
  // changes stay super-admin-only (write: []).
  team: { write: [], read: [OPS, SUPPORT] },
  settings: { write: [], read: [] },
  auditLogs: { write: [], read: [] },
};

export function rolesForArea(area, action = 'read') {
  const entry = MATRIX[area];
  if (!entry) throw new Error(`Unknown platform area "${area}"`);
  const roles = action === 'write' ? entry.write : [...entry.read, AUDITOR];
  return [...new Set([SUPER, ...roles])];
}

/** Route guard: platformArea('orders', 'write'). Reads always admit the auditor. */
export function platformArea(area, action = 'read') {
  const allowed = rolesForArea(area, action);
  return (req, _res, next) => {
    if (!allowed.includes(req.user?.role)) {
      return next(
        new ForbiddenError(
          `This ${area} ${action} requires one of roles: ${allowed.join(', ')}`,
        ),
      );
    }
    next();
  };
}
