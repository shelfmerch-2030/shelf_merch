import { describe, it, expect } from 'vitest';
import {
  transitionState,
  transitionThrough,
  validNextStatuses,
  canTransition,
} from '../src/services/stateMachine.service.js';
import { InvalidTransitionError } from '../src/utils/errors.js';

describe('stateMachine.service', () => {
  describe('order machine', () => {
    it.each(['approved', 'mockup_pending'])('allows %s orders to skip mockup review', (status) => {
      const order = { status, statusHistory: [] };
      transitionState('order', order, 'in_production', { userId: 'ops' }, 'Production task created');
      expect(order.status).toBe('in_production');
      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0].status).toBe('in_production');
    });

    it('still requires order approval before production', () => {
      expect(canTransition('order', 'created', 'in_production')).toBe(false);
    });

    it('allows the full happy path', () => {
      const path = [
        'approved', 'mockup_pending', 'mockup_approved', 'in_production',
        'qc_pending', 'packed', 'shipped', 'delivered',
      ];
      const order = { status: 'created' };
      for (const next of path) transitionState('order', order, next);
      expect(order.status).toBe('delivered');
    });

    it('rejects created -> shipped (must-have §11.1)', () => {
      expect(() => transitionState('order', { status: 'created' }, 'shipped')).toThrow(
        InvalidTransitionError,
      );
    });

    it('allows issue_raised from any state, then replacement_processing or cancelled', () => {
      for (const from of ['created', 'in_production', 'shipped', 'delivered']) {
        expect(canTransition('order', from, 'issue_raised')).toBe(true);
      }
      expect(validNextStatuses('order', 'issue_raised')).toEqual([
        'replacement_processing',
        'cancelled',
      ]);
      expect(canTransition('order', 'issue_raised', 'created')).toBe(false);
    });

    it('allows cancellation from any active state, but never from delivered', () => {
      for (const from of ['created', 'approved', 'in_production', 'shipped']) {
        expect(canTransition('order', from, 'cancelled')).toBe(true);
      }
      expect(canTransition('order', 'delivered', 'cancelled')).toBe(false);
      expect(validNextStatuses('order', 'cancelled')).toEqual([]);
    });

    it('appends to statusHistory when present', () => {
      const order = { status: 'created', statusHistory: [] };
      transitionState('order', order, 'approved', { userId: 'u1' }, 'looks good');
      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0]).toMatchObject({ status: 'approved', note: 'looks good' });
    });
  });

  describe('campaign machine', () => {
    it('enforces the linear wizard order', () => {
      expect(canTransition('campaign', 'draft', 'launched')).toBe(false);
      expect(canTransition('campaign', 'draft', 'recipients_uploaded')).toBe(true);
      expect(canTransition('campaign', 'launched', 'redemption_open')).toBe(true);
      expect(canTransition('campaign', 'fulfilled', 'draft')).toBe(false);
    });
  });

  describe('wallet machine', () => {
    it('walks draft -> active via transitionThrough', () => {
      const wallet = { status: 'draft' };
      transitionThrough('wallet', wallet, 'active');
      expect(wallet.status).toBe('active');
    });

    it('rejects skipping backwards', () => {
      expect(() => transitionState('wallet', { status: 'active' }, 'draft')).toThrow(
        InvalidTransitionError,
      );
    });
  });

  describe('redemption machine', () => {
    it('follows invited -> opened -> verified -> redeemed -> order_created', () => {
      const r = { status: 'invited' };
      for (const next of ['opened', 'verified', 'redeemed', 'order_created']) {
        transitionState('redemption', r, next);
      }
      expect(r.status).toBe('order_created');
    });

    it('cannot expire after redemption', () => {
      expect(canTransition('redemption', 'redeemed', 'expired')).toBe(false);
    });
  });

  it('throws on unknown machines', () => {
    expect(() => validNextStatuses('spaceship', 'docked')).toThrow();
  });
});
