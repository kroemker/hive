import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HIVE_CONFIG, type HiveConfig, type Ticket } from '../../shared/hive/types'
import { TicketNotFoundError } from './repo'

const openPath = vi.fn(async (_path: string) => '')
const execFileMock = vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => cb(null))

vi.mock('electron', () => ({
  shell: { openPath: (path: string) => openPath(path) }
}))

vi.mock('node:child_process', () => ({
  execFile: (cmd: string, args: string[], cb: (err: Error | null) => void) =>
    execFileMock(cmd, args, cb)
}))

function fakeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    title: 'Demo',
    type: 'code',
    status: 'implementation',
    labels: [],
    priority: 'medium',
    branch: 'hive/ticket-1-demo',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    runCount: 0,
    body: '',
    ...overrides
  }
}

function fakeRepo(ticket: Ticket | null, config: Partial<HiveConfig> = {}) {
  return {
    repoRoot: '/home/user/my-repo',
    getTicket: vi.fn(async () => ticket),
    getConfig: vi.fn(async () => ({ ...DEFAULT_HIVE_CONFIG, ...config }))
  }
}

describe('openTicketWorktree', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws for an unknown ticket', async () => {
    const { openTicketWorktree } = await import('./editor')
    const repo = fakeRepo(null)

    await expect(openTicketWorktree(repo as never, 'ticket-1')).rejects.toThrow(
      TicketNotFoundError
    )
  })

  it('throws when the ticket has no worktree yet', async () => {
    const { openTicketWorktree } = await import('./editor')
    const repo = fakeRepo(fakeTicket({ branch: null }))

    await expect(openTicketWorktree(repo as never, 'ticket-1')).rejects.toThrow(/no worktree/)
  })

  it('opens the OS file manager when no editor command is configured', async () => {
    const { openTicketWorktree } = await import('./editor')
    const repo = fakeRepo(fakeTicket())

    await openTicketWorktree(repo as never, 'ticket-1')

    expect(openPath).toHaveBeenCalledWith(join('/home/user/.hive-worktrees', 'my-repo', 'ticket-1'))
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('spawns the configured editor command on the worktree path', async () => {
    const { openTicketWorktree } = await import('./editor')
    const repo = fakeRepo(fakeTicket(), { editorCommand: 'code -n' })

    await openTicketWorktree(repo as never, 'ticket-1')

    expect(execFileMock).toHaveBeenCalledWith(
      'code',
      ['-n', join('/home/user/.hive-worktrees', 'my-repo', 'ticket-1')],
      expect.any(Function)
    )
    expect(openPath).not.toHaveBeenCalled()
  })
})
