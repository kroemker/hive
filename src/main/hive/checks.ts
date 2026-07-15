import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'
import type { CheckDefinition, CheckResult } from '../../shared/hive/types'

const exec = promisify(execCallback)

const MAX_OUTPUT_LENGTH = 20_000

/**
 * Runs each of the repo's configured checks (build/lint/test commands) in a ticket's
 * worktree, sequentially, capturing pass/fail and output. Never throws - a failing
 * command is a normal (non-zero-exit-code) result, not an error in the run itself.
 */
export async function runChecks(
  worktreePath: string,
  checks: CheckDefinition[]
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const check of checks) {
    results.push(await runOneCheck(worktreePath, check))
  }
  return results
}

async function runOneCheck(worktreePath: string, check: CheckDefinition): Promise<CheckResult> {
  const ranAt = new Date().toISOString()
  try {
    const { stdout, stderr } = await exec(check.command, {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024
    })
    return {
      name: check.name,
      command: check.command,
      exitCode: 0,
      output: truncate(stdout + stderr),
      ranAt
    }
  } catch (err) {
    const execErr = err as { code?: number; stdout?: string; stderr?: string; message: string }
    const output = `${execErr.stdout ?? ''}${execErr.stderr ?? ''}` || execErr.message
    return {
      name: check.name,
      command: check.command,
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
      output: truncate(output),
      ranAt
    }
  }
}

function truncate(output: string): string {
  return output.length > MAX_OUTPUT_LENGTH
    ? `${output.slice(0, MAX_OUTPUT_LENGTH)}\n…(truncated)`
    : output
}
