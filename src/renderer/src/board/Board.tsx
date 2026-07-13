import { useCallback, useEffect, useState } from 'react'
import type { TicketStatus } from '../../../shared/hive/state-machine'
import type { Ticket } from '../../../shared/hive/types'
import Column from './Column'
import NewTicketForm from './NewTicketForm'
import TicketDetail from './TicketDetail'

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: 'conception', label: 'Conception' },
  { status: 'ready-for-implementation', label: 'Ready for Implementation' },
  { status: 'implementation', label: 'Implementation' },
  { status: 'clarification', label: 'Clarification' },
  { status: 'failed', label: 'Failed' },
  { status: 'code-review', label: 'Code Review' },
  { status: 'ready-for-test', label: 'Ready for Test' },
  { status: 'resolved', label: 'Resolved' }
]

interface BoardProps {
  repoRoot: string
  onCloseRepo: () => void
}

function Board({ repoRoot, onCloseRepo }: BoardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [showNewTicketForm, setShowNewTicketForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setTickets(await window.hive.listTickets())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    // Fetching the board's tickets on mount from the local .hive/ data layer via IPC -
    // there's no external store to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  useEffect(() => {
    return window.hive.onTicketChanged(() => {
      refresh()
    })
  }, [refresh])

  return (
    <div className="board">
      <header className="board-header">
        <div>
          <h1>Hive</h1>
          <p className="repo-root">{repoRoot}</p>
        </div>
        <div className="board-actions">
          <button type="button" onClick={() => setShowNewTicketForm(true)}>
            + New ticket
          </button>
          <button type="button" className="secondary" onClick={onCloseRepo}>
            Switch repo
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="columns">
        {COLUMNS.map(({ status, label }) => (
          <Column
            key={status}
            label={label}
            tickets={tickets.filter((ticket) => ticket.status === status)}
            onSelect={setSelectedTicketId}
          />
        ))}
      </div>

      {showNewTicketForm && (
        <NewTicketForm
          onCancel={() => setShowNewTicketForm(false)}
          onCreated={async () => {
            setShowNewTicketForm(false)
            await refresh()
          }}
        />
      )}

      {selectedTicketId && (
        <TicketDetail
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

export default Board
