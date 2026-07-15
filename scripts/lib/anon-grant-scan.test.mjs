import { describe, it, expect } from 'vitest'
import { rowsToKeys, diffBaseline, SEMANTIC_ALLOWLIST } from './anon-grant-scan.mjs'

describe('rowsToKeys', () => {
  it('mappt RPC-Zeilen auf sortierte table.column-Keys', () => {
    const rows = [
      { table_name: 'profiles', column_name: 'google_access_token' },
      { table_name: 'auftraege', column_name: 'sv_notizen_vor_ort' },
    ]
    expect(rowsToKeys(rows, [])).toEqual([
      'auftraege.sv_notizen_vor_ort',
      'profiles.google_access_token',
    ])
  })

  it('filtert SEMANTIC_ALLOWLIST-Eintraege (False-Positives) raus', () => {
    const rows = [
      { table_name: 'profiles', column_name: 'twilio_nummer_provisioned_am' },
      { table_name: 'linkedin_oauth_tokens', column_name: 'access_token' },
    ]
    expect(rowsToKeys(rows)).toEqual(['linkedin_oauth_tokens.access_token'])
  })

  it('Default-Allowlist enthaelt den twilio-Timestamp-FP', () => {
    expect(SEMANTIC_ALLOWLIST).toContain('profiles.twilio_nummer_provisioned_am')
  })
})

describe('diffBaseline', () => {
  it('added = neue Verletzer, removed = behobene (boy-scout)', () => {
    const d = diffBaseline(['a.x', 'c.z'], ['a.x', 'b.y'])
    expect(d.added).toEqual(['c.z'])
    expect(d.removed).toEqual(['b.y'])
  })

  it('kein neuer Verletzer -> added leer (Ratchet gruen)', () => {
    const d = diffBaseline(['a.x', 'b.y'], ['a.x', 'b.y'])
    expect(d.added).toEqual([])
  })

  it('neuer anon-Grant auf sensible Spalte -> added faengt ihn', () => {
    const d = diffBaseline(['a.x', 'neu.secret'], ['a.x'])
    expect(d.added).toEqual(['neu.secret'])
  })
})
