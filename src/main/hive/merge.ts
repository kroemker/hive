import type { MergeStrategy } from '../../shared/hive/types'
import { GitError, runGit } from './git'

export class MergeConflictError extends Error {
  constructor(
    public readonly branch: string,
    public readonly baseBranch: string
  ) {
    super(`Merging "${branch}" into "${baseBranch}" has conflicts that need resolving first`)
    this.name = 'MergeConflictError'
  }
}

export interface MergeOptions {
  branch: string
  baseBranch: string
  strategy: MergeStrategy
  /** The ticket's own worktree - only used by the rebase strategy. */
  worktreePath: string
  message: string
}

/**
 * Merges a ticket branch into its base branch entirely via plumbing (merge-tree,
 * commit-tree, update-ref) so the repo's actual checkout is never touched - the human
 * may have this repo open in their own editor with a completely different branch checked
 * out, and Hive must never disturb that.
 *
 * Trade-off: if the base branch happens to be checked out in repoRoot, its ref moves out
 * from under that working directory/index. Nothing is lost or overwritten, but `git status`
 * there will look like the merged files were "deleted" until the human runs `git status`/
 * `git reset --hard` themselves - the same experience as a teammate advancing a shared
 * branch upstream. That's preferable to the alternative of Hive checking out over
 * possibly-uncommitted work in the user's own working directory.
 */
export async function mergeTicketBranch(repoRoot: string, opts: MergeOptions): Promise<void> {
  if (opts.strategy === 'rebase') {
    await rebaseAndFastForward(repoRoot, opts)
    return
  }

  const baseTip = await revParse(repoRoot, opts.baseBranch)
  const branchTip = await revParse(repoRoot, opts.branch)
  const treeOid = await writeMergeTree(repoRoot, opts)

  const parents = opts.strategy === 'squash' ? [baseTip] : [baseTip, branchTip]
  const commitArgs = ['commit-tree', treeOid, ...parents.flatMap((p) => ['-p', p]), '-m', opts.message]
  const { stdout: newCommit } = await runGit(commitArgs, repoRoot)

  await runGit(
    ['update-ref', `refs/heads/${opts.baseBranch}`, newCommit.trim(), baseTip],
    repoRoot
  )
}

async function writeMergeTree(repoRoot: string, opts: MergeOptions): Promise<string> {
  try {
    const { stdout } = await runGit(
      ['merge-tree', '--write-tree', opts.baseBranch, opts.branch],
      repoRoot
    )
    return stdout.split('\n')[0].trim()
  } catch (err) {
    if (err instanceof GitError && err.exitCode === 1) {
      throw new MergeConflictError(opts.branch, opts.baseBranch)
    }
    throw err
  }
}

async function rebaseAndFastForward(repoRoot: string, opts: MergeOptions): Promise<void> {
  const baseTip = await revParse(repoRoot, opts.baseBranch)

  try {
    await runGit(['rebase', opts.baseBranch], opts.worktreePath)
  } catch {
    await runGit(['rebase', '--abort'], opts.worktreePath).catch(() => {})
    throw new MergeConflictError(opts.branch, opts.baseBranch)
  }

  const newTip = await revParse(repoRoot, opts.branch)
  await runGit(['update-ref', `refs/heads/${opts.baseBranch}`, newTip, baseTip], repoRoot)
}

async function revParse(repoRoot: string, ref: string): Promise<string> {
  const { stdout } = await runGit(['rev-parse', ref], repoRoot)
  return stdout.trim()
}
