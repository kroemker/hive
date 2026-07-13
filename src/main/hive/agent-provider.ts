import type { AgentEvent, AgentRunResult } from '../../shared/hive/agent'
import type { PermissionMode } from '../../shared/hive/types'

export interface AgentRunInput {
  prompt: string
  worktreePath: string
  /** Defaults to the most restrictive mode if omitted. */
  permissionMode?: PermissionMode
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
