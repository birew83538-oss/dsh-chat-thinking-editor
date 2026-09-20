/**
 * dsh-assistant-edit — Client half.
 *
 * Contributes an edit pencil to the `conversation.chat.assistant-actions`
 * strip of every finalized assistant message. Clicking it opens a LIST modal
 * covering EVERY finalized assistant message in the session; each row expands
 * into two editors (reply text and reasoning chain) and saves independently
 * through the Host `assistantEdit/replace` Remote via the browser RPC channel.
 * The Host appends a surface replacement event so the model only ever sees
 * the edited version — old copies stay out of the model-visible surface.
 * The modal closes ONLY via its top-left close button (no backdrop tap, no
 * outside pointer-down, no swipe, no Escape), it is disabled while the agent
 * is running, and a failed save keeps the original content on screen.
 *
 * @module dsh-assistant-edit/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the SlotMap merge (the assistant-actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { EditAction } from './EditAction.tsx'
import type { AssistantEditInjected } from './slots.ts'
import { NS, en, zh } from './locales.ts'

export type {} from './slots.ts'
export type { AssistantEditInjected } from './slots.ts'

/** Dictionary namespace owned by this plugin. */
export { NS } from './locales.ts'

/** Required services: the slot registry, the connection RPC handle, and the locale seat. */
export const inject = ['slots', 'connection', 'locale']

/**
 * Client plugin body: the per-message edit entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'assistant-edit: dictionaries')

  // The connection handle is provided as a plain property, not a typed
  // Context merge; resolve it at apply time and close the RPC caller over it.
  const connection = ctx.get('connection') as ConnectionHandle | undefined

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'assistant-edit',
    order: 9,
    locale: NS,
    inject: (sessionId): AssistantEditInjected => ({
      rpc: connection?.rpc,
      sessionId,
    }),
  }, EditAction))
}