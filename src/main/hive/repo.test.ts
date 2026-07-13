import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_HIVE_CONFIG } from '../../shared/hive/types'
import { HiveRepo, InvalidTransitionError, TicketNotFoundError } from './repo'

describe('HiveRepo', () => {
  let repoRoot: string

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'hive-repo-'))
  })

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  it('init creates .hive/tickets and a default config.yaml', async () => {
    await HiveRepo.init(repoRoot)

    const configRaw = await readFile(join(repoRoot, '.hive', 'config.yaml'), 'utf8')
    expect(configRaw).toContain(`baseBranch: ${DEFAULT_HIVE_CONFIG.baseBranch}`)

    const repo = await HiveRepo.open(repoRoot)
    expect(await repo.listTickets()).toEqual([])
  })

  it('open throws when .hive does not exist yet', async () => {
    await expect(HiveRepo.open(repoRoot)).rejects.toThrow(/No \.hive directory/)
  })

  it('init is idempotent and does not clobber an existing config', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await repo.setConfig({ baseBranch: 'develop' })

    await HiveRepo.init(repoRoot)

    expect((await repo.getConfig()).baseBranch).toBe('develop')
  })

  it('creates a ticket in conception with a history entry', async () => {
    const repo = await HiveRepo.init(repoRoot)

    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    expect(ticket.id).toBe('ticket-1')
    expect(ticket.status).toBe('conception')
    expect(ticket.branch).toBeNull()

    expect(await repo.getTicket('ticket-1')).toEqual(ticket)

    const history = await repo.listHistory('ticket-1')
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ from: null, to: 'conception', actor: 'human' })
  })

  it('assigns increasing ids across tickets', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const first = await repo.createTicket({ title: 'First', type: 'code' })
    const second = await repo.createTicket({ title: 'Second', type: 'informational' })

    expect(first.id).toBe('ticket-1')
    expect(second.id).toBe('ticket-2')
    expect((await repo.listTickets()).map((t) => t.id)).toEqual(['ticket-1', 'ticket-2'])
  })

  it('getTicket returns null for an unknown id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    expect(await repo.getTicket('ticket-404')).toBeNull()
  })

  it('updateTicket edits fields and bumps updatedAt without touching status', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Original title', type: 'code' })

    const updated = await repo.updateTicket(ticket.id, { title: 'New title', labels: ['ui'] })

    expect(updated.title).toBe('New title')
    expect(updated.labels).toEqual(['ui'])
    expect(updated.status).toBe('conception')
    expect(updated.updatedAt >= ticket.updatedAt).toBe(true)
  })

  it('updateTicket throws TicketNotFoundError for an unknown id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await expect(repo.updateTicket('ticket-404', { title: 'x' })).rejects.toBeInstanceOf(
      TicketNotFoundError
    )
  })

  it('transitionTicket follows the state machine and records history', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    const moved = await repo.transitionTicket(ticket.id, 'ready-for-implementation')
    expect(moved.status).toBe('ready-for-implementation')

    const history = await repo.listHistory(ticket.id)
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      from: 'conception',
      to: 'ready-for-implementation',
      actor: 'human'
    })
  })

  it('transitionTicket rejects invalid transitions', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    await expect(repo.transitionTicket(ticket.id, 'resolved')).rejects.toBeInstanceOf(
      InvalidTransitionError
    )
    expect((await repo.getTicket(ticket.id))?.status).toBe('conception')
  })

  it('transitionTicket throws TicketNotFoundError for an unknown id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await expect(
      repo.transitionTicket('ticket-404', 'ready-for-implementation')
    ).rejects.toBeInstanceOf(TicketNotFoundError)
  })

  it('records and lists general comments in order', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    await repo.addComment(ticket.id, { author: 'human', body: 'Looks good so far' })
    await repo.addComment(ticket.id, { author: 'agent', body: 'Thanks, continuing' })

    const comments = await repo.listComments(ticket.id)
    expect(comments.map((c) => c.body)).toEqual(['Looks good so far', 'Thanks, continuing'])
    expect(comments[0].author).toBe('human')
  })

  it('addComment throws TicketNotFoundError for an unknown id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await expect(
      repo.addComment('ticket-404', { author: 'human', body: 'hi' })
    ).rejects.toBeInstanceOf(TicketNotFoundError)
  })

  it('persists tickets as human-readable files on disk', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await repo.createTicket({
      title: 'Add dark mode',
      type: 'code',
      body: '## Description\n\nSupport a dark theme.\n'
    })

    const raw = await readFile(join(repoRoot, '.hive', 'tickets', 'ticket-1', 'ticket.md'), 'utf8')
    expect(raw).toContain('title: Add dark mode')
    expect(raw).toContain('## Description')
  })

  it('records inline review comments, unresolved by default', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    const comment = await repo.addInlineComment(ticket.id, {
      filePath: 'src/theme.ts',
      line: 12,
      anchorSha: 'abc123',
      author: 'human',
      body: 'This should use the existing color token.'
    })

    expect(comment.resolved).toBe(false)
    expect(await repo.listInlineComments(ticket.id)).toEqual([comment])
  })

  it('addInlineComment throws TicketNotFoundError for an unknown id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await expect(
      repo.addInlineComment('ticket-404', {
        filePath: 'a.ts',
        line: 1,
        anchorSha: 'abc',
        author: 'human',
        body: 'hi'
      })
    ).rejects.toBeInstanceOf(TicketNotFoundError)
  })

  it('resolves and unresolves an inline comment thread in place', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    const comment = await repo.addInlineComment(ticket.id, {
      filePath: 'src/theme.ts',
      line: 12,
      anchorSha: 'abc123',
      author: 'human',
      body: 'Please fix'
    })

    const resolved = await repo.setInlineCommentResolved(ticket.id, comment.id, true)
    expect(resolved.resolved).toBe(true)
    expect((await repo.listInlineComments(ticket.id))[0].resolved).toBe(true)

    const unresolved = await repo.setInlineCommentResolved(ticket.id, comment.id, false)
    expect(unresolved.resolved).toBe(false)
  })

  it('setInlineCommentResolved throws for an unknown comment id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await expect(
      repo.setInlineCommentResolved(ticket.id, 'no-such-comment', true)
    ).rejects.toThrow(/not found/)
  })

  it('starts a run, writes its prompt, and bumps the ticket run counter', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })

    const run = await repo.startRun(ticket.id, {
      agent: 'claude-code',
      model: 'claude-opus-4-8',
      prompt: '# ticket-1: Add dark mode\n\nDo the thing.'
    })

    expect(run.agent).toBe('claude-code')
    expect(run.startedAt).toBeTruthy()

    const updated = await repo.getTicket(ticket.id)
    expect(updated?.runCount).toBe(1)

    const promptRaw = await readFile(
      join(repoRoot, '.hive', 'tickets', ticket.id, 'runs', run.id, 'prompt.md'),
      'utf8'
    )
    expect(promptRaw).toContain('Do the thing.')
  })

  it('startRun throws TicketNotFoundError for an unknown id', async () => {
    const repo = await HiveRepo.init(repoRoot)
    await expect(
      repo.startRun('ticket-404', { agent: 'claude-code', prompt: 'x' })
    ).rejects.toBeInstanceOf(TicketNotFoundError)
  })

  it('appends transcript lines and finishes a run with outcome/usage', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    const run = await repo.startRun(ticket.id, { agent: 'claude-code', prompt: 'x' })

    await repo.appendRunTranscript(ticket.id, run.id, 'started working')
    await repo.appendRunTranscript(ticket.id, run.id, 'made a commit')

    const finished = await repo.finishRun(ticket.id, run.id, {
      endedAt: new Date().toISOString(),
      outcome: 'success',
      tokensInput: 100,
      tokensOutput: 50,
      costUsd: 0.02
    })

    expect(finished.outcome).toBe('success')
    expect(finished.costUsd).toBe(0.02)

    const transcript = await repo.getRunTranscript(ticket.id, run.id)
    expect(transcript).toBe('started working\nmade a commit\n')
  })

  it('lists runs sorted by start time', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    await repo.startRun(ticket.id, { agent: 'claude-code', prompt: 'first' })
    await repo.startRun(ticket.id, { agent: 'claude-code', prompt: 'second' })

    const runs = await repo.listRuns(ticket.id)
    expect(runs).toHaveLength(2)
    expect(runs[0].startedAt <= runs[1].startedAt).toBe(true)
  })

  it('getRunTranscript returns an empty string for a run with no transcript yet', async () => {
    const repo = await HiveRepo.init(repoRoot)
    const ticket = await repo.createTicket({ title: 'Add dark mode', type: 'code' })
    const run = await repo.startRun(ticket.id, { agent: 'claude-code', prompt: 'x' })
    expect(await repo.getRunTranscript(ticket.id, run.id)).toBe('')
  })
})
