import { describe, expect, it } from 'vitest'
import { nextTicketId } from './ids'

describe('nextTicketId', () => {
  it('starts at ticket-1 for an empty repo', () => {
    expect(nextTicketId([])).toBe('ticket-1')
  })

  it('continues from the highest existing number', () => {
    expect(nextTicketId(['ticket-1', 'ticket-2', 'ticket-5'])).toBe('ticket-6')
  })

  it('ignores unrelated directory names', () => {
    expect(nextTicketId(['ticket-3', '.DS_Store'])).toBe('ticket-4')
  })
})
