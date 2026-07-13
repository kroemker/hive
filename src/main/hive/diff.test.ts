import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { computeTicketDiff, hasFileChangedSince } from './diff'
import { runGit } from './git'
import { createWorktree, worktreePathForTicket } from './worktrees'

describe('computeTicketDiff', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('reports added, modified, deleted, and renamed files with per-file patches', async () => {
    fixture = await createFixtureRepo()
    await writeFile(join(fixture.repoRoot, 'to-delete.txt'), 'bye\n', 'utf8')
    await runGit(['add', 'to-delete.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'add file to be deleted'], fixture.repoRoot)

    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    await writeFile(join(worktreePath, 'README.md'), '# fixture\n\nmodified\n', 'utf8')
    await mkdir(join(worktreePath, 'src'), { recursive: true })
    await writeFile(join(worktreePath, 'src', 'new.ts'), 'export const x = 1\n', 'utf8')
    await rm(join(worktreePath, 'to-delete.txt'))
    await runGit(['add', '-A'], worktreePath)
    await runGit(['commit', '-q', '-m', 'ticket changes'], worktreePath)

    const diff = await computeTicketDiff(fixture.repoRoot, branch, fixture.baseBranch)

    expect(diff.baseBranch).toBe(fixture.baseBranch)
    expect(diff.branch).toBe(branch)
    expect(diff.branchSha).toMatch(/^[0-9a-f]{40}$/)

    const byPath = Object.fromEntries(diff.files.map((f) => [f.path, f]))
    expect(byPath['README.md'].status).toBe('modified')
    expect(byPath['README.md'].patch).toContain('+modified')
    expect(byPath['src/new.ts'].status).toBe('added')
    expect(byPath['src/new.ts'].patch).toContain('+export const x = 1')
    expect(byPath['to-delete.txt'].status).toBe('deleted')
    expect(byPath['to-delete.txt'].patch).toContain('-bye')
  })

  it('shows a compact diff for renamed files rather than a full delete+add', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    await rename(join(worktreePath, 'README.md'), join(worktreePath, 'README2.md'))
    await runGit(['add', '-A'], worktreePath)
    await runGit(['commit', '-q', '-m', 'rename readme'], worktreePath)

    const diff = await computeTicketDiff(fixture.repoRoot, branch, fixture.baseBranch)

    expect(diff.files).toHaveLength(1)
    expect(diff.files[0]).toMatchObject({
      status: 'renamed',
      oldPath: 'README.md',
      path: 'README2.md'
    })
    expect(diff.files[0].patch).toContain('rename from README.md')
    expect(diff.files[0].patch).toContain('rename to README2.md')
  })

  it('returns no files when the ticket branch has no changes yet', async () => {
    fixture = await createFixtureRepo()
    const worktreePath = worktreePathForTicket(fixture.repoRoot, 'ticket-1')
    const branch = 'hive/ticket-1-demo'
    await createWorktree(fixture.repoRoot, worktreePath, branch, fixture.baseBranch)

    const diff = await computeTicketDiff(fixture.repoRoot, branch, fixture.baseBranch)
    expect(diff.files).toEqual([])
  })
})

describe('hasFileChangedSince', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('is false for the same commit', async () => {
    fixture = await createFixtureRepo()
    const sha = (await runGit(['rev-parse', 'HEAD'], fixture.repoRoot)).stdout.trim()
    expect(await hasFileChangedSince(fixture.repoRoot, 'README.md', sha, sha)).toBe(false)
  })

  it('is true when the file changed between the two commits', async () => {
    fixture = await createFixtureRepo()
    const before = (await runGit(['rev-parse', 'HEAD'], fixture.repoRoot)).stdout.trim()
    await writeFile(join(fixture.repoRoot, 'README.md'), '# fixture\n\nchanged\n', 'utf8')
    await runGit(['commit', '-q', '-am', 'change readme'], fixture.repoRoot)
    const after = (await runGit(['rev-parse', 'HEAD'], fixture.repoRoot)).stdout.trim()

    expect(await hasFileChangedSince(fixture.repoRoot, 'README.md', before, after)).toBe(true)
  })

  it('is false when a different file changed', async () => {
    fixture = await createFixtureRepo()
    const before = (await runGit(['rev-parse', 'HEAD'], fixture.repoRoot)).stdout.trim()
    await writeFile(join(fixture.repoRoot, 'other.txt'), 'unrelated\n', 'utf8')
    await runGit(['add', 'other.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'add other file'], fixture.repoRoot)
    const after = (await runGit(['rev-parse', 'HEAD'], fixture.repoRoot)).stdout.trim()

    expect(await hasFileChangedSince(fixture.repoRoot, 'README.md', before, after)).toBe(false)
  })
})
