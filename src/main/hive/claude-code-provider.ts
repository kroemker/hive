import { query, type CanUseTool, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentRunResult } from '../../shared/hive/agent'
import type { PermissionMode } from '../../shared/hive/types'
import type { AgentProvider, AgentRunInput } from './agent-provider'
import { classifyOutcome } from './agent-outcome'
import { getAnthropicApiKey } from './secrets'

/**
 * Tools an automated run may use without a human present to approve them.
 * Everything else (WebFetch, WebSearch, MCP tools, etc.) is denied - v1 has
 * no live approval channel to route an "ask" through, so ungated capabilities
 * are simply not granted rather than left to hang waiting for an answer.
 *
 * `safe` never runs a shell; `trusted` adds Bash, for repos/agents the user trusts to run
 * arbitrary commands (test suites, package installs, etc.) unattended.
 */
const AUTO_ALLOWED_TOOLS: Record<PermissionMode, ReadonlySet<string>> = {
  safe: new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'TodoWrite']),
  trusted: new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Task', 'TodoWrite'])
}

const MAX_TURNS = 60

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude-code'

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const allowedTools = AUTO_ALLOWED_TOOLS[input.permissionMode ?? 'safe']
    const canUseTool: CanUseTool = async (toolName) => {
      if (allowedTools.has(toolName)) {
        return { behavior: 'allow' }
      }
      return {
        behavior: 'deny',
        message: `${toolName} isn't available to automated Hive agent runs yet.`
      }
    }

    const apiKey = await getAnthropicApiKey()

    const stream = query({
      prompt: input.prompt,
      options: {
        cwd: input.worktreePath,
        abortController: input.signal ? abortControllerFor(input.signal) : undefined,
        permissionMode: 'default',
        canUseTool,
        maxTurns: MAX_TURNS,
        settingSources: ['project'],
        // Omitted entirely when no key is configured, so the subprocess inherits process.env
        // as-is (letting a `claude login` subscription session authenticate normally).
        env: apiKey ? { ...process.env, ANTHROPIC_API_KEY: apiKey } : undefined
      }
    })

    let finalResult: SDKResultMessage | undefined

    for await (const message of stream) {
      switch (message.type) {
        case 'assistant': {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              await input.onEvent({ type: 'assistant-text', text: block.text })
            } else if (block.type === 'tool_use') {
              await input.onEvent({ type: 'tool-use', name: block.name, input: block.input })
            }
          }
          break
        }
        case 'user': {
          const content = message.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                await input.onEvent({
                  type: 'tool-result',
                  output: stringifyToolResult(block.content),
                  isError: block.is_error ?? false
                })
              }
            }
          }
          break
        }
        case 'result':
          finalResult = message
          break
        default:
          break
      }
    }

    if (!finalResult) {
      throw new Error('Claude Code ended without producing a result message')
    }

    await input.onEvent({
      type: 'usage',
      inputTokens: finalResult.usage.input_tokens,
      outputTokens: finalResult.usage.output_tokens,
      costUsd: finalResult.total_cost_usd
    })

    const { outcome, summary } = classifyOutcome(finalResult)
    return {
      outcome,
      summary,
      costUsd: finalResult.total_cost_usd,
      inputTokens: finalResult.usage.input_tokens,
      outputTokens: finalResult.usage.output_tokens
    }
  }
}

function abortControllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) {
    controller.abort()
  } else {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === 'object' && block && 'text' in block ? String(block.text) : ''))
      .join('')
  }
  return JSON.stringify(content)
}
