import type { InlineComment, InlineCommentView, TicketDiff } from '../../shared/hive/types'
import { computeTicketDiff, hasFileChangedSince } from './diff'
import { runGit } from './git'
import type { HiveRepo } from './repo'

/** The ticket's diff against base, or null for tickets with no branch yet (or informational ones). */
export async function getTicketDiffOrNull(
  repo: HiveRepo,
  ticketId: string
): Promise<TicketDiff | null> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket?.branch) {
    return null
  }
  const config = await repo.getConfig()
  return computeTicketDiff(repo.repoRoot, ticket.branch, config.baseBranch)
}

export async function listInlineCommentsWithStaleness(
  repo: HiveRepo,
  ticketId: string
): Promise<InlineCommentView[]> {
  const comments = await repo.listInlineComments(ticketId)
  const ticket = await repo.getTicket(ticketId)
  if (!ticket?.branch || comments.length === 0) {
    return comments.map((comment) => ({ ...comment, stale: false }))
  }

  const currentSha = (await runGit(['rev-parse', ticket.branch], repo.repoRoot)).stdout.trim()
  return Promise.all(
    comments.map(async (comment) => ({
      ...comment,
      stale:
        comment.anchorSha !== currentSha &&
        (await hasFileChangedSince(
          repo.repoRoot,
          comment.filePath,
          comment.anchorSha,
          currentSha
        ))
    }))
  )
}

/** Adds an inline comment anchored to the ticket branch's current tip. */
export async function addInlineCommentAtCurrentTip(
  repo: HiveRepo,
  ticketId: string,
  input: { filePath: string; line: number; body: string }
): Promise<InlineComment> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket?.branch) {
    throw new Error(`Ticket "${ticketId}" has no branch/worktree to comment against yet`)
  }
  const anchorSha = (await runGit(['rev-parse', ticket.branch], repo.repoRoot)).stdout.trim()
  return repo.addInlineComment(ticketId, {
    filePath: input.filePath,
    line: input.line,
    anchorSha,
    author: 'human',
    body: input.body
  })
}
