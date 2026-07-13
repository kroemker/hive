import { useCallback, useEffect, useState } from 'react'
import { parseUnifiedDiff, type ParsedDiffLine } from '../../../shared/hive/diff-parse'
import type { DiffFile, InlineCommentView, Ticket, TicketDiff } from '../../../shared/hive/types'

interface DiffReviewProps {
  ticket: Ticket
  onClose: () => void
  onChanged: () => void
}

function DiffReview({ ticket, onClose, onChanged }: DiffReviewProps) {
  const [diff, setDiff] = useState<TicketDiff | null>(null)
  const [comments, setComments] = useState<InlineCommentView[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [composerLine, setComposerLine] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [loadedDiff, loadedComments] = await Promise.all([
      window.hive.getTicketDiff(ticket.id),
      window.hive.listInlineComments(ticket.id)
    ])
    setDiff(loadedDiff)
    setComments(loadedComments)
    setSelectedPath((current) => current ?? loadedDiff?.files[0]?.path ?? null)
  }, [ticket.id])

  useEffect(() => {
    // Fetching this ticket's diff/comments on mount from the local .hive/ + git data via
    // IPC - there's no external store to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function handleAddComment(filePath: string, line: number): Promise<void> {
    if (!draft.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.hive.addInlineComment(ticket.id, { filePath, line, body: draft.trim() })
      setDraft('')
      setComposerLine(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleResolved(commentId: string, resolved: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.hive.setInlineCommentResolved(ticket.id, commentId, resolved)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReviewAction(action: 'approve' | 'request-changes' | 'pass' | 'fail'): Promise<void> {
    const to =
      action === 'approve'
        ? 'ready-for-test'
        : action === 'pass'
          ? 'resolved'
          : ('implementation' as const)
    setBusy(true)
    setError(null)
    try {
      await window.hive.transitionTicket(ticket.id, to)
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const selectedFile = diff?.files.find((f) => f.path === selectedPath) ?? null

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="panel diff-review">
        <header className="panel-header">
          <div className="panel-header-title">
            <span className="ticket-id">{ticket.id}</span>
            <span>{ticket.title}</span>
            {diff && (
              <span className="hint">
                {diff.baseBranch}...{diff.branch}
              </span>
            )}
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        {ticket.type === 'informational' ? (
          <section className="diff-body">
            <h3>Written result</h3>
            <pre className="informational-body">{ticket.body || '(nothing written yet)'}</pre>
          </section>
        ) : !diff ? (
          <p className="hint">No branch/diff yet - this ticket hasn't entered implementation.</p>
        ) : diff.files.length === 0 ? (
          <p className="hint">The branch has no changes against {diff.baseBranch} yet.</p>
        ) : (
          <div className="diff-layout">
            <nav className="diff-file-list">
              {diff.files.map((file) => {
                const fileCommentCount = comments.filter((c) => c.filePath === file.path).length
                return (
                  <button
                    key={file.path}
                    type="button"
                    className={`diff-file-entry${file.path === selectedPath ? ' active' : ''}`}
                    onClick={() => setSelectedPath(file.path)}
                  >
                    <span className={`file-status file-status-${file.status}`}>
                      {file.status[0].toUpperCase()}
                    </span>
                    <span className="file-path">{file.path}</span>
                    {fileCommentCount > 0 && (
                      <span className="file-comment-count">{fileCommentCount}</span>
                    )}
                  </button>
                )
              })}
            </nav>

            <div className="diff-content">
              {selectedFile && (
                <DiffFileLines
                  file={selectedFile}
                  comments={comments.filter((c) => c.filePath === selectedFile.path)}
                  composerLine={composerLine}
                  draft={draft}
                  busy={busy}
                  onOpenComposer={setComposerLine}
                  onDraftChange={setDraft}
                  onSubmitComment={(line) => handleAddComment(selectedFile.path, line)}
                  onToggleResolved={handleToggleResolved}
                />
              )}
            </div>
          </div>
        )}

        {ticket.status === 'code-review' && (
          <div className="panel-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => handleReviewAction('request-changes')}
            >
              Request changes
            </button>
            <button type="button" disabled={busy} onClick={() => handleReviewAction('approve')}>
              Approve
            </button>
          </div>
        )}

        {ticket.status === 'ready-for-test' && (
          <div className="panel-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => handleReviewAction('fail')}
            >
              Testing failed
            </button>
            <button type="button" disabled={busy} onClick={() => handleReviewAction('pass')}>
              Testing passed
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface DiffFileLinesProps {
  file: DiffFile
  comments: InlineCommentView[]
  composerLine: number | null
  draft: string
  busy: boolean
  onOpenComposer: (line: number | null) => void
  onDraftChange: (value: string) => void
  onSubmitComment: (line: number) => void
  onToggleResolved: (commentId: string, resolved: boolean) => void
}

function DiffFileLines({
  file,
  comments,
  composerLine,
  draft,
  busy,
  onOpenComposer,
  onDraftChange,
  onSubmitComment,
  onToggleResolved
}: DiffFileLinesProps) {
  const lines = parseUnifiedDiff(file.patch)
  const commentsByLine = new Map<number, InlineCommentView[]>()
  for (const comment of comments) {
    const bucket = commentsByLine.get(comment.line) ?? []
    bucket.push(comment)
    commentsByLine.set(comment.line, bucket)
  }

  return (
    <div className="diff-file-lines">
      {lines.map((line, index) => {
        const anchorLine = line.newLine ?? line.oldLine
        const lineComments = anchorLine !== undefined ? (commentsByLine.get(anchorLine) ?? []) : []
        return (
          <div key={index}>
            <DiffLineRow
              line={line}
              onOpenComposer={
                anchorLine !== undefined ? () => onOpenComposer(anchorLine) : undefined
              }
            />
            {lineComments.length > 0 && (
              <ul className="inline-comment-thread">
                {lineComments.map((comment) => (
                  <li key={comment.id} className={comment.resolved ? 'resolved' : ''}>
                    <div className="inline-comment-meta">
                      <span className="comment-author">{comment.author}</span>
                      {comment.stale && <span className="stale-badge">outdated</span>}
                      <button
                        type="button"
                        className="secondary small"
                        disabled={busy}
                        onClick={() => onToggleResolved(comment.id, !comment.resolved)}
                      >
                        {comment.resolved ? 'Unresolve' : 'Resolve'}
                      </button>
                    </div>
                    <p className="comment-body">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {anchorLine !== undefined && composerLine === anchorLine && (
              <div className="comment-form inline-comment-form">
                <textarea
                  rows={2}
                  autoFocus
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  placeholder="Leave a comment on this line…"
                />
                <button type="button" disabled={busy} onClick={() => onSubmitComment(anchorLine)}>
                  Comment
                </button>
                <button type="button" className="secondary" onClick={() => onOpenComposer(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiffLineRow({
  line,
  onOpenComposer
}: {
  line: ParsedDiffLine
  onOpenComposer?: () => void
}) {
  return (
    <div className={`diff-line diff-line-${line.type}`}>
      <span className="diff-line-num">{line.oldLine ?? ''}</span>
      <span className="diff-line-num">{line.newLine ?? ''}</span>
      <span className="diff-line-gutter">
        {onOpenComposer && (
          <button type="button" className="comment-gutter-btn" onClick={onOpenComposer}>
            +
          </button>
        )}
      </span>
      <span className="diff-line-content">{line.content || ' '}</span>
    </div>
  )
}

export default DiffReview
