'use server'

// AAR-110: Manuelle Lead-Anlage
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// AAR-216: schadens_fall_typ aus dem Manual-Lead-Input entfernt — der MA kennt
// den Schadentyp beim Anlegen noch nicht, dieser wird in Phase 2 erfasst.
// AAR-695: service_typ raus (wird im Lead-Flow gesetzt, ist Endpoint-Sender
// für die Kanzlei). PLZ-Freitext durch Google-Maps-Auswahl ersetzt
// (Adresse + PLZ + Lat/Lng als Bundle).
export interface CreateManualLeadInput {
  /** CMM-32: 'herr' | 'frau' | 'divers' | null. Optional — wenn unbekannt
      bleibt's leer und Templates fallen auf "Hallo Vorname" zurück. */
  anrede?: 'herr' | 'frau' | 'divers' | null
  vorname: string
  nachname: string
  telefon: string
  email: string
  /** CMM-32: Hersteller/Modell direkt beim Anlegen erfassen — sonst hängt
      die Imagin-Render-Card im Lead-Detail leer. Werden in convertLeadToFall
      auf faelle.fahrzeug_hersteller/modell vererbt. */
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  /** CMM-32: Lackfarbe vom Dispatcher direkt am Telefon erfasst — der SV
      braucht's beim Vor-Ort-Termin zur eindeutigen Fahrzeug-Identifikation.
      lackfarbe_code mappt auf Imagin-paintIds für das Render-Bild;
      fahrzeug_farbe (Freitext) optional für Detail-Bezeichnungen. */
  lackfarbe_code?:
    | 'schwarz' | 'weiss' | 'silber' | 'grau' | 'blau' | 'rot'
    | 'gruen' | 'gelb' | 'orange' | 'braun' | 'beige' | 'sonstige'
    | null
  fahrzeug_farbe?: string | null
  /** CMM-32: Kennzeichen direkt erfassen — der SV identifiziert vor Ort
      über Kennzeichen, ergänzt das Render-Bild im Header. */
  kennzeichen?: string | null
  kunde_adresse: string
  kunde_strasse: string
  kunde_plz: string
  kunde_stadt: string
  kunde_lat: number | null
  kunde_lng: number | null
  source_channel: string
  notizen: string
}

export async function createManualLead(
  data: CreateManualLeadInput,
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-quick-create: Telefon nicht mehr Pflicht — der Dispatcher legt
  // einen leeren Lead-Stub an und füllt die Daten in der Lead-Maske aus.
  // DB-Spalte `telefon` ist nullable, also kein Insert-Fail.

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (!['admin', 'kundenbetreuer', 'dispatch'].includes(profile?.rolle ?? '')) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  const admin = createAdminClient()
  const { data: lead, error } = await admin.from('leads').insert({
    anrede: data.anrede ?? null,
    vorname: data.vorname || null,
    nachname: data.nachname || null,
    telefon: data.telefon || null,
    email: data.email || null,
    fahrzeug_hersteller: data.fahrzeug_hersteller?.trim() || null,
    fahrzeug_modell: data.fahrzeug_modell?.trim() || null,
    kennzeichen: data.kennzeichen?.trim() || null,
    lackfarbe_code: data.lackfarbe_code ?? null,
    fahrzeug_farbe: data.fahrzeug_farbe?.trim() || null,
    kunde_adresse: data.kunde_adresse || null,
    kunde_strasse: data.kunde_strasse || null,
    kunde_plz: data.kunde_plz || null,
    kunde_stadt: data.kunde_stadt || null,
    kunde_lat: data.kunde_lat,
    kunde_lng: data.kunde_lng,
    // AAR-216: schadentyp NICHT mehr beim Anlegen — wird in Phase 2 gesetzt.
    // AAR-695: service_typ NICHT mehr beim Anlegen — wird im Lead-Flow gesetzt.
    source_channel: data.source_channel,
    qualifizierungs_phase: 'neu',
    status: 'neu',
    kunden_konstellation: 'kk-01',
    zugewiesen_an: user.id,
    notiz: data.notizen || null,
  }).select('id').single()

  if (error || !lead) return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }

  revalidatePath('/dispatch/leads')
  return { success: true, leadId: lead.id }
}
