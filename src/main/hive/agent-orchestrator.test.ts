import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { FakeAgentProvider } from './fake-agent-provider'
import { runAgentAndAdvance } from './agent-orchestrator'
import { HiveRepo } from './repo'
import { applyTransition } from './workflow'

describe('runAgentAndAdvance', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('advances to code-review on success, recording the transcript and a comment', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')

    const provider = new FakeAgentProvider({
      events: [
        { type: 'assistant-text', text: 'Implementing the toggle...' },
        { type: 'tool-use', name: 'Write', input: { file: 'a.ts' } }
      ],
      outcome: 'success',
      summary: 'Added the dark mode toggle.',
      costUsd: 0.05,
      inputTokens: 500,
      outputTokens: 200
    })

    const updated = await runAgentAndAdvance(repo, provider, ticket.id)

    expect(updated.status).toBe('code-review')
    expect(updated.runCount).toBe(1)

    const runs = await repo.listRuns(ticket.id)
    expect(runs).toHaveLength(1)
    expect(runs[0].outcome).toBe('success')
    expect(runs[0].costUsd).toBe(0.05)

    const transcript = await repo.getRunTranscript(ticket.id, runs[0].id)
    expect(transcript).toContain('Implementing the toggle...')
    expect(transcript).toContain('[tool] Write')

    const comments = await repo.listComments(ticket.id)
    expect(comments.at(-1)).toMatchObject({ author: 'agent', body: 'Added the dark mode toggle.' })
  })

  it('advances to clarification when the agent asks a question', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')

    const provider = new FakeAgentProvider({
      outcome: 'needs_clarification',
      summary: 'Should the toggle persist across restarts?'
    })

    const updated = await runAgentAndAdvance(repo, provider, ticket.id)

    expect(updated.status).toBe('clarification')
    const comments = await repo.listComments(ticket.id)
    expect(comments.at(-1)?.body).toBe('Should the toggle persist across restarts?')
  })

  it('advances to failed when the run reports a failure outcome', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')

    const provider = new FakeAgentProvider({ outcome: 'failed', summary: 'Ran out of turns.' })

    const updated = await runAgentAndAdvance(repo, provider, ticket.id)

    expect(updated.status).toBe('failed')
    const runs = await repo.listRuns(ticket.id)
    expect(runs[0].outcome).toBe('failed')
  })

  it('advances to failed when the provider throws', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')

    const provider = new FakeAgentProvider({
      outcome: 'success',
      summary: 'unused',
      throws: new Error('subprocess crashed')
    })

    const updated = await runAgentAndAdvance(repo, provider, ticket.id)

    expect(updated.status).toBe('failed')
    const comments = await repo.listComments(ticket.id)
    expect(comments.at(-1)?.body).toContain('subprocess crashed')
  })

  it('passes unresolved inline comments and general comments into the prompt', async () => {
    fixture = await createFixtureRepo()
    const repo = await HiveRepo.init(fixture.repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    await applyTransition(repo, ticket.id, 'implementation')
    await repo.addComment(ticket.id, { author: 'human', body: 'please be quick' })
    await repo.addInlineComment(ticket.id, {
      filePath: 'src/theme.ts',
      line: 3,
      anchorSha: 'abc',
      author: 'human',
      body: 'use the existing token'
    })

    const provider = new FakeAgentProvider({ outcome: 'success', summary: 'done' })
    await runAgentAndAdvance(repo, provider, ticket.id)

    expect(provider.lastInput?.prompt).toContain('please be quick')
    expect(provider.lastInput?.prompt).toContain('use the existing token')
  })
})
