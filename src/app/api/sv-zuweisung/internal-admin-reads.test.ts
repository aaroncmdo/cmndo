import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// AAR (06.07. E2E-Hunt): der interne Auto-Dispatch (Bearer CRON_SECRET, user-los) MUSS
// ueber den Admin-Client lesen. Sonst liefern die RLS-gegateten Reads (faelle_claim_bridge,
// sachverstaendige, ...) 0 Zeilen -> 404 -> nach SV-Ablehnung wird KEIN Ersatz-SV zugewiesen.
describe('sv-zuweisung: interner Pfad liest via Admin-Client (nicht RLS)', () => {
  const src = readFileSync('src/app/api/sv-zuweisung/route.ts', 'utf8')

  it('waehlt den Client nach isInternal (Admin fuer intern, RLS fuer Staff)', () => {
    expect(src).toMatch(/const db = isInternal \? createAdminClient\(\) : supabase/)
  })

  it('liest den Fall ueber db, nicht direkt ueber den RLS-Client supabase', () => {
    // Reads sind mehrzeilig formatiert (db\n.from) -> \s* zwischen db und .from.
    expect(src).toMatch(/db\s*\.from\('faelle_claim_bridge'\)/)
    // Kein Read mehr auf dem RLS-Client (nur supabase.auth im Staff-Pfad bleibt).
    expect(src).not.toMatch(/supabase\s*\.from\(/)
  })
})
