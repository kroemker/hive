import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AgentEventMessage,
  type HiveApi,
  type TicketChangedMessage
} from '../shared/ipc'

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
  listHistory: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.listHistory, ticketId),
  checkBaseDrift: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.checkBaseDrift, ticketId),
  rebaseTicketOntoBase: (ticketId) =>
    ipcRenderer.invoke(IPC_CHANNELS.rebaseTicketOntoBase, ticketId),
  getTicketDiff: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.getTicketDiff, ticketId),
  listInlineComments: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.listInlineComments, ticketId),
  addInlineComment: (ticketId, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.addInlineComment, ticketId, input),
  setInlineCommentResolved: (ticketId, commentId, resolved) =>
    ipcRenderer.invoke(IPC_CHANNELS.setInlineCommentResolved, ticketId, commentId, resolved),
  listRuns: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.listRuns, ticketId),
  getRunTranscript: (ticketId, runId) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRunTranscript, ticketId, runId),
  cancelRun: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.cancelRun, ticketId),
  onAgentEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: AgentEventMessage): void =>
      listener(message)
    ipcRenderer.on(IPC_CHANNELS.agentEvent, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler)
  },
  onTicketChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: TicketChangedMessage): void =>
      listener(message)
    ipcRenderer.on(IPC_CHANNELS.ticketChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ticketChanged, handler)
  },
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.getConfig),
  setConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.setConfig, patch),
  pickWorktreeRoot: () => ipcRenderer.invoke(IPC_CHANNELS.pickWorktreeRoot),
  hasApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.hasApiKey),
  setApiKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.setApiKey, apiKey),
  clearApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.clearApiKey),
  getCheckResults: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.getCheckResults, ticketId),
  openTicketWorktree: (ticketId) => ipcRenderer.invoke(IPC_CHANNELS.openTicketWorktree, ticketId)
}

contextBridge.exposeInMainWorld('hive', api)
