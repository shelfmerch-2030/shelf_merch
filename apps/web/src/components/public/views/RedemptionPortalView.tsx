import { useEffect } from "react";
import confetti from "canvas-confetti";
import { Check, ShoppingBag, Calendar, Clock, Mail, Bell } from "lucide-react";
import KitAcceptPortal from "@/components/KitAcceptPortal";
import { LoadingState } from "@/components/LoadingState";
import { StoreBanner } from "@/components/StoreBanner";
import StoreShell from "@/components/store/StoreShell";
import { normalizeCurrencyMode } from "@/lib/storeCurrency";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { PublicInviteError } from "@/components/public/PublicInviteError";
import type { RedemptionVm } from "../controllers/useRedemptionController";

/** Redemption portal view: branded OTP gate, then store / kit-accept / track. */
export function RedemptionPortalView(vm: RedemptionVm) {
  useEffect(() => {
    if (vm.step !== "track" || !vm.order) return;

    // Initial festive burst
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Continuous dynamic falling confetti
    const interval = setInterval(() => {
      confetti({
        particleCount: 1,
        startVelocity: 0,
        ticks: 200,
        origin: {
          x: Math.random(),
          y: Math.random() - 0.2
        },
        colors: ["#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#3B82F6"]
      });
    }, 150);

    return () => clearInterval(interval);
  }, [vm.step, vm.order]);

  if (vm.step === "loading") {
    return <LoadingState message="Loading your gift…" />;
  }

  if (vm.step === "error") {
    return (
      <PublicInviteError
        title="Redemption unavailable"
        message={vm.error || "This invite link could not be opened."}
      />
    );
  }

  if (vm.step === "track" && vm.order) {
    const orderDate = vm.order.createdAt ? new Date(vm.order.createdAt) : new Date();
    const deliveryDate = new Date(orderDate);
    deliveryDate.setDate(orderDate.getDate() + 7);

    const formatDate = (date: Date) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };

    return (
      <div className="redemption-success-body">
        {/* Navigation / Header */}
        <header className="redemption-success-nav">
          <ShelfMerchLogo height={32} />
        </header>

        {/* Content Area */}
        <main className="redemption-success-content">
          <img
            src="/images/order-placed-3d-illustration.png"
            alt="Order Placed"
            className="redemption-success-illustration"
          />

          <div className="redemption-success-status">
            <span className="redemption-success-checkmark">
              <Check size={20} strokeWidth={3} />
            </span>
            <h1>Order Placed</h1>
          </div>

          <p className="redemption-success-thankyou">
            Thank you, <strong>{vm.portal?.recipient.name || "there"}</strong>!
          </p>
          <p className="redemption-success-info-msg">
            Order <strong>{vm.order.orderNumber}</strong> is created.
          </p>

          {/* Info Card */}
          <div className="redemption-success-card">
            <div className="redemption-success-grid">
              {/* Order ID */}
              <div className="redemption-success-item">
                <div className="redemption-success-icon-wrap purple">
                  <ShoppingBag size={20} />
                </div>
                <div className="redemption-success-item-details">
                  <span className="redemption-success-item-lbl">Order ID</span>
                  <span className="redemption-success-item-val">{vm.order.orderNumber}</span>
                </div>
              </div>

              {/* Order Date */}
              <div className="redemption-success-item">
                <div className="redemption-success-icon-wrap green">
                  <Calendar size={20} />
                </div>
                <div className="redemption-success-item-details">
                  <span className="redemption-success-item-lbl">Order Date</span>
                  <span className="redemption-success-item-val">{formatDate(orderDate)}</span>
                </div>
              </div>

              {/* Estimated Delivery */}
              <div className="redemption-success-item">
                <div className="redemption-success-icon-wrap orange">
                  <Clock size={20} />
                </div>
                <div className="redemption-success-item-details">
                  <span className="redemption-success-item-lbl">Estimated Delivery</span>
                  <span className="redemption-success-item-val">{formatDate(deliveryDate)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Email notice section */}
          <div className="redemption-success-email-sec">
            <div className="redemption-success-divider-container">
              <div className="redemption-success-divider-line" />
              <div className="redemption-success-divider-icon-wrap">
                <Mail size={18} />
              </div>
              <div className="redemption-success-divider-line" />
            </div>

            <div className="redemption-success-email-content-wrap">
              <div className="redemption-success-email-text">
                <h3>Keep an eye on your emails</h3>
                <p>
                  We'll send you email notifications at every important stage—from order confirmation to shipment and delivery.
                </p>
              </div>

              <div className="redemption-success-mail-illustration">
                <svg width="100" height="80" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="20" y="10" width="60" height="40" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" />
                  <line x1="30" y1="22" x2="70" y2="22" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
                  <line x1="30" y1="30" x2="60" y2="30" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
                  <path d="M10 30h80v42a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V30z" fill="#FCD34D" />
                  <path d="M10 30l40 30 40-30" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="redemption-success-mail-badge">
                  <Bell size={14} fill="#FFFFFF" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (vm.step === "kit" && vm.portal && vm.kitData && vm.sessionToken) {
    return (
      <KitAcceptPortal
        token={vm.token}
        sessionToken={vm.sessionToken}
        kitData={vm.kitData}
        recipientName={vm.portal.recipient.name}
        campaignName={vm.portal.campaign.name}
        welcome={vm.portal.campaign.message?.body}
        onAccepted={vm.onKitAccepted}
      />
    );
  }

  // Verified — hand off to the full multi-page store (points campaigns).
  if (vm.step === "shop" && vm.portal) {
    return (
      <StoreShell
        shop={vm.portal.campaign.shop || { name: vm.portal.campaign.name }}
        products={vm.products}
        mode="redeem"
        currency={normalizeCurrencyMode(vm.portal.campaign.shop?.currencyMode)}
        creditInr={vm.portal.recipient.creditAmount}
        recipientName={vm.portal.recipient.name}
        recipientEmail={vm.portal.recipient.email}
        initialShippingAddress={vm.portal.recipient.shippingAddress}
        welcome={vm.portal.campaign.message?.body}
        onCheckout={vm.onCheckout}
        onLogout={vm.onLogout}
        onFetchOrders={vm.onFetchOrders}
        onFetchTickets={vm.onFetchTickets}
        onRaiseTicket={vm.onRaiseTicket}
        onReplyTicket={vm.onReplyTicket}
        onConfirmTicket={vm.onConfirmTicket}
        redemptionToken={vm.token}
        sessionToken={vm.sessionToken}
        cartPersistId={vm.token}
      />
    );
  }

  const { portal, isKitFlow } = vm;

  // Gate: branded landing + OTP verification before entering the store or kit accept flow.
  return (
    <div className="store" style={{ background: "var(--bg)" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 24px" }}>
        {portal?.campaign.shop ? (
          <StoreBanner shop={portal.campaign.shop} eyebrow="Your reward store" />
        ) : (
          <div className="eyebrow">
            {isKitFlow ? "Your gift kit" : "Shelf Merch · Redeem your gift"}
          </div>
        )}
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>{portal?.campaign.name}</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          {isKitFlow ? (
            <>
              Hi {portal?.recipient.name} — your team sent you a kit. Verify your email or phone to
              view the items and accept your order.
            </>
          ) : (
            <>
              Hi {portal?.recipient.name} — you have{" "}
              <b>₹{portal?.recipient.creditAmount.toLocaleString("en-IN")}</b> to spend.
            </>
          )}
        </p>

        {vm.error && (
          <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--danger)" }}>
            {vm.error}
          </div>
        )}

        {vm.step === "portal" && (
          <div className="card" style={{ padding: 24 }}>
            <p className="muted" style={{ marginBottom: 16 }}>
              {portal?.campaign.message?.body ||
                (isKitFlow
                  ? "Verify your email or phone to view your kit and confirm shipping."
                  : "Verify your email or phone to enter the store and place your order.")}
            </p>
            <div className="field">
              <label className="lbl">Email or mobile</label>
              <input
                className="inp"
                value={vm.contact}
                onChange={(e) => vm.onContact(e.target.value)}
                placeholder="you@company.com or +91…"
              />
            </div>
            <button
              className="btn btn-brand btn-block"
              style={{ marginTop: 16 }}
              onClick={vm.onSendOtp}
              disabled={vm.isSendingOtp || !vm.contact.trim()}
              aria-busy={vm.isSendingOtp}
            >
              {vm.isSendingOtp ? "Sending…" : "Send verification code"}
            </button>
          </div>
        )}

        {vm.step === "otp" && (
          <div className="card" style={{ padding: 24 }}>
            <div className="field">
              <label className="lbl">6-digit code</label>
              <input
                className="inp"
                value={vm.otp}
                onChange={(e) => vm.onOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
              />
            </div>
            <button
              className="btn btn-brand btn-block"
              style={{ marginTop: 16 }}
              onClick={vm.onVerifyOtp}
              disabled={vm.isVerifyingOtp || vm.otp.trim().length !== 6}
              aria-busy={vm.isVerifyingOtp}
            >
              {vm.isVerifyingOtp
                ? "Verifying…"
                : isKitFlow
                  ? "Verify & view kit"
                  : "Verify & enter store"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
