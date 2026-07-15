import type { Ticket } from '../../../shared/hive/types'

interface TicketCardProps {
  ticket: Ticket
  onSelect: (id: string) => void
}

function TicketCard({ ticket, onSelect }: TicketCardProps) {
  return (
    <button type="button" className="ticket-card" onClick={() => onSelect(ticket.id)}>
      <div className="ticket-card-top">
        <span className="ticket-id">{ticket.id}</span>
        <span className={`priority priority-${ticket.priority}`}>{ticket.priority}</span>
      </div>
      <span className="ticket-title">{ticket.title}</span>
      {ticket.labels.length > 0 && (
        <div className="ticket-labels">
          {ticket.labels.map((label) => (
            <span key={label} className="label-chip">
              {label}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

export default TicketCard
