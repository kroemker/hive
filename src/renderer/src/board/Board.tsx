import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TicketStatus } from '../../../shared/hive/state-machine'
import type { Priority, Ticket } from '../../../shared/hive/types'
import Column from './Column'
import NewTicketForm from './NewTicketForm'
import SettingsPanel from './SettingsPanel'
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
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')

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

  const allLabels = useMemo(
    () => Array.from(new Set(tickets.flatMap((ticket) => ticket.labels))).sort(),
    [tickets]
  )

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (query && !ticket.title.toLowerCase().includes(query) && !ticket.id.includes(query)) {
        return false
      }
      if (labelFilter && !ticket.labels.includes(labelFilter)) {
        return false
      }
      if (priorityFilter && ticket.priority !== priorityFilter) {
        return false
      }
      return true
    })
  }, [tickets, search, labelFilter, priorityFilter])

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
          <button type="button" className="secondary" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          <button type="button" className="secondary" onClick={onCloseRepo}>
            Switch repo
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="board-filters">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or id…"
        />
        <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
          <option value="">All labels</option>
          {allLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
        >
          <option value="">All priorities</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </div>

      <div className="columns">
        {COLUMNS.map(({ status, label }) => (
          <Column
            key={status}
            label={label}
            tickets={filteredTickets.filter((ticket) => ticket.status === status)}
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

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default Board
