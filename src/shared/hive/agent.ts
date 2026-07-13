export type AgentEvent =
  | { type: 'assistant-text'; text: string }
  | { type: 'tool-use'; name: string; input: unknown }
  | { type: 'tool-result'; output: string; isError: boolean }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd: number }

export type AgentOutcome = 'success' | 'failed' | 'needs_clarification'

export interface AgentRunResult {
  outcome: AgentOutcome
  /** The agent's final message: a summary on success, the question on needs_clarification, the error on failed. */
  summary: string
  costUsd: number
  inputTokens: number
  outputTokens: number
}
