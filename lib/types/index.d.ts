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
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import '@deepseek-ai/dsh-session';
import type { MessageId } from '@deepseek-ai/dsh-llm/brand';
/** One replace request: target message identity plus the edited fields. */
export interface AssistantEditReplaceRequest {
    /** Session owning the target assistant message. */
    sessionId: string;
    /** Stable identity carried by the target `assistant/message` event. */
    messageId: MessageId;
    /** Replacement reply text; empty string blanks the reply. */
    text: string;
    /** Replacement reasoning; empty string removes the reasoning block. */
    reasoning: string;
}
/** Success branch. */
export interface AssistantEditReplaceSuccess {
    ok: true;
    /** Seq of the appended replacement event. */
    seq: number;
}
/** Failure branch with a stable machine code and human message. */
export interface AssistantEditReplaceFailure {
    ok: false;
    error: {
        /** `session-not-found` | `message-not-found` | `message-not-editable` | `invalid-content` */
        code: string;
        message: string;
    };
}
/** The single exported Remote result type. */
export type AssistantEditReplaceResult = AssistantEditReplaceSuccess | AssistantEditReplaceFailure;
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
export declare class AssistantEditService extends TypertRemoteService {
    static inject: readonly ["sessions"];
    constructor(ctx: Context);
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
    replace(request: AssistantEditReplaceRequest): Promise<AssistantEditReplaceResult>;
}
/**
 * The plugin entrypoint: this class is the Host plugin. The loader
 * constructs it with the resolved context, and its `typertRemote` binding
 * makes the gateway route `assistantEdit/replace` here.
 */
export default AssistantEditService;
