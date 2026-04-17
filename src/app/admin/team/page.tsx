import { createClient } from '@/lib/supabase/server'
import TeamClient from './TeamClient'

export default async function TeamPage() {
  const supabase = await createClient()
  const now = new Date()
  const monat = now.toLocaleString('de-DE', { month: 'long' })
  const jahr = now.getFullYear()
  const monatStr = `${jahr}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: mitarbeiter },
    { data: leadsRaw },
    { data: faelleAktivRaw },
    { data: faelleAbgRaw },
    { count: fallbackCount },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, vorname, nachname, rolle, telefon, force_password_change, created_at, position, gehaltsstufe, kategorie, kapazitaet_max, aktiv, eingestellt_am')
      .in('rolle', ['admin', 'kundenbetreuer', 'leadbearbeiter', 'kanzlei'])
      .order('created_at', { ascending: false }),
    supabase.from('leads').select('zugewiesen_an, status').gte('created_at', monatStr),
    supabase.from('faelle').select('kundenbetreuer_id').not('status', 'in', '("abgeschlossen","storniert")'),
    supabase.from('faelle').select('kundenbetreuer_id').eq('status', 'abgeschlossen').gte('abgeschlossen_am', monatStr),
    // AAR-427: KPI — aktive Fälle die aktuell im Admin-Fallback laufen
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('kundenbetreuer_fallback_flag', true)
      .not('status', 'in', '("abgeschlossen","storniert")'),
  ])

  const leadsByUser: Record<string, { total: number; konvertiert: number }> = {}
  for (const l of leadsRaw ?? []) {
    if (!l.zugewiesen_an) continue
    if (!leadsByUser[l.zugewiesen_an]) leadsByUser[l.zugewiesen_an] = { total: 0, konvertiert: 0 }
    leadsByUser[l.zugewiesen_an].total++
    if (l.status === 'umgewandelt' || l.status === 'umgewandelt-sv') leadsByUser[l.zugewiesen_an].konvertiert++
  }
  const aktiveFaelleByUser: Record<string, number> = {}
  for (const f of faelleAktivRaw ?? []) {
    if (f.kundenbetreuer_id) aktiveFaelleByUser[f.kundenbetreuer_id] = (aktiveFaelleByUser[f.kundenbetreuer_id] ?? 0) + 1
  }
  const abgeschlossenByUser: Record<string, number> = {}
  for (const f of faelleAbgRaw ?? []) {
    if (f.kundenbetreuer_id) abgeschlossenByUser[f.kundenbetreuer_id] = (abgeschlossenByUser[f.kundenbetreuer_id] ?? 0) + 1
  }

  return (
    <TeamClient
      mitarbeiter={mitarbeiter ?? []}
      leadsByUser={leadsByUser}
      aktiveFaelleByUser={aktiveFaelleByUser}
      abgeschlossenByUser={abgeschlossenByUser}
      monatLabel={`${monat} ${jahr}`}
      kbFallbackAktiv={fallbackCount ?? 0}
    />
  )
}
