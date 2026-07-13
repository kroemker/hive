import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type HiveApi } from '../shared/ipc'

const api: HiveApi = {
  pickRepoFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickRepoFolder),
  openRepo: (folderPath) => ipcRenderer.invoke(IPC_CHANNELS.openRepo, folderPath),
  listTickets: () => ipcRenderer.invoke(IPC_CHANNELS.listTickets),
  getTicket: (id) => ipcRenderer.invoke(IPC_CHANNELS.getTicket, id),
  createTicket: (input) => ipcRenderer.invoke(IPC_CHANNELS.createTicket, input),
  updateTicket: (id, patch) => ipcRenderer.invoke(IPC_CHANNELS.updateTicket, id, patch),
  transitionTicket: (id, to, note) => ipcRenderer.invoke(IPC_CHANNELS.transitionTicket, id, to, note),
  listComments: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.listComments, ticketId),
  addComment: (ticketId, body) => ipcRenderer.invoke(IPC_CHANNELS.addComment, ticketId, body),
  listHistory: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.listHistory, ticketId)
}

contextBridge.exposeInMainWorld('hive', api)
