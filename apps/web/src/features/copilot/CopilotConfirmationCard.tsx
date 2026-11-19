import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, Info, LoaderCircle } from "lucide-react";
import type { CopilotConfirmationArtifact, CopilotSuccessArtifact } from "./api";
import {
  cancelCopilotWriteApi,
  executeCopilotWriteApi,
  persistCopilotWriteArtifactApi,
  resolveCopilotWriteApi,
} from "./api";
import { buildWriteSuccessArtifact } from "./writeSuccess";
import { sendPointsOutcomeMessage } from "./sendPointsOutcomeMessage";
import { isVerifiedSwagPublication, swagRows, swagPresentation, swagCompactRows, swagWarnings, swagPublishFacts, swagPublishWarnings } from "./swagPresentation";
import { SwagSavedPreviews } from "./SwagSavedPreviews";
import { swagApprovalAction } from "./swagTimeline";
import { amountLabel, completedPresentation, isSendPointsWorkflow, operationLabel, previewRows, sendPointsRows } from "./actionPresentation";
import { shopStorefrontHref } from "@/lib/shopRedeemUrl";
import { tenantPath } from "@/lib/workspaceSlug";

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `copilot-write-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function allocationPreviewRows(preview: Record<string, unknown>) {
  const currency = String(preview.currency || "");
  const money = (value: unknown) => amountLabel(value, currency);
  const before = (preview.before || {}) as Record<string, unknown>;
  const after = (preview.after || {}) as Record<string, unknown>;
  const departments = Array.isArray(preview.departments) ? preview.departments as Record<string, unknown>[] : [];
  return [
    { label: "Funding source", value: String(preview.walletName || "Unavailable — prepare again") },
    { label: "Currency", value: currency || "Unavailable" },
    { label: "Net allocation", value: money(preview.netChange) },
    { label: "Wallet unallocated before → after", value: `${money(before.unallocatedAmount)} → ${money(after.unallocatedAmount)}` },
    ...departments.flatMap((department, index) => [
      { label: `Department ${index + 1}`, value: String(department.name || "Unavailable") },
      { label: `Allocation change ${index + 1}`, value: money(department.amount) },
      { label: `Allocated before → after ${index + 1}`, value: `${money(department.beforeAllocated)} → ${money(department.afterAllocated)}` },
      { label: `Unspent before → after ${index + 1}`, value: `${money(department.beforeUnspent)} → ${money(department.afterUnspent)}` },
    ]),
  ];
}

function toSuccessArtifact(
  workflow: string,
  result: Record<string, unknown> & { id?: string; name?: string; status?: string },
  artifact: CopilotConfirmationArtifact,
): CopilotSuccessArtifact {
  return {
    ...buildWriteSuccessArtifact(workflow, result, {
      preview: artifact.preview,
      request: artifact.request as Record<string, unknown> | undefined,
    }),
    confirmationId: artifact.confirmationId,
    status: "completed",
  };
}

export function CopilotConfirmationCard({
  artifact,
  conversationId,
  onChange,
  onEditSwag,
  readOnly = false,
}: {
  artifact: CopilotConfirmationArtifact;
  conversationId?: string | null;
  onChange: (next: CopilotConfirmationArtifact | CopilotSuccessArtifact) => void;
  onEditSwag?: () => void;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackKey] = useState(() => newIdempotencyKey());
  const idempotencyKey = artifact.operation === "campaigns.send_points" ? `send:${artifact.confirmationId}`
    : artifact.operation === "swag.collection" ? `swag:${artifact.confirmationId}` : fallbackKey;
  const recoveringRef = useRef(false);
  const actionRef = useRef(false);
  const preview = artifact.preview || {};
  const pending = artifact.status === "pending";
  const workflow = artifact.operation;
  const combined = workflow === "campaigns.send_points";
  const application = preview.application as { targets?: unknown[]; manual?: unknown[]; preserved?: unknown[]; requestedAll?: boolean } | undefined;
  const applyLabel = application?.manual?.length ? `Apply to ${application.targets?.length || 0} supported product${application.targets?.length === 1 ? '' : 's'} only`
    : application?.preserved?.length ? `Apply to ${application.targets?.length || 0} product${application.targets?.length === 1 ? '' : 's'}; keep existing designs`
      : 'Confirm Apply';
  const swagUnverified = workflow === "swag.collection" && artifact.status === "consumed";
  const resumable = combined && artifact.canResume === true && artifact.status === "failed";
  const rows = workflow === "swag.collection" ? swagRows(preview) : workflow === "budget.allocate" ? allocationPreviewRows(preview) : isSendPointsWorkflow(workflow) ? sendPointsRows(preview) : previewRows(preview);
  const processing = combined && artifact.progress?.outcome === "in_progress";
  function partialOutcome(resolved: { progress?: Record<string, unknown>; canResume?: boolean }): CopilotConfirmationArtifact {
    const running = resolved.progress?.outcome === "in_progress";
    return { ...artifact, status: running ? "consumed" : "failed", progress: resolved.progress, canResume: resolved.canResume,
      message: running ? "This confirmed send is still processing. Check status; do not confirm it again."
        : resolved.canResume ? "The original confirmed send can safely resume while its approval remains valid."
          : "This send requires review. Do not create another campaign or resend uncertain invitations." };
  }

  async function persistOutcome(next: CopilotConfirmationArtifact | CopilotSuccessArtifact) {
    if (!conversationId || !artifact.confirmationId) return;
    try {
      await persistCopilotWriteArtifactApi(conversationId, {
        confirmationId: artifact.confirmationId,
        artifact: next,
      });
    } catch {
      // Local UI state still updates; persistence is best-effort for reload recovery.
    }
  }

  async function applyOutcome(next: CopilotConfirmationArtifact | CopilotSuccessArtifact) {
    onChange(next);
    await persistOutcome(next);
  }

  useEffect(() => {
    if (readOnly || (!pending && !combined) || artifact.status === "cancelled" || artifact.status === "completed" || busy || recoveringRef.current) return;
    if (!artifact.confirmationId) return;
    recoveringRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveCopilotWriteApi(workflow, {
          ...(artifact.request || {}),
          confirmationId: artifact.confirmationId,
          idempotencyKey: `reconcile:${artifact.confirmationId}`,
        });
        if (cancelled) return;
        if (resolved.status === "completed" && resolved.result) {
          await applyOutcome(toSuccessArtifact(workflow, resolved.result, artifact));
          return;
        }
        if (resolved.status === "cancelled") {
          await applyOutcome({ ...artifact, status: "cancelled" });
        }
        if (resolved.status === "expired" || resolved.status === "consumed" || resolved.status === "failed") {
          if (combined && resolved.progress) {
            await applyOutcome(partialOutcome(resolved));
            return;
          }
          const message = resolved.status === "expired" ? "This confirmation expired. Ask Copilot to prepare it again."
            : resolved.status === "failed" ? "Execution failed. Check the operation status before preparing again."
              : "This confirmation was consumed, but completion is not verified. Check status before preparing again.";
          await applyOutcome({ ...artifact, status: workflow === "swag.collection" && resolved.status === "consumed" ? "consumed" : "failed", message });
        }
      } catch {
        // Leave the pending card so the user can confirm or cancel explicitly.
      } finally {
        recoveringRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // Recover once per mounted pending confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.confirmationId, pending, readOnly]);

  async function onConfirm() {
    if (readOnly || (!pending && !resumable) || busy || actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await executeCopilotWriteApi(workflow, {
        ...(artifact.request || {}),
        confirmationId: artifact.confirmationId,
        idempotencyKey,
      });
      await applyOutcome(toSuccessArtifact(workflow, result, artifact));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not confirm";
      // Ambiguous client failure after a possible server success: reconcile without a new WRITE.
      try {
        const resolved = await resolveCopilotWriteApi(workflow, {
          ...(artifact.request || {}),
          confirmationId: artifact.confirmationId,
          idempotencyKey: `reconcile:${artifact.confirmationId}`,
        });
        if (resolved.status === "completed" && resolved.result) {
          await applyOutcome(toSuccessArtifact(workflow, resolved.result, artifact));
          return;
        }
        if (combined && resolved.progress) {
          await applyOutcome(partialOutcome(resolved));
          return;
        }
        if (workflow === "swag.collection" && resolved.status === "consumed") {
          await applyOutcome({ ...artifact, status: "consumed", message: "Publication completion is not verified. Check status before preparing again; this action will not automatically retry." });
          return;
        }
      } catch {
        // Fall through to the original error.
      }
      setError(message);
      await applyOutcome({ ...artifact, status: "failed" });
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  async function onCancel() {
    if (readOnly || !pending || busy || actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await cancelCopilotWriteApi(workflow, artifact.confirmationId);
      await applyOutcome({ ...artifact, status: "cancelled" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  async function onCheckStatus() {
    if (busy || actionRef.current) return;
    actionRef.current = true; setBusy(true);
    try {
      const resolved = await resolveCopilotWriteApi(workflow, { confirmationId: artifact.confirmationId });
      if (resolved.status === "completed" && resolved.result) await applyOutcome(toSuccessArtifact(workflow, resolved.result, artifact));
      else if (resolved.progress) await applyOutcome(partialOutcome(resolved));
      else if (workflow === 'swag.collection' && preview.action === 'apply' && ['failed', 'cancelled', 'expired'].includes(resolved.status)) {
        await applyOutcome({ ...artifact, status: resolved.status, message: 'Artwork application did not complete. Review the saved design before preparing another application.' });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check status"); }
    finally { actionRef.current = false; setBusy(false); }
  }

  const terminal = !pending;
  const title = workflow === "swag.collection" ? preview.action === "publish" ? "Publish your collection?" : preview.action === "apply" ? "Apply your logo?" : "Save for later?" : operationLabel(workflow);
  const stateLabel = processing ? "Processing" : artifact.status === "cancelled" ? "Cancelled"
    : artifact.status === "completed" ? "Completed"
      : artifact.status === "expired" || (artifact.status === "failed" && /expired/i.test(artifact.message || "")) ? "Expired"
        : ["consumed", "unverified"].includes(artifact.status || "") || (artifact.status === "failed" && /not verified|unavailable|cannot be verified/i.test(artifact.message || "")) ? "Unverified"
          : artifact.status === "failed" ? "Failed" : pending ? "Review & confirm" : "Status unavailable";
  const tone = stateLabel === "Failed" ? "failure" : terminal ? "neutral" : "pending";
  const previewContent = rows.length ? <dl className="sm-copilot-confirm__preview">
    {rows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
  </dl> : <p className="sm-copilot-confirm__note">Preview details are unavailable.</p>;
  if (workflow === 'swag.collection' && artifact.status === 'completed') return <SwagCompletedApproval artifact={artifact} />;
  if (workflow === 'swag.collection' && preview.action === 'publish') {
    const { name, destination, productLabel, stores } = swagPublishFacts(preview);
    const warnings = swagPublishWarnings(preview);
    const liveStores = stores.filter(store => store.status === 'live').map(store => store.name);
    const draftStores = stores.filter(store => store.status === 'draft').map(store => store.name);
    return <div className="sm-copilot-confirm sm-swag-publish" data-tone={tone} aria-busy={busy} role="group" aria-label={`Publish ${name}?`}>
      <div className="sm-swag-publish__heading"><strong>Publish {name}?</strong><p>{productLabel}{destination && ` · ${destination}`}</p></div>
      <SwagSavedPreviews source={preview} publish />
      {(liveStores.length > 0 || draftStores.length > 0) && <div className="sm-swag-publish__visibility">
        {liveStores.length > 0 && <p>Products will be listed in {liveStores.join(', ')} under the store’s existing visibility rules.</p>}
        {draftStores.length > 0 && <p>{draftStores.join(', ')} {draftStores.length === 1 ? 'is a draft store' : 'are draft stores'}. Products added there won’t be publicly available while {draftStores.length === 1 ? 'the store is' : 'the stores are'} in draft.</p>}
      </div>}
      {warnings.length > 0 && <ul className="sm-swag-publish__warnings">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      {typeof preview.variantPolicy === 'string' && <p className="sm-copilot-confirm__note">All enabled product options are included.</p>}
      {!pending && <p role={artifact.status === 'failed' ? 'alert' : 'status'} className="sm-copilot-confirm__note">{error || artifact.message || (artifact.status === 'cancelled' ? 'Publication was cancelled.' : `Publication status: ${stateLabel.toLowerCase()}.`)}</p>}
      {pending && error && <p className="sm-copilot-attach-error" role="alert">{error}</p>}
      {pending && !readOnly && <div className="sm-copilot-confirm__actions sm-swag-publish__actions">
        {onEditSwag && <button type="button" className="sm-copilot-confirm__cancel" disabled={busy} onClick={onEditSwag}>Edit</button>}
        <button type="button" className="sm-copilot-confirm__cancel" disabled={busy} onClick={() => void onCancel()}>Cancel</button>
        <button type="button" className="sm-copilot-confirm__ok" disabled={busy} onClick={() => void onConfirm()}>
          {busy && <LoaderCircle size={16} className="sm-copilot-spin" aria-hidden="true" />} {busy ? 'Processing…' : 'Confirm & Publish'}
        </button>
      </div>}
      {!readOnly && swagUnverified && <button type="button" className="sm-copilot-confirm__cancel" disabled={busy} onClick={() => void onCheckStatus()}>Check publication status</button>}
    </div>;
  }
  return (
    <>
    {combined && !pending && artifact.progress ? <p className="sm-copilot-confirm__summary sm-copilot-send-outcome" aria-label="Send Points outcome">{sendPointsOutcomeMessage(artifact.progress)}</p> : null}
    <div className="sm-copilot-confirm" data-tone={tone} aria-busy={busy} role="group" aria-label={`${pending ? "Confirm" : stateLabel} ${title}`}>
      <div className="sm-copilot-confirm__head">
        <strong>{title}</strong><span className="sm-copilot-state">{busy ? combined ? "Sending Points…" : "Processing?" : stateLabel}</span>
      </div>
      {pending ? workflow === 'swag.collection' ? <>
        <dl className="sm-swag-facts">{swagCompactRows(preview).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
        {swagWarnings(preview).map(warning => <p className="sm-swag-warning" key={warning}>{warning}</p>)}
        {preview.action !== 'apply' && <details className="sm-copilot-confirm__original"><summary>Design details</summary>{previewContent}</details>}
      </> : previewContent : null}
      {pending && workflow === "swag.collection" ? <>
        {preview.action === 'apply' && Array.isArray(preview.designs) && preview.designs.some((row: Record<string, unknown>) => row.mockupUrl) ? <p>Existing saved designs are shown for comparison. Your new logo has not been applied yet.</p> : null}
        <SwagSavedPreviews source={preview} inline={preview.action === 'publish'} />
      </> : null}
      {pending && combined && Array.isArray(preview.recipientIdentities) ? <details className="sm-copilot-confirm__original">
        <summary>Verified recipients ({preview.recipientIdentities.length})</summary>
        <ul>{(preview.recipientIdentities as Array<{ name: string; email: string }>).map(recipient =>
          <li key={recipient.email}>{recipient.name} · {recipient.email}</li>)}</ul>
      </details> : null}
      {combined && artifact.progress ? <dl className="sm-copilot-confirm__preview" aria-label="Recorded send progress">
        {sendPointsRows(artifact.progress, true).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
      </dl> : null}
      {pending ? <>
        {workflow !== 'swag.collection' ? <p className="sm-copilot-confirm__note">Review these details before confirming. Cancel dismisses this request.</p> : null}
        {workflow === "shops.create" ? <p className="sm-copilot-confirm__note">Confirming creates and publishes this new store as Live.</p> : null}
        {workflow === "campaigns.points_draft" ? <p className="sm-copilot-confirm__note">Saving this draft does not debit funds or send invitations. Credit allocation and launch require separate confirmations.</p> : null}
        {workflow === "campaigns.allocate_credits" ? <p className="sm-copilot-confirm__note">This confirms INR-backed campaign credits. The wallet is debited only at launch, which requires a separate confirmation.</p> : null}
        {workflow === "campaigns.launch" ? <p className="sm-copilot-confirm__note">Confirming submits this launch. Review the funding debit and delivery schedule above.</p> : null}
      </> : artifact.status !== "failed" ? <p className="sm-copilot-confirm__note" role="status">{artifact.message || (artifact.status === "cancelled" ? "This confirmation was cancelled." : artifact.status === "completed" ? "The backend reports this confirmation as completed." : "Check the operation status before preparing another change.")}</p> : null}
      {pending && workflow === 'swag.collection' && preview.action === 'apply' ? <p className="sm-copilot-confirm__note">This saves artwork only. {application?.manual?.length ? 'The named manual products will remain unchanged. Clicking the supported-products action explicitly approves partial application.' : null}</p> : null}
      {error ? <p className="sm-copilot-attach-error" role="alert">{error}</p> : artifact.status === "failed" ? <p className="sm-copilot-attach-error" role="alert">{artifact.message || "Confirmation failed. Check the operation status before preparing again."}</p> : null}
      {terminal && rows.length ? <details className="sm-copilot-confirm__original"><summary>Original preview · proposed values</summary>{previewContent}</details> : null}
      {pending && !readOnly ? <div className="sm-copilot-confirm__actions">
        {workflow === 'swag.collection' && preview.action !== 'apply' && onEditSwag ? <button type="button" className="sm-copilot-confirm__cancel" disabled={busy} onClick={onEditSwag}>Back / Edit</button> : null}
        <button type="button" className="sm-copilot-confirm__cancel" onClick={() => void onCancel()} disabled={busy}>Cancel</button>
        <button type="button" className="sm-copilot-confirm__ok" onClick={() => void onConfirm()} disabled={busy}>
          {busy ? <LoaderCircle size={16} className="sm-copilot-spin" aria-hidden="true" /> : null}{workflow === "swag.collection" ? preview.action === "publish" ? "Confirm & Publish" : preview.action === "apply" ? applyLabel : "Confirm & Save Design" : combined ? "Confirm & Send Points" : "Confirm"}
        </button>
      </div> : null}
      {resumable && !readOnly ? <div className="sm-copilot-confirm__actions">
        <button type="button" className="sm-copilot-confirm__ok" onClick={() => void onConfirm()} disabled={busy}>
          {busy ? "Resuming…" : "Resume confirmed send"}
        </button>
      </div> : null}
      {!readOnly && (processing || swagUnverified) ? <div className="sm-copilot-confirm__actions">
        <button type="button" className="sm-copilot-confirm__cancel" onClick={() => void onCheckStatus()} disabled={busy}>{swagUnverified ? preview.action === "apply" ? "Check artwork status" : "Check publication status" : "Check send status"}</button>
      </div> : null}
    </div>
    </>
  );
}

export function SwagCompletedApproval({ artifact }: { artifact: CopilotConfirmationArtifact }) {
  const action = swagApprovalAction(artifact);
  const label = action === 'apply' ? 'Artwork application completed'
    : action === 'save' ? 'Design saved for later'
      : action === 'publish' ? 'Collection publication completed' : 'Swag operation completed';
  return <p className="sm-swag-completed-approval"><CheckCircle2 size={15} aria-hidden="true" /> {label}</p>;
}

export function CopilotWriteSuccess({ artifact, onContinueSwag, onApplyLogo }: { artifact: CopilotSuccessArtifact; onContinueSwag?: () => void; onApplyLogo?: () => void }) {
  const entity = artifact.result || artifact.shop || {};
  if (artifact.operation === 'swag.collection' && entity.action === 'publish') return <SwagPublicationResult result={entity} />;
  const productCount = entity.productCount ?? (Array.isArray(entity.products) ? entity.products.length : 'Unknown');
  const presentation = artifact.operation === "swag.collection" ? swagPresentation(entity) : completedPresentation(artifact.operation, entity);
  const shopId = typeof entity.id === "string" ? entity.id : "";
  const isStore = artifact.operation.startsWith("shops.");
  const live = entity.status === "live";
  const storefront = isStore && live ? typeof entity.storefrontUrl === "string" && entity.storefrontUrl ? entity.storefrontUrl
    : shopId ? shopStorefrontHref({ id: shopId, slug: typeof entity.slug === "string" ? entity.slug : undefined }) : "" : "";
  const actions = artifact.operation === "swag.collection" ? [
    ...(typeof entity.editorPath === "string" && /^\/swag\/new\?edit=[a-f\d]{24}$/i.test(entity.editorPath) && entity.published === false && entity.action !== 'apply'
      ? [{ label: "Edit design", href: tenantPath(entity.editorPath) }] : []),
    ...(entity.collectionPath === "/swag" ? [{ label: "View collection", href: tenantPath(entity.collectionPath) }] : []),
    ...(Array.isArray(entity.stores) ? entity.stores.flatMap(store => store && typeof store.id === "string" && /^[a-f\d]{24}$/i.test(store.id)
      ? [{ label: `Manage ${String(store.name || "Store")}`, href: tenantPath(`/shops/${store.id}`) }] : []) : []),
  ] : artifact.actions?.length ? artifact.actions.filter(action => action.label !== "View Store" || live) : [
    ...(storefront ? [{ label: "View Store", href: storefront, external: true }] : []),
    ...(isStore && shopId ? [{ label: "Manage Store", href: tenantPath(`/shops/${shopId}`) }] : []),
  ];
  const Icon = presentation.tone === "pending" ? Clock3 : presentation.tone === "failure" ? CircleAlert : presentation.tone === "neutral" ? Info : CheckCircle2;
  if (artifact.operation === 'swag.collection' && entity.action === 'apply') {
    const application = entity.application as { targets?: Array<{ productId: string }> } | undefined;
    const targets = new Set(application?.targets?.map(target => String(target.productId)) || []);
    const designs = Array.isArray(entity.designs) ? entity.designs.filter(design => targets.has(String(design.productId))) : [];
    const missing = Array.isArray(entity.products) ? entity.products.filter(product => !designs.some(design => design.productId === product.id && design.mockupUrl)) : [];
    return <div className="sm-swag-full sm-swag-applied-previews">
      <SwagSavedPreviews source={{ ...entity, designs }} inline />
      {missing.length > 0 && <p className="sm-swag-warning">No new branded preview: {missing.map(product => product.name).join(', ')}.</p>}
    </div>;
  }
  return (
    <>
    {artifact.operation === "campaigns.send_points" && artifact.result ? <p className="sm-copilot-confirm__summary sm-copilot-send-outcome" aria-label="Send Points outcome">{sendPointsOutcomeMessage(artifact.result)}</p> : null}
    <div className="sm-copilot-confirm sm-copilot-confirm--success" data-tone={presentation.tone} role="status">
      <Icon size={18} aria-hidden="true" />
      <div className="sm-copilot-confirm__content">
        <strong>{presentation.title}</strong>
        <p className="sm-copilot-confirm__summary">{presentation.message}</p>
        {artifact.operation === "swag.collection" ? <SwagSavedPreviews source={entity} snapshot /> : null}
        {artifact.operation === 'swag.collection' ? <>
          <p className="sm-swag-meta">{String(productCount)} product{productCount === 1 ? '' : 's'} · {entity.published === true ? (Array.isArray(entity.stores) ? entity.stores.map(store => String(store.name)).join(', ') || 'Review required' : 'Review required') : entity.action === 'apply' ? 'Design saved' : 'Draft'}</p>
          {swagWarnings(entity).map(warning => <p className="sm-swag-warning" key={warning}>{warning}</p>)}
          {onContinueSwag ? <button type="button" className="sm-copilot-confirm__cancel" onClick={onContinueSwag}>{entity.action === 'apply' ? 'Review current design' : 'Continue designing'}</button> : null}
          {onApplyLogo && entity.action === 'save' && /upload|logo saved/i.test(String(entity.artworkStatus)) ? <button type="button" className="sm-copilot-confirm__cancel" onClick={onApplyLogo}>Apply logo</button> : null}
          <details className="sm-copilot-confirm__original"><summary>Saved operation details</summary><dl className="sm-copilot-confirm__preview">{presentation.rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></details>
        </> : presentation.rows.length ? <dl className="sm-copilot-confirm__preview">
          {presentation.rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
        </dl> : <p className="sm-copilot-confirm__note">Completion details are unavailable.</p>}
        {actions.length ? <div className="sm-copilot-confirm__actions">
          {actions.map(action => <a key={action.label} className={action.external ? "sm-copilot-confirm__ok" : "sm-copilot-confirm__cancel"} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noreferrer noopener" : undefined}>{action.label}</a>)}
        </div> : null}
      </div>
    </div>
    </>
  );
}

function SwagPublicationResult({ result }: { result: Record<string, unknown> }) {
  const { name, stores, destination, productLabel } = swagPublishFacts(result);
  if (!isVerifiedSwagPublication(result)) return <p role="status">Publication details could not be verified. Check the recorded result.</p>;
  const drafts = stores.filter(store => store.status === 'draft');
  const live = stores.filter(store => store.status === 'live');
  return <div className="sm-swag-publication-result">
    <div role="status"><p>Your <strong>{name}</strong> collection {live.length === stores.length
      ? <>has been published to <strong>{destination}</strong> successfully.</>
      : <>has been added to <strong>{destination}</strong>.</>}</p><p className="sm-swag-publication-result__meta">{productLabel}</p>
      {drafts.length > 0 && <p>{drafts.map(store => store.name).join(', ')} {drafts.length === 1 ? 'is still in draft and isn’t publicly available yet.' : 'are still in draft and aren’t publicly available yet.'}</p>}
    </div>
    <div className="sm-copilot-confirm__actions">
      {result.collectionPath === '/swag' && <a className="sm-copilot-confirm__cancel" href={tenantPath(result.collectionPath)}>View collection</a>}
      {stores.map(store => typeof store.id === 'string' && /^[a-f\d]{24}$/i.test(store.id) && (store.status === 'live' || store.status === 'draft')
        ? <a key={store.id} className="sm-copilot-confirm__cancel" href={store.status === 'live' ? shopStorefrontHref({ id: store.id }) : tenantPath(`/shops/${store.id}`)}>{stores.length === 1 ? 'View store' : `View ${store.name}`}</a> : null)}
    </div>
  </div>;
}
