'use server'

// AAR-386: Server-Actions für die Feldmodus-Fallakte (arrived-State).
// Lädt Fall + Pflichtdokumente-Slots für den SV, speichert Vor-Ort-Notizen.
// Verifiziert immer, dass der eingeloggte Nutzer der zugeordnete SV des
// Falls ist (RLS deckt das zwar auch ab — Defense-in-Depth).
//
// CMM-32f Update: SV-Zuordnung läuft jetzt über `auftraege.sv_id` (eine
// Sub-Entity am Fall), nicht mehr direkt über `faelle.sv_id`. Der alte
// Check (fall.sv_id === sv.id) liefert „Fall nicht gefunden" weil der
// Fall nach Migration kein direktes sv_id mehr hat. Wir authorisieren
// jetzt via Auftrag und laden den Fall mit Admin-Client (RLS umgehen).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { getAlleSlots } from '@/lib/dokumente/katalog'
import { buildKatalogContext, evaluateKatalogRule } from '@/lib/dokumente/ruleEvaluator'
import type { DokumentSlotStatus } from '@/components/fall/DokumentSlot'

export type FeldmodusFallakteFall = {
  id: string
  fall_nummer: string
  kennzeichen: string | null
  fahrzeug: string | null
  szenario: string | null
  notizen: string | null
  filmcheck_notizen: string | null
  /** AAR-386: Dedizierte Spalte für SV-Vor-Ort-Notizen (getrennt von faelle.notizen). */
  sv_notizen_vor_ort: string | null
  kunde_name: string
  kunde_telefon: string | null
  besichtigungsort_adresse: string | null
  sv_briefing_text: string | null
}

export type FeldmodusSlot = {
  id: string | null
  slotId: string
  label: string
  beschreibung: string | null
  istPflicht: boolean
  status: DokumentSlotStatus
  currentFile: { name: string; url: string | null; size: number | null } | null
}

type LoadResult =
  | { success: true; fall: FeldmodusFallakteFall; slots: FeldmodusSlot[] }
  | { success: false; error: string }

const SV_UPLOAD_ROLE = 'sachverstaendiger'

/**
 * Lädt die Feldmodus-Fallakte für einen konkreten Fall. Prüft Auth + SV-
 * Zuordnung und mergt dokument_katalog mit pflichtdokumente, sodass Slots
 * mit bereits-hochgeladenen Dateien korrekt dargestellt werden können.
 */
export async function loadFeldmodusFallakteData(fallId: string): Promise<LoadResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  // CMM-32f: Auth via Auftrag (sv_id auf auftraege, nicht mehr auf faelle).
  // Fallback: legacy faelle.sv_id (für Pre-Migration-Fälle die noch keinen
  // Auftrag haben). Beide Pfade ohne RLS via Admin-Client — die Auth ist
  // explizit über die SV-Auftrag-Beziehung gegen den eingeloggten User.
  const admin = createAdminClient()

  const { data: auftrag } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .limit(1)
    .maybeSingle()

  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .select(
      'id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, szenario, notizen, filmcheck_notizen, sv_notizen_vor_ort, lead_id, besichtigungsort_adresse, schadens_adresse, schadens_plz, schadens_ort, sv_briefing_text, sv_id',
    )
    .eq('id', fallId)
    .single()

  if (fallErr || !fall) return { success: false, error: 'Fall nicht gefunden' }

  const istBerechtigt = !!auftrag || fall.sv_id === sv.id
  if (!istBerechtigt) {
    return { success: false, error: 'Fall ist nicht diesem SV zugeordnet' }
  }

  const [{ data: lead }, { data: pflicht }, katalog] = await Promise.all([
    fall.lead_id
      ? admin
          .from('leads')
          .select('vorname, nachname, telefon')
          .eq('id', fall.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    admin
      .from('pflichtdokumente')
      .select(
        'id, dokument_typ, status, pflicht, dokument_url, hochgeladen_am, sort_order',
      )
      .eq('fall_id', fallId)
      .order('sort_order', { ascending: true }),
    getAlleSlots(supabase),
  ])

  const ctx = buildKatalogContext({ lead: lead ?? null, fall })
  const pflichtById = new Map<string, Record<string, unknown>>()
  for (const p of (pflicht ?? []) as Record<string, unknown>[]) {
    pflichtById.set(p.dokument_typ as string, p)
  }

  const slots: FeldmodusSlot[] = katalog
    .filter((k) => k.uploadbar_von?.includes(SV_UPLOAD_ROLE))
    .filter((k) => evaluateKatalogRule(k.freigeschaltet_wenn, ctx))
    .map((k) => {
      const existing = pflichtById.get(k.slot_id)
      const istPflicht =
        k.pflicht_wenn != null && evaluateKatalogRule(k.pflicht_wenn, ctx)
      const rawStatus = (existing?.status as string) ?? 'ausstehend'
      const status: DokumentSlotStatus = [
        'ausstehend',
        'hochgeladen',
        'geprueft',
        'abgelehnt',
        'nachgereicht_angefordert',
        'optional',
      ].includes(rawStatus)
        ? (rawStatus as DokumentSlotStatus)
        : 'ausstehend'
      const dokumentUrl = (existing?.dokument_url as string | null) ?? null
      const fileName = dokumentUrl
        ? dokumentUrl.split('/').pop() ?? k.label
        : null
      return {
        id: (existing?.id as string | null) ?? null,
        slotId: k.slot_id,
        label: k.label,
        beschreibung: k.beschreibung,
        istPflicht,
        status,
        currentFile: fileName
          ? { name: fileName, url: dokumentUrl, size: null }
          : null,
      }
    })

  const fallData: FeldmodusFallakteFall = {
    id: fall.id,
    fall_nummer: fall.fall_nummer,
    kennzeichen: fall.kennzeichen,
    fahrzeug:
      [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') ||
      null,
    szenario: fall.szenario,
    notizen: fall.notizen,
    filmcheck_notizen: fall.filmcheck_notizen,
    sv_notizen_vor_ort: (fall as Record<string, unknown>).sv_notizen_vor_ort as
      | string
      | null ?? null,
    kunde_name: lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      : '—',
    kunde_telefon: lead?.telefon ?? null,
    besichtigungsort_adresse:
      fall.besichtigungsort_adresse ||
      [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]
        .filter(Boolean)
        .join(', ') ||
      null,
    sv_briefing_text: fall.sv_briefing_text,
  }

  return { success: true, fall: fallData, slots }
}

/**
 * Speichert Vor-Ort-Notizen vom SV auf der dedizierten Spalte
 * `faelle.sv_notizen_vor_ort` (AAR-386 Migration). Bleibt bewusst getrennt
 * von `faelle.notizen` (Kundenbetreuer/Dispatch) und `faelle.filmcheck_notizen`.
 */
export async function saveFeldmodusNotizen(
  fallId: string,
  notizen: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  // CMM-32f: Auth via Auftrag (siehe loadFeldmodusFallakteData).
  const admin = createAdminClient()
  const { data: auftrag } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .limit(1)
    .maybeSingle()
  const { data: fall } = await admin
    .from('faelle')
    .select('sv_id')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }
  if (!auftrag && fall.sv_id !== sv.id) {
    return { success: false, error: 'Fall ist nicht diesem SV zugeordnet' }
  }

  const { error } = await admin
    .from('faelle')
    .update({ sv_notizen_vor_ort: notizen.trim() || null })
    .eq('id', fallId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/gutachter/feldmodus')
  revalidatePath(`/gutachter/fall/${fallId}`)
  return { success: true }
}
