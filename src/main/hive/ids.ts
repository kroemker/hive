import { randomUUID } from 'node:crypto'

const TICKET_ID_PATTERN = /^ticket-(\d+)$/

/** Picks the next `ticket-<n>` id given the tickets that already exist. */
export function nextTicketId(existingIds: readonly string[]): string {
  let max = 0
  for (const id of existingIds) {
    const match = TICKET_ID_PATTERN.exec(id)
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `ticket-${max + 1}`
}

export function randomId(): string {
  return randomUUID()
}
