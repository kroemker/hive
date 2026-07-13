import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from './ipc'

describe('IPC_CHANNELS', () => {
  it('defines a stable channel name for picking a repo folder', () => {
    expect(IPC_CHANNELS.pickRepoFolder).toBe('repo:pick-folder')
  })
})
