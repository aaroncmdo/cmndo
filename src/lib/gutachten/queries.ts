// AAR-833: Gutachten Queries — Server-seitige Datenbankabfragen

import { createClient } from '@/lib/supabase/server'

export type GutachtenMitSv = {
  id: string
  claim_id: string
  sv_id: string
  status: string
  auftragsnummer: string | null
  besichtigungstermin: string | null
  besichtigt_am: string | null
  fertiggestellt_am: string | null
  unterschrieben_am: string | null
  gesamt_schadensbetrag: number | null
  bericht_pdf_url: string | null
  unterschrift_sv_url: string | null
  laeufer_report_id: string | null
  notiz: string | null
  created_at: string
  updated_at: string
  created_by_user_id: string | null
  sachverstaendige: {
    id: string
    profile_id: string | null
    profiles: {
      vorname: string | null
      nachname: string | null
      email: string | null
      telefon: string | null
      avatar_url: string | null
    } | null
  } | null
}

export type GutachtenPosition = {
  id: string
  gutachten_id: string
  claim_id: string
  position_nr: number
  bezeichnung: string
  kategorie: string | null
  schadensbetrag_netto: number | null
  schadensbetrag_brutto: number | null
  mwst_satz: number | null
  reparaturart: string | null
  ersatzteil_nr: string | null
  arbeitszeit_aw: number | null
  created_at: string
  updated_at: string
}

export type GutachtenFoto = {
  id: string
  gutachten_id: string
  claim_id: string
  upload_quelle: string
  uploaded_by: string | null
  storage_path: string
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  aufnahme_zeitpunkt: string | null
  beschreibung: string | null
  position_nr: number | null
  kategorie: string | null
  exif_processed: boolean
  created_at: string
}

export type GutachtenMitDetails = GutachtenMitSv & {
  positionen: GutachtenPosition[]
  fotos: GutachtenFoto[]
}

export async function getGutachtenForClaim(claimId: string): Promise<GutachtenMitSv[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gutachten')
    .select(`
      id, claim_id, sv_id, status, auftragsnummer,
      besichtigungstermin, besichtigt_am, fertiggestellt_am, unterschrieben_am,
      gesamt_schadensbetrag, bericht_pdf_url, unterschrift_sv_url,
      laeufer_report_id, notiz, created_at, updated_at, created_by_user_id,
      sachverstaendige (
        id, profile_id,
        profiles ( vorname, nachname, email, telefon, avatar_url )
      )
    `)
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[AAR-833] getGutachtenForClaim:', error.message)
    return []
  }

  return (data ?? []).map((g) => {
    const sv = Array.isArray(g.sachverstaendige) ? (g.sachverstaendige[0] ?? null) : g.sachverstaendige
    return {
      ...g,
      sachverstaendige: sv
        ? {
            ...sv,
            profiles: Array.isArray(sv.profiles) ? (sv.profiles[0] ?? null) : sv.profiles,
          }
        : null,
    }
  }) as unknown as GutachtenMitSv[]
}

export async function getGutachtenWithDetails(gutachtenId: string): Promise<GutachtenMitDetails | null> {
  const supabase = await createClient()

  const [gutachtenRes, positionenRes, fotosRes] = await Promise.all([
    supabase
      .from('gutachten')
      .select(`
        id, claim_id, sv_id, status, auftragsnummer,
        besichtigungstermin, besichtigt_am, fertiggestellt_am, unterschrieben_am,
        gesamt_schadensbetrag, bericht_pdf_url, unterschrift_sv_url,
        laeufer_report_id, notiz, created_at, updated_at, created_by_user_id,
        sachverstaendige (
          id, profile_id,
          profiles ( vorname, nachname, email, telefon, avatar_url )
        )
      `)
      .eq('id', gutachtenId)
      .single(),

    supabase
      .from('gutachten_positionen')
      .select('*')
      .eq('gutachten_id', gutachtenId)
      .order('position_nr', { ascending: true }),

    supabase
      .from('gutachten_fotos')
      .select('*')
      .eq('gutachten_id', gutachtenId)
      .order('created_at', { ascending: true }),
  ])

  if (gutachtenRes.error || !gutachtenRes.data) {
    console.error('[AAR-833] getGutachtenWithDetails:', gutachtenRes.error?.message)
    return null
  }

  const g = gutachtenRes.data
  const svRaw = Array.isArray(g.sachverstaendige) ? (g.sachverstaendige[0] ?? null) : g.sachverstaendige
  const base: GutachtenMitSv = {
    ...g,
    sachverstaendige: svRaw
      ? {
          ...svRaw,
          profiles: Array.isArray(svRaw.profiles) ? (svRaw.profiles[0] ?? null) : svRaw.profiles,
        }
      : null,
  } as unknown as GutachtenMitSv

  return {
    ...base,
    positionen: (positionenRes.data ?? []) as GutachtenPosition[],
    fotos:      (fotosRes.data      ?? []) as GutachtenFoto[],
  }
}
