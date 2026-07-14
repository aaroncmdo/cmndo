// P1 (Detail-View-Konsistenz): Detail-Facade fuer Versicherer.
// Konvention: docs/superpowers/detail-view-recipe.md
//
// Warum eine Detail-View: die Liste zeigt 5 von 15 Spalten, und das eigentlich
// Interessante an einem Versicherer ist das, was auf ihn ZEIGT (Faelle,
// VS-Korrespondenz) — davon war bisher nichts erreichbar.

import { createClient } from '@/lib/supabase/server'

const VS_COLUMNS =
  'id, name, normalized_name, bafin_nummer, adresse, plz, stadt, schaden_telefon, ' +
  'schaden_email, hotline_telefon, webseite, logo_url, ist_aktiv, erstellt_am, aktualisiert_am'

export type VersichererDetail = {
  id: string
  name: string
  normalizedName: string | null
  bafinNummer: string | null
  adresse: string | null
  plz: string | null
  stadt: string | null
  schadenTelefon: string | null
  schadenEmail: string | null
  hotlineTelefon: string | null
  webseite: string | null
  logoUrl: string | null
  istAktiv: boolean
  erstelltAm: string | null
  aktualisiertAm: string | null
}

type VsRow = {
  id: string
  name: string
  normalized_name: string | null
  bafin_nummer: string | null
  adresse: string | null
  plz: string | null
  stadt: string | null
  schaden_telefon: string | null
  schaden_email: string | null
  hotline_telefon: string | null
  webseite: string | null
  logo_url: string | null
  ist_aktiv: boolean | null
  erstellt_am: string | null
  aktualisiert_am: string | null
}

export async function getVersichererDetail(
  id: string,
): Promise<{ ok: true; data: VersichererDetail } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('versicherungen')
    .select(VS_COLUMNS)
    .eq('id', id)
    .single()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Versicherer nicht gefunden.' }

  const v = data as unknown as VsRow
  return {
    ok: true,
    data: {
      id: v.id,
      name: v.name,
      normalizedName: v.normalized_name,
      bafinNummer: v.bafin_nummer,
      adresse: v.adresse,
      plz: v.plz,
      stadt: v.stadt,
      schadenTelefon: v.schaden_telefon,
      schadenEmail: v.schaden_email,
      hotlineTelefon: v.hotline_telefon,
      webseite: v.webseite,
      logoUrl: v.logo_url,
      // DB erlaubt null — die UI behandelt "nicht gesetzt" als inaktiv.
      istAktiv: v.ist_aktiv ?? false,
      erstelltAm: v.erstellt_am,
      aktualisiertAm: v.aktualisiert_am,
    },
  }
}

export type VersichererFall = {
  id: string
  claimNummer: string | null
  status: string | null
  createdAt: string
}

/** Faelle, in denen dieser Versicherer der GEGNER ist. Fehler -> [] (Tab bleibt leer statt zu crashen). */
export async function getVersichererFaelle(versicherungId: string): Promise<VersichererFall[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('claims')
    .select('id, claim_nummer, status, created_at')
    .eq('gegner_versicherung_id', versicherungId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[versicherungen/faelle]', error.message)
    return []
  }

  return ((data ?? []) as unknown as Array<{
    id: string
    claim_nummer: string | null
    status: string | null
    created_at: string
  }>).map((c) => ({
    id: c.id,
    claimNummer: c.claim_nummer,
    status: c.status,
    createdAt: c.created_at,
  }))
}

export type VersichererKorrespondenz = {
  id: string
  claimId: string
  datum: string
  richtung: string
  kanal: string
  typ: string | null
  betreff: string | null
  status: string
  aktenzeichen: string | null
  naechsteFrist: string | null
}

/**
 * VS-Korrespondenz dieses Versicherers ueber ALLE Faelle hinweg.
 * Bisher war sie nur pro Fall sichtbar (faelle/[id]) — nie gebuendelt.
 */
export async function getVersichererKorrespondenz(
  versicherungId: string,
): Promise<VersichererKorrespondenz[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vs_korrespondenz')
    .select('id, claim_id, datum, richtung, kanal, typ, betreff, status, aktenzeichen, naechste_frist')
    .eq('versicherung_id', versicherungId)
    .order('datum', { ascending: false })

  if (error) {
    console.error('[versicherungen/korrespondenz]', error.message)
    return []
  }

  return ((data ?? []) as unknown as Array<{
    id: string
    claim_id: string
    datum: string
    richtung: string
    kanal: string
    typ: string | null
    betreff: string | null
    status: string
    aktenzeichen: string | null
    naechste_frist: string | null
  }>).map((k) => ({
    id: k.id,
    claimId: k.claim_id,
    datum: k.datum,
    richtung: k.richtung,
    kanal: k.kanal,
    typ: k.typ,
    betreff: k.betreff,
    status: k.status,
    aktenzeichen: k.aktenzeichen,
    naechsteFrist: k.naechste_frist,
  }))
}
