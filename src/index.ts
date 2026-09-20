/**
 * dsh-assistant-edit — Host half.
 *
 * Provides the `assistantEdit` Remote namespace with one direct method:
 *
 * - `replace(request)` — replace the text and reasoning content of one
 *   finalized assistant message by appending a **surface replacement**
 *   event to the session's append-only log. The model-visible surface
 *   (`deriveMessages` folding) then shows only the edited node; every older
 *   copy (the original append-origin event AND any earlier replacement) is
 *   shadowed out of the model-visible surface. This is exactly the mechanism
 *   compaction uses. The editable target is always the newest surface-visible
 *   event carrying the message id, so one message can be edited repeatedly.
 *
 * The gateway discovers this service through SRC source-mode reflection
 * (`typertRemote` binding + `@Remote` markers), so no typert generator
 * output is required for the endpoint to exist.
 *
 * @module dsh-assistant-edit
 */

import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Value import: pulls the `ctx.sessions` Context merge and SessionStore API.
import '@deepseek-ai/dsh-session'
import { isSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { AssistantMessage } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** One replace request: target message identity plus the edited fields. */
export interface AssistantEditReplaceRequest {
  /** Session owning the target assistant message. */
  sessionId: string
  /** Stable identity carried by the target `assistant/message` event. */
  messageId: MessageId
  /** Replacement reply text; empty string blanks the reply. */
  text: string
  /** Replacement reasoning; empty string removes the reasoning block. */
  reasoning: string
}

/** Success branch. */
export interface AssistantEditReplaceSuccess {
  ok: true
  /** Seq of the appended replacement event. */
  seq: number
}

/** Failure branch with a stable machine code and human message. */
export interface AssistantEditReplaceFailure {
  ok: false
  error: {
    /** `session-not-found` | `message-not-found` | `message-not-editable` | `invalid-content` */
    code: string
    message: string
  }
}

/** The single exported Remote result type. */
export type AssistantEditReplaceResult = AssistantEditReplaceSuccess | AssistantEditReplaceFailure

/** Required services: the session store (live sessions only). */
const INJECT = ['sessions'] as const

/**
 * Replace one finalized assistant message's editable content.
 *
 * SRC source-mode contract: the method keeps a single plain `request`
 * parameter (the gateway derives the wire field from the JS parameter
 * name), and the result rides as loose JSON.
 *
 * The class IS the plugin entrypoint (Cordis class-plugin form): the loader
 * constructs it with `(ctx, config)`, resolves `static inject`, and mounts
 * it as the `assistantEdit` context service. A separate `apply()` would
 * bypass inject resolution, so none is provided — mirroring
 * `dsh-message-feedback`'s default-export class entry.
 */
export class AssistantEditService extends TypertRemoteService {
  static inject = INJECT

  constructor(ctx: Context) {
    super(ctx, 'assistantEdit')
  }

  /**
   * Rewrite the reply text and reasoning chain of one assistant message.
   *
   * The replacement keeps every non-text/non-reasoning block (images,
   * tool calls, unknown blocks) untouched, replaces the first text block
   * with the edited reply (an empty reply blanks it), and replaces the
   * first reasoning block with the edited chain (an empty reasoning
   * removes that block). If the message already has no reasoning block,
   * a non-empty reasoning is added at the front of the content.
   *
   * @param request - target identity and edited fields.
   * @returns appended replacement seq, or a business failure.
   */
  @Remote('replace')
  async replace(request: AssistantEditReplaceRequest): Promise<AssistantEditReplaceResult> {
    const { sessionId, messageId, text, reasoning } = request
    if (typeof text !== 'string' || typeof reasoning !== 'string') {
      return fail('invalid-content', 'text and reasoning must be strings')
    }

    const session = this.ctx.sessions.get(sessionId as never)
    if (session === undefined) {
      return fail('session-not-found', `session ${String(sessionId)} is not live in this process`)
    }

    // Locate the CURRENT surface-visible event for this message. A message
    // that was already edited once carries a replacement copy standing on
    // the surface while the original append-origin event was shadowed — the
    // editable target is the NEWEST matching event still on the surface, so
    // the same message can be edited any number of times.
    let target: AssistantMessageEvent | undefined
    let anyMatch = false
    for (const event of session.events) {
      if (event.type !== 'assistant/message' || !isSurfaceEvent(event)) continue
      const candidate = event as AssistantMessageEvent
      if (candidate.data.message.id !== messageId) continue
      anyMatch = true
      // The replacement must shadow a CURRENT surface node. If the message
      // was already swept into a compaction summary it is no longer on the
      // surface — refuse loudly instead of corrupting the fold.
      if (!session.surface.nodes.includes(candidate.seq)) continue
      if (target === undefined || candidate.seq > target.seq) target = candidate
    }
    if (target === undefined) {
      if (!anyMatch) {
        return fail('message-not-found', `no assistant message with id ${String(messageId)}`)
      }
      return fail(
        'message-not-editable',
        'this message was replaced by a newer surface node (e.g. a compaction summary) and can no longer be edited',
      )
    }

    const content = buildEditedContent(target.data.message.content, text, reasoning)

    const appended = session.append(
      'assistant/message',
      {
        turn: target.data.turn,
        step: target.data.step,
        message: {
          ...target.data.message,
          content,
        },
        ...(target.data.interrupted === undefined ? {} : { interrupted: target.data.interrupted }),
        ...(target.data.usage === undefined ? {} : { usage: target.data.usage }),
      },
      {
        surfaceOp: { op: 'replace', start: target.seq, end: target.seq },
        sourceEventSeqs: [target.seq],
      },
    )
    return { ok: true, seq: appended.seq }
  }
}

/** One append-origin assistant/message event narrowed by the lookup. */
type AssistantMessageEvent = SessionEvent<'assistant/message'> & { data: { message: AssistantMessage } }

/** Build the edited content: replace text + reasoning, keep everything else. */
function buildEditedContent(original: readonly ContentBlock[], text: string, reasoning: string): ContentBlock[] {
  const content: ContentBlock[] = []
  let textDone = false
  let reasoningDone = false
  for (const block of original) {
    if (block.type === 'text' && !textDone) {
      content.push({ type: 'text', text })
      textDone = true
      continue
    }
    if (block.type === 'reasoning' && !reasoningDone) {
      if (reasoning.length > 0) content.push({ type: 'reasoning', text: reasoning })
      reasoningDone = true
      continue
    }
    content.push(block)
  }
  // A message with no text block at all: add the edited reply.
  if (!textDone) content.unshift({ type: 'text', text })
  // A message with no reasoning block: a non-empty reasoning joins the front.
  if (!reasoningDone && reasoning.length > 0) content.unshift({ type: 'reasoning', text: reasoning })
  return content
}

/** Build one business failure branch. */
function fail(code: string, message: string): AssistantEditReplaceFailure {
  return { ok: false, error: { code, message } }
}

/**
 * The plugin entrypoint: this class is the Host plugin. The loader
 * constructs it with the resolved context, and its `typertRemote` binding
 * makes the gateway route `assistantEdit/replace` here.
 */
export default AssistantEditService