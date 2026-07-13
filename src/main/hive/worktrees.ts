import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Ticket } from '../../shared/hive/types'
import { GitError, runGit } from './git'
import { slugify } from './slug'

export function branchNameForTicket(ticket: Pick<Ticket, 'id' | 'title'>): string {
  return `hive/${ticket.id}-${slugify(ticket.title)}`
}

/**
 * Worktrees live outside the repo tree entirely (never under `.hive/`, which is committed) -
 * as a sibling of the repo root, keyed by the repo's own directory name.
 */
export function worktreePathForTicket(repoRoot: string, ticketId: string): string {
  return join(dirname(repoRoot), '.hive-worktrees', basename(repoRoot), ticketId)
}

/** Creates a new branch off `baseBranch` and a worktree checked out onto it. */
export async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string,
  baseBranch: string
): Promise<void> {
  await mkdir(dirname(worktreePath), { recursive: true })
  await runGit(['worktree', 'add', '-b', branch, worktreePath, baseBranch], repoRoot)
}

/** Re-attaches a worktree to a branch that already exists (e.g. the worktree dir was lost). */
export async function reattachWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  await mkdir(dirname(worktreePath), { recursive: true })
  await runGit(['worktree', 'add', worktreePath, branch], repoRoot)
}

/** Removes a ticket's worktree and its branch. Fails loudly rather than discarding dirty work. */
export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  await runGit(['worktree', 'remove', worktreePath], repoRoot)
  await runGit(['branch', '-D', branch], repoRoot)
}

/** How many commits `baseBranch` has that `branch` doesn't - i.e. has the base moved on? */
export async function countCommitsBaseIsAhead(
  repoRoot: string,
  branch: string,
  baseBranch: string
): Promise<number> {
  const { stdout } = await runGit(['rev-list', '--count', `${branch}..${baseBranch}`], repoRoot)
  return Number(stdout.trim())
}

export class RebaseConflictError extends Error {
  constructor(public readonly baseBranch: string) {
    super(`Rebasing onto "${baseBranch}" hit conflicts that need resolving first`)
    this.name = 'RebaseConflictError'
  }
}

/** Replays a ticket's own branch onto the latest base, aborting cleanly on conflict. */
export async function rebaseBranchOntoBase(worktreePath: string, baseBranch: string): Promise<void> {
  try {
    await runGit(['rebase', baseBranch], worktreePath)
  } catch (err) {
    await runGit(['rebase', '--abort'], worktreePath).catch(() => {})
    if (err instanceof GitError) {
      throw new RebaseConflictError(baseBranch)
    }
    throw err
  }
}
