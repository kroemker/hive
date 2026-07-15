import { BrowserWindow } from 'electron'

/** Pushes an event to every open window's renderer - used for live agent-run streaming. */
export function broadcastToAllWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}
