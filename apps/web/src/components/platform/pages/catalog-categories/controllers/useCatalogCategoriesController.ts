import { useState, type FormEvent } from "react";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import { useLoad } from "../../../useLoad";
import {
  createCategory,
  listCategories,
  updateCategory,
  type PlatformCategory,
} from "@/services/platform-api";

export type CatalogCategoriesVm = ReturnType<typeof useCatalogCategoriesController>;

function findCategory(nodes: PlatformCategory[], id: string): PlatformCategory | null {
  for (const node of nodes) {
    if (node._id === id) return node;
    const found = node.children?.length ? findCategory(node.children, id) : null;
    if (found) return found;
  }
  return null;
}

function descendantIds(node: PlatformCategory): string[] {
  const ids = [node._id];
  for (const child of node.children ?? []) ids.push(...descendantIds(child));
  return ids;
}

function flattenActiveCategories(nodes: PlatformCategory[], depth = 0): { category: PlatformCategory; depth: number }[] {
  const options: { category: PlatformCategory; depth: number }[] = [];
  for (const node of nodes) {
    if (node.status === "active") options.push({ category: node, depth });
    if (node.children?.length) options.push(...flattenActiveCategories(node.children, depth + 1));
  }
  return options;
}

export function useCatalogCategoriesController() {
  const canWrite = canAccessArea(getStoredUser()?.role, "catalog", "write");
  const [version, setVersion] = useState(0);
  const load = useLoad(() => listCategories(), [version]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const tree = load.data ?? [];
  const excludedParentIds = new Set<string>();
  if (editingId) {
    const current = findCategory(tree, editingId);
    if (current) for (const id of descendantIds(current)) excludedParentIds.add(id);
  }
  const parentOptions = flattenActiveCategories(tree).filter(
    (option) => !excludedParentIds.has(option.category._id),
  );

  function refresh() {
    setVersion((value) => value + 1);
  }

  function resetForm() {
    setName("");
    setDescription("");
    setParentId("");
    setEditingId(null);
    setFormError("");
  }

  function onEdit(category: PlatformCategory) {
    setEditingId(category._id);
    setName(category.name);
    setDescription(category.description || "");
    setParentId(category.parentId ? String(category.parentId) : "");
    setFormError("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      if (editingId) {
        await updateCategory(editingId, {
          name: trimmed,
          description,
          parentId: parentId || null,
        });
      } else {
        await createCategory({
          name: trimmed,
          description,
          parentId: parentId || null,
        });
      }
      resetForm();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save category");
    } finally {
      setBusy(false);
    }
  }

  async function onArchive(category: PlatformCategory) {
    setBusy(true);
    setFormError("");
    try {
      await updateCategory(category._id, {
        status: category.status === "archived" ? "active" : "archived",
      });
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not update category");
    } finally {
      setBusy(false);
    }
  }

  async function onMove(category: PlatformCategory, siblings: PlatformCategory[], direction: -1 | 1) {
    const index = siblings.findIndex((row) => row._id === category._id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(next, 0, moved);
    setBusy(true);
    setFormError("");
    try {
      await Promise.all(reordered.map((row, order) => updateCategory(row._id, { sortOrder: order })));
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not reorder categories");
    } finally {
      setBusy(false);
    }
  }

  return {
    ...load,
    canWrite,
    tree,
    parentOptions,
    name,
    description,
    parentId,
    editingId,
    formError,
    busy,
    onName: setName,
    onDescription: setDescription,
    onParentId: setParentId,
    onEdit,
    onCancel: resetForm,
    onSubmit,
    onArchive,
    onMove,
  };
}
