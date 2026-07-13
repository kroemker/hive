import type { TicketStatus } from './state-machine'

export type TicketType = 'code' | 'informational'
export type Priority = 'low' | 'medium' | 'high'
export type Actor = 'human' | 'agent' | 'system'
export type RunOutcome = 'success' | 'failed' | 'needs_clarification'
export type MergeStrategy = 'merge-commit' | 'squash' | 'rebase'

/** The YAML front-matter of a ticket's `ticket.md`. */
export interface TicketFrontMatter {
  id: string
  title: string
  type: TicketType
  status: TicketStatus
  labels: string[]
  priority: Priority
  /** Set once a worktree/branch exists for this ticket (Phase 3+). */
  branch: string | null
  createdAt: string
  updatedAt: string
  runCount: number
}

/** A ticket as loaded from disk: front-matter plus its Markdown body. */
export interface Ticket extends TicketFrontMatter {
  /** Free-form Markdown: description, acceptance criteria, etc. */
  body: string
}

export interface NewTicketInput {
  title: string
  type: TicketType
  body?: string
  labels?: string[]
  priority?: Priority
}

/** One entry in a ticket's `comments.jsonl`. */
export interface Comment {
  id: string
  author: Actor
  body: string
  createdAt: string
}

/** One entry in a ticket's `history.jsonl` (state-transition audit log). */
export interface HistoryEntry {
  id: string
  at: string
  from: TicketStatus | null
  to: TicketStatus
  actor: Actor
  note?: string
}

/** `runs/<run-id>/meta.yaml` — populated fully once agent execution lands (Phase 5). */
export interface RunMeta {
  id: string
  agent: string
  model?: string
  startedAt: string
  endedAt?: string
  outcome?: RunOutcome
  tokensInput?: number
  tokensOutput?: number
  costUsd?: number
}

/** `.hive/config.yaml` */
export interface HiveConfig {
  baseBranch: string
  mergeStrategy: MergeStrategy
}

export const DEFAULT_HIVE_CONFIG: HiveConfig = {
  baseBranch: 'main',
  mergeStrategy: 'squash'
}
