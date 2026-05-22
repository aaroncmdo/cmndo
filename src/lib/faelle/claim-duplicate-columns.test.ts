// CMM-44 SP-H — Unit-Test fuer den Writer-Reroute-Vertrag (peelAuftraegeColumns).
//
// Die 2 zentralen Writer (state-machine.transitionFallStatus,
// lexdrive/process-event) routen ihre Updates durch peelAuftraegeColumns()
// VOR splitOrKeepFaelleUpdate(). Dieser Test sichert die Garantie ab, auf die
// sie sich verlassen: die 18 SP-H Auftrag-Lifecycle-Spalten werden sauber
// herausgepeelt und landen NIE im faelle- oder claims-Update.
//
// Reine Logik (kein DB) -> vitest. Die DB-Reader/Writer-Pfade selbst sind in
// scripts/smoke-cmm44-sph.mjs (Playwright-Smoke) abgedeckt.

import { describe, expect, it } from 'vitest'
import {
  AUFTRAEGE_OWNED_COLUMNS,
  CLAIM_OWNED_DUPLICATE_COLUMNS,
  peelAuftraegeColumns,
  splitOrKeepFaelleUpdate,
} from './claim-duplicate-columns'

// Die 18 SP-H-Spalten (Stand SP-H PR1/PR2). Aenderung hier MUSS bewusst sein.
const SPH_COLUMNS = [
  'filmcheck_ok',
  'filmcheck_am',
  'filmcheck_notizen',
  'storniert_am',
  'storno_grund',
  'storno_durch_user_id',
  'besichtigung_gestartet_am',
  'sv_briefing_text',
  'sv_briefing_generated_at',
  'sv_briefing_model',
  'sv_briefing_version',
  'sv_briefing_struktur',
  'sv_notizen_vor_ort',
  'technische_stellungnahme_status',
  'technische_stellungnahme_notiz_sv',
  'technische_stellungnahme_beauftragt_am',
  'technische_stellungnahme_hochgeladen_am',
  'technische_stellungnahme_freigabe_am',
] as const

describe('AUFTRAEGE_OWNED_COLUMNS', () => {
  it('contains exactly the 18 SP-H Auftrag-Lifecycle columns', () => {
    expect(AUFTRAEGE_OWNED_COLUMNS.size).toBe(18)
    for (const col of SPH_COLUMNS) {
      expect(AUFTRAEGE_OWNED_COLUMNS.has(col)).toBe(true)
    }
    // Keine ueberzaehligen Eintraege
    expect([...AUFTRAEGE_OWNED_COLUMNS].sort()).toEqual([...SPH_COLUMNS].sort())
  })

  it('is disjoint from CLAIM_OWNED_DUPLICATE_COLUMNS (kein Doppel-Routing)', () => {
    // Eine Spalte darf nie gleichzeitig auf claims UND auftraege geroutet werden.
    const overlap = [...AUFTRAEGE_OWNED_COLUMNS].filter((c) => CLAIM_OWNED_DUPLICATE_COLUMNS.has(c))
    expect(overlap).toEqual([])
  })
})

describe('peelAuftraegeColumns', () => {
  it('peels all SP-H columns into auftraegeUpdate and leaves non-SP-H in rest', () => {
    const update = {
      status: 'storniert',
      updated_at: '2026-05-22T10:00:00Z',
      storniert_am: '2026-05-22T10:00:00Z',
      storno_grund: 'Kunde abgesprungen',
      technische_stellungnahme_status: 'beauftragt',
    }
    const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)

    expect(auftraegeUpdate).toEqual({
      storniert_am: '2026-05-22T10:00:00Z',
      storno_grund: 'Kunde abgesprungen',
      technische_stellungnahme_status: 'beauftragt',
    })
    expect(rest).toEqual({
      status: 'storniert',
      updated_at: '2026-05-22T10:00:00Z',
    })
  })

  it('returns an empty auftraegeUpdate when no SP-H column is present', () => {
    const update = { status: 'abgeschlossen', abgeschlossen_am: '2026-05-22T10:00:00Z' }
    const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)
    expect(auftraegeUpdate).toEqual({})
    expect(rest).toEqual(update)
  })

  it('preserves falsy SP-H values (false / 0 / null) — not dropped as "absent"', () => {
    // filmcheck_ok=false, sv_briefing_version=0 sind gueltige Werte, keine "leer".
    const update = { filmcheck_ok: false, sv_briefing_version: 0, sv_briefing_text: null }
    const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)
    expect(auftraegeUpdate).toEqual({ filmcheck_ok: false, sv_briefing_version: 0, sv_briefing_text: null })
    expect(rest).toEqual({})
  })

  it('peels every one of the 18 SP-H columns', () => {
    const update: Record<string, unknown> = {}
    for (const col of SPH_COLUMNS) update[col] = `v_${col}`
    const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)
    expect(Object.keys(auftraegeUpdate).sort()).toEqual([...SPH_COLUMNS].sort())
    expect(rest).toEqual({})
  })
})

describe('central-writer invariant: peel BEFORE split → SP-H never reaches faelle/claims', () => {
  it('keeps SP-H columns out of both faelleUpdate and claimsUpdate (mit claim_id)', () => {
    // Reproduziert den state-machine/process-event-Pfad:
    // peelAuftraegeColumns(update) -> splitOrKeepFaelleUpdate(rest, claimId)
    const update = {
      status: 'storniert', // faelle-only
      status_changed_at: '2026-05-22T10:00:00Z', // claims-owned (CLAIM_OWNED_DUPLICATE_COLUMNS)
      storniert_am: '2026-05-22T10:00:00Z', // SP-H -> auftraege
      storno_grund: 'Test', // SP-H -> auftraege
    }
    const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)
    const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(rest, 'claim-123')

    // Keine SP-H-Spalte darf in faelle oder claims landen:
    for (const col of SPH_COLUMNS) {
      expect(faelleUpdate).not.toHaveProperty(col)
      expect(claimsUpdate).not.toHaveProperty(col)
    }
    // Aber sie sind im auftraegeUpdate erhalten:
    expect(auftraegeUpdate).toEqual({ storniert_am: '2026-05-22T10:00:00Z', storno_grund: 'Test' })
    // Und der Rest routet korrekt: status->faelle, status_changed_at->claims:
    expect(faelleUpdate).toEqual({ status: 'storniert' })
    expect(claimsUpdate).toEqual({ status_changed_at: '2026-05-22T10:00:00Z' })
  })

  it('also keeps SP-H out of faelle when claim_id is null (Legacy-Fallback)', () => {
    // Ohne claim_id faellt splitOrKeepFaelleUpdate auf "alles bleibt faelle" zurueck —
    // die SP-H-Spalten muessen trotzdem schon vorher gepeelt sein.
    const update = { status: 'storniert', storniert_am: '2026-05-22T10:00:00Z' }
    const { rest, auftraegeUpdate } = peelAuftraegeColumns(update)
    const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(rest, null)

    expect(faelleUpdate).toEqual({ status: 'storniert' })
    expect(faelleUpdate).not.toHaveProperty('storniert_am')
    expect(claimsUpdate).toEqual({})
    expect(auftraegeUpdate).toEqual({ storniert_am: '2026-05-22T10:00:00Z' })
  })
})
