import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type HiveApi } from '../shared/ipc'

const api: HiveApi = {
  pickRepoFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickRepoFolder)
}

contextBridge.exposeInMainWorld('hive', api)
