import { dialog, ipcMain } from 'electron'
import type { AgentEvent } from '../shared/hive/agent'
import type { TicketStatus } from '../shared/hive/state-machine'
import type { HiveConfig, NewTicketInput } from '../shared/hive/types'
import { IPC_CHANNELS, type TicketUpdateInput } from '../shared/ipc'
import { broadcastToAllWindows } from './broadcast'
import { runAgentAndAdvance } from './hive/agent-orchestrator'
import { ClaudeCodeProvider } from './hive/claude-code-provider'
import { openTicketWorktree } from './hive/editor'
import { notifyRunFinished } from './hive/notifications'
import { findRepoRoot } from './hive/paths'
import { HiveRepo } from './hive/repo'
import {
  addInlineCommentAtCurrentTip,
  getTicketDiffOrNull,
  listInlineCommentsWithStaleness
} from './hive/review'
import { clearAnthropicApiKey, hasAnthropicApiKey, setAnthropicApiKey } from './hive/secrets'
import { applyTransition, checkBaseDrift, rebaseTicketOntoBase } from './hive/workflow'
import {
  cancelActiveRun,
  clearActiveRun,
  getActiveRepo,
  registerActiveRun,
  setActiveRepo
} from './hive-session'

const claudeCodeProvider = new ClaudeCodeProvider()

/** Kicks off an agent run for a ticket that's just entered `implementation`, streaming
 * events to every window and letting the run be cancelled without blocking the caller. */
function startAgentRunInBackground(repo: HiveRepo, ticketId: string): void {
  const controller = registerActiveRun(ticketId)
  let runId = ''

  runAgentAndAdvance(repo, claudeCodeProvider, ticketId, {
    signal: controller.signal,
    onRunStarted: (id) => {
      runId = id
    },
    onEvent: (event: AgentEvent) => {
      broadcastToAllWindows(IPC_CHANNELS.agentEvent, { ticketId, runId, event })
    }
  })
    .then((ticket) => {
      notifyRunFinished(ticket)
    })
    .catch((err: unknown) => {
      console.error(`Agent run failed for ticket ${ticketId}:`, err)
    })
    .finally(() => {
      clearActiveRun(ticketId)
      broadcastToAllWindows(IPC_CHANNELS.ticketChanged, { ticketId })
    })
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.pickRepoFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.openRepo, async (_event, folderPath: string) => {
    const repoRoot = await findRepoRoot(folderPath)
    if (!repoRoot) {
      throw new Error(`"${folderPath}" is not inside a git repository`)
    }
    setActiveRepo(await HiveRepo.init(repoRoot))
    return { repoRoot }
  })

  ipcMain.handle(IPC_CHANNELS.listTickets, async () => getActiveRepo().listTickets())

  ipcMain.handle(IPC_CHANNELS.getTicket, async (_event, id: string) =>
    getActiveRepo().getTicket(id)
  )

  ipcMain.handle(IPC_CHANNELS.createTicket, async (_event, input: NewTicketInput) =>
    getActiveRepo().createTicket(input)
  )

  ipcMain.handle(
    IPC_CHANNELS.updateTicket,
    async (_event, id: string, patch: TicketUpdateInput) => getActiveRepo().updateTicket(id, patch)
  )

  ipcMain.handle(
    IPC_CHANNELS.transitionTicket,
    async (_event, id: string, to: TicketStatus, note?: string) => {
      const repo = getActiveRepo()
      const ticket = await applyTransition(repo, id, to, note ? { note } : undefined)
      if (to === 'implementation') {
        startAgentRunInBackground(repo, id)
      }
      return ticket
    }
  )

  ipcMain.handle(IPC_CHANNELS.listComments, async (_event, ticketId: string) =>
    getActiveRepo().listComments(ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.addComment, async (_event, ticketId: string, body: string) =>
    getActiveRepo().addComment(ticketId, { author: 'human', body })
  )

  ipcMain.handle(IPC_CHANNELS.listHistory, async (_event, ticketId: string) =>
    getActiveRepo().listHistory(ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.checkBaseDrift, async (_event, ticketId: string) =>
    checkBaseDrift(getActiveRepo(), ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.rebaseTicketOntoBase, async (_event, ticketId: string) =>
    rebaseTicketOntoBase(getActiveRepo(), ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.getTicketDiff, async (_event, ticketId: string) =>
    getTicketDiffOrNull(getActiveRepo(), ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.listInlineComments, async (_event, ticketId: string) =>
    listInlineCommentsWithStaleness(getActiveRepo(), ticketId)
  )

  ipcMain.handle(
    IPC_CHANNELS.addInlineComment,
    async (_event, ticketId: string, input: { filePath: string; line: number; body: string }) =>
      addInlineCommentAtCurrentTip(getActiveRepo(), ticketId, input)
  )

  ipcMain.handle(
    IPC_CHANNELS.setInlineCommentResolved,
    async (_event, ticketId: string, commentId: string, resolved: boolean) =>
      getActiveRepo().setInlineCommentResolved(ticketId, commentId, resolved)
  )

  ipcMain.handle(IPC_CHANNELS.listRuns, async (_event, ticketId: string) =>
    getActiveRepo().listRuns(ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.getRunTranscript, async (_event, ticketId: string, runId: string) =>
    getActiveRepo().getRunTranscript(ticketId, runId)
  )

  ipcMain.handle(IPC_CHANNELS.cancelRun, async (_event, ticketId: string) =>
    cancelActiveRun(ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.getConfig, async () => getActiveRepo().getConfig())

  ipcMain.handle(IPC_CHANNELS.setConfig, async (_event, patch: Partial<HiveConfig>) =>
    getActiveRepo().setConfig(patch)
  )

  ipcMain.handle(IPC_CHANNELS.pickWorktreeRoot, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.hasApiKey, async () => hasAnthropicApiKey())

  ipcMain.handle(IPC_CHANNELS.setApiKey, async (_event, apiKey: string) =>
    setAnthropicApiKey(apiKey)
  )

  ipcMain.handle(IPC_CHANNELS.clearApiKey, async () => clearAnthropicApiKey())

  ipcMain.handle(IPC_CHANNELS.getCheckResults, async (_event, ticketId: string) =>
    getActiveRepo().getCheckResults(ticketId)
  )

  ipcMain.handle(IPC_CHANNELS.openTicketWorktree, async (_event, ticketId: string) =>
    openTicketWorktree(getActiveRepo(), ticketId)
  )
}
