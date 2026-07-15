import { execFile } from 'node:child_process'

export class GitError extends Error {
  constructor(
    public readonly args: string[],
    public readonly exitCode: number,
    public readonly stderrOutput: string
  ) {
    super(`git ${args.join(' ')} failed (exit ${exitCode}): ${stderrOutput.trim()}`)
    this.name = 'GitError'
  }
}

/** Runs git with an argv array (never a shell), so arbitrary ticket text can never be injected. */
export function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: 1024 * 1024 * 32 },
      (err, stdout, stderr) => {
        if (err) {
          const exitCode = typeof err.code === 'number' ? err.code : 1
          reject(new GitError(args, exitCode, stderr || err.message))
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}
