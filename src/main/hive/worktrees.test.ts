import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { runGit } from './git'
import { pathExists } from './paths'
import {
  branchNameForTicket,
  countCommitsBaseIsAhead,
  createWorktree,
  reattachWorktree,
  removeWorktree,
  worktreePathForTicket
} from './worktrees'

describe('branchNameForTicket', () => {
  it('combines the ticket id and a slug of its title', () => {
    expect(branchNameForTicket({ id: 'ticket-3', title: 'Add dark mode!' })).toBe(
      'hive/ticket-3-add-dark-mode'
    )
  })
})

describe('worktreePathForTicket', () => {
  it('defaults to a .hive-worktrees sibling of the repo root', () => {
    expect(worktreePathForTicket('/home/user/my-repo', 'ticket-1')).toBe(
      join('/home/user/.hive-worktrees', 'my-repo', 'ticket-1')
    )
  })

  it('uses the configured worktreeRoot override when given', () => {
    expect(worktreePathForTicket('/home/user/my-repo', 'ticket-1', '/fast-disk/worktrees')).toBe(
      join('/fast-disk/worktrees', 'my-repo', 'ticket-1')
    )
  })

  it('falls back to the default when the override is null', () => {
    expect(worktreePathForTicket('/home/user/my-repo', 'ticket-1', null)).toBe(
      join('/home/user/.hive-worktrees', 'my-repo', 'ticket-1')
    )
  })
})

describe('worktree lifecycle', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('creates a branch and a worktree checked out onto it, off the base branch', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'

    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    expect(await pathExists(worktreePath)).toBe(true)
    expect(await pathExists(join(worktreePath, 'README.md'))).toBe(true)

    const { stdout: currentBranch } = await runGit(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      worktreePath
    )
    expect(currentBranch.trim()).toBe(branch)

    const { stdout: branchList } = await runGit(['branch', '--list', branch], fixture.repoRoot)
    expect(branchList).toContain(branch)
  })

  it('removes the worktree directory and deletes the branch', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    await removeWorktree(fixture.repoRoot, worktreePath, branch)

    expect(await pathExists(worktreePath)).toBe(false)
    const { stdout: branchList } = await runGit(['branch', '--list', branch], fixture.repoRoot)
    expect(branchList.trim()).toBe('')
  })

  it('fails to remove a worktree with uncommitted changes rather than discarding them', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)
    await writeFile(join(worktreePath, 'README.md'), 'uncommitted edit\n', 'utf8')

    await expect(removeWorktree(fixture.repoRoot, worktreePath, branch)).rejects.toThrow()
    expect(await pathExists(worktreePath)).toBe(true)
  })

  it('reattaches a worktree to an existing branch after the directory is lost', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)
    await writeFile(join(worktreePath, 'agent-work.txt'), 'work in progress\n', 'utf8')
    await runGit(['add', 'agent-work.txt'], worktreePath)
    await runGit(['commit', '-q', '-m', 'agent commit'], worktreePath)

    // Simulate the worktree directory being lost without going through `git worktree remove`.
    await runGit(['worktree', 'remove', '--force', worktreePath], fixture.repoRoot)
    expect(await pathExists(worktreePath)).toBe(false)

    await reattachWorktree(fixture.repoRoot, worktreePath, branch)

    expect(await pathExists(worktreePath)).toBe(true)
    expect(await readFile(join(worktreePath, 'agent-work.txt'), 'utf8')).toBe(
      'work in progress\n'
    )
  })
})

describe('countCommitsBaseIsAhead', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('is 0 when the base branch has not moved since the ticket branch forked', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    expect(await countCommitsBaseIsAhead(fixture.repoRoot, branch, fixture.baseBranch)).toBe(0)
  })

  it('counts new commits landed on base after the ticket branch forked', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    await writeFile(join(fixture.repoRoot, 'other.txt'), 'unrelated change\n', 'utf8')
    await runGit(['add', 'other.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'unrelated main commit'], fixture.repoRoot)

    expect(await countCommitsBaseIsAhead(fixture.repoRoot, branch, fixture.baseBranch)).toBe(1)
  })
})
