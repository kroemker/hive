import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Add dark mode toggle')).toBe('add-dark-mode-toggle')
  })

  it('strips punctuation and collapses runs of separators', () => {
    expect(slugify('Fix bug: crash on "save"!!')).toBe('fix-bug-crash-on-save')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --weird title--  ')).toBe('weird-title')
  })

  it('falls back to "ticket" for input with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('ticket')
  })

  it('truncates very long titles', () => {
    const slug = slugify('a'.repeat(100))
    expect(slug.length).toBe(40)
  })
})
