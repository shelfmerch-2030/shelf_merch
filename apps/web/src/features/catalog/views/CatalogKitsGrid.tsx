import { KitPreviewDialog } from "@/features/kits/KitPreviewDialog";
import {
  curatedPreviewBtnStyle,
  curatedSendBtnStyle,
} from "@/features/kits/curatedKitCardStyles";
import type { CatalogKitsVm } from "../controllers/useCatalogKitsController";

function CatalogKitsSkeleton() {
  return (
    <div className="sm-cat-grid" aria-busy="true" aria-label="Loading kits">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="sm-skeleton-card">
          <div className="sm-skeleton-img" />
          <div className="sm-skeleton-line" />
          <div className="sm-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function CatalogKitsGrid(vm: CatalogKitsVm) {
  if (vm.isLoading) {
    return <CatalogKitsSkeleton />;
  }

  if (vm.errorMessage) {
    return <div className="card sm-cat-error">{vm.errorMessage}</div>;
  }

  if (vm.kits.length === 0) {
    return (
      <div className="card empty sm-cat-empty">
        <h3>No kits in this category</h3>
        <p className="muted">Try another subcategory or check back later for new kits.</p>
      </div>
    );
  }

  return (
    <>
      <section className="sm-cat-page__results">
        <div className="sm-cat-page__results-head">
          <p className="sm-cat-page__results-count">
            Showing {vm.count} {vm.count === 1 ? "kit" : "kits"}
          </p>
        </div>

        <div className="sm-cat-grid sm-cat-grid--kits">
          {vm.kits.map((kit) => (
            <div
              key={kit.id}
              className="card sm-cat-kit-card"
              style={{
                padding: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                border: "1px solid var(--line)",
                borderRadius: "var(--r)",
                background: "#fff",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1.4",
                  background: "var(--gray-100)",
                  borderRadius: "var(--r-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  marginBottom: 10,
                }}
              >
                <img
                  src={kit.image}
                  alt={kit.name}
                  loading="lazy"
                  style={{ maxHeight: "90%", maxWidth: "90%", objectFit: "contain" }}
                />
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13.5,
                  marginBottom: 2,
                  color: "var(--ink)",
                  textAlign: "center",
                }}
              >
                {kit.name}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 10, textAlign: "center" }}>
                {kit.subtitle}
              </div>
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => vm.onPreview(kit)}
                  style={curatedPreviewBtnStyle}
                >
                  Preview
                </button>
                {vm.canSendKits ? (
                  <button
                    type="button"
                    className="btn btn-brand btn-sm"
                    onClick={() => void vm.onSend(kit)}
                    style={curatedSendBtnStyle}
                    disabled={vm.sendPending}
                  >
                    Send
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <KitPreviewDialog
        open={Boolean(vm.kitPreview)}
        onOpenChange={vm.onPreviewOpenChange}
        data={vm.kitPreview}
      />
    </>
  );
}
