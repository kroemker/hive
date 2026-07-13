export const TICKET_STATUSES = [
  'conception',
  'ready-for-implementation',
  'implementation',
  'clarification',
  'code-review',
  'ready-for-test',
  'resolved',
  'failed'
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

/**
 * Valid destination statuses for each status, per SPEC.md §3. `clarification`
 * and `failed` are agent-initiated exceptions off `implementation` rather
 * than steps in the main path, but they're just ordinary edges here.
 */
export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  conception: ['ready-for-implementation'],
  'ready-for-implementation': ['implementation'],
  implementation: ['clarification', 'code-review', 'failed'],
  clarification: ['implementation'],
  'code-review': ['implementation', 'ready-for-test'],
  'ready-for-test': ['implementation', 'resolved'],
  resolved: [],
  failed: ['implementation']
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value)
}
