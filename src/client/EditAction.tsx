/**
 * Per-message edit action: a pencil in the assistant-actions strip that opens
 * the edit LIST modal (every finalized assistant message in the session, this
 * one pre-expanded and scrolled into view). The button reuses the IconActions
 * row chrome (28px circle, hover fill) and is disabled while the agent is
 * running, matching the conflict rule of requirement 4.
 * @module dsh-assistant-edit/client/EditAction
 */

import { useCallback, useRef, useState } from 'react'
import {
  IconEditOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { AssistantEditActionProps } from './slots.ts'
import { EditModal } from './EditModal.tsx'
import css from './assistant-edit.module.css'

/**
 * One message's edit entry.
 * @param props - owner message identity, session kit, and injected face.
 */
export function EditAction({
  messageId, useSession, rpc, sessionId, t,
}: AssistantEditActionProps) {
  // The addressed fragment is immutable and cache-stable; reuse it for the
  // closure below rather than a second read. `running` gates the pencil.
  const running = useSession(snapshot => snapshot.running)
  const [open, setOpen] = useState(false)
  const [justEdited, setJustEdited] = useState(false)
  const justEditedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openModal = useCallback(() => {
    setJustEdited(false)
    setOpen(true)
  }, [])

  const closeModal = useCallback((edited: boolean) => {
    setOpen(false)
    if (!edited) return
    setJustEdited(true)
    // Retire the transient "已编辑" state after a beat; the durable truth is
    // the host-side replacement event, not this badge.
    if (justEditedTimer.current !== null) clearTimeout(justEditedTimer.current)
    justEditedTimer.current = setTimeout(() => { setJustEdited(false) }, 2500)
  }, [])

  return (
    <>
      <Tooltip label={justEdited ? t('edited.badge') : t('action.edit')} side="bottom">
        <button
          type="button"
          className={css.action}
          aria-label={justEdited ? t('edited.badge') : t('action.edit')}
          data-active={justEdited || undefined}
          onClick={openModal}
          disabled={running}
        >
          <IconEditOutline16 />
        </button>
      </Tooltip>
      {open && (
        <EditModal
          messageId={messageId}
          useSession={useSession}
          sessionId={sessionId}
          rpc={rpc}
          t={t}
          running={running}
          onClose={closeModal}
        />
      )}
    </>
  )
}