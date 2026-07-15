import { execFile } from 'node:child_process'
import { shell } from 'electron'
import type { HiveRepo } from './repo'
import { TicketNotFoundError } from './repo'
import { worktreePathForTicket } from './worktrees'

/**
 * Opens a ticket's worktree in the user's configured editor (e.g. `code`, `subl`), or
 * in the OS file manager if no editor command is configured.
 */
export async function openTicketWorktree(repo: HiveRepo, ticketId: string): Promise<void> {
  const ticket = await repo.getTicket(ticketId)
  if (!ticket) {
    throw new TicketNotFoundError(ticketId)
  }
  if (!ticket.branch) {
    throw new Error(`Ticket "${ticketId}" has no worktree yet`)
  }

  const config = await repo.getConfig()
  const worktreePath = worktreePathForTicket(repo.repoRoot, ticketId, config.worktreeRoot)

  if (!config.editorCommand) {
    await shell.openPath(worktreePath)
    return
  }

  const [command, ...args] = config.editorCommand.trim().split(/\s+/)
  await new Promise<void>((resolve, reject) => {
    execFile(command, [...args, worktreePath], (err) => (err ? reject(err) : resolve()))
  })
}
