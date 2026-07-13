import type { AgentEvent, AgentRunResult } from '../../shared/hive/agent'

export interface AgentRunInput {
  prompt: string
  worktreePath: string
  /** Awaited before the provider processes its next message, so writes stay in order. */
  onEvent: (event: AgentEvent) => void | Promise<void>
  signal?: AbortSignal
}

/**
 * A coding agent backend. Claude Code is the only implementation for v1 - this
 * interface exists so a second provider can be added later without reshaping
 * the orchestration code that calls it.
 */
export interface AgentProvider {
  readonly id: string
  run(input: AgentRunInput): Promise<AgentRunResult>
}
