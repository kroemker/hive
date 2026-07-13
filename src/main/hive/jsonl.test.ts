import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendJsonl, readJsonl } from './jsonl'

interface Entry {
  n: number
}

describe('jsonl', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hive-jsonl-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty array when the file does not exist yet', async () => {
    expect(await readJsonl(join(dir, 'missing.jsonl'))).toEqual([])
  })

  it('round-trips appended entries in order, creating parent directories', async () => {
    const filePath = join(dir, 'nested', 'entries.jsonl')
    await appendJsonl<Entry>(filePath, { n: 1 })
    await appendJsonl<Entry>(filePath, { n: 2 })
    await appendJsonl<Entry>(filePath, { n: 3 })

    expect(await readJsonl<Entry>(filePath)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('skips blank lines', async () => {
    const filePath = join(dir, 'entries.jsonl')
    await appendJsonl<Entry>(filePath, { n: 1 })
    await appendJsonl<Entry>(filePath, { n: 2 })

    expect(await readJsonl<Entry>(filePath)).toHaveLength(2)
  })
})
