import { dialog, ipcMain } from 'electron'
import type { TicketStatus } from '../shared/hive/state-machine'
import type { NewTicketInput } from '../shared/hive/types'
import { IPC_CHANNELS, type TicketUpdateInput } from '../shared/ipc'
import { findRepoRoot } from './hive/paths'
import { HiveRepo } from './hive/repo'
import {
  addInlineCommentAtCurrentTip,
  getTicketDiffOrNull,
  listInlineCommentsWithStaleness
} from './hive/review'
import { applyTransition, checkBaseDrift, rebaseTicketOntoBase } from './hive/workflow'
import { getActiveRepo, setActiveRepo } from './hive-session'

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
    async (_event, id: string, to: TicketStatus, note?: string) =>
      applyTransition(getActiveRepo(), id, to, note ? { note } : undefined)
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
}
