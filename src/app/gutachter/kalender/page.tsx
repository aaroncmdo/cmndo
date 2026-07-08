import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SVKalenderClient from './SVKalenderClient'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'
import KalenderRealtimeRefresh from '@/components/kalender/KalenderRealtimeRefresh'
import KalenderListeEmpty from './KalenderListeEmpty'

// AAR-229 W5 / F-12: Kalender + Termine merge mit View-Toggle.
export default async function SVKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view = 'kalender' } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Get the SV's sachverstaendige ID
  const sv = await getGutachterForUser<{ id: string; gcal_connected: boolean | null; standort_lat: number | null; standort_lng: number | null }>(supabase, user.id, 'id, gcal_connected, standort_lat, standort_lng')

  if (!sv) redirect('/login')

  // AAR-google-cal-drift: Source-of-Truth für „verbunden?" sind die
  // profiles.google_*-Tokens, NICHT sachverstaendige.gcal_connected. Der alte
  // /api/auth/google-calendar/-Flow schrieb nach der falschen Spalte —
  // dadurch zeigte die UI „verbunden" während Sync-Helper keinen Token fanden.
  const { isGoogleConnected } = await import('@/lib/google/oauth-client')
  const gcalConnected = await isGoogleConnected(user.id)

  // Live-Termine Phase 3: externe Busy-Slots aus sv_kalender_events_cache.
  // Der Cron `/api/cron/sync-external-calendars` befüllt den Cache aus
  // Google FreeBusy UND CalDAV — wir lesen hier nur, kein Live-Fetch.
  //
  // WICHTIG: Diese Cache-Lese-Logik wurde am 2026-05-10 in Commit 7ebcc0c0
  // („Phase 3 — Cache-Read + KalenderRealtimeRefresh") eingeführt und durch
  // den staging→feature-Merge 8f088031 versehentlich auf den Live-Google-
  // FreeBusy-Pfad zurückgerollt — wodurch CalDAV-Events (Apple/Fastmail/…)
  // komplett aus der SV-Kalender-UI verschwanden. KalenderRealtimeRefresh
  // unten triggert router.refresh() wenn neue Events eintreffen.
  // 2026-07-08: Anzeige-Fenster geweitet ([-90d,+90d]) damit die Wochen-Navigation auch
  // vergangene externe Termine zeigt. Der Sync cached [-90d,+365d] (fuers Finder-Busy via
  // v_belegung); die Wochen-Ansicht braucht nur einen nav-tauglichen Ausschnitt.
  const now = new Date()
  const fromIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90).toISOString()
  const toIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90).toISOString()
  // 2026-07-08: profil-gekeyt lesen. Der Sync-Cron (sync-to-cache) schreibt den Cache
  // profil-gekeyed (profile_id gesetzt, sv_id meist NULL) — der frühere .eq('sv_id')-Reader
  // matchte 1125/1129 Zeilen NICHT -> externe CalDAV-Events waren im Kalender unsichtbar.
  const { data: cachedEvents } = await supabase
    .from('sv_kalender_events_cache')
    .select('start_zeit, end_zeit, titel, source')
    .eq('profile_id', user.id)
    .gte('start_zeit', fromIso)
    .lte('start_zeit', toIso)
    .order('start_zeit')
  // 2026-07-08: titel + source mitlesen. CalDAV-Events haben echte Titel (VEVENT SUMMARY) — die
  // zeigen wir im Kalender statt anonym "Privat (Google)". Google-FreeBusy hat KEINEN Titel
  // (titel=NULL) -> source unterscheidet die Fallback-Beschriftung. Aaron 2026-07-08: "Termine
  // nicht als Privat (google) anzeigen wenn wir sie ja auslesen koennen."
  const externalBusy = (cachedEvents ?? []).map((e) => ({
    start: e.start_zeit as string,
    end: e.end_zeit as string,
    titel: (e.titel as string | null) ?? null,
    source: (e.source as string | null) ?? null,
  }))

  // KANONISCH (2026-07-07): SV-Termine aus gutachter_termine via assignee_id — NICHT
  // aus der stale v_faelle_mit_aktuellem_termin.sv_termin (claim-scoped, claim_id meist
  // NULL -> Mehrheit der Termine unsichtbar). Kein sa_unterschrieben-Hardfilter mehr
  // (Aaron 07.07.: „alle meine Termine"). Siehe lib/termine/sv-termine.ts + Spec.
  const { svTermine } = await import('@/lib/termine/sv-termine')
  const { effektiveBezugIds } = await import('@/lib/termine/effektive-bezug-ids')
  const fensterVon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
  const fensterBis = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 35).toISOString()
  const svTermineRows = await svTermine(supabase, sv.id, {
    statuses: ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt', 'gegenvorschlag'],
    from: fensterVon,
    to: fensterBis,
  })

  // Fall-/Claim-Enrichment (v_claim_full) fuer die Termine mit fall_id.
  const enrichFallIds = [...new Set(svTermineRows.map((t) => t.fall_id).filter(Boolean) as string[])]
  const fallMap = new Map<string, { claim_nummer: string | null; schadenort_ort: string | null; schadenort_adresse: string | null; lead_id: string | null; fall_status: string | null }>()
  if (enrichFallIds.length) {
    const { data: faelleFlat } = await supabase
      .from('v_claim_full')
      .select('fall_id, claim_nummer, schadenort_ort, schadenort_adresse, lead_id, fall_status')
      .in('fall_id', enrichFallIds)
    for (const f of (faelleFlat ?? []) as Array<Record<string, unknown>>) {
      fallMap.set(f.fall_id as string, {
        claim_nummer: (f.claim_nummer as string) ?? null,
        schadenort_ort: (f.schadenort_ort as string) ?? null,
        schadenort_adresse: (f.schadenort_adresse as string) ?? null,
        lead_id: (f.lead_id as string) ?? null,
        fall_status: (f.fall_status as string) ?? null,
      })
    }
  }

  // Lead-Namen (auch fuer bezug-native/pre-flowlink Termine ohne fall_id).
  const leadIds = [...new Set(svTermineRows
    .map((t) => (t.fall_id ? (fallMap.get(t.fall_id)?.lead_id ?? null) : effektiveBezugIds(t).leadId))
    .filter(Boolean) as string[])]
  const leadMap: Record<string, string> = {}
  if (leadIds.length) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data: leads } = await createAdminClient().from('leads').select('id, vorname, nachname').in('id', leadIds)
    for (const l of leads ?? []) leadMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }

  // faelle-Prop fuer SVKalenderClient: 1 Eintrag pro Termin (rendert sv_termin je Eintrag).
  const faelle = svTermineRows.map((t) => {
    const f = t.fall_id ? fallMap.get(t.fall_id) : null
    const eff = effektiveBezugIds(t)
    return {
      id: (t.fall_id ?? '') as string,
      claim_nummer: f?.claim_nummer ?? null,
      sv_termin: t.start_zeit,
      status: f?.fall_status ?? t.status,
      schadens_ort: f?.schadenort_ort ?? null,
      schadens_adresse: f?.schadenort_adresse ?? t.besichtigungsort_adresse ?? null,
      lead_id: (f?.lead_id ?? eff.leadId) ?? null,
      gutachter_termin_status: t.status,
    }
  })
  // termine-Prop: rohe Termin-Zeilen fuer Ablehnen/Gegenvorschlag-Aktionen.
  const termine = svTermineRows.map((t) => ({ id: t.id, fall_id: (t.fall_id ?? '') as string, status: t.status, final_verbindlich_ab: t.final_verbindlich_ab }))

  // AAR-864: verlegt-Slots als „Privater Termin"-Blocker im Kalender. Diese
  // tauchen NICHT in v_faelle_mit_aktuellem_termin auf (View priorisiert
  // verlegung_pending), sollen aber im Kalender weiter Slot-blockierend
  // sichtbar sein damit der SV nicht versehentlich neu drauf bucht.
  const fenster = new Date()
  const von = new Date(fenster.getFullYear(), fenster.getMonth(), fenster.getDate() - 14).toISOString()
  const bis = new Date(fenster.getFullYear(), fenster.getMonth(), fenster.getDate() + 35).toISOString()
  const { data: verlegteRows } = await supabase
    .from('gutachter_termine')
    .select('id, start_zeit, end_zeit')
    // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee_id/assignee_typ
    .eq('assignee_id', sv.id)
    .eq('assignee_typ', 'sachverstaendiger')
    .eq('status', 'verlegt')
    .gte('start_zeit', von)
    .lte('start_zeit', bis)
  const verlegteSlots = (verlegteRows ?? []).map((r) => ({
    id: r.id as string,
    start: r.start_zeit as string,
    end: r.end_zeit as string,
  }))

  // leadMap wird oben aus den kanonischen Termin-Zeilen gebaut.

  // AAR-229 W5 / F-12: Liste = chronologische Termine (Subset der Fälle mit sv_termin)
  const terminListe = (faelle ?? [])
    .filter(f => f.sv_termin)
    .sort((a, b) => new Date(a.sv_termin!).getTime() - new Date(b.sv_termin!).getTime())

  // 2026-05-06: Map start_zeit → fall_id für Time-Match-Clickability der
  // externalBusy-Events. Damit wird ein „Gebucht"-Pill der via Google
  // FreeBusy/CalDAV gelesen wurde, klickbar zum Claimondo-Auftrag, wenn
  // er zeitlich zu einem internen gutachter_termine matched (±2 Minuten
  // Toleranz, da Google-Events teils mit Sekunden-Drift zurückkommen).
  const claimondoTermineByStart = (faelle ?? [])
    .filter((f) => f.sv_termin)
    .map((f) => ({
      fallId: f.id as string,
      startMs: new Date(f.sv_termin as string).getTime(),
    }))

  return (
    <div className="h-full flex flex-col">
      <KalenderRealtimeRefresh profileId={user.id} />
      {/* View-Toggle */}
      <div className="px-4 py-2 bg-white border-b border-claimondo-border shrink-0">
        <PageHeader
          title="Kalender"
          actions={
            <div className="flex gap-1 bg-claimondo-bg rounded-ios-lg p-0.5">
              <Link
                href="/gutachter/kalender?view=kalender"
                className={`px-3 py-1.5 rounded-ios-md text-xs font-medium transition-colors ${
                  view === 'kalender' ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo'
                }`}
              >Kalender</Link>
              <Link
                href="/gutachter/kalender?view=liste"
                className={`px-3 py-1.5 rounded-ios-md text-xs font-medium transition-colors ${
                  view === 'liste' ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo'
                }`}
              >Liste</Link>
            </div>
          }
        />
      </div>

      {view === 'kalender' ? (
        <SVKalenderClient
          faelle={faelle ?? []}
          leadMap={leadMap}
          svId={sv.id}
          gcalConnected={gcalConnected}
          standortLat={sv.standort_lat ? Number(sv.standort_lat) : null}
          standortLng={sv.standort_lng ? Number(sv.standort_lng) : null}
          termine={(termine ?? []).map(t => ({
            id: t.id as string,
            fall_id: t.fall_id as string,
            status: t.status as string,
            final_verbindlich_ab: t.final_verbindlich_ab as string | null,
          }))}
          externalBusy={externalBusy}
          verlegteSlots={verlegteSlots}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {terminListe.length === 0 ? (
            // 2026-05-07 EmptyState-Iter-2: Kalender > Liste-View ist die
            // echte Termine-Empty-State (legacy /gutachter/termine wird hier
            // hin redirected). Wrapper-Component, weil diese Page eine
            // Server-Component ist und LucideIcon nicht über die RSC-Boundary
            // gereicht werden kann.
            <KalenderListeEmpty />
          ) : terminListe.map(fall => {
            const t = new Date(fall.sv_termin!)
            const name = fall.lead_id && leadMap[fall.lead_id] ? leadMap[fall.lead_id] : '—'
            return (
              <Link key={fall.id} href={`/gutachter/fall/${fall.id}`}
                className="block bg-white rounded-ios-xl border border-claimondo-border p-4 hover:bg-claimondo-bg transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-claimondo-navy">
                      {t.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} — {t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                    </p>
                    <p className="text-xs text-claimondo-ondo mt-0.5">{name} · {fall.schadens_ort ?? '—'}</p>
                  </div>
                  <span className="text-[10px] text-[var(--brand-secondary)]">{fall.claim_nummer ?? fall.id.slice(0, 8)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
