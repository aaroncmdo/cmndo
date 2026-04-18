'use server'

// AAR-162 / W2: Fallakte Stammdaten — Generic Inline-Edit-Action.
// Analog zu src/app/dispatch/leads/[id]/actions/stammdaten.ts (AAR-140 / W6):
// Allowlist-basierter Update-Endpoint, damit Consumer (InlineEditField) nicht
// einzeln 15 dedizierte Actions aufrufen müssen. Systemfelder + Status-Felder
// sind gesperrt — diese gehen über dedizierte Workflows (Webhooks, state-
// machine) nicht über diese Action.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { canEditField, type FallakteRolle } from '@/lib/fall/field-permissions'

/**
 * Allowlist der editierbaren Fall-Felder.
 *
 * WICHTIG: Diese Liste wurde gegen das echte faelle-Schema verifiziert
 * (information_schema.columns). Frühere Versionen enthielten zahlreiche
 * Felder die auf faelle gar nicht existieren (kunde_*, kernwert_*,
 * gegner_vorname/nachname, fin, hsn, tsn) — Saves wären serverseitig still
 * mit „column does not exist"-Fehler ausgestiegen.
 *
 * Kunde-Stammdaten leben auf profiles bzw. leads — das fall-Objekt liefert
 * sie via JOIN, Inline-Edit der Kunde-Felder läuft daher gegen profiles
 * (separater Endpoint, nicht hier).
 */
const FALL_EDITABLE_FIELDS = new Set<string>([
  // Fahrzeug (echte Spalten auf faelle)
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'fahrzeug_baujahr',
  'fahrzeug_farbe',
  'fahrzeug_typ',
  'kennzeichen',
  'fin_vin',
  'erstzulassung',
  'kilometerstand',
  // Halter (ZB1-OCR) — AAR-548 D7: halter_name ist GENERATED (nicht editierbar).
  'halter_vorname',
  'halter_nachname',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'halter_email',
  'halter_telefon',
  // Unfall
  'schadens_datum',
  'schadens_adresse',
  'schadens_plz',
  'schadens_ort',
  'schadens_ursache',
  'schadens_beschreibung',
  'schadenhergang',
  'schadenart',
  // Gegner / Versicherung
  'gegner_name',
  'gegner_kennzeichen',
  'gegner_versicherung',
  'gegner_versicherung_id',
  'gegner_fahrzeugtyp',
  'gegner_schadennummer',
  'gegner_versicherungsnummer',
  // Vorschäden
  'hat_vorschaeden',
  'vorschaden_anzahl',
  // Besichtigung (DB-verifiziert: Adresse + Lat/Lng/PlaceID + Datum)
  'besichtigungsort_adresse',
  'besichtigungsort_lat',
  'besichtigungsort_lng',
  'besichtigungsort_place_id',
  'besichtigung_datum',
  // Kernwerte (LexDrive-Webhook schreibt; Admin-Override)
  'reparaturkosten',
  'wiederbeschaffungswert',
  'restwert',
  'wertminderung',
  'schadenhoehe_netto',
  // VS-Status-Felder (AAR-161 W1 neu)
  'vs_kuerzung_grund',
  'geschlossen_grund',
  'nachbesichtigung_ergebnis',
  'kuerzungs_betrag',
  'regulierung_betrag',
  // Notizen
  'notizen',
  // AAR-313: Nutzungsausfall + Mietwagen-Kanzlei-Kommunikation
  'fahrzeug_fahrbereit',
  'mietwagen_flag',
  'nutzungsausfall',
  'mietwagen_kanzlei_informiert',
])

export async function updateFallField(
  fallId: string,
  field: string,
  value: unknown,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (!FALL_EDITABLE_FIELDS.has(field)) {
    return { success: false, error: `Feld "${field}" nicht in Allowlist` }
  }

  // Rollen-Check — sollte schon clientseitig gesperrt sein, Server ist die
  // Source of Truth.
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = (profile?.rolle as FallakteRolle | undefined) ?? 'kunde'

  const { data: fall } = await supabase
    .from('faelle')
    .select('status')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  if (!canEditField(rolle, field, fall.status)) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  // Null bei leerem String (explizites Löschen)
  const normalized = typeof value === 'string' && value.trim() === '' ? null : value

  const { error } = await supabase
    .from('faelle')
    .update({ [field]: normalized, updated_at: new Date().toISOString() })
    .eq('id', fallId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/admin/faelle/${fallId}`)
  return { success: true }
}
