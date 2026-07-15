import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runChecks } from './checks'

describe('runChecks', () => {
  let worktreePath: string

  beforeEach(async () => {
    worktreePath = await mkdtemp(join(tmpdir(), 'hive-checks-'))
  })

  afterEach(async () => {
    await rm(worktreePath, { recursive: true, force: true })
  })

  it('returns no results for an empty check list', async () => {
    expect(await runChecks(worktreePath, [])).toEqual([])
  })

  it('captures a passing command with exit code 0', async () => {
    const [result] = await runChecks(worktreePath, [{ name: 'Lint', command: 'echo ok' }])
    expect(result.name).toBe('Lint')
    expect(result.command).toBe('echo ok')
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('ok')
  })

  it('captures a failing command with its non-zero exit code and output', async () => {
    const [result] = await runChecks(worktreePath, [
      { name: 'Test', command: 'echo boom 1>&2 && exit 3' }
    ])
    expect(result.exitCode).toBe(3)
    expect(result.output).toContain('boom')
  })

  it('runs each command in the given worktree directory', async () => {
    const [result] = await runChecks(worktreePath, [{ name: 'Pwd', command: 'pwd' }])
    expect(result.output.trim()).toBe(worktreePath)
  })

  it('runs multiple checks in order', async () => {
    const results = await runChecks(worktreePath, [
      { name: 'First', command: 'echo one' },
      { name: 'Second', command: 'echo two' }
    ])
    expect(results.map((r) => r.name)).toEqual(['First', 'Second'])
  })
})
