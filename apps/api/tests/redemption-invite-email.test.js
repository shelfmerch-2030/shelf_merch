import { describe, it, expect } from 'vitest';
import { env } from '../src/config/env.js';
import { buildRedemptionInviteEmail } from '../src/services/email-templates/redemptionInvite.template.js';
import { buildSurpriseGiftEmail } from '../src/services/email-templates/surpriseGift.template.js';

describe('redemption invite email template', () => {
  it('renders branded kit invite with CTA and sender details', () => {
    const prevAppUrl = env.APP_URL;
    env.APP_URL = 'https://app.shelfmerch.com';
    try {
      const { subject, html, text } = buildRedemptionInviteEmail({
        recipientName: 'Priya Sharma',
        senderName: 'People Team, Rubix',
        message: "Your welcome kit is on its way! A little something from all of us — we're so glad you're here.",
        giftName: 'Welcome Kit',
        companyName: 'Rubix',
        link: '/redeem/test-token-abc',
        campaignType: 'kit',
        shopName: 'Salesforce',
      });

      expect(subject).toBe('People Team, Rubix sent you a gift');
      expect(html).toContain('shelfmerch-logo@shelfmerch');
      expect(html).toContain('alt="Shelf Merch"');
      expect(html).toContain('Claim your gift');
      expect(html).toContain('People Team, Rubix');
      expect(html).toContain('Welcome Kit');
      expect(html).toContain('gift from');
      expect(html).toContain('Rubix');
      expect(html).toContain('redeem/test-token-abc');
      expect(html).toContain('email-hero-banner@shelfmerch');
      expect(html).toContain('background-image');
      expect(html).toContain('shelfmerch-logo@shelfmerch');
      expect(html).not.toContain('em-hero-desktop');
      expect(html).not.toContain('em-hero-mobile');
      expect(html).not.toContain('email-hero-art@shelfmerch');
      expect(html).not.toContain('em-hero-art');
      expect(html).toContain('em-hero-copy');
      expect(html).not.toContain('cid:shop-banner-');
      expect(html).not.toContain('cid:shop-logo@shelfmerch');
      expect(html).not.toContain('Link expires in 30 days');
      expect(text).toContain('Priya Sharma');
      expect(text).not.toContain('Link expires in 30 days');
      expect(html).toContain('#F0F0F0');
      expect(html).toContain('#3155FF');
      expect(html).toContain('Helvetica Neue');
      expect(html).toContain('A gift is waiting for you');
    } finally {
      env.APP_URL = prevAppUrl;
    }
  });

  it('renders points invite with shop-scoped copy and redeem CTA', () => {
    const { subject, html, text } = buildRedemptionInviteEmail({
      recipientName: 'Alex',
      senderName: 'sm',
      giftName: 'test',
      companyName: 'IBM',
      link: '/redeem/points-token',
      campaignType: 'points',
      pointsScope: 'shop',
      shopName: 'test',
      shopCurrencyMode: 'points',
    });

    expect(subject).toBe("You've received reward points from sm");
    expect(html).toContain("You&#39;ve earned");
    expect(html).toContain('reward points');
    expect(html).toContain('Redeem your points');
    expect(html).toContain('redeem in');
    expect(html).toContain('test');
    expect(html).not.toContain('SENT YOU A GIFT');
    expect(text).toContain('Alex');
    expect(text).toContain('Redeem these points exclusively in test.');
  });

  it('escapes user-supplied HTML in message body', () => {
    const { html } = buildRedemptionInviteEmail({
      senderName: 'Team',
      message: '<script>alert(1)</script>',
      giftName: 'Kit',
      companyName: 'Co',
      link: '/redeem/x',
      campaignType: 'kit',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('surprise gift email template', () => {
  it('informs the recipient without redemption actions or a link', () => {
    const { subject, html, text } = buildSurpriseGiftEmail({
      recipientName: 'Priya Sharma',
      senderName: 'People Team, Rubix',
      message: 'A little something from all of us.',
      giftName: 'Welcome Kit',
      companyName: 'Rubix',
    });

    expect(subject).toBe("You've received a gift from Rubix!");
    expect(html).toContain('Rubix is sending');
    expect(html).toContain('No action required');
    expect(html).not.toContain('Claim your gift');
    expect(html).not.toContain('How to claim');
    expect(html).not.toContain('Link expires');
    expect(html).not.toContain('/redeem/');
    expect(text).toContain('shipped automatically to your address on file');
  });
});
