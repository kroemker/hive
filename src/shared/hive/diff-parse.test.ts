import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from './diff-parse'

describe('parseUnifiedDiff', () => {
  it('tracks old/new line numbers across additions, deletions, and context', () => {
    const patch = [
      'diff --git a/src/a.txt b/src/a.txt',
      'index 83db48f..1977e4e 100644',
      '--- a/src/a.txt',
      '+++ b/src/a.txt',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '-line2',
      '+line2 modified',
      ' line3',
      '+line4 added'
    ].join('\n')

    const lines = parseUnifiedDiff(patch)

    const meta = lines.filter((l) => l.type === 'meta')
    expect(meta.map((l) => l.content)).toEqual([
      'diff --git a/src/a.txt b/src/a.txt',
      'index 83db48f..1977e4e 100644',
      '--- a/src/a.txt',
      '+++ b/src/a.txt'
    ])

    const hunk = lines.find((l) => l.type === 'hunk')
    expect(hunk?.content).toBe('@@ -1,3 +1,4 @@')

    const contentLines = lines.filter((l) => l.type !== 'meta' && l.type !== 'hunk')
    expect(contentLines).toEqual([
      { type: 'context', content: 'line1', oldLine: 1, newLine: 1 },
      { type: 'del', content: 'line2', oldLine: 2 },
      { type: 'add', content: 'line2 modified', newLine: 2 },
      { type: 'context', content: 'line3', oldLine: 3, newLine: 3 },
      { type: 'add', content: 'line4 added', newLine: 4 }
    ])
  })

  it('handles a pure addition (new file) with only + lines', () => {
    const patch = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..7f1fd64',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,2 @@',
      '+export const x = 1',
      '+export const y = 2'
    ].join('\n')

    const lines = parseUnifiedDiff(patch).filter((l) => l.type === 'add')
    expect(lines).toEqual([
      { type: 'add', content: 'export const x = 1', newLine: 1 },
      { type: 'add', content: 'export const y = 2', newLine: 2 }
    ])
  })

  it('handles multiple hunks, resetting line counters at each header', () => {
    const patch = [
      'diff --git a/f.txt b/f.txt',
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,2 +1,2 @@',
      '-old1',
      '+new1',
      ' ctx1',
      '@@ -10,2 +10,3 @@',
      ' ctx2',
      '+new2'
    ].join('\n')

    const lines = parseUnifiedDiff(patch).filter((l) => l.type !== 'meta' && l.type !== 'hunk')
    expect(lines).toEqual([
      { type: 'del', content: 'old1', oldLine: 1 },
      { type: 'add', content: 'new1', newLine: 1 },
      { type: 'context', content: 'ctx1', oldLine: 2, newLine: 2 },
      { type: 'context', content: 'ctx2', oldLine: 10, newLine: 10 },
      { type: 'add', content: 'new2', newLine: 11 }
    ])
  })

  it('treats a rename-only patch (no hunks) as all metadata', () => {
    const patch = [
      'diff --git a/old.txt b/new.txt',
      'similarity index 100%',
      'rename from old.txt',
      'rename to new.txt'
    ].join('\n')

    const lines = parseUnifiedDiff(patch)
    expect(lines.every((l) => l.type === 'meta')).toBe(true)
  })

  it('preserves a "no newline at end of file" marker as metadata', () => {
    const patch = [
      'diff --git a/f.txt b/f.txt',
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1 +1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new'
    ].join('\n')

    const lines = parseUnifiedDiff(patch)
    expect(lines.find((l) => l.content === '\\ No newline at end of file')?.type).toBe('meta')
  })
})
