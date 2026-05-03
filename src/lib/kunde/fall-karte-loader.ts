// AAR-449: Shared-Loader für die FallKarte-Metadaten (nächster Termin,
// letztes Timeline-Update, Action-Hint via AAR-432 getKundenJetztZuTun).
// Wird sowohl von /kunde (Dashboard) als auch /kunde/faelle (Listen-View)
// genutzt — eine Datenabfrage, zwei UI-Einsatzorte.
//
// Nutzt den Admin-Client für den parallelisierten Metadaten-Fetch, weil
// RLS für timeline/pflichtdokumente/sla_tracking teilweise restriktiv ist
// und die eigentliche Authentifizierung in der aufrufenden Page bereits
// gegen den User gelaufen ist.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getKundenJetztZuTun,
  type KundeAktion,
  type KundeSlaRecord,
} from '@/lib/kunde/jetzt-zu-tun'
import type { FallKarteTermin } from '@/components/kunde/FallKarte'

export type FallKarteMetaInput = {
  id: string
  onboarding_complete?: boolean | null
  sa_unterschrieben?: boolean | null
  vollmacht_status?: string | null
  vollmacht_signiert_am?: string | null
  gutachter_termin_status?: string | null
  sv_termin?: string | null
  gutachter_termin_bestaetigt_am?: string | null
  anschlussschreiben_am?: string | null
  regulierung_am?: string | null
  polizei_vor_ort?: boolean | null
  status?: string | null
  abgeschlossen_am?: string | null
  besichtigungsort_adresse?: string | null
  schadens_adresse?: string | null
  schadens_plz?: string | null
  schadens_ort?: string | null
  // AAR-558 (C11): Nachbesichtigungs-Anforderung durchreichen
  nachbesichtigung_status?: string | null
  kanzlei_wunsch?: string | null
}

export type FallKarteMeta = {
  aktion: KundeAktion | null
  nextTermin: FallKarteTermin | null
  lastUpdate: string | null
}

/**
 * Lädt für eine Liste von Fällen pro Fall:
 *  - den zeitlich nächsten aktiven Termin (SV oder KB)
 *  - das letzte Timeline-Event (für „zuletzt aktualisiert vor X")
 *  - die höchst-priorisierte Jetzt-zu-tun-Aktion
 */
export async function ladeFallKartenMeta(
  faelle: FallKarteMetaInput[],
): Promise<Record<string, FallKarteMeta>> {
  const result: Record<string, FallKarteMeta> = {}
  if (!faelle.length) return result

  const fallIds = faelle.map((f) => f.id).filter(Boolean)
  if (!fallIds.length) return result

  const admin = createAdminClient()

  // Parallel: Termine, Timeline, Pflichtdokumente, SLA-Records.
  const [{ data: termine }, { data: timelineEvents }, { data: pflichtDocs }, { data: slaData }] = await Promise.all([
    admin
      .from('gutachter_termine')
      .select('id, fall_id, typ, status, start_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten')
      .in('fall_id', fallIds)
      .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben'])
      .is('durchgefuehrt_am', null)
      .order('start_zeit', { ascending: true }),
    admin
      .from('timeline')
      .select('fall_id, created_at')
      .in('fall_id', fallIds)
      .order('created_at', { ascending: false }),
    admin
      .from('pflichtdokumente')
      .select('fall_id, dokument_typ, dokument_url, status')
      .in('fall_id', fallIds),
    admin
      .from('sla_tracking')
      .select('fall_id, blocker_rolle, blocker_grund, status, breach_at')
      .in('fall_id', fallIds)
      .eq('blocker_rolle', 'kunde')
      .eq('status', 'breached'),
  ])

  // Pro Fall den nächsten Termin (erster nach Start-Zeit) speichern.
  const nextTerminByFall = new Map<string, FallKarteTermin>()
  for (const t of termine ?? []) {
    const fid = t.fall_id as string
    if (!fid || nextTerminByFall.has(fid)) continue
    if (!t.start_zeit) continue
    nextTerminByFall.set(fid, {
      typ: (t.typ as 'sv_begutachtung' | 'kb_beratung') ?? 'sv_begutachtung',
      start_zeit: t.start_zeit as string,
      kanal: t.kanal as string | null,
      video_link: t.video_link as string | null,
      adresse: null, // Adresse wird vom Konsumenten ergänzt (liegt auf faelle)
      sv_unterwegs_seit: t.sv_unterwegs_seit as string | null,
      sv_angekommen_am: t.sv_angekommen_am as string | null,
      sv_eta_minuten: (t.sv_eta_minuten as number | null) ?? null,
    })
  }

  // Pro Fall letztes Timeline-Event.
  const lastUpdateByFall = new Map<string, string>()
  for (const ev of timelineEvents ?? []) {
    const fid = ev.fall_id as string
    if (!fid || lastUpdateByFall.has(fid)) continue
    lastUpdateByFall.set(fid, ev.created_at as string)
  }

  // Polizeibericht-Hat + Nachreichen-Flag aufbauen.
  const polizeiHat = new Set<string>()
  const nachreich = new Set<string>()
  for (const d of pflichtDocs ?? []) {
    const fid = d.fall_id as string
    if (!fid) continue
    if (d.dokument_typ === 'polizeibericht' && d.dokument_url) polizeiHat.add(fid)
    if (d.status === 'nachgereicht_angefordert') nachreich.add(fid)
  }

  const slaRecords = (slaData ?? []) as KundeSlaRecord[]

  // Pro Fall die Aktion berechnen.
  for (const f of faelle) {
    const nextT = nextTerminByFall.get(f.id) ?? null
    if (nextT) {
      // Adresse für SV-Termine aus Fall-Feldern ergänzen.
      if (nextT.typ === 'sv_begutachtung') {
        nextT.adresse =
          (f.besichtigungsort_adresse ?? null) ||
          [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', ') ||
          null
      }
    }

    const aktion = getKundenJetztZuTun(
      {
        id: f.id,
        onboarding_complete: f.onboarding_complete ?? null,
        sa_unterschrieben: f.sa_unterschrieben ?? null,
        vollmacht_status: f.vollmacht_status ?? null,
        vollmacht_signiert_am: f.vollmacht_signiert_am ?? null,
        gutachter_termin_status: f.gutachter_termin_status ?? null,
        sv_termin: f.sv_termin ?? null,
        gutachter_termin_bestaetigt_am: f.gutachter_termin_bestaetigt_am ?? null,
        anschlussschreiben_am: f.anschlussschreiben_am ?? null,
        regulierung_am: f.regulierung_am ?? null,
        polizei_vor_ort: f.polizei_vor_ort ?? null,
        polizeibericht_uploaded: polizeiHat.has(f.id),
        hat_offene_nachreichung: nachreich.has(f.id),
        sv_unterwegs_seit: nextT?.sv_unterwegs_seit ?? null,
        sv_angekommen_am: nextT?.sv_angekommen_am ?? null,
        sv_eta_minuten: nextT?.sv_eta_minuten ?? null,
        status: f.status ?? null,
        abgeschlossen_am: f.abgeschlossen_am ?? null,
        nachbesichtigung_status: f.nachbesichtigung_status ?? null,
        kanzlei_wunsch: f.kanzlei_wunsch ?? null,
      },
      slaRecords,
    )

    result[f.id] = {
      aktion,
      nextTermin: nextT,
      lastUpdate: lastUpdateByFall.get(f.id) ?? null,
    }
  }

  return result
}
