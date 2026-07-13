import type { TicketStatus } from './hive/state-machine'
import type { Comment, HistoryEntry, NewTicketInput, Ticket } from './hive/types'

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
  listHistory: 'history:list'
} as const

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
}
