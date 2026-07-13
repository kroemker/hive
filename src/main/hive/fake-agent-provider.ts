import type { AgentEvent, AgentOutcome, AgentRunResult } from '../../shared/hive/agent'
import type { AgentProvider, AgentRunInput } from './agent-provider'

/**
 * A scripted AgentProvider for tests. Real model calls are slow/costly and
 * non-deterministic, so orchestration logic (prompt building, run
 * persistence, auto-transition) is exercised against this fake instead -
 * see PLAN.md's testing-strategy note on agent-provider tests.
 */
export class FakeAgentProvider implements AgentProvider {
  readonly id = 'fake-agent'
  public lastInput: AgentRunInput | undefined

  constructor(
    private readonly script: {
      events?: AgentEvent[]
      outcome: AgentOutcome
      summary: string
      costUsd?: number
      inputTokens?: number
      outputTokens?: number
      /** If set, `run()` throws this instead of returning. */
      throws?: Error
    }
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    this.lastInput = input
    if (this.script.throws) {
      throw this.script.throws
    }
    for (const event of this.script.events ?? []) {
      await input.onEvent(event)
    }
    return {
      outcome: this.script.outcome,
      summary: this.script.summary,
      costUsd: this.script.costUsd ?? 0,
      inputTokens: this.script.inputTokens ?? 0,
      outputTokens: this.script.outputTokens ?? 0
    }
  }
}
