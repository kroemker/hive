import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { runGit } from './git'
import { HiveRepo } from './repo'
import {
  addInlineCommentAtCurrentTip,
  getTicketDiffOrNull,
  listInlineCommentsWithStaleness
} from './review'
import { applyTransition } from './workflow'
import { worktreePathForTicket } from './worktrees'

async function commitInWorktree(worktreePath: string, fileName: string, content: string): Promise<void> {
  await writeFile(join(worktreePath, fileName), content, 'utf8')
  await runGit(['add', fileName], worktreePath)
  await runGit(['commit', '-q', '-m', `update ${fileName}`], worktreePath)
}

describe('getTicketDiffOrNull', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('is null before a ticket has a branch', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    expect(await getTicketDiffOrNull(repo, ticket.id)).toBeNull()
  })

  it('returns the diff once a ticket has a branch with changes', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    const implementing = await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'hello\n')

    const diff = await getTicketDiffOrNull(repo, ticket.id)

    expect(diff?.branch).toBe(implementing.branch)
    expect(diff?.files.map((f) => f.path)).toEqual(['feature.txt'])
  })
})

describe('inline comments with staleness', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('anchors a new comment to the branch tip at comment time', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'hello\n')
    const branchTip = (await runGit(['rev-parse', 'HEAD'], worktreePath)).stdout.trim()

    const comment = await addInlineCommentAtCurrentTip(repo, ticket.id, {
      filePath: 'feature.txt',
      line: 1,
      body: 'nit: rename this'
    })

    expect(comment.anchorSha).toBe(branchTip)
  })

  it('is not stale immediately after being made', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'hello\n')

    await addInlineCommentAtCurrentTip(repo, ticket.id, {
      filePath: 'feature.txt',
      line: 1,
      body: 'nit'
    })

    const views = await listInlineCommentsWithStaleness(repo, ticket.id)
    expect(views).toHaveLength(1)
    expect(views[0].stale).toBe(false)
  })

  it('becomes stale once the commented file changes in a later commit', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'hello\n')

    await addInlineCommentAtCurrentTip(repo, ticket.id, {
      filePath: 'feature.txt',
      line: 1,
      body: 'nit'
    })

    await commitInWorktree(worktreePath, 'feature.txt', 'hello again\n')

    const views = await listInlineCommentsWithStaleness(repo, ticket.id)
    expect(views[0].stale).toBe(true)
  })

  it('stays fresh if a different file changes after the comment', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'hello\n')

    await addInlineCommentAtCurrentTip(repo, ticket.id, {
      filePath: 'feature.txt',
      line: 1,
      body: 'nit'
    })

    await commitInWorktree(worktreePath, 'other.txt', 'unrelated\n')

    const views = await listInlineCommentsWithStaleness(repo, ticket.id)
    expect(views[0].stale).toBe(false)
  })
})
