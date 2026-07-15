import type { TicketStatus } from './state-machine'

export type TicketType = 'code' | 'informational'
export type Priority = 'low' | 'medium' | 'high'
export type Actor = 'human' | 'agent' | 'system'
export type RunOutcome = 'success' | 'failed' | 'needs_clarification'
export type MergeStrategy = 'merge-commit' | 'squash' | 'rebase'
/**
 * `safe` keeps agent runs to read/edit/search tools only (no shell). `trusted` additionally
 * allows Bash and web access - only meaningful once the user trusts the repo/agent combination.
 */
export type PermissionMode = 'safe' | 'trusted'

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

/**
 * An inline comment anchored to a specific line of a specific file, at the commit the
 * ticket's branch was at when the comment was made. Stored as a mutable JSON array
 * (`review.json`) rather than an append-only log, since resolving a thread edits it in place.
 */
export interface InlineComment {
  id: string
  filePath: string
  line: number
  /** The ticket branch's commit sha when this comment was made - used to detect staleness. */
  anchorSha: string
  author: Actor
  body: string
  createdAt: string
  resolved: boolean
}

/** An inline comment plus whether its file has changed since it was anchored. */
export interface InlineCommentView extends InlineComment {
  stale: boolean
}

export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface DiffFile {
  path: string
  oldPath?: string
  status: DiffFileStatus
  patch: string
}

export interface TicketDiff {
  baseBranch: string
  branch: string
  /** The branch tip this diff was computed against - used to anchor inline comments. */
  branchSha: string
  files: DiffFile[]
}

/** A user-configured build/lint/test command run automatically on entering `code-review`. */
export interface CheckDefinition {
  name: string
  command: string
}

/** The outcome of running one `CheckDefinition` against a ticket's worktree. */
export interface CheckResult {
  name: string
  command: string
  exitCode: number
  output: string
  ranAt: string
}

/** A starting point for a new ticket's body, offered in the "new ticket" form. */
export interface TicketTemplate {
  id: string
  label: string
  body: string
}

export const TICKET_TEMPLATES: TicketTemplate[] = [
  { id: 'blank', label: 'Blank', body: '' },
  {
    id: 'bug',
    label: 'Bug report',
    body: '## Steps to reproduce\n\n## Expected behavior\n\n## Actual behavior\n'
  },
  {
    id: 'feature',
    label: 'Feature request',
    body: '## Problem\n\n## Proposed solution\n\n## Acceptance criteria\n'
  }
]

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

/** `.hive/config.yaml` - checked into the repo, so no secrets belong here. */
export interface HiveConfig {
  baseBranch: string
  mergeStrategy: MergeStrategy
  permissionMode: PermissionMode
  /** Overrides where ticket worktrees are created. `null` uses the default sibling directory. */
  worktreeRoot: string | null
  /** Build/lint/test commands run in the worktree when a ticket enters `code-review`. */
  checks: CheckDefinition[]
  /** Command used to open a ticket's worktree (e.g. `code`, `subl`). `null` opens it in the OS file manager. */
  editorCommand: string | null
}

export const DEFAULT_HIVE_CONFIG: HiveConfig = {
  baseBranch: 'main',
  mergeStrategy: 'squash',
  permissionMode: 'safe',
  worktreeRoot: null,
  checks: [],
  editorCommand: null
}
