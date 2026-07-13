import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canTransition, type TicketStatus } from '../../shared/hive/state-machine'
import type {
  Actor,
  Comment,
  HistoryEntry,
  HiveConfig,
  InlineComment,
  NewTicketInput,
  Ticket
} from '../../shared/hive/types'
import { DEFAULT_HIVE_CONFIG } from '../../shared/hive/types'
import { readConfig, writeConfig } from './config'
import { nextTicketId, randomId } from './ids'
import { appendJsonl, readJsonl } from './jsonl'
import { readJsonArray, writeJsonArray } from './json-file'
import { pathExists } from './paths'
import { parseTicketFile, serializeTicketFile } from './ticket-file'

export class TicketNotFoundError extends Error {
  constructor(public readonly ticketId: string) {
    super(`Ticket "${ticketId}" was not found`)
    this.name = 'TicketNotFoundError'
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TicketStatus,
    public readonly to: TicketStatus
  ) {
    super(`Cannot move a ticket from "${from}" to "${to}"`)
    this.name = 'InvalidTransitionError'
  }
}

/** Reads and writes the `.hive/` directory of a single repo. */
export class HiveRepo {
  readonly repoRoot: string
  readonly hiveDir: string

  private constructor(repoRoot: string) {
    this.repoRoot = repoRoot
    this.hiveDir = join(repoRoot, '.hive')
  }

  private get configPath(): string {
    return join(this.hiveDir, 'config.yaml')
  }

  private get ticketsDir(): string {
    return join(this.hiveDir, 'tickets')
  }

  private ticketDir(id: string): string {
    return join(this.ticketsDir, id)
  }

  private ticketFilePath(id: string): string {
    return join(this.ticketDir(id), 'ticket.md')
  }

  private commentsPath(id: string): string {
    return join(this.ticketDir(id), 'comments.jsonl')
  }

  private historyPath(id: string): string {
    return join(this.ticketDir(id), 'history.jsonl')
  }

  private reviewPath(id: string): string {
    return join(this.ticketDir(id), 'review.json')
  }

  /** Creates `.hive/` (and a default config) if one doesn't already exist. */
  static async init(repoRoot: string): Promise<HiveRepo> {
    const repo = new HiveRepo(repoRoot)
    await mkdir(repo.ticketsDir, { recursive: true })
    if (!(await pathExists(repo.configPath))) {
      await writeConfig(repo.configPath, DEFAULT_HIVE_CONFIG)
    }
    return repo
  }

  /** Opens an existing `.hive/`; throws if one hasn't been initialized yet. */
  static async open(repoRoot: string): Promise<HiveRepo> {
    const repo = new HiveRepo(repoRoot)
    if (!(await pathExists(repo.hiveDir))) {
      throw new Error(`No .hive directory found at ${repoRoot}`)
    }
    return repo
  }

  async getConfig(): Promise<HiveConfig> {
    return readConfig(this.configPath)
  }

  async setConfig(patch: Partial<HiveConfig>): Promise<HiveConfig> {
    const merged = { ...(await this.getConfig()), ...patch }
    await writeConfig(this.configPath, merged)
    return merged
  }

  async listTickets(): Promise<Ticket[]> {
    const ids = await this.listTicketIds()
    const tickets = await Promise.all(ids.map((id) => this.getTicket(id)))
    return tickets
      .filter((ticket): ticket is Ticket => ticket !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async getTicket(id: string): Promise<Ticket | null> {
    try {
      const raw = await readFile(this.ticketFilePath(id), 'utf8')
      return parseTicketFile(raw)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  async createTicket(input: NewTicketInput): Promise<Ticket> {
    const id = nextTicketId(await this.listTicketIds())
    const now = new Date().toISOString()

    const ticket: Ticket = {
      id,
      title: input.title,
      type: input.type,
      status: 'conception',
      labels: input.labels ?? [],
      priority: input.priority ?? 'medium',
      branch: null,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
      body: input.body ?? ''
    }

    await mkdir(this.ticketDir(id), { recursive: true })
    await writeFile(this.ticketFilePath(id), serializeTicketFile(ticket), 'utf8')
    await appendJsonl<HistoryEntry>(this.historyPath(id), {
      id: randomId(),
      at: now,
      from: null,
      to: 'conception',
      actor: 'human'
    })

    return ticket
  }

  async updateTicket(
    id: string,
    patch: Partial<Pick<Ticket, 'title' | 'body' | 'labels' | 'priority' | 'branch'>>
  ): Promise<Ticket> {
    const ticket = await this.getTicket(id)
    if (!ticket) {
      throw new TicketNotFoundError(id)
    }
    const updated: Ticket = { ...ticket, ...patch, updatedAt: new Date().toISOString() }
    await writeFile(this.ticketFilePath(id), serializeTicketFile(updated), 'utf8')
    return updated
  }

  async transitionTicket(
    id: string,
    to: TicketStatus,
    opts: { actor?: Actor; note?: string } = {}
  ): Promise<Ticket> {
    const ticket = await this.getTicket(id)
    if (!ticket) {
      throw new TicketNotFoundError(id)
    }
    if (!canTransition(ticket.status, to)) {
      throw new InvalidTransitionError(ticket.status, to)
    }

    const now = new Date().toISOString()
    const updated: Ticket = { ...ticket, status: to, updatedAt: now }
    await writeFile(this.ticketFilePath(id), serializeTicketFile(updated), 'utf8')
    await appendJsonl<HistoryEntry>(this.historyPath(id), {
      id: randomId(),
      at: now,
      from: ticket.status,
      to,
      actor: opts.actor ?? 'human',
      note: opts.note
    })

    return updated
  }

  async addComment(id: string, comment: { author: Actor; body: string }): Promise<Comment> {
    if (!(await this.getTicket(id))) {
      throw new TicketNotFoundError(id)
    }
    const entry: Comment = {
      id: randomId(),
      author: comment.author,
      body: comment.body,
      createdAt: new Date().toISOString()
    }
    await appendJsonl<Comment>(this.commentsPath(id), entry)
    return entry
  }

  async listComments(id: string): Promise<Comment[]> {
    return readJsonl<Comment>(this.commentsPath(id))
  }

  async listHistory(id: string): Promise<HistoryEntry[]> {
    return readJsonl<HistoryEntry>(this.historyPath(id))
  }

  async listInlineComments(id: string): Promise<InlineComment[]> {
    return readJsonArray<InlineComment>(this.reviewPath(id))
  }

  async addInlineComment(
    id: string,
    comment: { filePath: string; line: number; anchorSha: string; author: Actor; body: string }
  ): Promise<InlineComment> {
    if (!(await this.getTicket(id))) {
      throw new TicketNotFoundError(id)
    }
    const entry: InlineComment = {
      id: randomId(),
      ...comment,
      createdAt: new Date().toISOString(),
      resolved: false
    }
    const comments = await this.listInlineComments(id)
    comments.push(entry)
    await writeJsonArray(this.reviewPath(id), comments)
    return entry
  }

  async setInlineCommentResolved(
    id: string,
    commentId: string,
    resolved: boolean
  ): Promise<InlineComment> {
    const comments = await this.listInlineComments(id)
    const index = comments.findIndex((c) => c.id === commentId)
    if (index === -1) {
      throw new Error(`Inline comment "${commentId}" was not found on ticket "${id}"`)
    }
    comments[index] = { ...comments[index], resolved }
    await writeJsonArray(this.reviewPath(id), comments)
    return comments[index]
  }

  private async listTicketIds(): Promise<string[]> {
    try {
      const entries = await readdir(this.ticketsDir, { withFileTypes: true })
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }
  }
}
