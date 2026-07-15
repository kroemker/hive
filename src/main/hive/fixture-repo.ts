import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { runGit } from './git'

export interface FixtureRepo {
  repoRoot: string
  baseBranch: string
  cleanup: () => Promise<void>
}

/** A real throwaway git repo with one commit on `baseBranch`, for integration tests. */
export async function createFixtureRepo(baseBranch = 'main'): Promise<FixtureRepo> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'hive-fixture-'))
  await runGit(['init', '-q', '-b', baseBranch], repoRoot)
  await runGit(['config', 'user.email', 'test@example.com'], repoRoot)
  await runGit(['config', 'user.name', 'Hive Test'], repoRoot)
  await writeFile(join(repoRoot, 'README.md'), '# fixture\n', 'utf8')
  await runGit(['add', 'README.md'], repoRoot)
  await runGit(['commit', '-q', '-m', 'initial commit'], repoRoot)

  // Worktrees for this repo land as a sibling directory (see worktreePathForTicket) -
  // clean that up too, not just the repo itself.
  const worktreesRoot = join(dirname(repoRoot), '.hive-worktrees', basename(repoRoot))

  return {
    repoRoot,
    baseBranch,
    cleanup: async () => {
      await rm(worktreesRoot, { recursive: true, force: true })
      await rm(repoRoot, { recursive: true, force: true })
    }
  }
}
