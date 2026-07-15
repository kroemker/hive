import type { HiveRepo } from './hive/repo'

let activeRepo: HiveRepo | null = null

export function getActiveRepo(): HiveRepo {
  if (!activeRepo) {
    throw new Error('No repository is open yet')
  }
  return activeRepo
}

export function setActiveRepo(repo: HiveRepo): void {
  activeRepo = repo
  activeRuns.clear()
}

/** Ticket id -> in-flight agent run, so a run can be cancelled from the UI. */
const activeRuns = new Map<string, AbortController>()

export function registerActiveRun(ticketId: string): AbortController {
  const controller = new AbortController()
  activeRuns.set(ticketId, controller)
  return controller
}

export function clearActiveRun(ticketId: string): void {
  activeRuns.delete(ticketId)
}

export function cancelActiveRun(ticketId: string): boolean {
  const controller = activeRuns.get(ticketId)
  if (!controller) {
    return false
  }
  controller.abort()
  return true
}
