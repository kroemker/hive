import type { Ticket } from '../../../shared/hive/types'
import TicketCard from './TicketCard'

interface ColumnProps {
  label: string
  tickets: Ticket[]
  onSelect: (id: string) => void
}

function Column({ label, tickets, onSelect }: ColumnProps) {
  return (
    <section className="column">
      <header className="column-header">
        <h2>{label}</h2>
        <span className="column-count">{tickets.length}</span>
      </header>
      <div className="column-cards">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

export default Column
