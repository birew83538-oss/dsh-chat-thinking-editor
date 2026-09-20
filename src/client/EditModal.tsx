/**
 * The edit list modal: lists EVERY finalized assistant message in the current
 * conversation window (each reply the assistant produced — including the ones
 * between tool calls). Each row expands into two editors: reply text and
 * reasoning chain. Every row saves independently through the Host
 * `assistantEdit/replace` Remote; a successful save appends a surface
 * replacement so the model only ever sees the edited version, and the same
 * message can be edited any number of times.
 *
 * Closing: the dialog closes ONLY via the close button pinned at the TOP-LEFT
 * of the header. Backdrop taps, outside pointer-downs, touch swipes, and the
 * Escape key never close it — mobile remote access kept dismissing the modal
 * by accident while scrolling.
 *
 * @module dsh-assistant-edit/client/EditModal
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId, MessageId } from '@deepseek-ai/dsh-client-connection/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AssistantEditActionProps } from './slots.ts'
import css from './assistant-edit.module.css'

/** Locale prop narrowed to the keys this modal consumes. */
type ModalT = AssistantEditActionProps['t']

/** One modal's props: owner message (for initial focus) + session kit + injected face. */
export interface EditModalProps {
  /** Message whose pencil opened the modal; its row starts expanded. */
  messageId: MessageId
  useSession: AssistantEditActionProps['useSession']
  sessionId: SessionId
  rpc: ClientConnectionRpc | undefined
  t: ModalT
  running: boolean
  onClose: (edited: boolean) => void
}

/** One editable assistant reply collected from the conversation snapshot. */
interface EditableItem {
  /** Stable React key (the message identity). */
  key: string
  /** Stable identity carried by the `assistant/message` event. */
  messageId: MessageId
  /** Owning turn (1-based). */
  turn: number
  /** Owning step within the turn. */
  step: number
  /** Whether this reply was frozen by an interruption. */
  interrupted: boolean
  /** Current surface reply text. */
  text: string
  /** Current surface reasoning chain. */
  reasoning: string
}

/** Narrowed view of one `assistant-step` chat node's payload. */
type AssistantStepNode = {
  kind: string
  anchorSeq?: number
  data?: {
    turn?: number
    step?: number
    finalNode?: {
      messageId?: MessageId
      turn?: number
      step?: number
      interrupted?: true
      blocks?: readonly { kind: string; text?: string }[]
    }
  }
}

/** Collect every finalized assistant reply visible in the window, in order. */
function collectEditable(snapshot: ConversationSnapshot | undefined): EditableItem[] {
  if (snapshot === undefined) return []
  const items: EditableItem[] = []
  for (const node of snapshot.chat.nodes.values() as readonly AssistantStepNode[]) {
    if (node.kind !== 'assistant-step') continue
    const final = node.data?.finalNode
    if (final?.messageId === undefined) continue
    const blocks = final.blocks ?? []
    items.push({
      key: String(final.messageId),
      messageId: final.messageId,
      turn: node.data?.turn ?? final.turn ?? 0,
      step: node.data?.step ?? final.step ?? 0,
      interrupted: final.interrupted === true,
      text: blocks.filter(b => b.kind === 'text').map(b => b.text ?? '').join(''),
      reasoning: blocks.filter(b => b.kind === 'reasoning').map(b => b.text ?? '').join(''),
    })
  }
  items.sort((a, b) => a.turn - b.turn || a.step - b.step)
  return items
}

/** One row's transient lifecycle state. */
type RowState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string }

/** A local draft for one row, keyed by message identity. */
interface Draft {
  text: string
  reasoning: string
}

/**
 * The modal dialog listing and editing every assistant message.
 * @param props - identity, read hooks, transport, and close callback.
 */
export function EditModal({
  messageId, useSession, sessionId, rpc, t, running, onClose,
}: EditModalProps) {
  // Re-collect on every snapshot flush: after a save the replacement event
  // lands and the collected values become the edited truth.
  const items = useSession(collectEditable)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const anySavedRef = useRef(false)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  // On open: expand (and scroll to) the row whose pencil was clicked.
  useEffect(() => {
    const initialKey = String(messageId)
    if (items.some(item => item.key === initialKey)) {
      setExpandedKey(initialKey)
      // Defer to the next paint so the row is mounted before scrolling.
      requestAnimationFrame(() => {
        rowRefs.current.get(initialKey)?.scrollIntoView({ block: 'center' })
      })
    } else if (items.length > 0) {
      setExpandedKey(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleRow = useCallback((key: string) => {
    setExpandedKey(current => (current === key ? null : key))
  }, [])

  const setDraft = useCallback((key: string, patch: Partial<Draft>) => {
    setDrafts(current => {
      const existing = current[key]
      const next: Draft = {
        text: patch.text ?? existing?.text ?? '',
        reasoning: patch.reasoning ?? existing?.reasoning ?? '',
      }
      return { ...current, [key]: next }
    })
    setRowStates(current => {
      const state = current[key]
      if (state === undefined || state.status === 'idle') return current
      return { ...current, [key]: { status: 'idle' } }
    })
  }, [])

  const saveRow = useCallback(async (item: EditableItem) => {
    const key = item.key
    if (rpc === undefined) {
      setRowStates(current => ({ ...current, [key]: { status: 'error', message: t('error.generic') } }))
      return
    }
    const draft = drafts[key] ?? { text: item.text, reasoning: item.reasoning }
    setRowStates(current => ({ ...current, [key]: { status: 'saving' } }))
    try {
      const result = await rpc.call('/api', 'assistantEdit/replace', {
        args: { request: { sessionId, messageId: item.messageId, text: draft.text, reasoning: draft.reasoning } },
      })
      const business = result.ok
        ? (result.value as { ok: boolean; error?: { code: string } } | null)
        : null
      if (business?.ok !== true) {
        const code = business?.error?.code
        const message = code === 'session-not-found' ? t('error.sessionNotFound')
          : code === 'message-not-found' ? t('error.messageNotFound')
            : code === 'message-not-editable' ? t('error.messageEol')
              : t('error.generic')
        setRowStates(current => ({ ...current, [key]: { status: 'error', message } }))
        return
      }
      // Success: the host event drives the surface; drop the local draft so
      // the row shows the collected (edited) truth from the next flush.
      anySavedRef.current = true
      setDrafts(current => {
        if (current[key] === undefined) return current
        const next = { ...current }
        delete next[key]
        return next
      })
      setRowStates(current => ({ ...current, [key]: { status: 'saved' } }))
    } catch {
      setRowStates(current => ({ ...current, [key]: { status: 'error', message: t('error.generic') } }))
    }
  }, [drafts, rpc, sessionId, t])

  const close = useCallback(() => {
    onClose(anySavedRef.current)
  }, [onClose])

  const countLabel = useMemo(
    () => `${String(items.length)} ${t('row.count')}`,
    [items.length, t],
  )

  return createPortal(
    <div className={css.overlay} role="presentation">
      {/* Pure visual mask: taps and swipes land here and are intentionally
          ignored — only the top-left close button dismisses the dialog. */}
      <div className={css.mask} aria-hidden="true" />
      <div
        className={css.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog.title')}
      >
        <div className={css.modalHeader}>
          <button type="button" className={css.close} aria-label={t('dialog.close')} onClick={close}>
            <IconCloseOutline16 size={14} />
          </button>
          <div className={css.titleWrap}>
            <h2 className={css.modalTitle}>{t('dialog.title')}</h2>
            <span className={css.count}>{countLabel}</span>
          </div>
        </div>
        {running && <p className={css.notice} role="status">{t('dialog.runningNotice')}</p>}
        <p className={css.hint}>{t('dialog.hint')}</p>
        {items.length === 0
          ? <p className={css.empty}>{t('dialog.empty')}</p>
          : (
            <div className={css.list} role="list">
              {items.map((item, index) => (
                <Row
                  key={item.key}
                  item={item}
                  index={index}
                  draft={drafts[item.key]}
                  state={rowStates[item.key] ?? { status: 'idle' }}
                  expanded={expandedKey === item.key}
                  running={running}
                  t={t}
                  onToggle={toggleRow}
                  onDraftChange={setDraft}
                  onSave={saveRow}
                  registerRef={element => {
                    if (element === null) rowRefs.current.delete(item.key)
                    else rowRefs.current.set(item.key, element)
                  }}
                />
              ))}
            </div>
          )}
      </div>
    </div>,
    document.body,
  )
}

/** One list row's props. */
interface RowProps {
  item: EditableItem
  index: number
  draft: Draft | undefined
  state: RowState
  expanded: boolean
  running: boolean
  t: ModalT
  onToggle: (key: string) => void
  onDraftChange: (key: string, patch: Partial<Draft>) => void
  onSave: (item: EditableItem) => void
  registerRef: (element: HTMLDivElement | null) => void
}

/** Keep Ctrl/Cmd+A scoped to the focused textarea so a "select all + delete"
 * in one editor never spills into (and erases) the sibling field too. */
function confineSelectAll(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
    event.preventDefault()
    event.currentTarget.select()
  }
}

/** One assistant message row: collapsed preview header + expandable editors. */
function Row({
  item, index, draft, state, expanded, running, t, onToggle, onDraftChange, onSave, registerRef,
}: RowProps) {
  const text = draft?.text ?? item.text
  const reasoning = draft?.reasoning ?? item.reasoning
  const previewSource = text.trim() !== '' ? text : reasoning
  const preview = previewSource.replace(/\s+/g, ' ').trim().slice(0, 80)
  const saving = state.status === 'saving'

  return (
    <div className={css.row} ref={registerRef} data-expanded={expanded || undefined} role="listitem">
      <button type="button" className={css.rowHead} onClick={() => { onToggle(item.key) }}>
        <span className={css.rowIndex}>{String(index + 1)}</span>
        <span className={css.rowMeta}>
          <span className={css.rowBadge}>T{String(item.turn)}·S{String(item.step)}</span>
          {item.interrupted && <span className={css.rowBadgeMuted}>{t('row.interrupted')}</span>}
          {state.status === 'saved' && <span className={css.savedBadge}>{t('row.saved')}</span>}
        </span>
        <span className={css.rowPreview}>{preview}</span>
        <span className={css.chevron} data-open={expanded || undefined} aria-hidden="true">▾</span>
      </button>
      {expanded && (
        <div className={css.rowBody}>
          <div className={css.field}>
            <label className={css.label} htmlFor={`assistant-edit-text-${item.key}`}>{t('dialog.replyLabel')}</label>
            <textarea
              id={`assistant-edit-text-${item.key}`}
              className={css.input}
              value={text}
              rows={6}
              disabled={running || saving}
              onKeyDown={confineSelectAll}
              onChange={event => { onDraftChange(item.key, { text: event.target.value }) }}
            />
          </div>
          <div className={css.field}>
            <label className={css.label} htmlFor={`assistant-edit-reasoning-${item.key}`}>{t('dialog.reasoningLabel')}</label>
            <textarea
              id={`assistant-edit-reasoning-${item.key}`}
              className={css.input}
              value={reasoning}
              rows={4}
              disabled={running || saving}
              onKeyDown={confineSelectAll}
              placeholder={item.reasoning === '' && reasoning === '' ? t('dialog.reasoningLabel') : undefined}
              onChange={event => { onDraftChange(item.key, { reasoning: event.target.value }) }}
            />
          </div>
          <div className={css.rowFooter}>
            {state.status === 'error' && <span className={css.failure} role="status">{state.message}</span>}
            <button
              type="button"
              className={css.save}
              disabled={running || saving}
              onClick={() => { void onSave(item) }}
            >
              {saving ? t('dialog.saving') : t('dialog.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
