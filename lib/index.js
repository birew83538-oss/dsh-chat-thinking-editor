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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
// Value import: pulls the `ctx.sessions` Context merge and SessionStore API.
import '@deepseek-ai/dsh-session';
import { isSurfaceEvent } from '@deepseek-ai/dsh-session/surface';
/** Required services: the session store (live sessions only). */
const INJECT = ['sessions'];
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
let AssistantEditService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _replace_decorators;
    return class AssistantEditService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _replace_decorators = [Remote('replace')];
            __esDecorate(this, null, _replace_decorators, { kind: "method", name: "replace", static: false, private: false, access: { has: obj => "replace" in obj, get: obj => obj.replace }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = INJECT;
        constructor(ctx) {
            super(ctx, 'assistantEdit');
            __runInitializers(this, _instanceExtraInitializers);
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
        async replace(request) {
            const { sessionId, messageId, text, reasoning } = request;
            if (typeof text !== 'string' || typeof reasoning !== 'string') {
                return fail('invalid-content', 'text and reasoning must be strings');
            }
            const session = this.ctx.sessions.get(sessionId);
            if (session === undefined) {
                return fail('session-not-found', `session ${String(sessionId)} is not live in this process`);
            }
            // Locate the CURRENT surface-visible event for this message. A message
            // that was already edited once carries a replacement copy standing on
            // the surface while the original append-origin event was shadowed — the
            // editable target is the NEWEST matching event still on the surface, so
            // the same message can be edited any number of times.
            let target;
            let anyMatch = false;
            for (const event of session.events) {
                if (event.type !== 'assistant/message' || !isSurfaceEvent(event))
                    continue;
                const candidate = event;
                if (candidate.data.message.id !== messageId)
                    continue;
                anyMatch = true;
                // The replacement must shadow a CURRENT surface node. If the message
                // was already swept into a compaction summary it is no longer on the
                // surface — refuse loudly instead of corrupting the fold.
                if (!session.surface.nodes.includes(candidate.seq))
                    continue;
                if (target === undefined || candidate.seq > target.seq)
                    target = candidate;
            }
            if (target === undefined) {
                if (!anyMatch) {
                    return fail('message-not-found', `no assistant message with id ${String(messageId)}`);
                }
                return fail('message-not-editable', 'this message was replaced by a newer surface node (e.g. a compaction summary) and can no longer be edited');
            }
            const content = buildEditedContent(target.data.message.content, text, reasoning);
            const appended = session.append('assistant/message', {
                turn: target.data.turn,
                step: target.data.step,
                message: {
                    ...target.data.message,
                    content,
                },
                ...(target.data.interrupted === undefined ? {} : { interrupted: target.data.interrupted }),
                ...(target.data.usage === undefined ? {} : { usage: target.data.usage }),
            }, {
                surfaceOp: { op: 'replace', start: target.seq, end: target.seq },
                sourceEventSeqs: [target.seq],
            });
            return { ok: true, seq: appended.seq };
        }
    };
})();
export { AssistantEditService };
/** Build the edited content: replace text + reasoning, keep everything else. */
function buildEditedContent(original, text, reasoning) {
    const content = [];
    let textDone = false;
    let reasoningDone = false;
    for (const block of original) {
        if (block.type === 'text' && !textDone) {
            content.push({ type: 'text', text });
            textDone = true;
            continue;
        }
        if (block.type === 'reasoning' && !reasoningDone) {
            if (reasoning.length > 0)
                content.push({ type: 'reasoning', text: reasoning });
            reasoningDone = true;
            continue;
        }
        content.push(block);
    }
    // A message with no text block at all: add the edited reply.
    if (!textDone)
        content.unshift({ type: 'text', text });
    // A message with no reasoning block: a non-empty reasoning joins the front.
    if (!reasoningDone && reasoning.length > 0)
        content.unshift({ type: 'reasoning', text: reasoning });
    return content;
}
/** Build one business failure branch. */
function fail(code, message) {
    return { ok: false, error: { code, message } };
}
/**
 * The plugin entrypoint: this class is the Host plugin. The loader
 * constructs it with the resolved context, and its `typertRemote` binding
 * makes the gateway route `assistantEdit/replace` here.
 */
export default AssistantEditService;
