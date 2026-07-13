import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { runGit } from './git'
import { MergeConflictError, mergeTicketBranch } from './merge'
import { createWorktree, worktreePathForTicket } from './worktrees'

async function setUpTicketBranch(
  fixture: FixtureRepo,
  ticketId: string,
  fileContent: string
): Promise<{ branch: string; worktreePath: string }> {
  const worktreePath = worktreePathForTicket(fixture.repoRoot, ticketId)
  const branch = `hive/${ticketId}-demo`
  await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)
  await writeFile(join(worktreePath, 'feature.txt'), fileContent, 'utf8')
  await runGit(['add', 'feature.txt'], worktreePath)
  await runGit(['commit', '-q', '-m', 'add feature.txt'], worktreePath)
  return { branch, worktreePath }
}

describe('mergeTicketBranch', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('merge-commit strategy creates a real merge commit with both parents', async () => {
    fixture = await createFixtureRepo()
    const { branch, worktreePath } = await setUpTicketBranch(
      fixture,
      'ticket-1',
      'hello from the ticket branch\n'
    )
    await mergeTicketBranch(fixture.repoRoot, {
      branch,
      baseBranch: fixture.baseBranch,
      strategy: 'merge-commit',
      worktreePath,
      message: 'Merge ticket-1: demo'
    })

    const { stdout: parents } = await runGit(
      ['log', '-1', '--format=%P', fixture.baseBranch],
      fixture.repoRoot
    )
    expect(parents.trim().split(' ')).toHaveLength(2)

    const { stdout: subject } = await runGit(
      ['log', '-1', '--format=%s', fixture.baseBranch],
      fixture.repoRoot
    )
    expect(subject.trim()).toBe('Merge ticket-1: demo')

    // The merge is done entirely via plumbing (merge-tree/commit-tree/update-ref): repoRoot's
    // own working directory is never written to, even though it's checked out on the branch
    // that just gained a new commit.
    expect(
      await readFile(join(fixture.repoRoot, 'feature.txt'), 'utf8').catch(() => null)
    ).toBeNull()
  })

  it('squash strategy creates a single new commit on base with only base as parent', async () => {
    fixture = await createFixtureRepo()
    const { branch, worktreePath } = await setUpTicketBranch(
      fixture,
      'ticket-2',
      'squash me\n'
    )

    await mergeTicketBranch(fixture.repoRoot, {
      branch,
      baseBranch: fixture.baseBranch,
      strategy: 'squash',
      worktreePath,
      message: 'demo (ticket-2)'
    })

    const { stdout: parents } = await runGit(
      ['log', '-1', '--format=%P', fixture.baseBranch],
      fixture.repoRoot
    )
    expect(parents.trim().split(' ')).toHaveLength(1)

    // Content landed on base even though history was squashed away.
    const { stdout: show } = await runGit(
      ['show', `${fixture.baseBranch}:feature.txt`],
      fixture.repoRoot
    )
    expect(show).toBe('squash me\n')
  })

  it('rebase strategy replays the ticket branch onto base and fast-forwards', async () => {
    fixture = await createFixtureRepo()
    const { branch, worktreePath } = await setUpTicketBranch(
      fixture,
      'ticket-3',
      'rebase me\n'
    )

    // Advance base with an unrelated commit so the rebase has to actually replay commits.
    await writeFile(join(fixture.repoRoot, 'other.txt'), 'unrelated\n', 'utf8')
    await runGit(['add', 'other.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'unrelated main commit'], fixture.repoRoot)
    const baseTipAfterUnrelatedCommit = (
      await runGit(['rev-parse', fixture.baseBranch], fixture.repoRoot)
    ).stdout.trim()

    await mergeTicketBranch(fixture.repoRoot, {
      branch,
      baseBranch: fixture.baseBranch,
      strategy: 'rebase',
      worktreePath,
      message: 'unused for rebase'
    })

    // Exits 0 (and so resolves) only if the pre-rebase base tip is an ancestor of the new
    // base tip - i.e. the rebase really did fast-forward past the unrelated commit.
    await expect(
      runGit(
        ['merge-base', '--is-ancestor', baseTipAfterUnrelatedCommit, fixture.baseBranch],
        fixture.repoRoot
      )
    ).resolves.toBeDefined()

    const { stdout: show } = await runGit(
      ['show', `${fixture.baseBranch}:feature.txt`],
      fixture.repoRoot
    )
    expect(show).toBe('rebase me\n')
    const { stdout: otherShow } = await runGit(
      ['show', `${fixture.baseBranch}:other.txt`],
      fixture.repoRoot
    )
    expect(otherShow).toBe('unrelated\n')
  })

  it('throws MergeConflictError and leaves base untouched when content actually conflicts', async () => {
    fixture = await createFixtureRepo()
    const { branch, worktreePath } = await setUpTicketBranch(
      fixture,
      'ticket-4',
      'ticket branch version\n'
    )

    // Conflicting change to the same file on base.
    await writeFile(join(fixture.repoRoot, 'feature.txt'), 'main branch version\n', 'utf8')
    await runGit(['add', 'feature.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'conflicting main commit'], fixture.repoRoot)
    const baseTipBefore = (
      await runGit(['rev-parse', fixture.baseBranch], fixture.repoRoot)
    ).stdout.trim()

    await expect(
      mergeTicketBranch(fixture.repoRoot, {
        branch,
        baseBranch: fixture.baseBranch,
        strategy: 'merge-commit',
        worktreePath,
        message: 'should not land'
      })
    ).rejects.toBeInstanceOf(MergeConflictError)

    const baseTipAfter = (
      await runGit(['rev-parse', fixture.baseBranch], fixture.repoRoot)
    ).stdout.trim()
    expect(baseTipAfter).toBe(baseTipBefore)
  })

  it('rebase strategy surfaces MergeConflictError and leaves the worktree usable', async () => {
    fixture = await createFixtureRepo()
    const { branch, worktreePath } = await setUpTicketBranch(
      fixture,
      'ticket-5',
      'ticket branch version\n'
    )

    await writeFile(join(fixture.repoRoot, 'feature.txt'), 'main branch version\n', 'utf8')
    await runGit(['add', 'feature.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'conflicting main commit'], fixture.repoRoot)

    await expect(
      mergeTicketBranch(fixture.repoRoot, {
        branch,
        baseBranch: fixture.baseBranch,
        strategy: 'rebase',
        worktreePath,
        message: 'unused'
      })
    ).rejects.toBeInstanceOf(MergeConflictError)

    // The aborted rebase should leave the worktree in a clean, usable state.
    const { stdout: status } = await runGit(['status', '--porcelain'], worktreePath)
    expect(status.trim()).toBe('')
  })
})
