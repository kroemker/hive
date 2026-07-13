import { useCallback, useEffect, useState } from 'react'
import {
  TICKET_STATUSES,
  canTransition,
  type TicketStatus
} from '../../../shared/hive/state-machine'
import type { Comment, HistoryEntry, Priority, Ticket } from '../../../shared/hive/types'
import AgentRunsPanel from './AgentRunsPanel'
import DiffReview from './DiffReview'

interface TicketDetailProps {
  ticketId: string
  onClose: () => void
  onChanged: () => void
}

function TicketDetail({ ticketId, onClose, onChanged }: TicketDetailProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [newComment, setNewComment] = useState('')
  const [baseDrift, setBaseDrift] = useState(0)
  const [showDiffReview, setShowDiffReview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [loadedTicket, loadedComments, loadedHistory] = await Promise.all([
      window.hive.getTicket(ticketId),
      window.hive.listComments(ticketId),
      window.hive.listHistory(ticketId)
    ])
    setTicket(loadedTicket)
    setComments(loadedComments)
    setHistory(loadedHistory)
    if (loadedTicket) {
      setTitle(loadedTicket.title)
      setBody(loadedTicket.body)
      setLabels(loadedTicket.labels.join(', '))
      setPriority(loadedTicket.priority)
      setBaseDrift(
        loadedTicket.branch && loadedTicket.status !== 'resolved'
          ? await window.hive.checkBaseDrift(ticketId)
          : 0
      )
    }
  }, [ticketId])

  useEffect(() => {
    // Fetching this ticket's data on mount/id-change from the local .hive/ data layer via
    // IPC - there's no external store to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    return window.hive.onTicketChanged((message) => {
      if (message.ticketId === ticketId) {
        load()
      }
    })
  }, [ticketId, load])

  async function handleSave(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.hive.updateTicket(ticketId, {
        title: title.trim(),
        body,
        labels: labels
          .split(',')
          .map((label) => label.trim())
          .filter((label) => label.length > 0),
        priority
      })
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleTransition(to: TicketStatus): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.hive.transitionTicket(ticketId, to)
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRebase(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.hive.rebaseTicketOntoBase(ticketId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddComment(): Promise<void> {
    if (!newComment.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.hive.addComment(ticketId, newComment.trim())
      setNewComment('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!ticket) {
    return (
      <div className="overlay" role="dialog" aria-modal="true">
        <div className="panel">
          <p>Loading…</p>
          <div className="panel-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  const nextStatuses = TICKET_STATUSES.filter((status) => canTransition(ticket.status, status))

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="panel ticket-detail">
        <header className="panel-header">
          <div className="panel-header-title">
            <span className="ticket-id">{ticket.id}</span>
            <span className={`status-badge status-${ticket.status}`}>{ticket.status}</span>
          </div>
          <div className="board-actions">
            {(ticket.branch || ticket.type === 'informational') && (
              <button type="button" className="secondary" onClick={() => setShowDiffReview(true)}>
                Review {ticket.type === 'informational' ? 'result' : 'diff'}
              </button>
            )}
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {baseDrift > 0 && (
          <div className="drift-warning">
            <p>
              Base has moved {baseDrift} commit{baseDrift === 1 ? '' : 's'} ahead since this
              branch was created.
            </p>
            <button type="button" className="secondary" onClick={handleRebase} disabled={busy}>
              Rebase onto base
            </button>
          </div>
        )}

        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <div className="field-row">
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>

          <label>
            Labels (comma-separated)
            <input value={labels} onChange={(e) => setLabels(e.target.value)} />
          </label>
        </div>

        <label>
          Description / acceptance criteria
          <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <div className="panel-actions">
          <button type="button" onClick={handleSave} disabled={busy}>
            Save
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <section>
          <h3>Move to</h3>
          <div className="transition-actions">
            {nextStatuses.length === 0 && <p className="hint">No transitions available.</p>}
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => handleTransition(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        <AgentRunsPanel ticketId={ticket.id} />

        <section>
          <h3>Comments</h3>
          <ul className="comment-list">
            {comments.length === 0 && <li className="hint">No comments yet.</li>}
            {comments.map((comment) => (
              <li key={comment.id}>
                <span className="comment-author">{comment.author}</span>
                <span className="comment-body">{comment.body}</span>
              </li>
            ))}
          </ul>
          <div className="comment-form">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
            />
            <button type="button" onClick={handleAddComment} disabled={busy}>
              Comment
            </button>
          </div>
        </section>

        <section>
          <h3>History</h3>
          <ul className="history-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="history-time">{new Date(entry.at).toLocaleString()}</span>
                <span className="history-transition">
                  {entry.from ?? '(created)'} → {entry.to}
                </span>
                <span className="history-actor">{entry.actor}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {showDiffReview && (
        <DiffReview
          ticket={ticket}
          onClose={() => setShowDiffReview(false)}
          onChanged={async () => {
            await load()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export default TicketDetail
