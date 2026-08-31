import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LoadingState } from "@/components/LoadingState";
import { StoreAuthPanel } from "@/features/store-auth/StoreAuthPanel";
import { PublicInviteError } from "./public/PublicInviteError";
import { useRedemptionController } from "./public/controllers/useRedemptionController";
import { RedemptionPortalView } from "./public/views/RedemptionPortalView";
import {
  ApiError,
  claimRedeemShopAccount,
  getRedemptionPortal,
  type StorefrontData,
} from "@/services/api-bridge";
import {
  setShopCustomerSession,
  type ShopCustomerSession,
} from "@/services/shop-customer-store";
import { shopStorefrontPath } from "@/lib/shopRedeemUrl";

type Phase =
  | { kind: "loading" }
  | { kind: "claim"; shop: StorefrontData["shop"] }
  | { kind: "legacy" }
  | { kind: "error"; message: string };

/**
 * Redeem invite entry:
 * - Shop-linked invites → claim shop account (password if new) → public storefront
 * - Kit / non-shop invites → existing redemption portal
 */
export default function RedemptionPortal({ token }: { token: string }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  const finishToStore = useCallback(
    (session: ShopCustomerSession, shop: StorefrontData["shop"]) => {
      setShopCustomerSession(shop.id, session);
      const slug = shop.slug;
      if (
        slug &&
        typeof window !== "undefined" &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname) &&
        !import.meta.env.DEV
      ) {
        // Production subdomain storefront lives on shop host; path /shop/:id works everywhere.
        navigate(shopStorefrontPath(shop.id), { replace: true });
      } else {
        navigate(shopStorefrontPath(shop.id), { replace: true });
      }
    },
    [navigate],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase({ kind: "loading" });
      try {
        // Probe whether this invite is shop-linked by attempting claim without password.
        const res = await claimRedeemShopAccount(token);
        if (cancelled) return;
        if (res.needsPassword) {
          setPhase({ kind: "claim", shop: res.shop });
          return;
        }
        finishToStore(
          {
            accessToken: res.accessToken,
            customer: res.customer,
            creditAmount: res.creditAmount,
            redemptionToken: res.redemptionToken,
          },
          res.shop,
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === "NO_SHOP" || err.status === 422)) {
          // Fall back to kit / classic redeem UI.
          setPhase({ kind: "legacy" });
          return;
        }
        // If claim fails unexpectedly, still try classic portal (auto-verify).
        try {
          const portal = (await getRedemptionPortal(token)) as {
            campaign?: { shop?: { id?: string } | null };
          };
          if (cancelled) return;
          if (portal.campaign?.shop) {
            setPhase({
              kind: "error",
              message: err instanceof Error ? err.message : "Could not open invite",
            });
          } else {
            setPhase({ kind: "legacy" });
          }
        } catch (portalErr) {
          if (cancelled) return;
          setPhase({
            kind: "error",
            message:
              portalErr instanceof Error
                ? portalErr.message
                : err instanceof Error
                  ? err.message
                  : "Invalid redemption link",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, finishToStore, retryKey]);

  if (phase.kind === "loading") {
    return <LoadingState message="Opening your invite…" />;
  }

  if (phase.kind === "error") {
    return (
      <PublicInviteError
        title="Redemption unavailable"
        message={phase.message}
        onRetry={() => setRetryKey((k) => k + 1)}
      />
    );
  }

  if (phase.kind === "claim") {
    return (
      <StoreAuthPanel
        shop={phase.shop}
        redeemToken={token}
        onAuthenticated={(session) => finishToStore(session, phase.shop)}
      />
    );
  }

  return <LegacyRedemptionPortal token={token} />;
}

function LegacyRedemptionPortal({ token }: { token: string }) {
  const vm = useRedemptionController(token);
  return <RedemptionPortalView {...vm} />;
}
