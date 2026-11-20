import { CopilotConversation } from './copilotConversation.model.js';
import { McpWriteConfirmation } from '../mcp/mcpWriteConfirmation.model.js';
import { readMcpWriteOutcome } from '../mcp/mcpWriteSafety.js';
import { catalogByName, workflowsFromCatalog } from './copilotMcpCatalog.js';

const workflows = new Map(workflowsFromCatalog().map(row => [row.id, row]));

function plain(value) { return value?.toObject ? value.toObject() : value; }

function outcomeForArtifact(artifact, outcomes) {
  const matches = outcomes.filter(row => row.workflow === artifact.operation && (
    artifact.confirmationId ? row.confirmationId === artifact.confirmationId
      : artifact.kind === 'success' && row.state === 'completed' && row.result?.id
        && row.result.id === (artifact.result?.id || artifact.shop?.id)
  ));
  // Several historical updates can target the same resource. Never guess which one a legacy card represents.
  return matches.length === 1 ? matches[0] : null;
}

function confirmationsIn(messages) {
  const found = new Map();
  for (const message of messages) {
    for (const artifact of message.artifacts || []) {
      if (artifact.confirmationId && workflows.has(artifact.operation)) {
        found.set(artifact.confirmationId, { confirmationId: artifact.confirmationId, workflow: artifact.operation });
      }
    }
    // Older success cards lost confirmationId; the persisted PREPARE tool result retains it.
    const tool = message.role === 'tool' ? catalogByName(message.toolName) : null;
    if (tool?.kind !== 'prepare' || !tool.workflow) continue;
    try {
      const result = JSON.parse(message.content);
      if (typeof result?.confirmationId === 'string') found.set(result.confirmationId, { confirmationId: result.confirmationId, workflow: tool.workflow });
    } catch { /* Non-JSON/error tool results are not confirmation evidence. */ }
  }
  return [...found.values()];
}

function outcomeMessage(outcome) {
  if (outcome.workflow === 'campaigns.send_points') {
    if (outcome.state === 'completed') return 'Send Points launch is recorded. The result shows actual debit and invitation acknowledgement; mailbox delivery is not guaranteed.';
    if (outcome.progress?.outcome === 'in_progress') return 'This confirmed send is still processing. Check status; do not confirm it again.';
    if (outcome.progress) return outcome.canResume
      ? 'This send stopped before completion. The original confirmed operation can safely resume while its approval remains valid.'
      : 'This send requires review. Check the recorded progress and debit; do not create another campaign or resend uncertain invitations.';
  }
  if (outcome.state === 'completed') {
    const result = outcome.result;
    return result?.name && result.status === 'live'
      ? `${result.name} is now Live.` : `${outcome.workflow.replace(/[_.]/g, ' ')} completed.`;
  }
  if (outcome.state === 'cancelled') return 'This confirmation was cancelled. No operation was executed by this cancellation.';
  if (outcome.state === 'expired') return 'This confirmation expired. Prepare a fresh preview if the change is still wanted.';
  if (outcome.state === 'consumed') return 'This confirmation was consumed, but completion is not verified. Check status; do not execute it again.';
  if (outcome.state === 'unavailable') return 'This confirmation is unavailable and completion cannot be verified. Check authoritative status; do not execute it again.';
  return 'Execution failed. Do not infer completion or rollback; check authoritative state before preparing again.';
}

function applyOutcome(artifact, outcome) {
  if (outcome.state === 'pending') return artifact;
  const value = plain(artifact);
  const next = {
    ...value, operation: outcome.workflow, confirmationId: outcome.confirmationId,
    kind: outcome.state === 'completed' ? 'success' : 'confirmation',
    status: outcome.state === 'completed' ? 'completed' : outcome.state === 'cancelled' ? 'cancelled' : 'failed',
    message: outcomeMessage(outcome),
  };
  if (outcome.workflow === 'campaigns.send_points' && outcome.progress) {
    next.progress = outcome.progress;
    next.canResume = Boolean(outcome.canResume);
    if (outcome.progress.outcome === 'in_progress') next.status = 'consumed';
  }
  if (outcome.state === 'completed') {
    next.result = outcome.result;
    next.title = outcome.workflow === 'shops.create' ? 'Store created' : 'Completed';
    if (outcome.workflow.startsWith('shops.')) next.shop = outcome.result;
  } else {
    delete next.result;
    delete next.shop;
  }
  return next;
}

/** Read-only authoritative recovery; updates only the supplied in-memory transcript. */
export async function reconcileConversationWriteState(conversation) {
  const outcomes = [];
  for (const binding of confirmationsIn(conversation.messages)) {
    const workflow = workflows.get(binding.workflow);
    const state = await readMcpWriteOutcome({
      tenantId: conversation.tenantId, actorUserId: conversation.userId,
      operation: workflow.mcpOperation, confirmationId: binding.confirmationId,
    });
    outcomes.push({ ...(state || { state: 'unavailable', errorCode: 'CONFIRMATION_INVALID' }), ...binding });
  }
  for (const message of conversation.messages) {
    for (let index = 0; index < (message.artifacts || []).length; index += 1) {
      const artifact = message.artifacts[index];
      const outcome = outcomeForArtifact(artifact, outcomes);
      if (outcome?.state !== 'pending' && outcome) message.artifacts[index] = applyOutcome(artifact, outcome);
    }
  }
  return outcomes;
}

/** Server-side outcome persistence, before HTTP success; never calls a business handler. */
export async function recordCopilotWriteOutcome({ tenantId, userId, workflow, confirmationId, state, result, errorCode }) {
  const meta = workflows.get(workflow);
  if (!meta || !confirmationId) return;
  const outcome = { state, ...(state === 'completed' ? { result } : {}), ...(errorCode ? { errorCode } : {}) };
  await McpWriteConfirmation.updateOne({
    tenantId, actorUserId: userId, operation: meta.mcpOperation, confirmationId,
    ...(state === 'completed' ? { status: 'consumed' } : { 'copilotOutcome.state': { $ne: 'completed' } }),
  }, { $set: { copilotOutcome: outcome } });
  // Atomic artifact updates preserve concurrent appended messages and cannot downgrade success.
  const conversations = await CopilotConversation.find({
    tenantId, userId, 'messages.artifacts.confirmationId': confirmationId,
  });
  for (const conversation of conversations) {
    const outcomes = await reconcileConversationWriteState(conversation);
    const authoritative = outcomes.find(row => row.confirmationId === confirmationId && row.workflow === workflow);
    if (!authoritative || authoritative.state === 'pending') continue;
    for (const message of conversation.messages) {
      const artifact = (message.artifacts || []).find(row => row.confirmationId === confirmationId && row.operation === workflow);
      if (!artifact) continue;
      await CopilotConversation.updateOne({ _id: conversation._id, tenantId, userId }, {
        $set: { 'messages.$[].artifacts.$[artifact]': plain(artifact) },
      }, { arrayFilters: [{ 'artifact.confirmationId': confirmationId, 'artifact.operation': workflow }] });
      break;
    }
  }
}

/** Supersede PREPARE-only content, preserving provider tool-use/result pairing. */
export function messagesWithWriteOutcomes(messages, outcomes) {
  const terminal = outcomes.filter(row => row.state !== 'pending');
  if (!terminal.length) return messages;
  const projected = messages.map(message => {
    const value = plain(message);
    const tool = value.role === 'tool' ? catalogByName(value.toolName) : null;
    if (tool?.kind === 'prepare') {
      try {
        const result = JSON.parse(value.content);
        const outcome = terminal.find(row => row.confirmationId === result.confirmationId && row.workflow === tool.workflow);
        if (outcome) return { ...value, content: JSON.stringify({ ...outcome, authoritative: true, message: outcomeMessage(outcome) }) };
      } catch { /* Keep non-JSON messages unchanged. */ }
    }
    const bound = (value.artifacts || []).filter(artifact => artifact.confirmationId);
    if (value.role === 'assistant' && !value.toolCalls?.length && bound.length && bound.every(artifact => terminal.some(row => row.confirmationId === artifact.confirmationId))) {
      return { ...value, content: bound.map(artifact => outcomeMessage(terminal.find(row => row.confirmationId === artifact.confirmationId))).join('\n') };
    }
    return value;
  });
  // A fresh authoritative summary also supersedes older assistant prose after execution.
  let lastUser = projected.length - 1;
  while (lastUser >= 0 && projected[lastUser].role !== 'user') lastUser -= 1;
  projected.splice(lastUser >= 0 ? lastUser : projected.length, 0, {
    role: 'assistant', content: `Backend-confirmed WRITE state (supersedes earlier previews/confirmation requests; do not re-execute): ${JSON.stringify(terminal)}`,
  });
  return projected;
}
