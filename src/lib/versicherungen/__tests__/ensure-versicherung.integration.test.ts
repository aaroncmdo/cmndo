import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ensureVersicherung } from '@/lib/versicherungen/ensure-versicherung'

// GEGATET (s. ensure-firma.integration.test.ts): createClient erst in beforeAll.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!URL && !!KEY
const d = RUN ? describe : describe.skip

d('ensureVersicherung (DB)', () => {
  let db: SupabaseClient
  beforeAll(() => {
    db = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  })
  it('matcht Bestands-Registry semantisch (normalized_name)', async () => {
    // Bestand: eine reale Registry-Versicherung lesen, in abweichender Schreibweise resolven
    const { data } = await db.from('versicherungen').select('name').not('name','is',null).limit(1).single()
    const r = await ensureVersicherung({ db, klartext: (data!.name as string).toUpperCase().replace(/\s+/g, '  ') })
    expect(r.ok).toBe(true)
    expect(r.ok && r.created).toBe(false) // gematcht, nicht neu angelegt
  })
})
