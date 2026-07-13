import { describe, expect, it } from 'vitest'
import type { Ticket } from '../../shared/hive/types'
import { parseTicketFile, serializeTicketFile } from './ticket-file'

const ticket: Ticket = {
  id: 'ticket-1',
  title: 'Add dark mode',
  type: 'code',
  status: 'conception',
  labels: ['ui'],
  priority: 'medium',
  branch: null,
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  runCount: 0,
  body: '## Description\n\nSupport a dark theme.\n\n## Acceptance criteria\n\n- [ ] Toggle in settings'
}

describe('ticket file round-trip', () => {
  it('serializes to YAML front matter followed by the Markdown body', () => {
    const raw = serializeTicketFile(ticket)
    expect(raw.startsWith('---\n')).toBe(true)
    expect(raw).toContain('id: ticket-1')
    expect(raw).toContain('## Acceptance criteria')
  })

  it('parses back to an equivalent ticket', () => {
    const raw = serializeTicketFile(ticket)
    expect(parseTicketFile(raw)).toEqual(ticket)
  })

  it('throws on a file with no front matter', () => {
    expect(() => parseTicketFile('just a body, no front matter')).toThrow(/front matter/)
  })

  it('preserves an empty body', () => {
    const empty: Ticket = { ...ticket, body: '' }
    expect(parseTicketFile(serializeTicketFile(empty)).body).toBe('')
  })
})
