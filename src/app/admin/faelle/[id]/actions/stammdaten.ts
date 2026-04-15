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
 * Allowlist der editierbaren Fall-Felder. Muss synchron zu den Stammdaten-
 * Sections im UebersichtTab bleiben. Status-Transitions, Termine und
 * Regulierung gehen über eigene Actions (siehe actions/termine.ts etc.).
 */
const FALL_EDITABLE_FIELDS = new Set<string>([
  // Kunde — wird primär über den Lead gespiegelt, hier als Override möglich
  'kunde_vorname',
  'kunde_nachname',
  'kunde_email',
  'kunde_telefon',
  // Fahrzeug
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'fahrzeug_baujahr',
  'fahrzeug_farbe',
  'kennzeichen',
  'fin',
  'hsn',
  'tsn',
  'erstzulassung',
  'kilometerstand',
  // Halter (ZB1-OCR)
  'halter_vorname',
  'halter_nachname',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  // Unfall
  'schadens_datum',
  'schadens_adresse',
  'schadens_plz',
  'schadens_ort',
  'schadens_ursache',
  'schadens_beschreibung',
  'unfall_uhrzeit',
  // Gegner / Versicherung
  'gegner_vorname',
  'gegner_nachname',
  'gegner_kennzeichen',
  'gegner_versicherung',
  'gegner_schadennummer',
  'versicherung_name',
  'versicherung_schaden_nr',
  'versicherung_id',
  // Vorschäden
  'hat_vorschaeden',
  'vorschaeden_beschreibung',
  // Besichtigung
  'besichtigungsort_adresse',
  'besichtigungsort_plz',
  'besichtigungsort_stadt',
  'fahrzeug_standort_adresse',
  'fahrzeug_standort_plz',
  // Kernwerte — Kanzlei/LexDrive schreibt per Webhook, Admin-Override möglich
  'kernwert_reparaturkosten',
  'kernwert_wiederbeschaffungswert',
  'kernwert_nutzungsausfall',
  'kernwert_restwert',
  'kernwert_mietwagen',
  // VS-Status-Felder (AAR-161 neu)
  'vs_kuerzung_grund',
  'geschlossen_grund',
  'nachbesichtigung_ergebnis',
  'kuerzungs_betrag',
  'regulierung_betrag',
  // Notizen
  'notizen',
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
