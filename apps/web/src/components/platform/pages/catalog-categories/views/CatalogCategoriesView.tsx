import { Link } from "react-router";
import {
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { PlatformCategory } from "@/services/platform-api";
import type { CatalogCategoriesVm } from "../controllers/useCatalogCategoriesController";

function CategoryActions({
  category,
  siblings,
  canWrite,
  busy,
  onEdit,
  onArchive,
  onMove,
}: {
  category: PlatformCategory;
  siblings: PlatformCategory[];
  canWrite: boolean;
  busy: boolean;
  onEdit: (category: PlatformCategory) => void;
  onArchive: (category: PlatformCategory) => void;
  onMove: (category: PlatformCategory, siblings: PlatformCategory[], direction: -1 | 1) => void;
}) {
  if (!canWrite) return null;
  const index = siblings.findIndex((row) => row._id === category._id);
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy || index <= 0}
        onClick={() => onMove(category, siblings, -1)}
      >
        Up
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy || index < 0 || index >= siblings.length - 1}
        onClick={() => onMove(category, siblings, 1)}
      >
        Down
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(category)}>
        Edit
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onArchive(category)}>
        {category.status === "archived" ? "Restore" : "Archive"}
      </button>
    </div>
  );
}

function SubCategoryTags({
  subCategories,
  canWrite,
  busy,
  onEdit,
  onArchive,
}: {
  subCategories: PlatformCategory[];
  canWrite: boolean;
  busy: boolean;
  onEdit: (category: PlatformCategory) => void;
  onArchive: (category: PlatformCategory) => void;
}) {
  if (!subCategories.length) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No sub-categories yet.</p>;
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      {subCategories.map((sub) => {
        const children = sub.children ?? [];
        return (
          <div key={sub._id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => canWrite && onEdit(sub)}
                title={sub.description || "Sub-category"}
                style={{
                  opacity: sub.status === "archived" ? 0.55 : 1,
                  cursor: canWrite ? "pointer" : "default",
                }}
              >
                {sub.name}
              </button>
              <StatusTag status={sub.status} />
              {canWrite ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => onArchive(sub)}
                >
                  {sub.status === "archived" ? "Restore" : "Archive"}
                </button>
              ) : null}
            </div>
            {children.length ? (
              <div className="row" style={{ gap: 6, flexWrap: "wrap", paddingLeft: 4 }}>
                {children.map((child) => (
                  <button
                    key={child._id}
                    type="button"
                    className="tag"
                    disabled={busy}
                    onClick={() => canWrite && onEdit(child)}
                    title={child.description || "Child category"}
                    style={{
                      opacity: child.status === "archived" ? 0.55 : 1,
                      cursor: canWrite ? "pointer" : "default",
                      border: "1px solid var(--line, #e6e6e6)",
                      background: "transparent",
                    }}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CategorySection({
  category,
  parent,
  siblings,
  canWrite,
  busy,
  onEdit,
  onArchive,
  onMove,
}: {
  category: PlatformCategory;
  parent: PlatformCategory;
  siblings: PlatformCategory[];
  canWrite: boolean;
  busy: boolean;
  onEdit: (category: PlatformCategory) => void;
  onArchive: (category: PlatformCategory) => void;
  onMove: (category: PlatformCategory, siblings: PlatformCategory[], direction: -1 | 1) => void;
}) {
  const subCategories = category.children ?? [];
  return (
    <section style={{ borderTop: "1px solid var(--line, #e6e6e6)", padding: "18px 0" }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            {parent.name}
            {canWrite ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "0 4px", height: "auto", fontSize: 12 }}
                  disabled={busy}
                  onClick={() => onEdit(parent)}
                >
                  Edit parent
                </button>
              </>
            ) : null}
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{category.name}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Category
            {category.description ? ` · ${category.description}` : ""}
          </div>
        </div>
        <StatusTag status={category.status} />
        <CategoryActions
          category={category}
          siblings={siblings}
          canWrite={canWrite}
          busy={busy}
          onEdit={onEdit}
          onArchive={onArchive}
          onMove={onMove}
        />
      </div>

      <SubCategoryTags
        subCategories={subCategories}
        canWrite={canWrite}
        busy={busy}
        onEdit={onEdit}
        onArchive={onArchive}
      />
    </section>
  );
}

export function CatalogCategoriesView({
  error,
  loading,
  canWrite,
  tree,
  parentOptions,
  name,
  description,
  parentId,
  editingId,
  formError,
  busy,
  onName,
  onDescription,
  onParentId,
  onEdit,
  onCancel,
  onSubmit,
  onArchive,
  onMove,
}: CatalogCategoriesVm) {
  const categorySections = tree.flatMap((parent) =>
    (parent.children ?? []).map((category) => ({ parent, category, siblings: parent.children ?? [] })),
  );

  return (
    <>
      <PlatformPageHeader
        title="Categories"
        subtitle="Each Category is a section. Sub-categories show as tags underneath."
        actions={
          <Link to="/platform/catalog" className="btn btn-ghost btn-sm">
            Back to catalog
          </Link>
        }
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {formError && <PlatformError message={formError} />}

      {canWrite ? (
        <form className="card" style={{ padding: 16, marginBottom: 16, maxWidth: 720 }} onSubmit={onSubmit}>
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit category" : "Add category"}</h3>
          <div className="field">
            <label className="lbl">Name</label>
            <input className="inp" value={name} onChange={(e) => onName(e.target.value)} />
          </div>
          <div className="field">
            <label className="lbl">Parent</label>
            <select
              className="inp"
              value={parentId}
              onChange={(e) => onParentId(e.target.value)}
            >
              <option value="">None — top-level parent category</option>
              {parentOptions.map(({ category, depth }) => (
                <option key={category._id} value={category._id}>
                  {`${"\u00A0".repeat(depth * 2)}${depth ? "↳ " : ""}${category.name}`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="lbl">Description</label>
            <input className="inp" value={description} onChange={(e) => onDescription(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-brand btn-sm" disabled={busy || !name.trim()}>
              {editingId ? "Save" : "Add category"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="card" style={{ padding: 16 }}>
        {tree.length === 0 && !loading ? <p className="muted">No categories yet.</p> : null}
        {categorySections.length === 0 && tree.length > 0 && !loading ? (
          <p className="muted">No categories yet. Add a Category under a Parent to get started.</p>
        ) : null}
        {categorySections.map(({ parent, category, siblings }) => (
          <CategorySection
            key={category._id}
            category={category}
            parent={parent}
            siblings={siblings}
            canWrite={canWrite}
            busy={busy}
            onEdit={onEdit}
            onArchive={onArchive}
            onMove={onMove}
          />
        ))}
      </div>
    </>
  );
}
