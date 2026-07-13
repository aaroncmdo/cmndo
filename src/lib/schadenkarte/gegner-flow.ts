// Public token resolver for the opponent accident-report flow (/schaden/{karten_token}).
// No auth required: possession of the NFC card token IS the authorization.
// Use the service-role admin client — anon has no RLS access to schadenkarten/vehicles/firmen.
// Imported by the /schaden/[token] page server component.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSchadenkarteToFahrzeug } from '@/lib/schadenkarte/schadenkarte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** The "our side" context pre-filled for the opponent before they enter their data. */
export type SchadenTokenContext = {
  fahrzeugId: string
  firmaId: string
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  firmaName: string | null
}

export type ResolveSchadenTokenResult =
  | { ok: true; context: SchadenTokenContext }
  | { ok: false; reason: 'nicht_gefunden' | 'nicht_gebunden' | 'kein_fahrzeug' }

/**
 * Resolves a karten_token to the fleet-vehicle + firma context.
 * Returns ok:false with a typed reason on every failure path; never throws.
 *
 * Caller is responsible for passing a service-role db client
 * (anon client has no RLS access to the underlying tables).
 */
export async function resolveSchadenTokenContext(
  db: AnyDb,
  token: string,
): Promise<ResolveSchadenTokenResult> {
  // Step 1: reverse-lookup token -> karte row
  const karte = await resolveSchadenkarteToFahrzeug(db, token)
  if (karte === null) {
    return { ok: false, reason: 'nicht_gefunden' }
  }

  // Step 2: card must be in 'gebunden' state (frei/bestellt/gesperrt must not open the flow)
  if (karte.status !== 'gebunden') {
    return { ok: false, reason: 'nicht_gebunden' }
  }

  // Step 3: bound card must reference a vehicle + firma
  if (!karte.fahrzeugId || !karte.firmaId) {
    return { ok: false, reason: 'kein_fahrzeug' }
  }

  // Step 4: load vehicle columns (columns confirmed via getKundeFlotte in firma-flotte.ts)
  const { data: veh } = await db
    .from('vehicles')
    .select('kennzeichen_aktuell,hersteller,modell_haupttyp')
    .eq('id', karte.fahrzeugId)
    .maybeSingle()

  const v = veh as { kennzeichen_aktuell: string | null; hersteller: string | null; modell_haupttyp: string | null } | null

  // Step 5: load firma name
  const { data: firma } = await db.from('firmen').select('name').eq('id', karte.firmaId).maybeSingle()

  const f = firma as { name: string | null } | null

  // Step 6: return fully-typed context (null-safe on every optional field)
  return {
    ok: true,
    context: {
      fahrzeugId: karte.fahrzeugId,
      firmaId: karte.firmaId,
      kennzeichen: v?.kennzeichen_aktuell ?? null,
      hersteller: v?.hersteller ?? null,
      modell: v?.modell_haupttyp ?? null,
      firmaName: f?.name ?? null,
    },
  }
}
