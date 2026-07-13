import type { AgentOutcome } from '../../shared/hive/agent'

export const CLARIFICATION_MARKER = 'NEEDS_CLARIFICATION'

export interface ClassifiableResult {
  subtype: string
  is_error: boolean
  result?: string
}

/**
 * Turns a Claude Agent SDK result message into (outcome, summary). A run is
 * "needs_clarification" when the agent's own final message opts into that
 * contract (see CLARIFICATION_CONTRACT in prompt.ts) rather than via any
 * SDK-native signal - the SDK has no built-in "pause for human input" concept.
 */
export function classifyOutcome(result: ClassifiableResult): {
  outcome: AgentOutcome
  summary: string
} {
  if (result.subtype !== 'success' || result.is_error) {
    return {
      outcome: 'failed',
      summary: result.result?.trim() || `Agent run failed (${result.subtype})`
    }
  }

  const text = (result.result ?? '').trim()
  if (text.startsWith(CLARIFICATION_MARKER)) {
    const question = text.slice(CLARIFICATION_MARKER.length).replace(/^:?\s*/, '')
    return { outcome: 'needs_clarification', summary: question || text }
  }

  return { outcome: 'success', summary: text }
}
