import { describe, expect, it } from 'vitest'
import { classifyOutcome } from './agent-outcome'

describe('classifyOutcome', () => {
  it('is success for a clean result with no clarification marker', () => {
    expect(
      classifyOutcome({ subtype: 'success', is_error: false, result: 'Added dark mode toggle.' })
    ).toEqual({ outcome: 'success', summary: 'Added dark mode toggle.' })
  })

  it('is needs_clarification when the final message opts into the marker', () => {
    const result = classifyOutcome({
      subtype: 'success',
      is_error: false,
      result: 'NEEDS_CLARIFICATION: Should the toggle persist across restarts?'
    })
    expect(result).toEqual({
      outcome: 'needs_clarification',
      summary: 'Should the toggle persist across restarts?'
    })
  })

  it('is failed when the SDK reports a non-success subtype', () => {
    expect(
      classifyOutcome({ subtype: 'error_max_turns', is_error: true, result: '' })
    ).toEqual({ outcome: 'failed', summary: 'Agent run failed (error_max_turns)' })
  })

  it('is failed when is_error is true even with subtype success', () => {
    expect(
      classifyOutcome({ subtype: 'success', is_error: true, result: 'API error' })
    ).toEqual({ outcome: 'failed', summary: 'API error' })
  })

  it('tolerates a marker with no colon', () => {
    expect(
      classifyOutcome({ subtype: 'success', is_error: false, result: 'NEEDS_CLARIFICATION what next?' })
    ).toEqual({ outcome: 'needs_clarification', summary: 'what next?' })
  })
})
