import type { CopilotArtifact, CopilotConfirmationArtifact, CopilotMessage, CopilotSuccessArtifact } from './api';
import type { SwagState } from './swagApi';
import { isVerifiedSwagPublication } from './swagPresentation';

export function visibleMessage(message: CopilotMessage & { streaming?: boolean }) {
  return message.role === 'user' || Boolean(message.streaming || message.content?.trim() || message.artifacts?.length);
}
type SwagPublishReview = CopilotConfirmationArtifact & ({ preview: { action: 'publish' } } | { request: { action: 'publish' } });

export function swagApprovalAction(artifact: CopilotConfirmationArtifact) {
  return artifact.preview?.action ?? artifact.request?.action;
}

export function isSwagPublishReview(artifact: CopilotArtifact): artifact is SwagPublishReview {
  return artifact.kind === 'confirmation' && artifact.operation === 'swag.collection'
    && swagApprovalAction(artifact) === 'publish';
}
/** Presentation projection only. The server transcript and immutable receipts
 * are retained; an operation's canonical appended result is displayed once. */
export function projectSwagTimeline<T extends CopilotMessage>(messages: T[], state: SwagState | null) {
  const receipts = new Map<string, { action: string; index: number }>();
  const lastApproval = new Map<string, number>();
  messages.forEach((message, index) => message.artifacts?.forEach(artifact => {
    if ((artifact.kind !== 'confirmation' && artifact.kind !== 'success') || artifact.operation !== 'swag.collection' || !artifact.confirmationId) return;
    if (artifact.kind === 'confirmation') {
      lastApproval.set(artifact.confirmationId, index);
      return;
    }
    if (message.role !== 'assistant' || message.uiEventId !== `swag:receipt:${artifact.confirmationId}` || artifact.status !== 'completed') return;
    const result = artifact.result;
    const action = result?.action;
    if (action === 'publish' ? isVerifiedSwagPublication(result)
      : (action === 'apply' || action === 'save') && typeof result?.id === 'string' && Boolean(result.id)) {
      receipts.set(artifact.confirmationId, { action: String(action), index });
    }
  }));
  const timeline = messages.map((message, index) => {
    const hasMatchingReceipt = (approval: CopilotConfirmationArtifact) => {
      if (approval.operation !== 'swag.collection') return false;
      const receipt = receipts.get(approval.confirmationId);
      const action = swagApprovalAction(approval);
      return Boolean(receipt && (!action || receipt.action === action));
    };
    const superseded = (a: CopilotArtifact) => {
      if (a.kind === 'confirmation' && a.operation === 'swag.collection') return hasMatchingReceipt(a) || lastApproval.get(a.confirmationId) !== index;
      if (a.kind !== 'success' || a.operation !== 'swag.collection' || !a.confirmationId) return false;
      const receipt = receipts.get(a.confirmationId);
      return Boolean(receipt && receipt.action === a.result?.action && receipt.index !== index);
    };
    const suppressCompletedReview = (message.artifacts || []).some(a => a.kind === 'success' ? superseded(a)
      : a.kind === 'confirmation' && (hasMatchingReceipt(a) || (a.operation === 'swag.collection' && a.status === 'completed' && superseded(a))));
    const earlierReview = message.artifacts?.some(superseded);
    const artifacts = (message.artifacts || []).filter(a => !superseded(a));
    const step = artifacts.find((a): a is Extract<CopilotArtifact, { kind: 'swag_step' }> => a.kind === 'swag_step');
    const completedApproval = artifacts.find((a): a is CopilotConfirmationArtifact => a.kind === 'confirmation' && a.operation === 'swag.collection' && a.status === 'completed');
    const artworkResult = artifacts.find((a): a is CopilotSuccessArtifact => a.kind === 'success' && a.operation === 'swag.collection'
      && a.result?.action === 'apply' && Boolean(a.confirmationId && receipts.get(a.confirmationId)?.index === index))?.result;
    return { message, index, artifacts, step, completedApproval, artworkResult, suppressCompletedReview, earlierReview: Boolean(earlierReview),
      visible: visibleMessage(message) && (!suppressCompletedReview || artifacts.some(a => a.kind !== 'swag_step')) };
  });
  const latest = timeline.reduce((last, row) => row.visible ? row.index : last, -1);
  return timeline.map(row => ({ ...row, active: Boolean(state?.active && row.index === latest && row.step?.swag.revision === state.revision
    && (!row.step.swag.conversationId || row.step.swag.conversationId === state.conversationId)) }));
}
