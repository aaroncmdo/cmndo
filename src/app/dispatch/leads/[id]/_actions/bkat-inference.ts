'use server'

// AAR-504/505: Server-Actions fuer BKat-Inferenz. Zwei Entry-Points:
//
// 1. analyzeBkatForLead(leadId): liest Lead + ggf. Polizeibericht-URLs und
//    fuehrt die OCR-first/LLM-fallback-Analyse. Gibt Ergebnis an UI zurueck.
//    Persistiert NICHTS — nur Vorschlag.
//
// 2. saveBkatUnfallart(leadId, unfallart, schadentyp): Dispatcher bestaetigt
//    die Klassifikation. Schreibt leads.bkat_unfallart + leads.schadentyp.
//    TBNRs werden weiterhin NICHT persistiert.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { inferBkat, type BkatInferenzErgebnis } from '@/lib/bkat/inference'
import { polizeiberichtUrlsFromLead } from '@/lib/bkat/lead-polizeibericht-urls'
import { resignStorageUrl } from '@/lib/storage/url'
import type { Database } from '@/lib/supabase/database.types'

type BkatUnfallart = Database['public']['Enums']['bkat_unfallart']

export async function analyzeBkatForLead(
  leadId: string,
): Promise<{ success: boolean; data?: BkatInferenzErgebnis; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, unfallhergang, schadens_hergang, polizei_vor_ort, polizei_aktenzeichen, polizeibericht_url')
    .eq('id', leadId)
    .single()

  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  // unfallhergang und schadens_hergang sind dasselbe Feld in zwei
  // Auspraegungen (Phase-1-Kundenstimme vs Phase-4-technisch). Fuer die
  // Analyse nehmen wir den vollstaendigeren Text.
  const ltext = (lead.unfallhergang as string | null) ?? ''
  const stext = (lead.schadens_hergang as string | null) ?? ''
  const unfallhergang = ltext.length >= stext.length ? ltext : stext

  // Polizeibericht-Bilder für die Vision-OCR. Quelle ist die Lead-Präsenz-URL — der Lead
  // ist die Ingest-Quelle (FG5-C4: won't-demote). Früher las das hier
  // fall_dokumente.dokument_url: die Spalte existiert nicht (heisst storage_path), die
  // Query schlug still fehl → BKat bekam nie Bilder.
  //
  // Die GESPEICHERTE URL ist aber NICHT dauerhaft abrufbar: `fall-dokumente` ist ein
  // PRIVATER Bucket → eine getPublicUrl liefert HTTP 400, eine signed-URL läuft nach
  // ihrer TTL (1h) ab. Anthropic-Vision holt das Bild OHNE Auth (source.type='url') →
  // die URL muss FRISCH signiert werden, sonst sieht Claude nur einen Fehler.
  const admin = createAdminClient()
  const signedUrls = await Promise.all(
    polizeiberichtUrlsFromLead(lead).map((url) => resignStorageUrl(admin, url)),
  )
  const polizeibericht_urls = signedUrls.filter((u): u is string => !!u)

  const result = await inferBkat({
    polizeibericht_urls,
    unfallhergang,
  })

  // Aktenzeichen automatisch auf Lead speichern wenn noch keins gesetzt ist
  if (result.aktenzeichen && !lead.polizei_aktenzeichen) {
    // Das Aktenzeichen stammt aus einer kostenpflichtigen KI-Auswertung des
    // Polizeiberichts. Geht der Write verloren, ist das Ergebnis weg und muss neu
    // erzeugt werden — die Bedingung oben ist zugleich der Wiederholungs-Schutz.
    const { error: akzFehler } = await supabase
      .from('leads')
      .update({ polizei_aktenzeichen: result.aktenzeichen })
      .eq('id', leadId)
    if (akzFehler) {
      console.error(`[bkat-inference] Aktenzeichen nicht gespeichert (Lead ${leadId}):`, akzFehler.message)
    }
    revalidatePath(`/dispatch/leads/${leadId}`)
  }

  return { success: true, data: result }
}

export async function saveBkatUnfallart(
  leadId: string,
  unfallart: BkatUnfallart,
  schadentypLegacy: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const updates: Record<string, unknown> = {
    bkat_unfallart: unfallart,
    updated_at: new Date().toISOString(),
  }
  if (schadentypLegacy) {
    updates.schadentyp = schadentypLegacy
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

// bkatToLegacySchadentyp wurde nach '@/lib/bkat/lookup' verschoben —
// 'use server'-Files dürfen nur async-Exports haben.
