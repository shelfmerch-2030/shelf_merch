import { CopilotConversation } from './copilotConversation.model.js';
import { McpWriteConfirmation } from '../mcp/mcpWriteConfirmation.model.js';
import { readMcpWriteOutcome } from '../mcp/mcpWriteSafety.js';
import { catalogByName, workflowsFromCatalog } from './copilotMcpCatalog.js';
import { appendSwagReceipt } from './swagTimeline.js';

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
  if (outcome.workflow === 'wallets.setup' && outcome.state === 'completed') {
    return 'The backend recorded confirmation and completion of the wallet setup.';
  }
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

const SKIPPED_CONFIRMATION = [
  /\bwithout (?:first )?(?:(?:an?|your|the|explicit|user|prior|separate)\s+)*(?:confirmation|confirming|clicking confirm)\b/i,
  /\b(?:skipped|bypassed) (?:the )?confirmation\b|\b(?:the )?confirmation (?:was |step was )?(?:skipped|bypassed|not required|never requested)\b|\bno confirmation (?:was )?(?:required|needed|provided|requested)\b/i,
  /\b(?:did not|didn['’]t|never) (?:ask (?:you )?(?:to confirm|for confirmation)|click confirm|show (?:a |the )?confirmation)\b/i,
];
const describesSkippedConfirmation = text => SKIPPED_CONFIRMATION.some(pattern => pattern.test(text));
const CONFIRMATION_REQUIREMENT = /\b(?:can(?:not|['’]t)|will not|won['’]t|would not|wouldn['’]t|must not|should not|do not|don['’]t|did not|didn['’]t|never|not)\s+(?:have\s+)?(?:create[d]?|set up|complete[d]?|proceed(?:ed)?|execute[d]?)\b/i;

/** Correct unsupported claims about the wallet setup approval, leaving balance narration intact. */
export function walletSetupNarration(content, outcomes) {
  if (!content || !describesSkippedConfirmation(content)) return content;
  const setups = outcomes.filter(row => row.workflow === 'wallets.setup');
  return content.replace(/[^\n]+?(?:[.!?](?=\s|$)|$)/gm, sentence => {
    if (sentence.endsWith('?') || !describesSkippedConfirmation(sentence) || CONFIRMATION_REQUIREMENT.test(sentence)) return sentence;
    const names = setups.filter(row => row.result?.name && sentence.toLowerCase().includes(row.result.name.toLowerCase()));
    if (!/\bwallet\b/i.test(sentence) && (!setups.length || /\b(?:store|campaign|top[- ]?up|publish|send points|finance approval)\b/i.test(sentence))) return sentence;
    const relevant = names.length ? names : setups;
    const replacement = relevant.length === 1 && relevant[0].state === 'completed'
      ? outcomeMessage(relevant[0])
      : 'I can’t verify the wallet setup confirmation from this conversation.';
    return sentence.replace(/\S[\s\S]*/, replacement);
  });
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
      if (outcome?.state !== 'pending' && outcome) {
        const next = applyOutcome(artifact, outcome);
        if (outcome.workflow === 'swag.collection' && outcome.state === 'completed' && message.uiEventId !== `swag:receipt:${outcome.confirmationId}`) {
          next.kind = 'confirmation'; next.status = 'completed';
          next.message = 'Completed. The recorded result appears later in this conversation.';
          delete next.result; delete next.shop;
        }
        message.artifacts[index] = next;
      }
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
      }, { arrayFilters: [{ 'artifact.confirmationId': confirmationId, 'artifact.operation': workflow,
        ...(workflow === 'swag.collection' ? { 'artifact.kind': 'confirmation' } : {}) }] });
      break;
    }
    if (workflow === 'swag.collection') await appendSwagReceipt(conversation, authoritative);
  }
}

/** Supersede PREPARE-only content, preserving provider tool-use/result pairing. */
export function messagesWithWriteOutcomes(messages, outcomes) {
  const terminal = outcomes.filter(row => row.state !== 'pending').map(row => row.workflow === 'wallets.setup'
    ? { ...row, userConfirmation: row.state === 'completed' ? 'verified' : 'unverified' }
    : row);
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
    if (value.role === 'assistant' && !value.toolCalls?.length) {
      return { ...value, content: walletSetupNarration(value.content, outcomes) };
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
