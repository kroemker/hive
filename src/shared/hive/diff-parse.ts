export type DiffLineType = 'meta' | 'hunk' | 'add' | 'del' | 'context'

export interface ParsedDiffLine {
  type: DiffLineType
  content: string
  oldLine?: number
  newLine?: number
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/
const META_PREFIXES = [
  'diff --git',
  'index ',
  '--- ',
  '+++ ',
  'new file',
  'deleted file',
  'similarity index',
  'rename from',
  'rename to'
]

/** Turns a `git diff` patch into per-line records carrying old/new line numbers, for review UIs. */
export function parseUnifiedDiff(patch: string): ParsedDiffLine[] {
  const result: ParsedDiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false

  for (const raw of patch.split('\n')) {
    if (META_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
      result.push({ type: 'meta', content: raw })
      continue
    }

    const hunkMatch = HUNK_HEADER.exec(raw)
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1])
      newLine = Number(hunkMatch[2])
      inHunk = true
      result.push({ type: 'hunk', content: raw })
      continue
    }

    if (!inHunk) {
      if (raw.length > 0) {
        result.push({ type: 'meta', content: raw })
      }
      continue
    }

    if (raw.startsWith('+')) {
      result.push({ type: 'add', content: raw.slice(1), newLine })
      newLine += 1
    } else if (raw.startsWith('-')) {
      result.push({ type: 'del', content: raw.slice(1), oldLine })
      oldLine += 1
    } else if (raw.startsWith('\\')) {
      result.push({ type: 'meta', content: raw })
    } else {
      // A context line: git prefixes it with a space, but be lenient about a
      // stripped trailing space on an otherwise-blank line.
      result.push({ type: 'context', content: raw.slice(1), oldLine, newLine })
      oldLine += 1
      newLine += 1
    }
  }

  return result
}
