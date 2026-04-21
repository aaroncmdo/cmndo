'use server'

// AAR-143: Stammdaten-Inline-Edit extrahiert aus actions.ts (AAR-140 / W6).
// Allowlist verhindert dass User über dieses Endpoint kritische Felder wie
// qualifizierungs_phase / status / disqualifiziert_grund_key manipulieren —
// diese gehen ausschließlich über die jeweiligen dedizierten Actions.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STAMMDATEN_ALLOWED_FIELDS = new Set([
  // Kunde — Kontakt + Adresse + Notiz
  'vorname', 'nachname', 'telefon', 'email',
  'kunde_plz', 'kunde_strasse', 'kunde_stadt',
  'notiz',
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
  // AAR-176 / AAR-581 (N4): Besichtigungsort wird primär in Phase 2 via
  // saveHardGate gesetzt. Admins dürfen später auch inline via Stammdaten
  // editieren — alle 4 strukturierten Felder zulassen.
  'besichtigungsort_adresse',
  'besichtigungsort_lat',
  'besichtigungsort_lng',
  'besichtigungsort_place_id',
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
  // AAR-unfallfotos: Schadenbeschreibung (was am Auto kaputt ist) — manuell
  // editierbar und durch Haiku-Vision aus den Unfallfotos gefüllt.
  'sachschaden_beschreibung',
])

export async function saveStammdaten(
  leadId: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; ignored?: string[]; fallId?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-631: Nach SA-Unterschrift ist der Fall die Source-of-Truth — Lead-Edit
  // an gemeinsamen Feldern würde Drift erzeugen (Lead bleibt als Snapshot,
  // Fall ist live). Daher: nach Conversion keine Lead-Stammdaten-Edits mehr
  // über diesen Endpoint. Der Dispatcher soll über die Fallakte editieren.
  const { data: lead } = await supabase
    .from('leads')
    .select('sa_unterschrieben')
    .eq('id', leadId)
    .maybeSingle()

  if (lead?.sa_unterschrieben) {
    const { data: fall } = await supabase
      .from('faelle')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle()
    return {
      success: false,
      error: fall
        ? 'Lead ist zu einem Fall konvertiert. Bitte über die Fallakte editieren.'
        : 'Lead ist abgeschlossen — kein Edit mehr möglich.',
      fallId: fall?.id,
    }
  }

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
