import { describe, expect, it } from 'vitest'
import { buildAgentPrompt, CLARIFICATION_CONTRACT } from './prompt'

const ticket = {
  id: 'ticket-1',
  title: 'Add dark mode toggle',
  type: 'code' as const,
  body: 'Add a dark mode toggle to settings.'
}

describe('buildAgentPrompt', () => {
  it('includes the ticket id, title, and body', () => {
    const prompt = buildAgentPrompt(ticket, { comments: [], inlineComments: [] })
    expect(prompt).toContain('ticket-1: Add dark mode toggle')
    expect(prompt).toContain('Add a dark mode toggle to settings.')
  })

  it('always includes the clarification contract', () => {
    const prompt = buildAgentPrompt(ticket, { comments: [], inlineComments: [] })
    expect(prompt).toContain(CLARIFICATION_CONTRACT)
  })

  it('groups unresolved inline comments by file, sorted by line', () => {
    const prompt = buildAgentPrompt(ticket, {
      comments: [],
      inlineComments: [
        {
          id: 'c2',
          filePath: 'src/theme.ts',
          line: 20,
          anchorSha: 'a',
          author: 'human',
          body: 'second comment',
          createdAt: '',
          resolved: false,
          stale: false
        },
        {
          id: 'c1',
          filePath: 'src/theme.ts',
          line: 5,
          anchorSha: 'a',
          author: 'human',
          body: 'first comment',
          createdAt: '',
          resolved: false,
          stale: false
        }
      ]
    })

    expect(prompt).toContain('## Requested changes from code review')
    expect(prompt).toContain('### src/theme.ts')
    const firstIndex = prompt.indexOf('first comment')
    const secondIndex = prompt.indexOf('second comment')
    expect(firstIndex).toBeGreaterThan(-1)
    expect(secondIndex).toBeGreaterThan(firstIndex)
  })

  it('omits resolved inline comments', () => {
    const prompt = buildAgentPrompt(ticket, {
      comments: [],
      inlineComments: [
        {
          id: 'c1',
          filePath: 'src/theme.ts',
          line: 5,
          anchorSha: 'a',
          author: 'human',
          body: 'already fixed',
          createdAt: '',
          resolved: true,
          stale: false
        }
      ]
    })
    expect(prompt).not.toContain('Requested changes')
    expect(prompt).not.toContain('already fixed')
  })

  it('includes general ticket comments', () => {
    const prompt = buildAgentPrompt(ticket, {
      comments: [{ id: 'g1', author: 'human', body: 'please hurry', createdAt: '' }],
      inlineComments: []
    })
    expect(prompt).toContain('## Ticket comments')
    expect(prompt).toContain('[human] please hurry')
  })
})
