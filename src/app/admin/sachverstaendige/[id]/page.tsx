import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SvDetailClient from './SvDetailClient'
import VerifizierungsToggle from './VerifizierungsToggle'
import VerifizierungsTab, { type Tier2Slot, type PflichtdokumentSlot } from './VerifizierungsTab'
import { getSvStatus } from '@/lib/sv-status'
import FallStatusBadge from '@/components/shared/FallStatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import { getAlleSlots } from '@/lib/dokumente/katalog'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'

type SvSearchParams = { tab?: string }

export default async function SvDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SvSearchParams>
}) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const activeTab = sp.tab === 'verifizierung' ? 'verifizierung' : 'stammdaten'
  const supabase = await createClient()

  // AAR-659: profiles-Embed mit FK-Hint (Follow-up zu AAR-657 — die Stelle
  // war im ersten Scan durchgerutscht, weil der Einzel-Abfrage-Effekt auf
  // einer Detail-Page weniger auffällt als der „0 von 0" auf der Übersicht).
  // AAR-659: urlaub_von/bis mitladen — für Header-Badge.
  const { data: sv, error: svErr } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, paket, offene_faelle, partner_seit, ist_aktiv, notizen, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_adresse, standort_plz, standort_lat, standort_lng, standort_place_id, gutachter_typ, werbebudget_guthaben_netto, anzahlung_status, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, verifiziert, verifiziert_am, sa_vorlage_status, sa_vorlage_storage_path, sa_vorlage_hochgeladen_am, sa_vorlage_admin_notiz, verifizierung_status, verifizierung_frist_bis, gesperrt_grund, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer, qualifikationen_neu, spezifikationen, schadenarten, urlaub_von, urlaub_bis, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email, telefon)')
    .eq('id', id)
    .single()
  if (svErr) console.error('[admin/sv-detail] SV-Query:', svErr.message)

  if (!sv) notFound()

  // AAR-717: CalDAV-Verbindungs-Status für Admin-Banner. Wenn last_error
  // gesetzt ist, zeigen wir einen roten Hinweis im Stammdaten-Tab.
  const { data: caldavVerbindung } = await supabase
    .from('sv_kalender_verbindungen')
    .select('provider_label, calendar_display_name, last_error, last_error_at, connected_at, last_sync_at')
    .eq('sv_id', id)
    .eq('provider', 'caldav')
    .maybeSingle()

  const profileRaw = sv.profiles as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    vorname: string | null; nachname: string | null; email: string | null; telefon: string | null
  } | null

  // Google-Bewertung aus Cache laden (profile_id = sv.profile_id)
  const { data: bewertungRow } = sv.profile_id
    ? await supabase
        .from('google_bewertungen_cache')
        .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
        .eq('profile_id', sv.profile_id)
        .maybeSingle()
    : { data: null }
  const bewertung = bewertungRow ?? null

  // Fälle + Tasks parallel laden
  const [faelleRes, tasksRes] = await Promise.all([
    supabase.from('v_faelle_mit_aktuellem_termin')
      .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_termin, created_at, lead_id, leads(vorname, nachname)')
      .eq('sv_id', id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false }),
    supabase.from('tasks')
      .select('id, titel, typ, status, faellig_am, prioritaet, fall_id, faelle(fall_nummer)')
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
  })

  // AAR-359 W6: Verifizierungs-Tab-Daten (nur wenn aktiv — spart Queries sonst)
  // AAR-644: Komplettes Load defensiv via try/catch — bisher konnte ein Fehler
  // im createAdminClient (fehlender SERVICE_ROLE_KEY), createSignedUrl, oder
  // Katalog-Query die gesamte Server-Component zum Crash bringen → error.tsx
  // wurde angezeigt statt des Verifizierungs-Tabs. Der Support-Bot-Report
  // interpretierte die „Seite neu laden"-Error-Boundary als 404.
  let verifizierungsData: {
    saVorlageSignedUrl: string | null
    tier2Slots: Tier2Slot[]
    pflichtdokumente: PflichtdokumentSlot[]
    loadError: string | null
  } = { saVorlageSignedUrl: null, tier2Slots: [], pflichtdokumente: [], loadError: null }

  if (activeTab === 'verifizierung') {
    try {
      const dbAdmin = createAdminClient()

      // SA-Vorlage Signed URL (5 Min gültig für Admin-Preview)
      let signedUrl: string | null = null
      if (sv.sa_vorlage_storage_path) {
        const { data: sig, error: sigErr } = await dbAdmin.storage
          .from('fall-dokumente')
          .createSignedUrl(sv.sa_vorlage_storage_path, 300)
        if (sigErr) console.warn('[sv-verifizierung] createSignedUrl fehlgeschlagen:', sigErr.message)
        signedUrl = sig?.signedUrl ?? null
      }

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
        saVorlageSignedUrl: signedUrl,
        tier2Slots,
        pflichtdokumente,
        loadError: null,
      }
    } catch (err) {
      console.error('[sv-verifizierung] Tab-Load gescheitert:', err)
      verifizierungsData = {
        saVorlageSignedUrl: null,
        tier2Slots: [],
        pflichtdokumente: [],
        loadError: err instanceof Error ? err.message : 'Unbekannter Fehler',
      }
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sticky Header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-claimondo-border flex-shrink-0 px-4 py-3">
        <div>
          <Link href="/admin/sachverstaendige" className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors mb-1.5 inline-block">
            &larr; Gutachter-Übersicht
          </Link>
          <PageHeader
            title={name || 'Sachverständiger'}
            description={
              <span className="flex items-center gap-3 flex-wrap">
                {profile?.email && <span>{profile.email}</span>}
                {sv.gutachter_typ && <span className="bg-[#4573A2]/5 text-[#4573A2] px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.gutachter_typ}</span>}
                {sv.paket && <span className="bg-[#f8f9fb] px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.paket}</span>}
                {/* AAR-659: partner_seit + werbebudget waren im SELECT aber nie gerendert — Dead-Load. */}
                {sv.partner_seit && (
                  <span className="text-claimondo-ondo/70">
                    Partner seit {new Date(sv.partner_seit as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: '2-digit', year: 'numeric' })}
                  </span>
                )}
                {sv.werbebudget_guthaben_netto != null && Number(sv.werbebudget_guthaben_netto) > 0 && (
                  <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
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
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${aktiv ? 'bg-amber-50 text-amber-700' : 'bg-[#f8f9fb] text-claimondo-ondo'}`}>
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
                  <div className="w-20 h-1.5 bg-[#f8f9fb] rounded-full overflow-hidden mt-0.5">
                    <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-[#4573A2]'}`}
                      style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
                {/* ARCH-1 POLISH Befund 1: Onboarding-Status-Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium ${onboardingStatus.bg} ${onboardingStatus.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${onboardingStatus.dot}`} />
                  {onboardingStatus.label}
                </span>
                {/* AAR-425: Manueller Verifizierungs-Toggle (Whitelabel-Gate) */}
                <VerifizierungsToggle
                  svId={sv.id}
                  verifiziert={sv.verifiziert ?? false}
                  verifiziertAm={sv.verifiziert_am ?? null}
                />
                {/* CMM-31: Google-Bewertung aus Cache */}
                {bewertung?.durchschnitt != null && (
                  <GoogleBewertungBadge
                    durchschnitt={bewertung.durchschnitt as number}
                    anzahl={bewertung.anzahl_bewertungen as number | null}
                    zuletztAktualisiert={bewertung.zuletzt_aktualisiert_am as string | null}
                    size="sm"
                  />
                )}
                {/* KFZ-153: Gutachten-Mängel Warnung */}
                {(mangelCounts.formal > 0 || mangelCounts.inhaltlich > 0) && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600" title={`${mangelCounts.formal}x formaler Mangel, ${mangelCounts.inhaltlich}x inhaltlicher Mangel`}>
                    {mangelCounts.formal + mangelCounts.inhaltlich} Gutachten-Mängel
                  </span>
                )}
                {sv.ist_aktiv ? (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-600">Aktiv</span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-red-50 text-red-500">Inaktiv</span>
                )}
              </>
            }
          />
        </div>
      </div>

      {/* ── Tab-Navigation (AAR-359 W6) ────────────────────────────── */}
      <div className="border-b border-claimondo-border bg-white flex-shrink-0 px-4">
        <div className="max-w-6xl mx-auto flex gap-1">
          <Link
            href={`/admin/sachverstaendige/${id}`}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'stammdaten'
                ? 'border-[#4573A2] text-[#1E3A5F]'
                : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            Stammdaten
          </Link>
          <Link
            href={`/admin/sachverstaendige/${id}?tab=verifizierung`}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'verifizierung'
                ? 'border-[#4573A2] text-[#1E3A5F]'
                : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            Verifizierung
          </Link>
        </div>
      </div>

      {/* ── Tab-Content ──────────────────────────────────────────── */}
      {activeTab === 'verifizierung' ? (
        <div className="flex-1 overflow-y-auto p-4 bg-[#f8f9fb]/30">
          <div className="max-w-4xl mx-auto">
            {verifizierungsData.loadError && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Verifizierungs-Daten teilweise nicht geladen</p>
                <p className="text-amber-700">{verifizierungsData.loadError}</p>
                <p className="text-amber-600 mt-1">
                  Stammdaten sind weiterhin editierbar (Tab „Stammdaten"). SA-Vorlage + Tier-2-Slots werden nicht angezeigt bis Ursache gefixt ist.
                </p>
              </div>
            )}
            <VerifizierungsTab
              svId={sv.id}
              saVorlageStatus={(sv.sa_vorlage_status as 'ausstehend' | 'geprueft' | 'zurueckgewiesen' | null) ?? null}
              saVorlageStoragePath={sv.sa_vorlage_storage_path ?? null}
              saVorlageSignedUrl={verifizierungsData.saVorlageSignedUrl}
              saVorlageAdminNotiz={sv.sa_vorlage_admin_notiz ?? null}
              saVorlageHochgeladenAm={sv.sa_vorlage_hochgeladen_am ?? null}
              verifizierungStatus={(sv.verifizierung_status as 'ausstehend' | 'geprueft' | 'frist_ueberschritten' | null) ?? null}
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
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-6xl mx-auto flex">
          {/* LEFT: Edit Form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 min-w-0">
            {/* AAR-717: CalDAV-Verbindungs-Fehler-Banner */}
            {caldavVerbindung?.last_error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5 text-red-600">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                  </svg>
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-red-800">
                    Kalender-Verbindung fehlgeschlagen
                    {caldavVerbindung.last_error_at && (
                      <span className="text-red-600 font-normal ml-2 text-xs">
                        (seit {new Date(caldavVerbindung.last_error_at as string).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })})
                      </span>
                    )}
                  </p>
                  <p className="text-red-700 text-xs mt-1">
                    {caldavVerbindung.provider_label ?? 'CalDAV'} — {caldavVerbindung.last_error}
                  </p>
                  <p className="text-red-600 text-[11px] mt-1">
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
                  <p className={`text-2xl font-bold tabular-nums ${pct > 80 ? 'text-red-500' : pct > 50 ? 'text-amber-500' : 'text-[#4573A2]'}`}>{pct}%</p>
                  <p className="text-[10px] text-claimondo-ondo">Auslastung</p>
                </div>
              </div>
            </div>

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
              }}
            />
          </div>

          {/* RIGHT: Offene Fälle + Tasks Panel */}
          <div className="w-[340px] flex-shrink-0 border-l border-claimondo-border overflow-y-auto p-4 space-y-4 bg-[#f8f9fb]/30">
            {/* Offene Fälle */}
            <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
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
                        className="block px-3 py-2.5 border-b border-claimondo-border hover:bg-[#f8f9fb] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-claimondo-navy truncate">{kunde}</span>
                          <FallStatusBadge status={fall.status} size="xs" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#4573A2] font-mono">{fall.fall_nummer ?? fall.id.slice(0, 8)}</span>
                          {fall.sv_termin && <span className="text-[10px] text-claimondo-ondo/70">{new Date(fall.sv_termin).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Offene Tasks */}
            <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-claimondo-border">
                <span className="text-xs font-semibold text-claimondo-navy">Offene Tasks ({tasks.length})</span>
              </div>
              {tasks.length === 0 ? (
                <p className="py-6 text-center text-claimondo-ondo/70 text-xs">Keine offenen Tasks</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {tasks.map(t => {
                    const fr = t.faelle as unknown as Record<string, unknown> | null
                    const fallNr = (fr?.fall_nummer as string) ?? '—'
                    const overdue = t.faellig_am && new Date(t.faellig_am) < now
                    return (
                      <Link key={t.id} href={t.fall_id ? `/faelle/${t.fall_id}` : '#'}
                        className={`block px-3 py-2.5 border-b border-claimondo-border hover:bg-[#f8f9fb] transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                        <p className="text-xs text-claimondo-navy font-medium truncate">{t.titel}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                          <span className="text-claimondo-ondo/70 font-mono">{fallNr}</span>
                          {t.faellig_am && (
                            <span className={overdue ? 'text-red-500 font-semibold' : 'text-claimondo-ondo/70'}>
                              {new Date(t.faellig_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                          {t.prioritaet === 'kritisch' && <span className="bg-red-50 text-red-500 px-1 rounded font-semibold">!</span>}
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
    </div>
  )
}
