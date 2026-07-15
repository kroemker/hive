import { useCallback, useEffect, useState } from 'react'
import type { CheckDefinition, MergeStrategy, PermissionMode } from '../../../shared/hive/types'

interface SettingsPanelProps {
  onClose: () => void
}

function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [baseBranch, setBaseBranch] = useState('')
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('squash')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('safe')
  const [worktreeRoot, setWorktreeRoot] = useState<string | null>(null)
  const [checks, setChecks] = useState<CheckDefinition[]>([])
  const [editorCommand, setEditorCommand] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [config, keyPresent] = await Promise.all([window.hive.getConfig(), window.hive.hasApiKey()])
    setBaseBranch(config.baseBranch)
    setMergeStrategy(config.mergeStrategy)
    setPermissionMode(config.permissionMode)
    setWorktreeRoot(config.worktreeRoot)
    setChecks(config.checks)
    setEditorCommand(config.editorCommand ?? '')
    setHasApiKey(keyPresent)
  }, [])

  useEffect(() => {
    // Fetching settings on mount from the local .hive/ data layer via IPC - there's no
    // external store to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function handleSave(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.hive.setConfig({
        baseBranch: baseBranch.trim(),
        mergeStrategy,
        permissionMode,
        worktreeRoot,
        checks: checks.filter((check) => check.name.trim() && check.command.trim()),
        editorCommand: editorCommand.trim() || null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function handleAddCheck(): void {
    setChecks((current) => [...current, { name: '', command: '' }])
  }

  function handleUpdateCheck(index: number, patch: Partial<CheckDefinition>): void {
    setChecks((current) => current.map((check, i) => (i === index ? { ...check, ...patch } : check)))
  }

  function handleRemoveCheck(index: number): void {
    setChecks((current) => current.filter((_, i) => i !== index))
  }

  async function handlePickWorktreeRoot(): Promise<void> {
    const picked = await window.hive.pickWorktreeRoot()
    if (picked) {
      setWorktreeRoot(picked)
    }
  }

  async function handleSaveApiKey(): Promise<void> {
    if (!apiKeyDraft.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.hive.setApiKey(apiKeyDraft.trim())
      setApiKeyDraft('')
      setHasApiKey(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleClearApiKey(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.hive.clearApiKey()
      setHasApiKey(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="panel settings-panel">
        <header className="panel-header">
          <div className="panel-header-title">
            <h2>Settings</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <section>
          <h3>Git</h3>
          <div className="field-row">
            <label>
              Base branch
              <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} />
            </label>
            <label>
              Merge strategy
              <select
                value={mergeStrategy}
                onChange={(e) => setMergeStrategy(e.target.value as MergeStrategy)}
              >
                <option value="squash">Squash</option>
                <option value="merge-commit">Merge commit</option>
                <option value="rebase">Rebase</option>
              </select>
            </label>
          </div>
          <label>
            Worktree location
            <div className="field-row">
              <input
                value={worktreeRoot ?? ''}
                placeholder="Default: a .hive-worktrees folder next to the repo"
                onChange={(e) => setWorktreeRoot(e.target.value || null)}
              />
              <button type="button" className="secondary" onClick={handlePickWorktreeRoot}>
                Browse…
              </button>
              {worktreeRoot && (
                <button type="button" className="secondary" onClick={() => setWorktreeRoot(null)}>
                  Reset
                </button>
              )}
            </div>
          </label>
        </section>

        <section>
          <h3>Agent permissions</h3>
          <label>
            Permission mode
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
            >
              <option value="safe">Safe (read, write, search - no shell)</option>
              <option value="trusted">Trusted (also allows running shell commands)</option>
            </select>
          </label>
          <p className="hint">
            Trusted mode lets the agent run arbitrary shell commands (tests, builds, package
            installs) unattended. Only use it for repos and agents you trust.
          </p>
        </section>

        <section>
          <h3>Pre-review checks</h3>
          <p className="hint">
            Run automatically in the ticket&apos;s worktree when it enters code review, and shown
            alongside the diff.
          </p>
          <ul className="check-editor-list">
            {checks.map((check, index) => (
              <li key={index} className="field-row">
                <input
                  value={check.name}
                  placeholder="Name (e.g. Lint)"
                  onChange={(e) => handleUpdateCheck(index, { name: e.target.value })}
                />
                <input
                  value={check.command}
                  placeholder="Command (e.g. npm run lint)"
                  onChange={(e) => handleUpdateCheck(index, { command: e.target.value })}
                />
                <button type="button" className="secondary" onClick={() => handleRemoveCheck(index)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="secondary" onClick={handleAddCheck}>
            + Add check
          </button>
        </section>

        <section>
          <h3>Editor</h3>
          <label>
            Editor command
            <input
              value={editorCommand}
              placeholder="Default: open in the OS file manager (e.g. code, subl)"
              onChange={(e) => setEditorCommand(e.target.value)}
            />
          </label>
        </section>

        <div className="panel-actions">
          <button type="button" onClick={handleSave} disabled={busy}>
            Save
          </button>
        </div>

        <section>
          <h3>Claude Code credentials</h3>
          <p className="hint">
            Leave this blank to use your existing <code>claude login</code> session (Claude
            Pro/Max subscription). Set an API key only if you want to bill this per Claude API
            usage instead.
          </p>
          <p>
            Status:{' '}
            {hasApiKey ? (
              <span className="status-badge status-resolved">API key configured</span>
            ) : (
              <span className="status-badge">using CLI login</span>
            )}
          </p>
          <div className="field-row">
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="sk-ant-…"
            />
            <button type="button" className="secondary" disabled={busy} onClick={handleSaveApiKey}>
              Save key
            </button>
            {hasApiKey && (
              <button type="button" className="secondary" disabled={busy} onClick={handleClearApiKey}>
                Clear key
              </button>
            )}
          </div>
        </section>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

export default SettingsPanel
