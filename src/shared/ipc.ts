import type { AgentEvent } from './hive/agent'
import type { TicketStatus } from './hive/state-machine'
import type {
  Comment,
  HistoryEntry,
  InlineComment,
  InlineCommentView,
  NewTicketInput,
  RunMeta,
  Ticket,
  TicketDiff
} from './hive/types'

export const IPC_CHANNELS = {
  pickRepoFolder: 'repo:pick-folder',
  openRepo: 'repo:open',
  listTickets: 'tickets:list',
  getTicket: 'tickets:get',
  createTicket: 'tickets:create',
  updateTicket: 'tickets:update',
  transitionTicket: 'tickets:transition',
  listComments: 'comments:list',
  addComment: 'comments:add',
  listHistory: 'history:list',
  checkBaseDrift: 'tickets:check-base-drift',
  rebaseTicketOntoBase: 'tickets:rebase-onto-base',
  getTicketDiff: 'tickets:get-diff',
  listInlineComments: 'review:list-comments',
  addInlineComment: 'review:add-comment',
  setInlineCommentResolved: 'review:set-comment-resolved',
  listRuns: 'agent:list-runs',
  getRunTranscript: 'agent:get-run-transcript',
  cancelRun: 'agent:cancel-run',
  agentEvent: 'agent:event',
  ticketChanged: 'tickets:changed'
} as const

/** Pushed from main to renderer while a run is in progress (not request/response). */
export interface AgentEventMessage {
  ticketId: string
  runId: string
  event: AgentEvent
}

/** Pushed whenever a background agent run changes a ticket, so open views can refresh. */
export interface TicketChangedMessage {
  ticketId: string
}

export type TicketUpdateInput = Partial<Pick<Ticket, 'title' | 'body' | 'labels' | 'priority'>>

export interface OpenRepoResult {
  repoRoot: string
}

export interface HiveApi {
  /** Opens a native folder picker and returns the chosen path, or null if cancelled. */
  pickRepoFolder: () => Promise<string | null>
  /** Finds the git repo root containing `folderPath` and makes it the active repo. */
  openRepo: (folderPath: string) => Promise<OpenRepoResult>
  listTickets: () => Promise<Ticket[]>
  getTicket: (id: string) => Promise<Ticket | null>
  createTicket: (input: NewTicketInput) => Promise<Ticket>
  updateTicket: (id: string, patch: TicketUpdateInput) => Promise<Ticket>
  transitionTicket: (id: string, to: TicketStatus, note?: string) => Promise<Ticket>
  listComments: (ticketId: string) => Promise<Comment[]>
  addComment: (ticketId: string, body: string) => Promise<Comment>
  listHistory: (ticketId: string) => Promise<HistoryEntry[]>
  /** How many commits the base branch has gained since this ticket's branch forked. */
  checkBaseDrift: (ticketId: string) => Promise<number>
  /** Replays a ticket's branch onto the latest base, without changing its status. */
  rebaseTicketOntoBase: (ticketId: string) => Promise<void>
  /** The ticket's diff against base, or null if it has no branch yet. */
  getTicketDiff: (ticketId: string) => Promise<TicketDiff | null>
  listInlineComments: (ticketId: string) => Promise<InlineCommentView[]>
  addInlineComment: (
    ticketId: string,
    input: { filePath: string; line: number; body: string }
  ) => Promise<InlineComment>
  setInlineCommentResolved: (
    ticketId: string,
    commentId: string,
    resolved: boolean
  ) => Promise<InlineComment>
  listRuns: (ticketId: string) => Promise<RunMeta[]>
  getRunTranscript: (ticketId: string, runId: string) => Promise<string>
  /** Aborts the ticket's in-flight agent run, if any. Returns false if none was running. */
  cancelRun: (ticketId: string) => Promise<boolean>
  /** Subscribes to live agent-run events; returns an unsubscribe function. */
  onAgentEvent: (listener: (message: AgentEventMessage) => void) => () => void
  /** Subscribes to background ticket changes (e.g. an agent run finishing); returns an unsubscribe function. */
  onTicketChanged: (listener: (message: TicketChangedMessage) => void) => () => void
}
