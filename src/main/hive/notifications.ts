import { Notification } from 'electron'
import type { Ticket } from '../../shared/hive/types'

/** Notifies the user that a background agent run has finished, based on where the ticket landed. */
export function notifyRunFinished(ticket: Ticket): void {
  if (!Notification.isSupported()) {
    return
  }
  const body = messageFor(ticket)
  if (!body) {
    return
  }
  new Notification({ title: `${ticket.id}: ${ticket.title}`, body }).show()
}

function messageFor(ticket: Ticket): string | null {
  switch (ticket.status) {
    case 'code-review':
      return 'Run finished - ready for review.'
    case 'clarification':
      return 'The agent needs clarification to continue.'
    case 'failed':
      return 'The run failed.'
    default:
      return null
  }
}
