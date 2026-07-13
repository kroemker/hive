import type { TicketStatus } from '../../shared/hive/state-machine'
import type { Ticket } from '../../shared/hive/types'
import { mergeTicketBranch } from './merge'
import { pathExists } from './paths'
import { HiveRepo, TicketNotFoundError } from './repo'
import {
  branchNameForTicket,
  countCommitsBaseIsAhead,
  createWorktree,
  reattachWorktree,
  rebaseBranchOntoBase,
  removeWorktree,
  worktreePathForTicket
} from './worktrees'

/**
 * Applies a ticket transition, performing whatever git side effect that transition implies
 * (creating/reattaching a worktree on entering `implementation`, merging and tearing down the
 * worktree on entering `resolved`) before recording the transition itself. If the git side
 * effect fails, nothing is persisted - the ticket stays exactly where it was.
 */
export async function applyTransition(
  repo: HiveRepo,
  ticketId: string,
  to: TicketStatus,
  opts: { note?: string } = {}
): Promise<Ticket> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket) {
    throw new TicketNotFoundError(ticketId)
  }

  if (to === 'implementation') {
    await ensureWorktree(repo, ticket)
  }

  if (to === 'resolved' && ticket.branch) {
    await resolveTicket(repo, ticket)
  }

  return repo.transitionTicket(ticketId, to, opts)
}

async function ensureWorktree(repo: HiveRepo, ticket: Ticket): Promise<void> {
  const worktreePath = worktreePathForTicket(repo.repoRoot, ticket.id)

  if (ticket.branch) {
    if (!(await pathExists(worktreePath))) {
      // The worktree directory was lost (e.g. deleted by hand) - reattach it to the
      // branch that's already recorded on the ticket, rather than starting over.
      await reattachWorktree(repo.repoRoot, worktreePath, ticket.branch)
    }
    return
  }

  const config = await repo.getConfig()
  const branch = branchNameForTicket(ticket)
  await createWorktree(repo.repoRoot, worktreePath, branch, config.baseBranch)
  await repo.updateTicket(ticket.id, { branch })
}

/** How many commits the base branch has gained since this ticket's branch forked. */
export async function checkBaseDrift(repo: HiveRepo, ticketId: string): Promise<number> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket?.branch) {
    return 0
  }
  const config = await repo.getConfig()
  return countCommitsBaseIsAhead(repo.repoRoot, ticket.branch, config.baseBranch)
}

/** Replays a ticket's branch onto the latest base, without touching its status. */
export async function rebaseTicketOntoBase(repo: HiveRepo, ticketId: string): Promise<void> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket) {
    throw new TicketNotFoundError(ticketId)
  }
  if (!ticket.branch) {
    throw new Error(`Ticket "${ticketId}" has no branch/worktree yet`)
  }
  const config = await repo.getConfig()
  const worktreePath = worktreePathForTicket(repo.repoRoot, ticket.id)
  await rebaseBranchOntoBase(worktreePath, config.baseBranch)
}

async function resolveTicket(repo: HiveRepo, ticket: Ticket): Promise<void> {
  if (!ticket.branch) {
    return
  }
  const config = await repo.getConfig()
  const worktreePath = worktreePathForTicket(repo.repoRoot, ticket.id)

  await mergeTicketBranch(repo.repoRoot, {
    branch: ticket.branch,
    baseBranch: config.baseBranch,
    strategy: config.mergeStrategy,
    worktreePath,
    message: `${ticket.title} (${ticket.id})`
  })

  await removeWorktree(repo.repoRoot, worktreePath, ticket.branch)
}
