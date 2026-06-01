import { createClient } from '@/lib/supabase/server'
import TeamClient from './TeamClient'

export default async function TeamPage() {
  const supabase = await createClient()
  const now = new Date()
  const monat = now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', month: 'long' })
  const jahr = now.getFullYear()
  const monatStr = `${jahr}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: mitarbeiterRaw },
    { data: vergList },
    { data: leadsRaw },
    { data: faelleAktivRaw },
    { data: faelleAbgRaw },
    { count: fallbackCount },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, vorname, nachname, rolle, telefon, force_password_change, created_at, kategorie, kapazitaet_max, aktiv')
      .in('rolle', ['admin', 'kundenbetreuer', 'dispatch', 'kanzlei'])
      .order('created_at', { ascending: false }),
    // W2.3/AAR-951: HR-Felder aus admin-only mitarbeiter_verguetung (RLS is_admin -> nur Admin sieht Werte).
    // Cast bis Type-Regen: Tabelle noch nicht in database.types.ts (parallele Session haelt die Datei).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('mitarbeiter_verguetung').select('profile_id, position, gehaltsstufe, eingestellt_am'),
    supabase.from('leads').select('zugewiesen_an, status').gte('created_at', monatStr),
    // CMM-47: faelle → v_claim_full. CMM-49 T1.2-d: KPI liest abgeleitete Phase
    // (main_phase/sub_phase) statt fall_status; abgeschlossen == sub_phase='erfolgreich_reguliert'.
    supabase.from('v_claim_full').select('kundenbetreuer_id').neq('main_phase', 'abschluss'),
    supabase.from('v_claim_full').select('kundenbetreuer_id').eq('sub_phase', 'erfolgreich_reguliert').gte('abgeschlossen_am', monatStr),
    // AAR-427: KPI — aktive Fälle die aktuell im Admin-Fallback laufen
    supabase
      .from('v_claim_full')
      .select('id', { count: 'exact', head: true })
      .eq('kundenbetreuer_fallback_flag', true)
      .neq('main_phase', 'abschluss'),
  ])

  // W2.3/AAR-951: HR flach in die Mitarbeiterliste mergen (TeamClient bleibt unveraendert).
  type VergListRow = { profile_id: string; position: string | null; gehaltsstufe: string | null; eingestellt_am: string | null }
  const vergMap = new Map(((vergList ?? []) as VergListRow[]).map((v) => [v.profile_id, v]))
  const mitarbeiter = (mitarbeiterRaw ?? []).map(m => {
    const v = vergMap.get(m.id)
    return { ...m, position: v?.position ?? null, gehaltsstufe: v?.gehaltsstufe ?? null, eingestellt_am: v?.eingestellt_am ?? null }
  })

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
