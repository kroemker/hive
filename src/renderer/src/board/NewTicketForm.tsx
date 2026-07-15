import { useState, type FormEvent } from 'react'
import { TICKET_TEMPLATES, type NewTicketInput, type Priority, type TicketType } from '../../../shared/hive/types'

interface NewTicketFormProps {
  onCancel: () => void
  onCreated: () => void
}

function NewTicketForm({ onCancel, onCreated }: NewTicketFormProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TicketType>('code')
  const [priority, setPriority] = useState<Priority>('medium')
  const [labels, setLabels] = useState('')
  const [templateId, setTemplateId] = useState(TICKET_TEMPLATES[0].id)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTemplateChange(id: string): void {
    setTemplateId(id)
    const template = TICKET_TEMPLATES.find((t) => t.id === id)
    setBody(template?.body ?? '')
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const input: NewTicketInput = {
        title: title.trim(),
        type,
        priority,
        labels: labels
          .split(',')
          .map((label) => label.trim())
          .filter((label) => label.length > 0),
        body
      }
      await window.hive.createTicket(input)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="panel" onSubmit={handleSubmit}>
        <h2>New ticket</h2>

        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Add dark mode toggle"
          />
        </label>

        <div className="field-row">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as TicketType)}>
              <option value="code">code</option>
              <option value="informational">informational</option>
            </select>
          </label>

          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>

        <label>
          Labels (comma-separated)
          <input
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            placeholder="ui, backend"
          />
        </label>

        <label>
          Template
          <select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
            {TICKET_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Description / acceptance criteria
          <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="panel-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            Create ticket
          </button>
        </div>
      </form>
    </div>
  )
}

export default NewTicketForm
