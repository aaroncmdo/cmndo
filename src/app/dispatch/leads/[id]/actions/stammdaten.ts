'use server'

// AAR-143: Stammdaten-Inline-Edit extrahiert aus actions.ts (AAR-140 / W6).
// Allowlist verhindert dass User über dieses Endpoint kritische Felder wie
// qualifizierungs_phase / status / disqualifikations_grund_key manipulieren —
// diese gehen ausschließlich über die jeweiligen dedizierten Actions.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STAMMDATEN_ALLOWED_FIELDS = new Set([
  // Kunde
  'vorname', 'nachname', 'telefon', 'email',
  // Fahrzeug
  'kennzeichen', 'fahrzeug_hersteller', 'fahrzeug_modell',
  // AAR-181: Baujahr ist Pflichtfeld in Phase 4, muss in der Allowlist sein
  'fahrzeug_baujahr', 'erstzulassung',
  // AAR-347: OCR-Fallback — FIN/HSN/TSN manuell im Dispatch eintragbar,
  // wenn der ZB1-Upload fehlschlägt oder der Kunde keinen Schein hat.
  'fin', 'hsn', 'tsn',
  'hat_vorschaeden', 'vorschaeden_beschreibung',
  'finanzierung_leasing', 'vorsteuerabzugsberechtigt',
  // Gegner + Unfall
  'gegner_bekannt', 'gegner_kennzeichen', 'gegner_versicherung',
  // AAR-265: FK auf versicherungen-Stammdaten (Autocomplete in Phase 4)
  'gegner_versicherung_id',
  'gegner_schadennummer', 'unfalldatum', 'unfall_uhrzeit',
  // AAR-264: Wunschtermin in Phase 2 — wird auch fürs SV-Matching genutzt
  'wunschtermin',
  // AAR-270: Wochentag-Präferenz für SV-Slot-Filter (ISO 1=Mo..7=So)
  'wunschtermin_wochentage',
  'unfallort', 'unfallort_lat', 'unfallort_lng', 'unfallort_kategorie',
  // AAR-135 Auto-Flags (von gegner-kz-flags.ts berechnet)
  'fahrerflucht', 'auslandskennzeichen',
  // Zeugen
  'zeugen',
  // AAR-298: Zeugen-Kontaktdaten (JSONB-Array von {name, telefon, email?, notiz?})
  'zeugen_kontakte',
  // AAR-305: Werkstatt-seit-wann (Date)
  'werkstatt_seit_datum',
  // AAR-176 / AAR-179 Audit-Fix #4: sv_treffpunkt wird aktuell nur in Phase 2
  // via saveHardGate gesetzt. Admins brauchen die Möglichkeit den Treffpunkt
  // später auch inline zu editieren — daher auch hier zulassen.
  'sv_treffpunkt',
  // AAR-182 Audit-Fix #2: zb1_status damit „Nein — manuell eintragen" in
  // Zb1UploadCard persistiert werden kann (Wert 'abgelehnt').
  'zb1_status',
  // AAR-263: polizeibericht_status für „Nein — Kunde reicht später nach"
  'polizeibericht_status',
  // AAR-318 Teil D: Halter-Editierung in Phase 4 — alle Felder + Geburtsdatum
  'halter_vorname',
  'halter_nachname',
  'halter_geburtsdatum',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  // AAR-318: Flag „Halter = Kunde" — wenn true werden die Halter-Felder aus
  // den Kundendaten übernommen (Client-side beim Toggeln, persistiert hier)
  'ist_fahrzeughalter',
  // AAR-314: Tracking Anfrage beim Deutschen Büro Grüne Karte (Auslands-KZ)
  'gegner_versicherung_anfrage_datum',
  // AAR-316: Kundensprache für FlowLink/Portal-Übersetzungen (de/tr/ar/ru/pl/en/other)
  'sprache',
  // AAR-305: Schadenshergang-Pflicht bei fahrbereitem Fahrzeug (Banner in Phase 4)
  'schadens_hergang',
])

export async function saveStammdaten(
  leadId: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; ignored?: string[] }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const allowed: Record<string, unknown> = {}
  const ignored: string[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (STAMMDATEN_ALLOWED_FIELDS.has(key)) {
      allowed[key] = value
    } else {
      ignored.push(key)
    }
  }

  if (Object.keys(allowed).length === 0) {
    return { success: false, error: 'Keine erlaubten Felder im Update', ignored }
  }

  allowed.updated_at = new Date().toISOString()
  const { error } = await supabase.from('leads').update(allowed).eq('id', leadId)
  if (error) return { success: false, error: error.message, ignored }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, ignored: ignored.length ? ignored : undefined }
}
