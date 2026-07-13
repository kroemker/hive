import { useState } from 'react'
import Board from './board/Board'

function App() {
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePickFolder(): Promise<void> {
    setError(null)
    const folder = await window.hive.pickRepoFolder()
    if (!folder) {
      return
    }
    try {
      const opened = await window.hive.openRepo(folder)
      setRepoRoot(opened.repoRoot)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!repoRoot) {
    return (
      <main className="welcome">
        <h1>Hive</h1>
        <p className="tagline">A kanban board for your local git repo.</p>
        <button type="button" onClick={handlePickFolder}>
          Open repository folder
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  return <Board repoRoot={repoRoot} onCloseRepo={() => setRepoRoot(null)} />
}

export default App
