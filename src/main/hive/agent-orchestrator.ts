import type { AgentEvent } from '../../shared/hive/agent'
import type { Ticket } from '../../shared/hive/types'
import type { AgentProvider } from './agent-provider'
import { buildAgentPrompt } from './prompt'
import type { HiveRepo } from './repo'
import { applyTransition } from './workflow'
import { worktreePathForTicket } from './worktrees'

export interface RunAgentOptions {
  onEvent?: (event: AgentEvent) => void
  /** Fires once the run record is created, before the provider starts working. */
  onRunStarted?: (runId: string) => void
  signal?: AbortSignal
}

/**
 * Runs the agent for a ticket that's just entered `implementation` and
 * advances it to code-review / clarification / failed based on the outcome.
 * `applyTransition` itself only handles the git side of entering
 * implementation (worktree creation/reuse) - this is what actually invokes
 * the agent, wired in at the IPC boundary rather than inside applyTransition
 * so the transition itself stays fast and agent-agnostic.
 */
export async function runAgentAndAdvance(
  repo: HiveRepo,
  provider: AgentProvider,
  ticketId: string,
  opts: RunAgentOptions = {}
): Promise<Ticket> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket) {
    throw new Error(`Ticket "${ticketId}" was not found`)
  }
  if (!ticket.branch) {
    throw new Error(`Ticket "${ticketId}" has no worktree yet`)
  }

  const [comments, inlineComments] = await Promise.all([
    repo.listComments(ticketId),
    repo.listInlineComments(ticketId)
  ])
  const prompt = buildAgentPrompt(ticket, {
    comments,
    inlineComments: inlineComments.map((comment) => ({ ...comment, stale: false }))
  })

  const run = await repo.startRun(ticketId, { agent: provider.id, prompt })
  opts.onRunStarted?.(run.id)
  const worktreePath = worktreePathForTicket(repo.repoRoot, ticketId)

  const onEvent = async (event: AgentEvent): Promise<void> => {
    opts.onEvent?.(event)
    await repo.appendRunTranscript(ticketId, run.id, formatEventLine(event))
  }

  try {
    const result = await provider.run({ prompt, worktreePath, signal: opts.signal, onEvent })

    await repo.finishRun(ticketId, run.id, {
      endedAt: new Date().toISOString(),
      outcome: result.outcome,
      tokensInput: result.inputTokens,
      tokensOutput: result.outputTokens,
      costUsd: result.costUsd
    })
    await repo.addComment(ticketId, {
      author: 'agent',
      body: result.summary || describeOutcomeFallback(result.outcome)
    })

    const nextStatus =
      result.outcome === 'success'
        ? 'code-review'
        : result.outcome === 'needs_clarification'
          ? 'clarification'
          : 'failed'
    return applyTransition(repo, ticketId, nextStatus)
  } catch (err) {
    await repo.finishRun(ticketId, run.id, {
      endedAt: new Date().toISOString(),
      outcome: 'failed'
    })
    await repo.addComment(ticketId, {
      author: 'agent',
      body: `Run failed: ${err instanceof Error ? err.message : String(err)}`
    })
    return applyTransition(repo, ticketId, 'failed')
  }
}

function describeOutcomeFallback(outcome: string): string {
  if (outcome === 'success') return 'Work complete.'
  if (outcome === 'needs_clarification') return 'The agent needs clarification but gave no question.'
  return 'The run failed.'
}

function formatEventLine(event: AgentEvent): string {
  switch (event.type) {
    case 'assistant-text':
      return event.text
    case 'tool-use':
      return `[tool] ${event.name} ${JSON.stringify(event.input)}`
    case 'tool-result':
      return `[${event.isError ? 'tool error' : 'tool result'}] ${event.output}`
    case 'usage':
      return `[usage] ${event.inputTokens} in / ${event.outputTokens} out, $${event.costUsd.toFixed(4)}`
    default:
      return ''
  }
}
