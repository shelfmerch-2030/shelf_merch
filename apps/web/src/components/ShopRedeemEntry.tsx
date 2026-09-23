import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { StoreBanner } from "@/components/StoreBanner";
import { LoadingState } from "@/components/LoadingState";
import { publicFetch } from "@/services/api";
import { shopPublicLinkLabel } from "@/lib/shopRedeemUrl";

type ShopInfo = {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  bannerTheme?: string;
  bannerPreset?: string;
  bannerImageUrl?: string;
  currencyMode?: string;
};

export default function ShopRedeemEntry({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await publicFetch<{ shop: ShopInfo }>(`/storefront/by-slug/${slug}`);
        if (!cancelled) setShop(data.shop);
      } catch {
        if (!cancelled) setError("This reward store could not be found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onContinue() {
    setError("");
    setBusy(true);
    try {
      const data = await publicFetch<{ recipient: { token: string } }>(
        `/storefront/by-slug/${slug}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      navigate(`/redeem/${data.recipient.token}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find your rewards");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState message="Loading store…" />;
  }

  if (!shop) {
    return (
      <div className="auth">
        <div className="auth-form">
          <div className="inner">
            <h1>Store not found</h1>
            <p className="muted">{error || "Check the link and try again."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="store" style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 24px" }}>
        <StoreBanner
          shop={{
            name: shop.name,
            logoUrl: shop.logoUrl,
            bannerTheme: shop.bannerTheme,
            bannerPreset: shop.bannerPreset,
            bannerImageUrl: shop.bannerImageUrl,
          }}
          eyebrow="Your reward store"
        />
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>{shop.name}</h1>
        <p className="muted" style={{ marginBottom: 8 }}>
          Enter your work email to access your rewards and redeem points.
        </p>
        <p className="mut3" style={{ fontSize: 12, marginBottom: 24 }}>
          {shopPublicLinkLabel(slug)}
        </p>

        {error ? (
          <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}

        <div className="card" style={{ padding: 24 }}>
          <div className="field">
            <label className="lbl" htmlFor="shop-redeem-email">
              Work email
            </label>
            <input
              id="shop-redeem-email"
              className="inp"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email.trim()) void onContinue();
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-brand btn-block"
            style={{ marginTop: 16 }}
            disabled={busy || !email.trim()}
            onClick={() => void onContinue()}
          >
            {busy ? "Looking up…" : "Continue to my rewards"}
          </button>
        </div>
      </div>
    </div>
  );
}
