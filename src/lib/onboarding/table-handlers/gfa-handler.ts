import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingFeld } from '@/components/onboarding/types'
import type { OnboardingTableHandler } from './types'

const GFA_TABLE = 'gutachter_finder_anfragen'

async function getClientIpHash(): Promise<string | null> {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  const realIp = h.get('x-real-ip')
  const raw = xff?.split(',')[0]?.trim() || realIp?.trim() || null
  if (!raw) return null
  return createHash('sha256').update(raw).digest('hex')
}

// Baut die gfa-Updates aus felder. gfa ist die anon-Front-Staging-Tabelle (config-getrieben; die
// alte ALLOWED_TABLES war die einzige Grenze -> KEINE harte Per-Spalte-Allowlist, low-sensitivity).
// checkbox -> TIMESTAMPTZ (true=now, false=null). signature(>100 Zeichen) setzt zusaetzlich
// sa_unterzeichnet_am, damit konvertiere-anfrage-zu-fall (Pflicht-Check) nicht blockt
// (sonst landen alle GFAs auf status='entwurf').
function buildGfaUpdates(
  felder: OnboardingFeld[],
  values: Record<string, unknown>,
  now: () => string,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const feld of felder) {
    const spalte = feld.db_target?.spalte
    if (!spalte) continue
    if (!(feld.feld_key in values)) continue
    let val = values[feld.feld_key]
    if (val === undefined) continue
    if (feld.typ === 'checkbox') val = val === true ? now() : null
    updates[spalte] = val
    if (feld.typ === 'signature' && typeof val === 'string' && val.length > 100) {
      updates['sa_unterzeichnet_am'] = now()
    }
  }
  return updates
}

// gutachter-finden / werkstatt-finden (anon-Front): Shell-Insert (mit Rate-Limit) wenn keine
// anfrageId, sonst Update mit Existenz-Check.
//
// SERVICE-ROLE statt anon-Client (wie insertAnfrage / embed/actions.ts): der PII-Leak-Fix
// (Mig 20260716200848) entzog anon das SELECT-Grant auf gfa. Ohne SELECT kann der anon-Client die
// Tabelle nicht mehr LESEN — und jeder Insert-RETURNING (.select('id')) UND jeder Update
// (.eq('id') + RLS-USING lesen source/status der Zeile) endet in "permission denied for table
// gutachter_finder_anfragen" (42501). Ergebnis: der oeffentliche Finder-Funnel nahm seit 16.07.
// KEINE anonymen Anfragen mehr an. Statt anon SELECT wieder zu granten (= PII-Leak zurueck) laeuft
// der Schreibpfad server-seitig; die Sicherheit der anon-Write-RLS-Policies wird explizit als
// WHERE-Guard repliziert (INSERT: source bleibt NULL; UPDATE: nur eigene anonyme Entwuerfe).
export const gfaHandler: OnboardingTableHandler = {
  tabelle: GFA_TABLE,
  async apply(ctx, felder, values, now) {
    const updates = buildGfaUpdates(felder, values, now)
    // Keine gfa-Werte in dieser Phase -> kein Insert/Update (1:1 zur alten size===0-Frueh-Rueckgabe).
    if (Object.keys(updates).length === 0) return { ok: true, id: ctx.anfrageId ?? '' }

    const supabase = createAdminClient()
    const id = ctx.anfrageId ?? null

    if (!id) {
      // AAR-915: Rate-Limit fuer anonyme Neu-Anfragen (max 5 / 1h pro IP). Nur beim INSERT —
      // der UPDATE-Pfad (Wizard-Weiterklicken) bleibt unbegrenzt.
      const ipHash = await getClientIpHash()
      if (ipHash) {
        const { data: allowed, error: rlErr } = await supabase.rpc('check_gfa_rate_limit', {
          p_ip_hash: ipHash,
        })
        if (rlErr) {
          console.error('[gfa-rate-limit] rpc failed', rlErr.message)
          // Fail-open bei RPC-Fehler — Verfuegbarkeit > Rate-Limit-Strenge
        } else if (allowed === false) {
          return {
            ok: false,
            error: 'Zu viele Anfragen von dieser Verbindung. Bitte spaeter erneut versuchen.',
            reason: 'rate_limited',
          }
        }
      }
      // Shell-Datensatz: vorname/nachname/email NOT NULL -> leere Platzhalter; status='entwurf'.
      // source bleibt NULL (nativer Finder) — repliziert die anon-INSERT-RLS-with_check (source IS NULL).
      const payload = { vorname: '', nachname: '', email: '', schadentyp: 'unbekannt', status: 'entwurf', ...updates }
      const { data, error } = await supabase.from(GFA_TABLE).insert(payload).select('id').single()
      if (error || !data) return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }
      return { ok: true, id: (data as { id: string }).id }
    }

    // Sicherheits-Guard = anon-UPDATE-RLS-Policy: nur anonyme Entwuerfe (source IS NULL AND
    // status='entwurf') sind editierbar — ein fremder/konvertierter Datensatz (selbst bei geratener
    // id) bleibt unberuehrt. AAR-890: .select('id') erkennt weiterhin die nicht-(mehr)-editierbare
    // Zeile (0 Rows -> anfrage_not_found), z.B. nach slot-ttl-cleanup oder Status-Wechsel.
    const { data, error } = await supabase
      .from(GFA_TABLE)
      .update(updates)
      .eq('id', id)
      .is('source', null)
      .eq('status', 'entwurf')
      .select('id')
    if (error) return { ok: false, error: error.message }
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, error: 'Anfrage nicht gefunden', reason: 'anfrage_not_found' }
    }
    return { ok: true, id }
  },
}
