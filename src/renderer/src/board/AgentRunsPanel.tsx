import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '../../../shared/hive/agent'
import type { RunMeta } from '../../../shared/hive/types'

interface AgentRunsPanelProps {
  ticketId: string
}

function AgentRunsPanel({ ticketId }: AgentRunsPanelProps) {
  const [runs, setRuns] = useState<RunMeta[]>([])
  const [liveRunId, setLiveRunId] = useState<string | null>(null)
  const [liveLines, setLiveLines] = useState<string[]>([])
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [expandedTranscript, setExpandedTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const liveEndRef = useRef<HTMLDivElement | null>(null)

  const loadRuns = useCallback(async () => {
    setRuns(await window.hive.listRuns(ticketId))
  }, [ticketId])

  useEffect(() => {
    // Fetching this ticket's run history on mount/id-change from the local .hive/ data
    // layer via IPC - there's no external store to subscribe to instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    const unsubscribeAgentEvent = window.hive.onAgentEvent((message) => {
      if (message.ticketId !== ticketId) {
        return
      }
      setLiveRunId(message.runId)
      setLiveLines((lines) => [...lines, formatEvent(message.event)])
    })

    const unsubscribeTicketChanged = window.hive.onTicketChanged((message) => {
      if (message.ticketId !== ticketId) {
        return
      }
      setLiveRunId(null)
      setLiveLines([])
      loadRuns()
    })

    return () => {
      unsubscribeAgentEvent()
      unsubscribeTicketChanged()
    }
  }, [ticketId, loadRuns])

  useEffect(() => {
    liveEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [liveLines])

  async function handleCancel(): Promise<void> {
    setBusy(true)
    try {
      await window.hive.cancelRun(ticketId)
    } finally {
      setBusy(false)
    }
  }

  async function handleExpand(runId: string): Promise<void> {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      return
    }
    setExpandedRunId(runId)
    setExpandedTranscript(await window.hive.getRunTranscript(ticketId, runId))
  }

  if (runs.length === 0 && !liveRunId) {
    return null
  }

  return (
    <section>
      <h3>Agent runs</h3>

      {liveRunId && (
        <div className="live-run">
          <div className="live-run-header">
            <span className="live-run-badge">Running…</span>
            <button type="button" className="secondary small" disabled={busy} onClick={handleCancel}>
              Cancel
            </button>
          </div>
          <pre className="live-run-log">
            {liveLines.join('\n')}
            <div ref={liveEndRef} />
          </pre>
        </div>
      )}

      <ul className="run-list">
        {[...runs].reverse().map((run) => (
          <li key={run.id}>
            <button type="button" className="run-summary" onClick={() => handleExpand(run.id)}>
              <span className={`outcome-badge outcome-${run.outcome ?? 'pending'}`}>
                {run.outcome ?? 'running'}
              </span>
              <span className="run-agent">{run.agent}</span>
              <span className="run-cost">
                {run.costUsd !== undefined ? `$${run.costUsd.toFixed(4)}` : ''}
              </span>
              <span className="run-tokens">
                {run.tokensInput !== undefined && run.tokensOutput !== undefined
                  ? `${run.tokensInput} in / ${run.tokensOutput} out`
                  : ''}
              </span>
            </button>
            {expandedRunId === run.id && (
              <pre className="run-transcript">{expandedTranscript || '(empty transcript)'}</pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'assistant-text':
      return event.text
    case 'tool-use':
      return `[tool] ${event.name} ${JSON.stringify(event.input)}`
    case 'tool-result':
      return `[${event.isError ? 'tool error' : 'tool result'}] ${event.output}`
    case 'usage':
      return `[usage] ${event.inputTokens} in / ${event.outputTokens} out, $${event.costUsd.toFixed(4)}`
    default:
      return ''
  }
}

export default AgentRunsPanel
