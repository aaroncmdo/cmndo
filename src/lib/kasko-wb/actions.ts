'use server'

// Lade-Actions der Kasko-Werkstattbindungs-Wissensbasis (Spec 2026-09-04). Admin-Client wie
// versicherungen/search-actions.ts: der /flow und der Embed laufen ANON; die drei Tabellen sind
// oeffentliche Referenzdaten (anon-Read-RLS), enthalten keine Kundendaten.
// Datei-Level 'use server': NUR async functions + type-Deklarationen exportieren (check:use-server-exports).

import { createAdminClient } from '@/lib/supabase/admin'
import type { KaskoBindungsInfo, KaskoMarke, KaskoTarif } from './types'

type MarkeRow = {
  id: string
  slug: string
  marke: string
  wb_status: KaskoMarke['wbStatus']
  wb_marker: string[] | null
  nicht_wb_marker: string[] | null
  hinweis: string | null
  varianten_hinweis: string | null
  kasko_tarife: { count: number }[] | null
}

export async function ladeKaskoMarken(): Promise<{ ok: true; marken: KaskoMarke[] } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kasko_versicherer_marken')
    .select('id, slug, marke, wb_status, wb_marker, nicht_wb_marker, hinweis, varianten_hinweis, kasko_tarife(count)')
    .eq('aktiv', true)
    .order('marke', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const marken: KaskoMarke[] = ((data ?? []) as unknown as MarkeRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    marke: r.marke,
    wbStatus: r.wb_status,
    wbMarker: r.wb_marker ?? [],
    nichtWbMarker: r.nicht_wb_marker ?? [],
    hinweis: r.hinweis,
    variantenHinweis: r.varianten_hinweis,
    // Nested count kommt als Array mit einem Objekt (PostgREST) -> normalisieren.
    tarifAnzahl: Array.isArray(r.kasko_tarife) ? r.kasko_tarife[0]?.count ?? 0 : 0,
  }))
  return { ok: true, marken }
}

type TarifRow = {
  id: string
  marke_id: string
  anzeigename: string
  hat_werkstattbindung: boolean
  bindungsumfang: KaskoTarif['bindungsumfang']
  verlaesslichkeit: KaskoTarif['verlaesslichkeit']
}

export async function ladeKaskoTarife(markeId: string): Promise<{ ok: true; tarife: KaskoTarif[] } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kasko_tarife')
    .select('id, marke_id, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit')
    .eq('marke_id', markeId)
    .eq('aktiv', true)
    .order('reihenfolge', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const tarife: KaskoTarif[] = ((data ?? []) as unknown as TarifRow[]).map((r) => ({
    id: r.id,
    markeId: r.marke_id,
    anzeigename: r.anzeigename,
    hatWerkstattbindung: r.hat_werkstattbindung,
    bindungsumfang: r.bindungsumfang,
    verlaesslichkeit: r.verlaesslichkeit,
  }))
  return { ok: true, tarife }
}

type KonditionenRow = {
  nachlass_text: string | null
  sanktion_text: string | null
  ausnahmen_text: string | null
  partnernetz: string | null
}

const GDV_SANKTION =
  'Bis zur Reparatur in der vom Versicherer benannten Werkstatt wird die Erstattung auf 80 % der marktüblichen Reparaturkosten begrenzt, mindestens mit einer zusätzlichen Selbstbeteiligung von 100 € (GDV-Muster-AKB A.2.5.2.5.2). Servicebausteine wie Hol-/Bringservice, Ersatzwagen, Reinigung und Reparaturgarantie gibt es nur in der Partnerwerkstatt.'
const GDV_AUSNAHMEN = 'Haftpflichtschaden Dritter · Totalschaden · Reparatur im Ausland · keine erreichbare Partnerwerkstatt'

/**
 * Alles fuer Endseite, Mail und Dispatch: Marke (oder Freitext), Tarif, Marker, Konditionen (Marke oder
 * GDV-Default) und Kontakt des Rechtstraegers aus versicherungen. Fehlende Teile fallen auf Defaults —
 * die Endseite darf NIE leer sein.
 */
export async function ladeKaskoBindungsInfo(
  markeId: string | null,
  tarifId: string | null,
  markeNameFallback?: string | null,
): Promise<{ ok: true; info: KaskoBindungsInfo } | { ok: false; error: string }> {
  const admin = createAdminClient()
  let info: KaskoBindungsInfo = {
    markeName: markeNameFallback ?? null,
    tarifName: null,
    wbMarker: [],
    nachlassText: null,
    sanktionText: GDV_SANKTION,
    ausnahmenText: GDV_AUSNAHMEN,
    partnernetz: null,
    verlaesslichkeit: 'nicht_belegt',
    bindungsumfang: 'unklar',
    hotline: null,
    schadenEmail: null,
    webseite: null,
    stand: '2026-07-20',
  }
  if (markeId) {
    const { data: m, error } = await admin
      .from('kasko_versicherer_marken')
      .select('marke, wb_marker, stand, versicherung_id, kasko_wb_konditionen(nachlass_text, sanktion_text, ausnahmen_text, partnernetz)')
      .eq('id', markeId)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (m) {
      const row = m as unknown as {
        marke: string; wb_marker: string[] | null; stand: string; versicherung_id: string | null
        kasko_wb_konditionen: KonditionenRow | KonditionenRow[] | null
      }
      const k = Array.isArray(row.kasko_wb_konditionen) ? row.kasko_wb_konditionen[0] : row.kasko_wb_konditionen
      info = {
        ...info,
        markeName: row.marke,
        wbMarker: row.wb_marker ?? [],
        stand: row.stand,
        nachlassText: k?.nachlass_text ?? null,
        sanktionText: k?.sanktion_text?.trim() ? `${k.sanktion_text} Servicebausteine wie Hol-/Bringservice, Ersatzwagen oder Reparaturgarantie gibt es nur in der Partnerwerkstatt.` : GDV_SANKTION,
        ausnahmenText: k?.ausnahmen_text?.trim() ? k.ausnahmen_text : GDV_AUSNAHMEN,
        partnernetz: k?.partnernetz ?? null,
      }
      if (row.versicherung_id) {
        const { data: v } = await admin
          .from('versicherungen')
          .select('schaden_telefon, hotline_telefon, schaden_email, webseite')
          .eq('id', row.versicherung_id)
          .maybeSingle()
        if (v) {
          info.hotline = (v.schaden_telefon as string | null) ?? (v.hotline_telefon as string | null) ?? null
          info.schadenEmail = (v.schaden_email as string | null) ?? null
          info.webseite = (v.webseite as string | null) ?? null
        }
      }
    }
  }
  if (tarifId) {
    const { data: t } = await admin
      .from('kasko_tarife')
      .select('anzeigename, bindungsumfang, verlaesslichkeit')
      .eq('id', tarifId)
      .maybeSingle()
    if (t) {
      info.tarifName = t.anzeigename as string
      info.bindungsumfang = t.bindungsumfang as KaskoBindungsInfo['bindungsumfang']
      info.verlaesslichkeit = t.verlaesslichkeit as KaskoBindungsInfo['verlaesslichkeit']
    }
  }
  return { ok: true, info }
}
