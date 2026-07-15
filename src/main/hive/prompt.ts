import type { Comment, InlineCommentView, Ticket } from '../../shared/hive/types'

export const CLARIFICATION_CONTRACT =
  'If you need information only a human can provide before you can proceed ' +
  '(an ambiguous requirement, a missing credential, a design decision that ' +
  "isn't yours to make), do not guess. Commit whatever partial progress is " +
  'safe first, then end your final response with a single line starting ' +
  'with exactly "NEEDS_CLARIFICATION:" followed by your question, and make ' +
  'no further tool calls after that line.'

export interface PromptContext {
  comments: Comment[]
  inlineComments: InlineCommentView[]
}

/**
 * Builds the prompt for one agent run: the ticket spec, plus everything from
 * SPEC.md §6.3 that should be "read like a human contributor reading a PR
 * review" - unresolved inline comments and general ticket comments. Reused
 * for every re-entry into `implementation` (request-changes, testing-failed,
 * answered clarification, retry) rather than tracking deltas since the last
 * run.
 */
export function buildAgentPrompt(
  ticket: Pick<Ticket, 'id' | 'title' | 'body' | 'type'>,
  context: PromptContext
): string {
  const sections: string[] = [`# ${ticket.id}: ${ticket.title}`, ticket.body.trim() || '(no description provided)']

  const unresolved = context.inlineComments.filter((comment) => !comment.resolved)
  if (unresolved.length > 0) {
    const byFile = new Map<string, InlineCommentView[]>()
    for (const comment of unresolved) {
      const bucket = byFile.get(comment.filePath) ?? []
      bucket.push(comment)
      byFile.set(comment.filePath, bucket)
    }

    const lines = ['## Requested changes from code review']
    for (const [filePath, comments] of byFile) {
      lines.push(`\n### ${filePath}`)
      for (const comment of [...comments].sort((a, b) => a.line - b.line)) {
        lines.push(`- line ${comment.line}: ${comment.body}`)
      }
    }
    sections.push(lines.join('\n'))
  }

  if (context.comments.length > 0) {
    const lines = [
      '## Ticket comments',
      ...context.comments.map((comment) => `- [${comment.author}] ${comment.body}`)
    ]
    sections.push(lines.join('\n'))
  }

  sections.push(`## Working agreement\n\n${CLARIFICATION_CONTRACT}`)

  return sections.join('\n\n')
}
