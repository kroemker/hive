import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import { HiveRepo } from './hive/repo'
import { getActiveRepo, setActiveRepo } from './hive-session'
import { findRepoRoot } from './hive/paths'

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

  ipcMain.handle(IPC_CHANNELS.createTicket, async (_event, input: Parameters<HiveRepo['createTicket']>[0]) =>
    getActiveRepo().createTicket(input)
  )

  ipcMain.handle(
    IPC_CHANNELS.updateTicket,
    async (_event, id: string, patch: Parameters<HiveRepo['updateTicket']>[1]) =>
      getActiveRepo().updateTicket(id, patch)
  )

  ipcMain.handle(
    IPC_CHANNELS.transitionTicket,
    async (_event, id: string, to: Parameters<HiveRepo['transitionTicket']>[1], note?: string) =>
      getActiveRepo().transitionTicket(id, to, note ? { note } : undefined)
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
}
