export const IPC_CHANNELS = {
  pickRepoFolder: 'repo:pick-folder'
} as const

export interface HiveApi {
  /** Opens a native folder picker and returns the chosen path, or null if cancelled. */
  pickRepoFolder: () => Promise<string | null>
}
