import type { DiffFile, DiffFileStatus, TicketDiff } from '../../shared/hive/types'
import { runGit } from './git'

/** The diff a ticket's branch introduces relative to where it forked from base. */
export async function computeTicketDiff(
  repoRoot: string,
  branch: string,
  baseBranch: string
): Promise<TicketDiff> {
  const range = `${baseBranch}...${branch}`
  const branchSha = (await runGit(['rev-parse', branch], repoRoot)).stdout.trim()

  const { stdout: nameStatus } = await runGit(
    ['diff', '--name-status', '-M', range],
    repoRoot
  )

  const files: DiffFile[] = []
  for (const line of nameStatus.split('\n').map((l) => l.trim())) {
    if (!line) {
      continue
    }
    const [statusCode, ...rest] = line.split('\t')
    let status: DiffFileStatus
    let path: string
    let oldPath: string | undefined
    let pathspecs: string[]

    if (statusCode.startsWith('R')) {
      status = 'renamed'
      ;[oldPath, path] = rest
      pathspecs = [oldPath, path]
    } else if (statusCode === 'A') {
      status = 'added'
      path = rest[0]
      pathspecs = [path]
    } else if (statusCode === 'D') {
      status = 'deleted'
      path = rest[0]
      pathspecs = [path]
    } else {
      status = 'modified'
      path = rest[0]
      pathspecs = [path]
    }

    const { stdout: patch } = await runGit(['diff', '-M', range, '--', ...pathspecs], repoRoot)
    files.push({ path, oldPath, status, patch })
  }

  return { baseBranch, branch, branchSha, files }
}

/** Has `filePath` changed at all between two commits? Used to tell if a comment is stale. */
export async function hasFileChangedSince(
  repoRoot: string,
  filePath: string,
  sinceSha: string,
  untilSha: string
): Promise<boolean> {
  if (sinceSha === untilSha) {
    return false
  }
  const { stdout } = await runGit(
    ['diff', '--name-only', sinceSha, untilSha, '--', filePath],
    repoRoot
  )
  return stdout.trim().length > 0
}
