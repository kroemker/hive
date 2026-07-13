import { dump, load } from 'js-yaml'
import type { Ticket } from '../../shared/hive/types'

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseTicketFile(raw: string): Ticket {
  const match = FRONT_MATTER_PATTERN.exec(raw)
  if (!match) {
    throw new Error('Ticket file is missing its YAML front matter')
  }
  const [, frontMatterRaw, rest] = match
  const frontMatter = load(frontMatterRaw) as Omit<Ticket, 'body'>
  const body = rest.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
  return { ...frontMatter, body }
}

/** Bodies are always normalized to `trimEnd()`; trailing whitespace isn't meaningful content. */
export function serializeTicketFile(ticket: Ticket): string {
  const { body, ...frontMatter } = ticket
  const frontMatterYaml = dump(frontMatter, { lineWidth: 100, sortKeys: false })
  const trimmedBody = body.trimEnd()
  const bodySection = trimmedBody.length > 0 ? `\n\n${trimmedBody}\n` : '\n'
  return `---\n${frontMatterYaml}---${bodySection}`
}
