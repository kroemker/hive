import { useState } from 'react'

function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)

  async function handlePickFolder(): Promise<void> {
    const path = await window.hive.pickRepoFolder()
    if (path) {
      setRepoPath(path)
    }
  }

  return (
    <main className="app">
      <h1>Hive</h1>
      <p className="tagline">A kanban board for your local git repo.</p>
      <button type="button" onClick={handlePickFolder}>
        Open repository folder
      </button>
      {repoPath && (
        <p className="repo-path">
          Selected: <code>{repoPath}</code>
        </p>
      )}
    </main>
  )
}

export default App
