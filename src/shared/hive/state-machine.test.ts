import { describe, expect, it } from 'vitest'
import { TICKET_STATUSES, canTransition, isTicketStatus } from './state-machine'

describe('canTransition', () => {
  it('allows the main happy path', () => {
    expect(canTransition('conception', 'ready-for-implementation')).toBe(true)
    expect(canTransition('ready-for-implementation', 'implementation')).toBe(true)
    expect(canTransition('implementation', 'code-review')).toBe(true)
    expect(canTransition('code-review', 'ready-for-test')).toBe(true)
    expect(canTransition('ready-for-test', 'resolved')).toBe(true)
  })

  it('allows request-changes and testing-fails loops back to implementation', () => {
    expect(canTransition('code-review', 'implementation')).toBe(true)
    expect(canTransition('ready-for-test', 'implementation')).toBe(true)
  })

  it('allows the clarification and failed exception branches off implementation', () => {
    expect(canTransition('implementation', 'clarification')).toBe(true)
    expect(canTransition('clarification', 'implementation')).toBe(true)
    expect(canTransition('implementation', 'failed')).toBe(true)
    expect(canTransition('failed', 'implementation')).toBe(true)
  })

  it('rejects skipping states', () => {
    expect(canTransition('conception', 'implementation')).toBe(false)
    expect(canTransition('conception', 'resolved')).toBe(false)
    expect(canTransition('code-review', 'resolved')).toBe(false)
  })

  it('treats resolved as terminal', () => {
    expect(canTransition('resolved', 'implementation')).toBe(false)
    expect(canTransition('resolved', 'conception')).toBe(false)
  })

  it('rejects clarification/failed jumping straight to review or test', () => {
    expect(canTransition('clarification', 'code-review')).toBe(false)
    expect(canTransition('failed', 'ready-for-test')).toBe(false)
  })
})

describe('isTicketStatus', () => {
  it('accepts every known status', () => {
    for (const status of TICKET_STATUSES) {
      expect(isTicketStatus(status)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isTicketStatus('qa')).toBe(false)
    expect(isTicketStatus('')).toBe(false)
  })
})
