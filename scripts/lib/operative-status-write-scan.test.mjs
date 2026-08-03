import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './operative-status-write-scan.mjs'

describe('scanContent (FG1: direkte claims.operative_status-Writes)', () => {
  it('flaggt inline .from("claims").update({ operative_status: ... })', () => {
    const v = scanContent(`await db.from('claims').update({ operative_status: 'abgeschlossen', abgeschlossen_am: now }).eq('id', id)`)
    expect(v).toHaveLength(1)
    expect(v[0].form).toBe('inline')
  })

  it('flaggt traced-object: const payload = {...op...}; .from("claims").update(payload)', () => {
    const src = `
      const claimUpdate = { sv_id: x, operative_status: 'sv-zugewiesen' }
      await admin.from('claims').update(claimUpdate).eq('id', claimId)
    `
    const v = scanContent(src)
    expect(v).toHaveLength(1)
    expect(v[0].form).toBe('traced-object')
  })

  it('flaggt traced-assign: payload.operative_status = ...; .from("claims").update(payload) (Engine-Muster)', () => {
    const src = `
      const claimsUpdate = { updated_at: now }
      claimsUpdate.operative_status = resolveCursorOperativeStatus(newStatus, cur)
      await db.from('claims').update(claimsUpdate).eq('id', claimId)
    `
    const v = scanContent(src)
    expect(v).toHaveLength(1)
    expect(v[0].form).toBe('traced-assign')
  })

  it('flaggt traced-assign in CAST-Form: (payload as Record<...>).operative_status = ... (C1a / A2-#6 sv-zuweisung)', () => {
    const src = `
      const claimsUpd = { sv_zugewiesen_am: now }
      ;(claimsUpd as Record<string, unknown>).operative_status = orgPool ? 'sv-gesucht' : 'sv-zugewiesen'
      await adminDb.from('claims').update(claimsUpd).eq('id', fallClaimId)
    `
    const v = scanContent(src)
    expect(v).toHaveLength(1)
    expect(v[0].form).toBe('traced-assign')
  })

  it('flaggt mehrzeiliges inline-Objekt (verschachtelt) korrekt', () => {
    const src = `await db.from('claims').update({
      kanzlei_uebergeben_am: now,
      operative_status: 'an_externe_kanzlei_uebergeben',
      meta: { via: 'x' },
    }).eq('id', id)`
    expect(scanContent(src)).toHaveLength(1)
  })

  // ── Negative (0 False-Positives) ──────────────────────────────────────────

  it('flaggt NICHT einen reinen Read (.from("claims").select)', () => {
    expect(scanContent(`const { data } = await db.from('claims').select('operative_status').eq('id', id)`)).toHaveLength(0)
  })

  it('flaggt NICHT eine Read-Mapping-Objektliteral OHNE claims.update (der reparatur-abschluss:53-Fall)', () => {
    const src = `
      const { data: claim } = await db.from('claims').select('operative_status').eq('id', id).maybeSingle()
      if (!istReparaturClaimAbschliessbar({ operative_status: claim.operative_status }, { status: t })) return
    `
    expect(scanContent(src)).toHaveLength(0)
  })

  it('flaggt NICHT .update({...}) auf claims OHNE operative_status', () => {
    expect(scanContent(`await db.from('claims').update({ sv_id: x, updated_at: now }).eq('id', id)`)).toHaveLength(0)
  })

  it('flaggt NICHT .insert({ operative_status }) (initialer Cursor bei Anlage ist legitim)', () => {
    expect(scanContent(`await db.from('claims').insert({ operative_status: 'ersterfassung', lead_id: l })`)).toHaveLength(0)
  })

  it('flaggt NICHT eine Typ-Annotation operative_status: string | null', () => {
    const src = `type ClaimRow = { id: string; operative_status: string | null }`
    expect(scanContent(src)).toHaveLength(0)
  })

  it('flaggt NICHT einen Write auf eine ANDERE Tabelle (Anker ist claims)', () => {
    expect(scanContent(`await db.from('leads').update({ operative_status: 'x' }).eq('id', id)`)).toHaveLength(0)
  })

  it('flaggt NICHT wenn operative_status nur in einem Kommentar steht', () => {
    const src = `
      // setze operative_status: 'abgeschlossen' — TODO
      await db.from('claims').update({ updated_at: now }).eq('id', id)
    `
    expect(scanContent(src)).toHaveLength(0)
  })

  it('flaggt NICHT eq/neq-Filter auf operative_status (Read-Achse)', () => {
    expect(scanContent(`db.from('claims').select('id').neq('operative_status', 'abgeschlossen')`)).toHaveLength(0)
  })
})

describe('diffBaseline', () => {
  it('added = neue, removed = behobene', () => {
    const d = diffBaseline(['b.ts', 'c.ts'], ['a.ts', 'b.ts'])
    expect(d.added).toEqual(['c.ts'])
    expect(d.removed).toEqual(['a.ts'])
  })
})
