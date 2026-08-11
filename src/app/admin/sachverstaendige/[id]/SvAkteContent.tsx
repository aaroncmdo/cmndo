import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SvDetailClient from './SvDetailClient'
import VerifizierungsToggle from './VerifizierungsToggle'
import TestAccountToggle from './TestAccountToggle'
import VerifizierungsTab, { type Tier2Slot, type PflichtdokumentSlot } from './VerifizierungsTab'
import AbrechnungsTab from './AbrechnungsTab'
import { getSvStatus } from '@/lib/sv-status'
import FallStatusBadge from '@/components/shared/FallStatusBadge'
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'
import { getAlleSlots } from '@/lib/dokumente/katalog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FinderVisibilityBadge } from '@/components/admin/FinderVisibilityBadge'
import { getPartnerBilling } from '@/lib/finance/partner-billing'
import type { PartnerBillingRow, PartnerBillingAggregat } from '@/lib/finance/partner-billing'
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'
import NetzwerkAboSektion, { type NetzwerkAboRow } from './NetzwerkAboSektion'
import { istAktivesAbo } from '@/lib/netzwerk/entitlement'

type SvSearchParams = { tab?: string }

export default async function SvDetailPage({
  params,
  searchParams,
  variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SvSearchParams>
  /**
   * "drawer" wenn eine Intercepting-Route diese Page im DrawerShell rendert
   * (@drawer/(.)[id] bzw. vertrieb/@drawer/(.)sachverstaendige/[id]).
   * Next uebergibt der echten Route nur params/searchParams -> Default "page".
   */
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const activeTab = sp.tab === 'verifizierung' ? 'verifizierung' : sp.tab === 'abrechnungen' ? 'abrechnungen' : 'stammdaten'
  const tabs: DetailTab[] = [
    { key: 'stammdaten', label: 'Stammdaten', href: `/admin/vertrieb/sachverstaendige/${id}` },
    { key: 'verifizierung', label: 'Verifizierung', href: `/admin/vertrieb/sachverstaendige/${id}?tab=verifizierung` },
    { key: 'abrechnungen', label: 'Abrechnungen', href: `/admin/vertrieb/sachverstaendige/${id}?tab=abrechnungen` },
  ]
  const supabase = await createClient()

  // AAR-659: profiles-Embed mit FK-Hint (Follow-up zu AAR-657 — die Stelle
  // war im ersten Scan durchgerutscht, weil der Einzel-Abfrage-Effekt auf
  // einer Detail-Page weniger auffällt als der „0 von 0" auf der Übersicht).
  // AAR-659: urlaub_von/bis mitladen — für Header-Badge.
  const { data: sv, error: svErr } = await supabase
    .from('sachverstaendige')
    .select('id, firmenname, profile_id, paket, onboarding_quelle, offene_faelle, partner_seit, ist_aktiv, notizen, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_adresse, standort_plz, standort_lat, standort_lng, standort_place_id, gutachter_typ, werbebudget_guthaben_netto, anzahlung_status, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, verifiziert, verifiziert_am, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, gesperrt_grund, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer, qualifikationen_neu, spezifikationen, schadenarten, urlaub_von, urlaub_bis, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email, telefon, google_place_id)')
    .eq('id', id)
    .single()
  if (svErr) console.error('[admin/sv-detail] SV-Query:', svErr.message)

  if (!sv) notFound()

  // Gutachter-Onboarding-Audit (Befund #6): ist_testaccount separat via untyped
  // admin-client lesen — die Spalte ist neu und noch nicht in database.types, der
  // typisierte Select oben wuerde sonst tsc brechen. Defensive: bei fehlendem
  // SERVICE_ROLE_KEY nicht die ganze Seite crashen (default false).
  let istTestaccount = false
  try {
    const { data: testFlagRow } = await createAdminClient()
      .from('sachverstaendige')
      .select('ist_testaccount')
      .eq('id', id)
      .maybeSingle()
    istTestaccount = Boolean((testFlagRow as { ist_testaccount?: boolean } | null)?.ist_testaccount)
  } catch (err) {
    console.error('[admin/sv-detail] ist_testaccount-Read:', err)
  }

  // Aaron 07.07.: Finder-Sichtbarkeit — hat der SV eine berechnete Isochrone?
  // Leichter Boolean-Check (die Isochrone selbst ist ~10k Vertices, hier nicht noetig).
  const { data: isoRow } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('id', id)
    .not('isochrone_polygon', 'is', null)
    .maybeSingle()
  const hatIsochrone = !!isoRow

  // Netzwerkpartner-Abo-Rows für die Admin-Sektion (Status + comped-Toggle).
  // AdminClient: sv_netzwerk_abonnements ist RLS-locked für den Admin-User-Context.
  // Defensiv wie der ist_testaccount-Read — ein Fehler crasht nicht die Seite.
  let netzwerkAbos: NetzwerkAboRow[] = []
  let netzwerkAboLoadError: string | null = null
  try {
    const { data, error } = await createAdminClient()
      .from('sv_netzwerk_abonnements')
      .select('id, status, gueltig_bis, stripe_subscription_id, erstellt_am')
      .eq('sv_id', id)
      .order('erstellt_am', { ascending: false })
    if (error) {
      netzwerkAboLoadError = error.message
    } else {
      const jetzt = new Date()
      netzwerkAbos = (data ?? []).map((r) => {
        const status = r.status as string
        const gueltigBis = (r.gueltig_bis as string | null) ?? null
        return {
          id: r.id as string,
          status,
          gueltigBis,
          stripeSubscriptionId: (r.stripe_subscription_id as string | null) ?? null,
          erstelltAm: r.erstellt_am as string,
          istAktiv: istAktivesAbo({ status, gueltig_bis: gueltigBis }, jetzt),
        }
      })
    }
  } catch (err) {
    console.error('[admin/sv-detail] netzwerk-abo-Read:', err)
    netzwerkAboLoadError = err instanceof Error ? err.message : 'Unbekannter Fehler'
  }

  // AAR-717: CalDAV-Verbindungs-Status für Admin-Banner. Wenn last_error
  // gesetzt ist, zeigen wir einen roten Hinweis im Stammdaten-Tab.
  // Admin-Client: kalender_verbindungen ist RLS-locked (profile_id = auth.uid());
  // der Admin liest hier eine FREMDE profile_id -> user-context liefe leer.
  const { data: caldavVerbindung } = sv.profile_id
    ? await createAdminClient()
        .from('kalender_verbindungen')
        .select('provider_label, calendar_display_name, last_error, last_error_at, connected_at, last_sync_at')
        .eq('profile_id', sv.profile_id)
        .eq('provider', 'caldav')
        .maybeSingle()
    : { data: null }

  const profileRaw = sv.profiles as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    vorname: string | null; nachname: string | null; email: string | null; telefon: string | null; google_place_id: string | null
  } | null

  // Fälle + Tasks parallel laden
  const [faelleRes, tasksRes] = await Promise.all([
    supabase.from('v_faelle_mit_aktuellem_termin')
      .select('id, claim_nummer, status, schadens_ursache, schadens_ort, sv_termin, created_at, lead_id, leads!lead_id(vorname, nachname)')
      .eq('sv_id', id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false }),
    supabase.from('tasks')
      .select('id, titel, typ, status, faellig_am, prioritaet, fall_id, claims:claim_id(claim_nummer)')
      .eq('zugewiesen_an', sv.profile_id)
      .in('status', ['offen', 'in-bearbeitung'])
      .order('faellig_am', { ascending: true })
      .limit(20),
  ])

  const faelle = faelleRes.data ?? []
  const tasks = tasksRes.data ?? []

  // KFZ-153: Gutachten-Mängel Counts für diesen SV
  const fallIds = faelle.map(f => f.id)
  let mangelCounts = { formal: 0, inhaltlich: 0 }
  if (fallIds.length > 0) {
    const { data: mangel } = await supabase
      .from('regulierungs_klassifizierung')
      .select('kuerzungsgrund')
      .in('fall_id', fallIds)
      .in('kuerzungsgrund', ['gutachten_formaler_mangel', 'gutachten_inhaltlicher_mangel'])
    if (mangel) {
      mangelCounts = {
        formal: mangel.filter(m => m.kuerzungsgrund === 'gutachten_formaler_mangel').length,
        inhaltlich: mangel.filter(m => m.kuerzungsgrund === 'gutachten_inhaltlicher_mangel').length,
      }
    }
  }

  const name = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : ''
  const maxFaelle = sv.paket_faelle_gesamt ?? 10
  const genutzt = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const pct = maxFaelle > 0 ? Math.round((genutzt / maxFaelle) * 100) : 0
  const now = new Date()

  // ARCH-1 POLISH Befund 1: Onboarding-Status-Badge im Detail-Header
  const onboardingStatus = getSvStatus({
    portal_zugang_freigeschaltet: sv.portal_zugang_freigeschaltet,
    vertrag_unterschrieben: sv.vertrag_unterschrieben,
    gesperrt_seit: sv.gesperrt_seit,
    paket: sv.paket,
  })

  // AAR-359 W6: Verifizierungs-Tab-Daten (nur wenn aktiv — spart Queries sonst)
  // AAR-644: Komplettes Load defensiv via try/catch — bisher konnte ein Fehler
  // im createAdminClient (fehlender SERVICE_ROLE_KEY), createSignedUrl, oder
  // Katalog-Query die gesamte Server-Component zum Crash bringen → error.tsx
  // wurde angezeigt statt des Verifizierungs-Tabs. Der Support-Bot-Report
  // interpretierte die „Seite neu laden"-Error-Boundary als 404.
  let verifizierungsData: {
    tier2Slots: Tier2Slot[]
    pflichtdokumente: PflichtdokumentSlot[]
    loadError: string | null
  } = { tier2Slots: [], pflichtdokumente: [], loadError: null }

  if (activeTab === 'verifizierung') {
    try {
      const dbAdmin = createAdminClient()

      // Tier-2-Slots aus Katalog + bereits angeforderte pflichtdokumente-Rows
      const [alleSlots, pflichtRes] = await Promise.all([
        getAlleSlots(supabase),
        dbAdmin.from('pflichtdokumente')
          .select('id, dokument_typ, status, hochgeladen_am, dokument_url, begruendung')
          .eq('sv_id', id),
      ])
      const pflichtRows = (pflichtRes.data ?? []) as Array<{
        id: string
        dokument_typ: string
        status: Tier2Slot['status']
        hochgeladen_am: string | null
      }>

      // AAR-553: Upload-Counts wurden früher via dokumente.pflichtdokument_id
      // geführt — die Spalte existiert jedoch weder in der alten dokumente-
      // Tabelle (verifiziert) noch in fall_dokumente. Rückwirkend bestätigt:
      // Counts waren immer 0.
      const uploadCounts: Record<string, number> = {}

      // AAR-691 / AAR-714: Nur Tier-2-Verifizierungs-Slots (echte
      // Qualifikations-Nachweise). SA-Vorlage + die 4 neuen Pflicht-Slots
      // (Sicherungsabtretung, Honorarvereinbarung, Datenschutz, Widerruf)
      // werden separat als Tier-1-Pflichtdokumente dargestellt.
      const PFLICHT_SLOT_IDS = [
        'sv_sicherungsabtretung',
        'sv_honorarvereinbarung',
        'sv_datenschutzerklaerung',
        'sv_widerrufsbelehrung',
      ] as const
      const VERIFIZIERUNG_HIDDEN_SLOTS = new Set<string>([
        'sv_sa_vorlage',
        'sv_abtretungserklaerung',
        ...PFLICHT_SLOT_IDS,
      ])
      const verifizierungsSlots = alleSlots.filter(
        (s) =>
          s.kategorie === 'gutachter_verifizierung' &&
          !VERIFIZIERUNG_HIDDEN_SLOTS.has(s.slot_id),
      )
      // AAR-515: Nummer-Mapping pro Slot. Admin sieht Nummer + Dokument
      // nebeneinander beim Prüfen — Plausibilisierungs-Hilfe.
      const nummernMap: Record<string, { nummer: string | null; label: string }> = {
        sv_bvsk_mitgliedschaft: { nummer: sv.bvsk_mitgliedsnummer ?? null, label: 'BVSK-Mitgliedsnummer' },
        sv_ihk_zertifikat: { nummer: sv.ihk_zertifikat_nummer ?? null, label: 'IHK-Zertifikats-Nummer' },
        sv_bestellungsurkunde_oebuv: { nummer: sv.oebuv_bestellungsnummer ?? null, label: 'Bestellungsnummer' },
      }
      const tier2Slots: Tier2Slot[] = verifizierungsSlots.map(s => {
        const row = pflichtRows.find(p => p.dokument_typ === s.slot_id)
        const nummerInfo = nummernMap[s.slot_id] ?? { nummer: null, label: '' }
        return {
          slotId: s.slot_id,
          label: s.label,
          beschreibung: s.beschreibung,
          pflichtdokId: row?.id ?? null,
          status: row?.status ?? null,
          hochgeladenAm: row?.hochgeladen_am ?? null,
          uploadCount: row ? (uploadCounts[row.id] ?? 0) : 0,
          mapsToQualifikation: s.maps_to_qualifikation,
          steuertKundensichtbarkeit: s.steuert_kundensichtbarkeit,
          nummer: nummerInfo.nummer,
          nummerLabel: nummerInfo.nummer ? nummerInfo.label : null,
        }
      })

      // AAR-714: Tier-1-Pflichtdokumente (4 Slots) zusammenstellen mit
      // Signed-URL fürs Preview. Slots ohne pflichtdokumente-Row zeigen
      // wir als „leer" an.
      const pflichtSlotsAlle = alleSlots.filter((s) =>
        (PFLICHT_SLOT_IDS as readonly string[]).includes(s.slot_id),
      )
      const pflichtdokumente: PflichtdokumentSlot[] = []
      for (const slot of pflichtSlotsAlle) {
        const row = pflichtRows.find((p) => p.dokument_typ === slot.slot_id)
        let signed: string | null = null
        const dokUrl = (row as { dokument_url?: string | null } | undefined)?.dokument_url ?? null
        if (dokUrl) {
          const { data: sig, error: sigErr } = await dbAdmin.storage
            .from('fall-dokumente')
            .createSignedUrl(dokUrl, 300)
          if (sigErr) console.warn('[sv-pflichtdok] createSignedUrl:', sigErr.message)
          signed = sig?.signedUrl ?? null
        }
        pflichtdokumente.push({
          slotId: slot.slot_id,
          label: slot.label,
          beschreibung: slot.beschreibung,
          pflichtdokId: row?.id ?? null,
          status: (row?.status as PflichtdokumentSlot['status']) ?? null,
          hochgeladenAm: row?.hochgeladen_am ?? null,
          dokumentUrl: dokUrl,
          signedUrl: signed,
          adminNotiz: (row as { begruendung?: string | null } | undefined)?.begruendung ?? null,
        })
      }

      verifizierungsData = {
        tier2Slots,
        pflichtdokumente,
        loadError: null,
      }
    } catch (err) {
      console.error('[sv-verifizierung] Tab-Load gescheitert:', err)
      verifizierungsData = {
        tier2Slots: [],
        pflichtdokumente: [],
        loadError: err instanceof Error ? err.message : 'Unbekannter Fehler',
      }
    }
  }

  // Abrechnungs-Tab-Daten (nur wenn aktiv — spart Query sonst)
  let abrechnungsRows: PartnerBillingRow[] = []
  let abrechnungsAggregat: PartnerBillingAggregat = { perStatus: {}, perPartnerTyp: {}, hat_unbekannten_ust_status: false }
  if (activeTab === 'abrechnungen') {
    const result = await getPartnerBilling({ partnerTyp: 'sv', partnerId: id })
    abrechnungsRows = result.rows
    abrechnungsAggregat = result.aggregat
  }

  return (
    <EntityDetailShell
      variant={variant}
      title={name || 'Sachverständiger'}
      backHref="/admin/sachverstaendige"
      backLabel="Gutachter-Übersicht"
      tabs={tabs}
      activeTab={activeTab}
      description={
              <span className="flex items-center gap-3 flex-wrap">
                {profile?.email && <span>{profile.email}</span>}
                {sv.gutachter_typ && <span className="bg-claimondo-ondo/5 text-claimondo-ondo px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.gutachter_typ}</span>}
                {sv.paket && <span className="bg-claimondo-bg px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.paket}</span>}
                {/* AAR-659: partner_seit + werbebudget waren im SELECT aber nie gerendert — Dead-Load. */}
                {sv.partner_seit && (
                  <span className="text-claimondo-ondo/70">
                    Partner seit {new Date(sv.partner_seit as string).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' })}
                  </span>
                )}
                {sv.werbebudget_guthaben_netto != null && Number(sv.werbebudget_guthaben_netto) > 0 && (
                  <span className="bg-success-soft text-success-strong px-1.5 py-0.5 rounded text-[10px] font-medium">
                    Werbebudget {Number(sv.werbebudget_guthaben_netto).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                )}
                {/* AAR-659: Urlaub-Badge wenn aktiv oder anstehend */}
                {sv.urlaub_von && sv.urlaub_bis && (() => {
                  const heute = new Date().toISOString().slice(0, 10)
                  const von = sv.urlaub_von as string
                  const bis = sv.urlaub_bis as string
                  const aktiv = heute >= von && heute <= bis
                  const anstehend = heute < von
                  if (!aktiv && !anstehend) return null
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${aktiv ? 'bg-warning-soft text-warning-strong' : 'bg-claimondo-bg text-claimondo-ondo'}`}>
                      Urlaub {von}–{bis}
                    </span>
                  )
                })()}
              </span>
            }
            actions={
              <>
                <div className="text-right">
                  <span className="text-sm font-bold text-claimondo-navy tabular-nums">{genutzt}/{maxFaelle}</span>
                  <div className="w-20 h-1.5 bg-claimondo-bg rounded-full overflow-hidden mt-0.5">
                    <div className={`h-full rounded-full ${pct > 80 ? 'bg-danger' : pct > 50 ? 'bg-warning' : 'bg-claimondo-ondo'}`}
                      style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
                {/* ARCH-1 POLISH Befund 1: Onboarding-Status-Badge — shared StatusBadge
                    (colorCls-Escape-Hatch), identisch zur Dispatch-Detailsicht. */}
                <StatusBadge colorCls={`${onboardingStatus.bg} ${onboardingStatus.text}`}>
                  {onboardingStatus.label}
                </StatusBadge>
                {/* AAR-425: Manueller Verifizierungs-Toggle (Whitelabel-Gate) */}
                <VerifizierungsToggle
                  svId={sv.id}
                  verifiziert={sv.verifiziert ?? false}
                  verifiziertAm={sv.verifiziert_am ?? null}
                />
                {/* Gutachter-Onboarding-Audit (Befund #6): Test-Account-Toggle */}
                <TestAccountToggle svId={sv.id} istTestaccount={istTestaccount} />
                {/* KFZ-153: Gutachten-Mängel Warnung */}
                {(mangelCounts.formal > 0 || mangelCounts.inhaltlich > 0) && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-warning-soft text-warning" title={`${mangelCounts.formal}x formaler Mangel, ${mangelCounts.inhaltlich}x inhaltlicher Mangel`}>
                    {mangelCounts.formal + mangelCounts.inhaltlich} Gutachten-Mängel
                  </span>
                )}
                {/* Audit Slice 2 (Badge-Dedup): der rohe ist_aktiv-Chip ("Aktiv"/"Inaktiv")
                    wurde entfernt — er duplizierte bzw. WIDERSPRACH dem Lifecycle-Badge oben
                    (getSvStatus: portal_zugang=true => "Aktiv"; gesperrt_seit => "Gesperrt").
                    getSvStatus ist die EINE Lifecycle-Achse; ist_aktiv=false ohne Sperre ist ein
                    Vor-Freischaltungs-Zustand ("Wartet auf ..."), den zusaetzlich das
                    FinderVisibilityBadge ("nicht aktiv") traegt. Prod-verifiziert 17.07.:
                    0 SVs sind portal-frei + ist_aktiv=false => kein "live-aber-inaktiv"-Verlust. */}
                {/* Aaron 07.07.: Finder-Sichtbarkeit — zeigt WARUM ein SV (nicht) im oeffentlichen Finder auftaucht */}
                <FinderVisibilityBadge
                  sv={{
                    verifiziert: sv.verifiziert,
                    ist_aktiv: sv.ist_aktiv,
                    hatIsochrone,
                    standort_lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
                    standort_lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
                    istTestaccount,
                  }}
                />
              </>
      }
    >
      {/* ── Tab-Content (Tab-Bar liefert EntityDetailShell) ────────── */}
      {activeTab === 'abrechnungen' ? (
        <AbrechnungsTab rows={abrechnungsRows} aggregat={abrechnungsAggregat} />
      ) : activeTab === 'verifizierung' ? (
        <div className="flex-1 overflow-y-auto p-4 bg-claimondo-bg/30">
          <div className="max-w-4xl mx-auto">
            {verifizierungsData.loadError && (
              <div className="mb-4 rounded-ios-xl border border-warning/30 bg-warning-soft px-4 py-3 text-xs text-warning-strong">
                <p className="font-semibold mb-1">Verifizierungs-Daten teilweise nicht geladen</p>
                <p className="text-warning-strong">{verifizierungsData.loadError}</p>
                <p className="text-warning mt-1">
                  Stammdaten sind weiterhin editierbar (Tab „Stammdaten"). Tier-2-Slots + Pflichtdokumente werden nicht angezeigt bis Ursache gefixt ist.
                </p>
              </div>
            )}
            <VerifizierungsTab
              svId={sv.id}
              paket={(sv.paket as string | null) ?? null}
              onboardingQuelle={(sv.onboarding_quelle as string | null) ?? null}
              verifizierungStatus={(sv.verifizierung_status as 'ausstehend' | 'geprueft' | 'frist_ueberschritten' | 'abgelehnt' | null) ?? null}
              verifizierungAdminNotiz={(sv.verifizierung_admin_notiz as string | null) ?? null}
              verifizierungFristBis={sv.verifizierung_frist_bis ?? null}
              verifiziertAm={sv.verifiziert_am ?? null}
              tier2Slots={verifizierungsData.tier2Slots}
              pflichtdokumente={verifizierungsData.pflichtdokumente}
              svVerifiziert={sv.verifiziert ?? false}
              gesperrtSeit={sv.gesperrt_seit ?? null}
              gesperrtGrund={sv.gesperrt_grund ?? null}
            />
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto md:overflow-hidden">
        <div className="md:h-full max-w-6xl mx-auto flex flex-col md:flex-row">
          {/* LEFT: Edit Form */}
          <div className="flex-1 md:overflow-y-auto p-4 space-y-5 min-w-0">
            {/* AAR-717: CalDAV-Verbindungs-Fehler-Banner */}
            {caldavVerbindung?.last_error && (
              <div className="bg-danger-soft border border-danger/30 rounded-2xl p-4 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5 text-danger">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                  </svg>
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-danger-strong">
                    Kalender-Verbindung fehlgeschlagen
                    {caldavVerbindung.last_error_at && (
                      <span className="text-danger font-normal ml-2 text-xs">
                        (seit {new Date(caldavVerbindung.last_error_at as string).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })})
                      </span>
                    )}
                  </p>
                  <p className="text-danger-strong text-xs mt-1">
                    {caldavVerbindung.provider_label ?? 'CalDAV'} — {caldavVerbindung.last_error}
                  </p>
                  <p className="text-danger text-[11px] mt-1">
                    Dispatch läuft weiter (fail-open), Termin-Überschneidungen können jedoch nicht geprüft werden bis der SV neu verbindet.
                  </p>
                </div>
              </div>
            )}
            {/* Auslastung */}
            <div className="bg-white border border-claimondo-border rounded-2xl p-5">
              <h2 className="text-sm font-medium text-claimondo-ondo mb-3">Auslastung & Paket</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-claimondo-navy tabular-nums">{genutzt}</p>
                  <p className="text-[10px] text-claimondo-ondo">Aktive Fälle</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-claimondo-navy tabular-nums">{maxFaelle}</p>
                  <p className="text-[10px] text-claimondo-ondo">Max. Kapazität</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${pct > 80 ? 'text-danger' : pct > 50 ? 'text-warning' : 'text-claimondo-ondo'}`}>{pct}%</p>
                  <p className="text-[10px] text-claimondo-ondo">Auslastung</p>
                </div>
              </div>
            </div>

            {/* Netzwerkpartner-Status + comped-Toggle (Matching-Override P1.4 haengt daran) */}
            <NetzwerkAboSektion svId={sv.id} abos={netzwerkAbos} loadError={netzwerkAboLoadError} />

            {/* Edit form mit Google Places */}
            <SvDetailClient
              sv={{
                id: sv.id,
                profileId: sv.profile_id!,
                vorname: profile?.vorname ?? '',
                nachname: profile?.nachname ?? '',
                telefon: profile?.telefon ?? '',
                paket: sv.paket,
                maxFaelleMonat: sv.paket_faelle_gesamt ?? 10,
                istAktiv: sv.ist_aktiv ?? true,
                gesperrtSeit: sv.gesperrt_seit ?? null,
                gesperrtGrund: sv.gesperrt_grund ?? null,
                notizen: sv.notizen ?? '',
                standortAdresse: sv.standort_adresse ?? '',
                standortPlz: sv.standort_plz ?? '',
                standortLat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
                standortLng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
                standortPlaceId: sv.standort_place_id ?? '',
                paketUmkreisKm: sv.paket_umkreis_km ?? 15,
                qualifikationen: (sv.qualifikationen_neu as string[] | null) ?? [],
                spezifikationen: (sv.spezifikationen as string[] | null) ?? [],
                schadenarten: (sv.schadenarten as string[] | null) ?? [],
                bvskMitgliedsnummer: sv.bvsk_mitgliedsnummer ?? '',
                ihkZertifikatNummer: sv.ihk_zertifikat_nummer ?? '',
                oebuvBestellungsnummer: sv.oebuv_bestellungsnummer ?? '',
                googlePlaceId: profile?.google_place_id ?? null,
              }}
            />

            {/* Partner-Aktivität (CRM-Cockpit) — additiv, nicht im Verifizierung-Tab verschachtelt */}
            <div className="mt-6">
              <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
              <PartnerCockpitPanel partnerTyp="sv" partnerId={id} />
            </div>
          </div>

          {/* RIGHT: Offene Fälle + Tasks Panel — mobil unter dem Formular (Top-Border statt Left). */}
          <div className="w-full md:w-[340px] md:flex-shrink-0 border-t md:border-t-0 md:border-l border-claimondo-border md:overflow-y-auto p-4 space-y-4 bg-claimondo-bg/30">
            {/* Offene Fälle */}
            <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-claimondo-border">
                <span className="text-xs font-semibold text-claimondo-navy">Offene Fälle ({faelle.length})</span>
              </div>
              {faelle.length === 0 ? (
                <p className="py-6 text-center text-claimondo-ondo/70 text-xs">Keine offenen Fälle</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {faelle.map(fall => {
                    const leadRaw = fall.leads as unknown
                    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as { vorname: string | null; nachname: string | null } | null
                    const kunde = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
                    return (
                      <Link key={fall.id} href={`/faelle/${fall.id}`}
                        className="block px-3 py-2.5 border-b border-claimondo-border hover:bg-claimondo-bg transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-claimondo-navy truncate">{kunde}</span>
                          <FallStatusBadge status={fall.status} size="xs" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-claimondo-ondo font-mono">{fall.claim_nummer ?? fall.id.slice(0, 8)}</span>
                          {fall.sv_termin && <span className="text-[10px] text-claimondo-ondo/70">{new Date(fall.sv_termin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Offene Tasks */}
            <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-claimondo-border">
                <span className="text-xs font-semibold text-claimondo-navy">Offene Tasks ({tasks.length})</span>
              </div>
              {tasks.length === 0 ? (
                <p className="py-6 text-center text-claimondo-ondo/70 text-xs">Keine offenen Tasks</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {tasks.map(t => {
                    const frRaw = t.claims as unknown
                    const frClaim = (Array.isArray(frRaw) ? frRaw[0] : frRaw) as { claim_nummer: string | null } | null
                    const fallNr = (frClaim?.claim_nummer as string) ?? '—'
                    const overdue = t.faellig_am && new Date(t.faellig_am) < now
                    return (
                      <Link key={t.id} href={t.fall_id ? `/faelle/${t.fall_id}` : '#'}
                        className={`block px-3 py-2.5 border-b border-claimondo-border hover:bg-claimondo-bg transition-colors ${overdue ? 'bg-danger-soft/30' : ''}`}>
                        <p className="text-xs text-claimondo-navy font-medium truncate">{t.titel}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                          <span className="text-claimondo-ondo/70 font-mono">{fallNr}</span>
                          {t.faellig_am && (
                            <span className={overdue ? 'text-danger font-semibold' : 'text-claimondo-ondo/70'}>
                              {new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                          {t.prioritaet === 'kritisch' && <span className="bg-danger-soft text-danger px-1 rounded font-semibold">!</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </EntityDetailShell>
  )
}
