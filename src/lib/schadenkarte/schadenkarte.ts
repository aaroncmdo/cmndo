// Schadenkarte-Service: Mint, Binden, Resolve, Liste.
// Spiegelt src/app/admin/werkstaetten/qr-pool-actions.ts (Mint-Retry-Loop)
// und src/lib/flotte/konto-firma.ts (AnyDb-Pattern, kein typed .from()).
// schadenkarten ist noch NICHT in database.types.ts (Regel-2-Lag) ->
// AnyDb-Cast noetig.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSchadenkarteToken } from './token'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

const MAX_BATCH = 200

/**
 * Batch N Karten-Token fuer eine Firma anlegen (status='bestellt').
 * UNIQUE-Retry je Token (max 5 Versuche). Max 200 pro Batch.
 */
export async function mintSchadenkarten(
  db: AnyDb,
  params: { firmaId: string; anzahl: number; charge?: string | null },
): Promise<{ ok: true; tokens: string[] } | { ok: false; error: string }> {
  const n = Math.floor(Number(params.anzahl))
  if (!Number.isFinite(n) || n < 1 || n > MAX_BATCH) {
    return { ok: false, error: `Anzahl muss zwischen 1 und ${MAX_BATCH} liegen.` }
  }
  const chargeVal = params.charge?.trim() ?? null
  const tokens: string[] = []

  for (let i = 0; i < n; i++) {
    let inserted = false
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const token = generateSchadenkarteToken()
      const { error } = await db.from('schadenkarten').insert({
        karten_token: token,
        firma_id: params.firmaId,
        status: 'bestellt',
        charge: chargeVal,
      })
      if (!error) {
        tokens.push(token)
        inserted = true
      } else {
        const msg = (error.message ?? '').toLowerCase()
        // UNIQUE-Kollision auf karten_token -> neuer Token; anderer Fehler -> abbrechen.
        if (!msg.includes('duplicate') && !msg.includes('unique') && error.code !== '23505') {
          return { ok: false, error: error.message }
        }
      }
    }
    if (!inserted) {
      return { ok: false, error: 'Token-Generierung fehlgeschlagen (zu viele Kollisionen).' }
    }
  }

  return { ok: true, tokens }
}

/**
 * Freie oder bestellte Karte an ein Fahrzeug binden (status -> 'gebunden').
 * Nur Karten der eigenen Firma UND nur Fahrzeuge der eigenen Firma.
 * Optimistic-Guard auf .eq('status', alterStatus).
 */
export async function bindeSchadenkarteAnFahrzeug(
  db: AnyDb,
  params: { token: string; fahrzeugId: string; firmaId: string; userId: string },
): Promise<{ ok: boolean; error?: string }> {
  // 0) Fahrzeug-Ownership-Gate (flotten_fahrzeuge = N:M Firma<->Fahrzeug). Server-Actions
  //    sind aufrufbare Endpoints -- ohne dieses Gate koennte ein FM seine Karte per direktem
  //    Call an eine fremde vehicle-UUID binden und /schaden/[token] zeigte fremde
  //    Fahrzeugdaten. Kanonisch HIER statt in jedem Caller (vorher hatten 2 von 3 das Gate nicht).
  const { data: owner } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', params.firmaId)
    .eq('vehicle_id', params.fahrzeugId)
    .maybeSingle()
  if (!owner) return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }

  // 1) Karte holen
  const { data: karte } = await db
    .from('schadenkarten')
    .select('id, status, firma_id')
    .eq('karten_token', params.token)
    .maybeSingle()

  const row = karte as { id: string; status: string; firma_id: string } | null

  if (!row) return { ok: false, error: 'Karte nicht gefunden.' }
  if (row.firma_id !== params.firmaId) {
    return { ok: false, error: 'Karte gehört zu einer anderen Firma.' }
  }
  if (row.status !== 'bestellt' && row.status !== 'frei') {
    return { ok: false, error: 'Karte ist bereits gebunden oder gesperrt.' }
  }

  // 2) Optimistic update mit Status-Guard (verhindert Race + partial-unique Verletzung)
  const { data: updated, error } = await db
    .from('schadenkarten')
    .update({
      status: 'gebunden',
      fahrzeug_id: params.fahrzeugId,
      gebunden_am: new Date().toISOString(),
      gebunden_von: params.userId,
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id')
    .maybeSingle()

  if (error) {
    // UNIQUE(fahrzeug_id) WHERE status='gebunden' -> dieses Fahrzeug hat bereits eine aktive Karte
    if (error.code === '23505') {
      return { ok: false, error: 'Dieses Fahrzeug hat bereits eine aktive Karte.' }
    }
    return { ok: false, error: error.message }
  }
  if (!updated) {
    return { ok: false, error: 'Karte wurde zwischenzeitlich geaendert.' }
  }

  return { ok: true }
}

/**
 * Reverse-Lookup Token -> Fahrzeug (fuer: welches Fahrzeug ist diese Karte?).
 * Gibt null zurueck wenn der Token unbekannt ist.
 */
export async function resolveSchadenkarteToFahrzeug(
  db: AnyDb,
  token: string,
): Promise<{ fahrzeugId: string | null; firmaId: string | null; status: string } | null> {
  const { data } = await db
    .from('schadenkarten')
    .select('fahrzeug_id, firma_id, status')
    .eq('karten_token', token)
    .maybeSingle()

  if (!data) return null

  const row = data as { fahrzeug_id: string | null; firma_id: string | null; status: string }
  return {
    fahrzeugId: row.fahrzeug_id,
    firmaId: row.firma_id,
    status: row.status,
  }
}

/**
 * Vehicle-IDs, die bereits eine gebundene Karte haben (fuer: nur ungebundene
 * Fahrzeuge zum Binden anbieten). Firma-scoped.
 */
export async function getGebundeneFahrzeugIds(db: AnyDb, firmaId: string): Promise<Set<string>> {
  const { data } = await db
    .from('schadenkarten')
    .select('fahrzeug_id')
    .eq('firma_id', firmaId)
    .eq('status', 'gebunden')
    .not('fahrzeug_id', 'is', null)

  const ids = new Set<string>()
  for (const row of (data ?? []) as Array<{ fahrzeug_id: string | null }>) {
    if (row.fahrzeug_id) ids.add(row.fahrzeug_id)
  }
  return ids
}

/**
 * Alle Karten einer Firma (fuer die Karten-Liste).
 */
export async function getKartenFuerFirma(
  db: AnyDb,
  firmaId: string,
  opts?: { nurGebunden?: boolean },
): Promise<Array<{ id: string; token: string; status: string; fahrzeugId: string | null; nfcUid: string | null }>> {
  let query = db
    .from('schadenkarten')
    .select('id, karten_token, status, fahrzeug_id, nfc_uid')
    .eq('firma_id', firmaId)
  // Flotten-Ansichten zeigen nur real gebundene Karten (Admin ohne Param = alle Status).
  if (opts?.nurGebunden) query = query.eq('status', 'gebunden')
  const { data } = await query.order('erstellt_am', { ascending: false })

  if (!data) return []

  return (
    data as Array<{
      id: string
      karten_token: string
      status: string
      fahrzeug_id: string | null
      nfc_uid: string | null
    }>
  ).map((row) => ({
    id: row.id,
    token: row.karten_token,
    status: row.status,
    fahrzeugId: row.fahrzeug_id,
    nfcUid: row.nfc_uid,
  }))
}

// ─── Lebenszyklus: sperren · entsperren · entbinden ─────────────────────────
//
// Der Gegner-Flow oeffnet NUR bei status='gebunden' (lib/schadenkarte/gegner-flow.ts).
// Ein Statuswechsel weg von 'gebunden' toetet den Token daher SOFORT -- das ist das
// gesamte Sicherheitsfundament fuer "Karte verloren".

type KarteRow = { id: string; status: string; firma_id: string; fahrzeug_id: string | null }

/** Laedt die Karte und prueft die Firma-Zugehoerigkeit. Muster wie bindeSchadenkarteAnFahrzeug. */
async function ladeKarteFuerFirma(
  db: AnyDb,
  token: string,
  firmaId: string,
): Promise<KarteRow | { error: string }> {
  const { data } = await db
    .from('schadenkarten')
    .select('id, status, firma_id, fahrzeug_id')
    .eq('karten_token', token)
    .maybeSingle()

  const row = data as KarteRow | null
  if (!row) return { error: 'Karte nicht gefunden.' }
  if (row.firma_id !== firmaId) return { error: 'Karte gehört zu einer anderen Firma.' }
  return row
}

/** Setzt den Status mit Optimistic-Guard auf den Ausgangsstatus (Race-Schutz). */
async function setzeStatus(
  db: AnyDb,
  row: KarteRow,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('schadenkarten')
    .update(patch)
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Karte wurde zwischenzeitlich geändert.' }
  return { ok: true }
}

/**
 * Karte sperren (verloren/gestohlen). Der Token ist danach SOFORT tot.
 *
 * fahrzeug_id bleibt bewusst stehen (Historie: "diese Karte sass auf Fahrzeug X").
 * Der Partial-Unique greift nur WHERE status='gebunden' -> das Fahrzeug kann sofort eine
 * Ersatzkarte bekommen, ohne dass wir die Historie verlieren.
 *
 * IDEMPOTENT: eine bereits gesperrte Karte erneut zu sperren liefert ok:true. Das ist der
 * Notfall-Pfad -- er muss Doppelklick und Retry ueberstehen, statt einen Fehler zu werfen.
 */
export async function sperreSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }
  if (row.status === 'gesperrt') return { ok: true } // idempotent
  return setzeStatus(db, row, { status: 'gesperrt' })
}

/**
 * Karte entsperren -> 'frei', NICHT zurueck auf 'gebunden'.
 *
 * Grund: das Fahrzeug hat inzwischen evtl. eine Ersatzkarte. Ein automatisches
 * Zurueck-auf-gebunden wuerde entweder den Partial-Unique verletzen oder zwei gueltige
 * Karten fuer ein Fahrzeug erzeugen. Die wiedergefundene Karte muss BEWUSST neu gebunden
 * werden.
 */
export async function entsperreSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }
  if (row.status !== 'gesperrt') return { ok: false, error: 'Karte ist nicht gesperrt.' }
  return setzeStatus(db, row, {
    status: 'frei',
    fahrzeug_id: null,
    gebunden_am: null,
    gebunden_von: null,
  })
}

/** Karte vom Fahrzeug loesen (Fahrzeug verkauft / Karte umziehen) -> 'frei'. */
export async function entbindeSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }
  if (row.status !== 'gebunden') return { ok: false, error: 'Karte ist nicht gebunden.' }
  return setzeStatus(db, row, {
    status: 'frei',
    fahrzeug_id: null,
    gebunden_am: null,
    gebunden_von: null,
  })
}

/**
 * Chip-Seriennummer an der Karte vermerken (nach erfolgreichem + VERIFIZIERTEM Beschreiben).
 *
 * Zweck: Nachweis "dieser Token sitzt auf diesem physischen Chip" + die Ops-Frage
 * "welche Karten sind noch nicht beschrieben?" (nfc_uid IS NULL).
 *
 * ⚠ KEIN Anti-Clone-Merkmal: beim Antippen uebergibt das Betriebssystem nur die URL,
 * nicht die Chip-UID -- eine Klon-Erkennung zur Tap-Zeit ist mit einem reinen URI-Tag
 * technisch nicht moeglich. Die Spalte ist Inventar, nicht Sicherheit.
 *
 * Bewusst OHNE Status-Guard: das Beschreiben ist unabhaengig davon, ob die Karte gerade
 * bestellt/frei/gebunden ist.
 */
export async function speichereNfcUid(
  db: AnyDb,
  params: { token: string; firmaId: string; nfcUid: string },
): Promise<{ ok: boolean; error?: string }> {
  const row = await ladeKarteFuerFirma(db, params.token, params.firmaId)
  if ('error' in row) return { ok: false, error: row.error }

  // firma_id wird BEIM UPDATE erneut geprueft, nicht nur beim Lesen: schliesst die
  // TOCTOU-Luecke zwischen ladeKarteFuerFirma und dem Write.
  const { data, error } = await db
    .from('schadenkarten')
    .update({ nfc_uid: params.nfcUid })
    .eq('id', row.id)
    .eq('firma_id', params.firmaId)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  // Matcht der firma_id-Guard beim Write keine Zeile (genau die TOCTOU-Luecke von oben --
  // z.B. firma_id wurde zwischen Read und Write per ON DELETE SET NULL auf NULL gesetzt),
  // liefert PostgREST data: null, error: null. Ohne diesen Check waere das faelschlich
  // ok:true, obwohl nichts geschrieben wurde (analog setzeStatus oben).
  if (!data) return { ok: false, error: 'Karte wurde zwischenzeitlich geändert.' }
  return { ok: true }
}

/**
 * Finalisiert eine frisch beschriebene Karte in EINEM Aufruf für beide Portale:
 * Chip-UID vermerken (falls gelesen) + optional ans Fahrzeug binden.
 * uid zuerst, dann bind -- schlägt der Bind fehl, ist die Karte trotzdem als beschrieben
 * markiert (der Nutzer wiederholt nur die Bindung).
 */
export async function finalisiereSchadenkarte(
  db: AnyDb,
  params: { token: string; firmaId: string; userId: string; nfcUid: string | null; fahrzeugId: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (params.nfcUid) {
    const uidRes = await speichereNfcUid(db, {
      token: params.token,
      firmaId: params.firmaId,
      nfcUid: params.nfcUid,
    })
    if (!uidRes.ok) return uidRes
  }
  if (params.fahrzeugId) {
    const bindRes = await bindeSchadenkarteAnFahrzeug(db, {
      token: params.token,
      fahrzeugId: params.fahrzeugId,
      firmaId: params.firmaId,
      userId: params.userId,
    })
    if (!bindRes.ok) return bindRes
  }
  return { ok: true }
}
