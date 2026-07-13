import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { runGit } from './git'
import { pathExists } from './paths'
import { HiveRepo } from './repo'
import { applyTransition, checkBaseDrift, rebaseTicketOntoBase } from './workflow'
import { worktreePathForTicket } from './worktrees'

async function commitInWorktree(worktreePath: string, fileName: string, content: string): Promise<void> {
  await writeFile(join(worktreePath, fileName), content, 'utf8')
  await runGit(['add', fileName], worktreePath)
  await runGit(['commit', '-q', '-m', `add ${fileName}`], worktreePath)
}

describe('applyTransition', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('creates a branch and worktree on entering implementation, and records it on the ticket', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')

    const updated = await applyTransition(repo, ticket.id, 'implementation')

    expect(updated.branch).toBe(`hive/${ticket.id}-add-dark-mode`)
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    expect(await pathExists(worktreePath)).toBe(true)
  })

  it('reuses the same branch/worktree when re-entering implementation after request-changes', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    const first = await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'work in progress\n')

    await repo.transitionTicket(ticket.id, 'code-review')
    const second = await applyTransition(repo, ticket.id, 'implementation')

    expect(second.branch).toBe(first.branch)
    expect(await readFile(join(worktreePath, 'feature.txt'), 'utf8')).toBe('work in progress\n')
  })

  it('reattaches the worktree if it was lost while a ticket was out of implementation', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    const withBranch = await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'committed work\n')
    await runGit(['worktree', 'remove', '--force', worktreePath], fixture.repoRoot)
    await repo.transitionTicket(ticket.id, 'code-review')

    await applyTransition(repo, ticket.id, 'implementation')

    expect(await pathExists(worktreePath)).toBe(true)
    expect(await readFile(join(worktreePath, 'feature.txt'), 'utf8')).toBe('committed work\n')
    const { stdout: currentBranch } = await runGit(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      worktreePath
    )
    expect(currentBranch.trim()).toBe(withBranch.branch)
  })

  it('merges and tears down the worktree on entering resolved', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    const withBranch = await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'shipped content\n')
    await repo.transitionTicket(ticket.id, 'code-review')
    await repo.transitionTicket(ticket.id, 'ready-for-test')

    const resolved = await applyTransition(repo, ticket.id, 'resolved')

    expect(resolved.status).toBe('resolved')
    expect(await pathExists(worktreePath)).toBe(false)

    const { stdout: show } = await runGit(
      ['show', `${fixture.baseBranch}:feature.txt`],
      fixture.repoRoot
    )
    expect(show).toBe('shipped content\n')

    const { stdout: branchList } = await runGit(
      ['branch', '--list', withBranch.branch as string],
      fixture.repoRoot
    )
    expect(branchList.trim()).toBe('')
  })

  it('leaves the ticket in ready-for-test when the merge conflicts', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'README.md', 'ticket branch version\n')
    await repo.transitionTicket(ticket.id, 'code-review')
    await repo.transitionTicket(ticket.id, 'ready-for-test')

    // Conflicting change lands on base after the ticket branch forked.
    await writeFile(join(fixture.repoRoot, 'README.md'), 'main branch version\n', 'utf8')
    await runGit(['add', 'README.md'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'conflicting main commit'], fixture.repoRoot)

    await expect(applyTransition(repo, ticket.id, 'resolved')).rejects.toThrow()

    const ticketAfter = await repo.getTicket(ticket.id)
    expect(ticketAfter?.status).toBe('ready-for-test')
    expect(await pathExists(worktreePath)).toBe(true)
  })
})

describe('checkBaseDrift and rebaseTicketOntoBase', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('is 0 for a ticket with no branch yet', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    expect(await checkBaseDrift(repo, ticket.id)).toBe(0)
  })

  it('reports how many commits base has gained, and rebase clears it', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    const worktreePath = worktreePathForTicket(fixture.repoRoot, ticket.id)
    await commitInWorktree(worktreePath, 'feature.txt', 'ticket work\n')

    await writeFile(join(fixture.repoRoot, 'other.txt'), 'unrelated\n', 'utf8')
    await runGit(['add', 'other.txt'], fixture.repoRoot)
    await runGit(['commit', '-q', '-m', 'unrelated main commit'], fixture.repoRoot)

    expect(await checkBaseDrift(repo, ticket.id)).toBe(1)

    await rebaseTicketOntoBase(repo, ticket.id)

    expect(await checkBaseDrift(repo, ticket.id)).toBe(0)
    expect(await readFile(join(worktreePath, 'other.txt'), 'utf8')).toBe('unrelated\n')
    expect(await readFile(join(worktreePath, 'feature.txt'), 'utf8')).toBe('ticket work\n')
  })
})
