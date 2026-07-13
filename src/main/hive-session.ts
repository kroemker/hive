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
}
