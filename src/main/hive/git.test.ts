import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureRepo, type FixtureRepo } from './fixture-repo'
import { GitError, runGit } from './git'

describe('runGit', () => {
  let fixture: FixtureRepo | undefined

  afterEach(async () => {
    await fixture?.cleanup()
    fixture = undefined
  })

  it('resolves with stdout on success', async () => {
    fixture = await createFixtureRepo()
    const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], fixture.repoRoot)
    expect(stdout.trim()).toBe('main')
  })

  it('rejects with a GitError carrying the exit code and stderr on failure', async () => {
    fixture = await createFixtureRepo()
    await expect(runGit(['rev-parse', 'does-not-exist'], fixture.repoRoot)).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(GitError)
        expect((err as GitError).exitCode).not.toBe(0)
        expect((err as GitError).stderrOutput.length).toBeGreaterThan(0)
        return true
      }
    )
  })

  it('never invokes a shell, so special characters in args are passed literally', async () => {
    fixture = await createFixtureRepo()
    const message = 'fix: `rm -rf /` should never run; $(whoami) && echo pwned'
    await runGit(['commit', '--allow-empty', '-m', message], fixture.repoRoot)
    const { stdout } = await runGit(['log', '-1', '--format=%s'], fixture.repoRoot)
    expect(stdout.trim()).toBe(message)
  })
})
