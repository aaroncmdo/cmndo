// CMM-28: Kunde-Detail-Page komplett auf claim-Loader umgestellt.
//
// Vorher: getFallById(supabase, id, FALL_SELECT_KUNDE) las aus
// v_faelle_mit_aktuellem_termin. Jetzt: getKundeFallDetailRecord liest
// claims als Anker + faelle als Lifecycle-Bridge + gutachter_termine.
// Output-Shape ist ein flaches Record damit die Sub-Components 1:1
// weiter funktionieren.
//
// Cleanup:
//   • EskalationsErgebnisCard raus (Eskalations-Edge-Case)
//   • FaqBotCard raus (lieber WhatsApp-First Support)
//   • ReFrageKanzleiClient raus (Self-Review-Modal)
//   • SaeuleMeinAnwalt + KanzleiAnsprechpartnerBlock-Render raus —
//     konsolidiert zu einer „Meine Kanzlei"-Card.
//
// KanzleiAnsprechpartnerBlock-Component bleibt unter
// src/components/shared/claims/ erhalten — Admin- und KB-Portal nutzen
// sie weiter.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorageUrl, getStorageUrlBulk } from '@/lib/storage/url'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { FallPhasenPanel } from '@/components/shared/fall-phases'
import PageHeader from '@/components/shared/PageHeader'
import FallDetailSections from './FallDetailSections'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
import PflichtdokumenteSection from '@/components/fall/PflichtdokumenteSection'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { MeineKanzleiCard } from '@/components/kunde/kanzlei'
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import SaeuleMeinBetreuer from '@/components/kunde/SaeuleMeinBetreuer'
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import { saveBankdaten, updateZahlungsweg } from './actions'
import GutachtenWeiterleitungButton from '@/components/kunde/GutachtenWeiterleitungButton'
import KundeAbschlussCard from '@/components/kunde/KundeAbschlussCard'
import KundeBetreuerStrip from '@/components/kunde/KundeBetreuerStrip'
import GoogleReviewPrompt from '@/components/kunde/GoogleReviewPrompt'
import KanzleiPfadCard from '@/components/kunde/KanzleiPfadCard'
import KundeAusfallEntschaedigungCard from '@/components/kunde/KundeAusfallEntschaedigungCard'
import TerminSectionCard from '@/components/kunde/TerminSectionCard'
import TerminVerlegungBanner from '@/components/kunde/TerminVerlegungBanner'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
import KundeSvLiveBanner from '@/components/kunde/KundeSvLiveBanner'
import ClaimStepper from '@/components/kunde/ClaimStepper'
import { getAlleAuftraege } from '@/lib/auftrag/queries'
import { getKanzleiFall } from '@/lib/kanzlei-fall/queries'
import { getClaimLifecycle } from '@/lib/claims/lifecycle'
import { getKundeFallDetailRecord, getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

// AAR-864: force-dynamic, damit der Verlegungs-Banner direkt nach dem
// SV-Submit ohne Hard-Reload erscheint (revalidatePath alleine reicht
// nicht zuverlässig wenn der Kunde gerade auf der Page ist).
export const dynamic = 'force-dynamic'

export default async function KundeFallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()

    // CMM-28: claim-zentrierter Loader. Ownership wird intern aufgelöst
    // (claim_parties.user_id ODER faelle.kunde_id ODER lead.email).
    const fall = await getKundeFallDetailRecord(admin, user.id, user.email ?? null, id)
    if (!fall) notFound()

    // Kunde-Vorname (für TerminLiveStatus "X ist da")
    const { data: kundeProfile } = await admin
      .from('profiles')
      .select('vorname')
      .eq('id', user.id)
      .maybeSingle()
    const kundeVorname = (kundeProfile?.vorname as string | null) ?? null

    // CMM-28: Zurück-Link „← Meine Fälle" nur sinnvoll wenn der Kunde
    // mehrere Fälle hat. Bei Single-Fall existiert keine Liste-Seite zum
    // zurückkehren (Layout-Nav heißt „Mein Fall" + linked direkt hierher).
    const allFaelle = await getKundeFaelle(admin, user.id, user.email ?? null)
    const hatMehrereFaelle = allFaelle.length > 1

    // Kanzlei-Daten laden (Name, Adresse, Email aus kanzleien-Tabelle)
    let kanzleiRow: { name: string | null; email: string | null; adresse: string | null } | null = null
    if (fall.kanzlei_id) {
      const { data: k } = await admin
        .from('kanzleien')
        .select('name, email, adresse')
        .eq('id', fall.kanzlei_id as string)
        .maybeSingle()
      if (k) {
        kanzleiRow = {
          name: (k.name as string | null) ?? null,
          email: (k.email as string | null) ?? null,
          adresse: (k.adresse as string | null) ?? null,
        }
      }
    }

    // SV-Daten laden
    let svName: string | null = null
    let svTelefon: string | null = null
    let svVerifiziert = false
    let svGooglePlaceId: string | null = null
    let svAvatarUrl: string | null = null
    let svBeschreibung: string | null = null
    if (fall.sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('profile_id, verifizierung_status')
        .eq('id', fall.sv_id as string)
        .single()
      if (sv?.profile_id) {
        const { data: p } = await admin
          .from('profiles')
          .select('vorname, nachname, telefon, google_place_id, avatar_url, profilbeschreibung')
          .eq('id', sv.profile_id)
          .single()
        if (p) {
          svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null
          svTelefon = p.telefon
          svGooglePlaceId = (p.google_place_id as string | null) ?? null
          svAvatarUrl = (p.avatar_url as string | null) ?? null
          svBeschreibung = (p.profilbeschreibung as string | null) ?? null
        }
      }
      svVerifiziert = sv?.verifizierung_status === 'geprueft'
    }

    // KB-Daten laden
    let kbName: string | null = null
    let kbTelefon: string | null = null
    let kbAvatarUrl: string | null = null
    let kbBeschreibung: string | null = null
    if (fall.kundenbetreuer_id) {
      const { data: kb } = await admin
        .from('profiles')
        .select('vorname, nachname, telefon, anzeigename, avatar_url, profilbeschreibung')
        .eq('id', fall.kundenbetreuer_id as string)
        .single()
      if (kb) {
        kbName = (kb.anzeigename as string | null) || [kb.vorname, kb.nachname].filter(Boolean).join(' ') || null
        kbTelefon = kb.telefon
        kbAvatarUrl = (kb.avatar_url as string | null) ?? null
        kbBeschreibung = (kb.profilbeschreibung as string | null) ?? null
      }
    }

    // Dokumente laden — alle Dokumente des Claims, die fuer den Kunden
    // sichtbar sind. Abgelehnte Iterationen werden ausgeblendet.
    let claimFallIds: string[] = [id]
    if (fall.claim_id) {
      const { data: claimFaelle } = await admin
        .from('faelle')
        .select('id')
        .eq('claim_id', fall.claim_id as string)
      claimFallIds = ((claimFaelle ?? []) as Array<{ id: string }>).map((f) => f.id)
      if (claimFallIds.length === 0) claimFallIds = [id]
    }
    const { data: dokumenteRaw } = await admin.from('fall_dokumente')
      .select('id, dokument_typ, storage_path, original_filename, hochgeladen_am, sichtbar_fuer')
      .in('fall_id', claimFallIds)
      .is('geloescht_am', null)
      .is('abgelehnt_am', null)
      .order('hochgeladen_am')
    const dokUrls = await getStorageUrlBulk(
      admin,
      (dokumenteRaw ?? []).map(d => ({ bucket: 'fall-dokumente', path: d.storage_path as string })),
    )
    const dokumente = (dokumenteRaw ?? []).map((d, i) => ({
      id: d.id as string,
      typ: d.dokument_typ as string,
      datei_url: dokUrls[i] ?? '',
      datei_name: (d.original_filename as string | null) ?? null,
      created_at: d.hochgeladen_am as string,
    }))

    // CMM-23: Pflichtdokumente-Liste laden — identische Filter-Logik wie
    // beim SV im Auftrag, nur aus Kunden-Sicht.
    const pflichtSlots = await getPflichtdokumenteForFall(supabase, id, 'kunde')

    // Nachrichten laden (alle Kanaele inkl. Gruppe)
    const { data: nachrichten } = await admin.from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: true })

    // Chat-Teilnehmer laden
    const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
    const chatTeilnehmer = await getChatTeilnehmer(id)

    // Aktiven gutachter_termine Eintrag laden (inkl. sv_vorgeschlagene_slots)
    const { data: aktiverTermin } = await admin
      .from('gutachter_termine')
      .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, sv_id, sv_vorgeschlagene_slots')
      .eq('fall_id', id)
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // AAR-864: Pending Verlegungs-Slot + alter Termin (für Banner).
    // Banner verschwindet automatisch sobald der pending-Slot in der
    // Vergangenheit liegt (= Verlegung obsolet, Termin gelaufen oder verstrichen).
    const { data: verlegungPendingRow } = await admin
      .from('gutachter_termine')
      .select('id, start_zeit, verlegung_quelle_id, verlegung_grund, sv_id')
      .eq('fall_id', fall.id as string)
      .eq('status', 'verlegung_pending')
      .gt('start_zeit', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    let verlegungBannerProps: React.ComponentProps<typeof TerminVerlegungBanner> | null = null
    if (verlegungPendingRow?.verlegung_quelle_id) {
      const { data: alterTermin } = await admin
        .from('gutachter_termine')
        .select('start_zeit')
        .eq('id', verlegungPendingRow.verlegung_quelle_id as string)
        .maybeSingle()
      // SV-Vorname aus profiles
      let svVorname = ''
      if (verlegungPendingRow.sv_id) {
        const { data: sv } = await admin
          .from('sachverstaendige')
          .select('profile_id')
          .eq('id', verlegungPendingRow.sv_id as string)
          .maybeSingle()
        if (sv?.profile_id) {
          const { data: p } = await admin
            .from('profiles')
            .select('vorname, anzeigename')
            .eq('id', sv.profile_id as string)
            .maybeSingle()
          svVorname = ((p?.vorname as string | null) ?? (p?.anzeigename as string | null) ?? '') as string
        }
      }
      const fmtD = (iso: string | null) =>
        iso
          ? new Date(iso).toLocaleDateString('de-DE', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : ''
      const fmtT = (iso: string | null) =>
        iso
          ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          : ''
      verlegungBannerProps = {
        pendingTerminId: verlegungPendingRow.id as string,
        alterDatum: fmtD(alterTermin?.start_zeit as string | null),
        alterUhrzeit: fmtT(alterTermin?.start_zeit as string | null),
        neuesDatum: fmtD(verlegungPendingRow.start_zeit as string | null),
        neuesUhrzeit: fmtT(verlegungPendingRow.start_zeit as string | null),
        svVorname,
        grund: (verlegungPendingRow.verlegung_grund as string | null) ?? null,
      }
    }

    // AAR-558 (C9): Kunden-sichere Felder aus faelle_kunde_view laden.
    // Nur noch für AuszahlungCard genutzt — Eskalations-Tag-Felder kommen
    // mit, werden aber nicht mehr gerendert (CMM-28 Cleanup).
    const { data: kundeView } = await supabase
      .from('faelle_kunde_view')
      .select(
        'auszahlung_kunde_betrag, auszahlung_kunde_eingegangen_am, auszahlung_zahlungsweg',
      )
      .eq('id', id)
      .maybeSingle()

    // 13.05.2026 Restore: claim-Row + fall-Extras für die im 8f088031-Merge
    // verlorenen Cards (KanzleiPfadCard, KundeAusfallEntschaedigungCard,
    // KundeAbschlussCard.gutachtenUrl, GoogleReviewPrompt-Gating). Der
    // CMM-28-Loader getKundeFallDetailRecord deckt diese Felder nicht ab.
    let claimExtra: {
      kanzlei_uebergeben_am: string | null
      kanzlei_ansprechpartner_email: string | null
      kanzlei_ansprechpartner_telefon: string | null
      totalschaden: boolean | null
      gutachten_ocr_processed_at: string | null
      nutzungsausfall_tage: number | null
      wiederbeschaffungsdauer_tage: number | null
      gutachten_nutzungsausfall_tagessatz_eur: number | null
      gutachten_mietwagen_tagessatz_eur: number | null
      reparaturkosten_brutto: number | null
      minderwert: number | null
      wiederbeschaffungswert: number | null
      restwert: number | null
    } | null = null
    if (fall.claim_id) {
      // Cluster F+G PR-2: Split in 2 Queries — claims für Kanzlei-Felder (Nicht-F+G),
      // v_gutachten_werte (Dual-Source-View) für die 10 F+G-Werte
      const [{ data: cxClaim }, { data: cxView }] = await Promise.all([
        admin
          .from('claims')
          .select('kanzlei_uebergeben_am, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon')
          .eq('id', fall.claim_id as string)
          .maybeSingle(),
        admin
          .from('v_gutachten_werte')
          .select(
            'totalschaden, gutachten_ocr_processed_at, nutzungsausfall_tage, wiederbeschaffungsdauer_tage, gutachten_nutzungsausfall_tagessatz_eur, gutachten_mietwagen_tagessatz_eur, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert',
          )
          .eq('claim_id', fall.claim_id as string)
          .maybeSingle(),
      ])
      if (cxClaim || cxView) {
        claimExtra = {
          kanzlei_uebergeben_am: (cxClaim?.kanzlei_uebergeben_am as string | null) ?? null,
          kanzlei_ansprechpartner_email: (cxClaim?.kanzlei_ansprechpartner_email as string | null) ?? null,
          kanzlei_ansprechpartner_telefon: (cxClaim?.kanzlei_ansprechpartner_telefon as string | null) ?? null,
          totalschaden: (cxView?.totalschaden as boolean | null) ?? null,
          gutachten_ocr_processed_at: (cxView?.gutachten_ocr_processed_at as string | null) ?? null,
          nutzungsausfall_tage: (cxView?.nutzungsausfall_tage as number | null) ?? null,
          wiederbeschaffungsdauer_tage: (cxView?.wiederbeschaffungsdauer_tage as number | null) ?? null,
          gutachten_nutzungsausfall_tagessatz_eur: (cxView?.gutachten_nutzungsausfall_tagessatz_eur as number | null) ?? null,
          gutachten_mietwagen_tagessatz_eur: (cxView?.gutachten_mietwagen_tagessatz_eur as number | null) ?? null,
          reparaturkosten_brutto: cxView?.reparaturkosten_brutto != null ? Number(cxView.reparaturkosten_brutto) : null,
          minderwert: cxView?.minderwert != null ? Number(cxView.minderwert) : null,
          wiederbeschaffungswert: cxView?.wiederbeschaffungswert != null ? Number(cxView.wiederbeschaffungswert) : null,
          restwert: cxView?.restwert != null ? Number(cxView.restwert) : null,
        }
      }
    }

    // Fall-Extras: Mietwagen-Felder + Google-Review-Prompt-Marker.
    // CMM-44 SP-A2 (Cluster 2): mietwagen_hat → claims.hat_mietwagen (SSoT) via
    // claims-Embed; restliche mietwagen_*-Felder bleiben faelle-only.
    // CMM-44 SP-B PR2a: google_review_prompt_gezeigt_am lebt auf claims (SSoT) —
    // in den claims-Embed gezogen.
    const { data: fallExtra } = await admin
      .from('faelle')
      .select(
        'mietwagen_seit_datum, mietwagen_vermieter, mietwagen_limit_tage, mietwagen_rechnung_vorhanden, claims:claim_id(hat_mietwagen, google_review_prompt_gezeigt_am)',
      )
      .eq('id', id)
      .maybeSingle()
    const fallExtraClaim = fallExtra
      ? Array.isArray(fallExtra.claims) ? fallExtra.claims[0] : fallExtra.claims
      : null
    const ausfallProps: React.ComponentProps<typeof KundeAusfallEntschaedigungCard> | null = claimExtra
      ? {
          totalschaden: claimExtra.totalschaden,
          ocrVerarbeitet: !!claimExtra.gutachten_ocr_processed_at,
          mietwagenHat: !!(fallExtraClaim?.hat_mietwagen as boolean | null),
          mietwagenSeitDatum: (fallExtra?.mietwagen_seit_datum as string | null) ?? null,
          mietwagenVermieter: (fallExtra?.mietwagen_vermieter as string | null) ?? null,
          mietwagenLimitTage: (fallExtra?.mietwagen_limit_tage as number | null) ?? null,
          mietwagenRechnungVorhanden: !!(fallExtra?.mietwagen_rechnung_vorhanden as boolean | null),
          nutzungsausfallTage: claimExtra.nutzungsausfall_tage,
          wiederbeschaffungsdauerTage: claimExtra.wiederbeschaffungsdauer_tage,
          nutzungsausfallTagessatzEur: claimExtra.gutachten_nutzungsausfall_tagessatz_eur,
          mietwagenTagessatzEur: claimExtra.gutachten_mietwagen_tagessatz_eur,
        }
      : null

    // Szenario-Label für Rügefall-Banner
    const fallStatus = (fall.status as string) ?? ''
    let szenario = (fall.szenario as string) ?? 'normalfall'
    if (fallStatus === 'klage' && szenario !== 'klagefall') szenario = 'klagefall'
    else if (
      ['vs-kuerzt', 'vs-abgelehnt', 'nachbesichtigung-laeuft'].includes(fallStatus) &&
      szenario === 'normalfall'
    ) {
      szenario = 'ruegefall'
    }

    const aktuellePhaseSnake = (fall.aktuelle_phase as string | null | undefined) ?? null
    const abgeschlossenAmKunde = (fall.abgeschlossen_am as string | null | undefined) ?? null

    // CMM-36: polizeiDocs/SLAs/svLive-Berechnung für KundeJetztZuTunCard
    // entfernt — die Card existiert nicht mehr auf dieser Seite. Live-Tracking
    // läuft über KundeSvLiveBanner (Realtime), Pflichtdokumente über
    // PflichtdokumenteSection.

    // Termin-Daten für die Detail-Card (SV + KB)
    const aktiveStatus = ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben']
    const { data: svKandidaten } = await admin
      .from('gutachter_termine')
      .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, durchgefuehrt_am, sv_id, kb_id, created_at')
      .eq('fall_id', id)
      .eq('typ', 'sv_begutachtung')
      .in('status', aktiveStatus)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
    const STATUS_PRIO: Record<string, number> = { bestaetigt: 1, gegenvorschlag: 2, reserviert: 3, verschoben: 4 }
    const svTermin = (svKandidaten ?? []).slice().sort((a, b) =>
      (STATUS_PRIO[a.status as string] ?? 9) - (STATUS_PRIO[b.status as string] ?? 9),
    )[0] ?? null
    const { data: kbTermin } = await admin
      .from('gutachter_termine')
      .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, sv_id, kb_id')
      .eq('fall_id', id)
      .eq('typ', 'kb_beratung')
      .in('status', aktiveStatus)
      .is('cancelled_at', null)
      .gte('start_zeit', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // SV-Kontakt für TerminSectionCard
    let svKontakt: { name: string | null; telefon: string | null; email: string | null; avatar_url: string | null } | null = null
    if (svTermin?.sv_id ?? fall.sv_id) {
      const svId = (svTermin?.sv_id as string | null) ?? (fall.sv_id as string | null)
      if (svId) {
        const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).maybeSingle()
        if (sv?.profile_id) {
          const { data: p } = await admin
            .from('profiles')
            .select('vorname, nachname, telefon, anzeigename, avatar_url, email')
            .eq('id', sv.profile_id)
            .maybeSingle()
          if (p) {
            svKontakt = {
              name: (p.anzeigename as string | null) || [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
              telefon: p.telefon as string | null,
              email: p.email as string | null,
              avatar_url: p.avatar_url as string | null,
            }
          }
        }
      }
    }
    let kbKontakt: { name: string | null; telefon: string | null; email: string | null; avatar_url: string | null } | null = null
    if (kbTermin?.kb_id ?? fall.kundenbetreuer_id) {
      const kbId = (kbTermin?.kb_id as string | null) ?? (fall.kundenbetreuer_id as string | null)
      if (kbId) {
        const { data: p } = await admin
          .from('profiles')
          .select('vorname, nachname, telefon, anzeigename, avatar_url, email')
          .eq('id', kbId)
          .maybeSingle()
        if (p) {
          kbKontakt = {
            name: (p.anzeigename as string | null) || [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
            telefon: p.telefon as string | null,
            email: p.email as string | null,
            avatar_url: p.avatar_url as string | null,
          }
        }
      }
    }

    const terminAdresse =
      (fall.besichtigungsort_adresse as string | null) ||
      [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') ||
      null

    const terminCards: Array<{
      termin: React.ComponentProps<typeof TerminSectionCard>['termin']
      gegenueber: React.ComponentProps<typeof TerminSectionCard>['gegenueber']
    }> = []
    // SV-Termin lebt im ClaimStepper-Wrapper (terminInfo). Doppelte
    // TerminSectionCard wäre Redundanz — nur KB-Termin als eigene Card.
    if (kbTermin) {
      terminCards.push({
        termin: {
          id: kbTermin.id as string,
          typ: 'kb_beratung',
          status: (kbTermin.status as string) ?? 'reserviert',
          start_zeit: kbTermin.start_zeit as string | null,
          end_zeit: kbTermin.end_zeit as string | null,
          kanal: kbTermin.kanal as string | null,
          video_link: kbTermin.video_link as string | null,
          sv_unterwegs_seit: null,
          sv_angekommen_am: null,
          sv_eta_minuten: null,
          adresse: null,
        },
        gegenueber: kbKontakt ? { rolle: 'kundenbetreuer', ...kbKontakt } : null,
      })
    }
    terminCards.sort((a, b) => {
      const ta = a.termin.start_zeit ? new Date(a.termin.start_zeit).getTime() : Number.MAX_SAFE_INTEGER
      const tb = b.termin.start_zeit ? new Date(b.termin.start_zeit).getTime() : Number.MAX_SAFE_INTEGER
      return ta - tb
    })

    const gutachtenVerfuegbar = !!fall.gutachten_eingegangen_am

    // CMM-32f: Claim-Lifecycle-Resolver für den kombinierten Stepper
    const [auftraege, kanzleiFall] = await Promise.all([
      getAlleAuftraege(admin, fall.id as string),
      getKanzleiFall(admin, fall.id as string),
    ])
    // onboarding_complete lebt auf faelle (nicht leads) — direkt aus dem
    // bereits geladenen fall-Objekt holen, um den 400-Fehler zu vermeiden.
    let leadInputForLifecycle: {
      sa_unterschrieben: boolean | null
      vollmacht_signiert_am: string | null
      onboarding_complete: boolean | null
    } | null = null
    if (fall.lead_id) {
      const { data: leadRow } = await admin
        .from('leads')
        .select('sa_unterschrieben, vollmacht_signiert_am')
        .eq('id', fall.lead_id as string)
        .maybeSingle()
      if (leadRow) {
        leadInputForLifecycle = {
          sa_unterschrieben: (leadRow.sa_unterschrieben as boolean | null) ?? null,
          vollmacht_signiert_am: (leadRow.vollmacht_signiert_am as string | null) ?? null,
          onboarding_complete: (fall.onboarding_complete as boolean | null) ?? null,
        }
      }
    }
    // Gutachten-PDF aus dem Storage-Bucket
    let gutachtenUrlAusBucket: string | null = null
    if (fall.claim_id) {
      const { data: gut } = await admin
        .from('fall_dokumente')
        .select('storage_path')
        .in('fall_id', claimFallIds)
        .eq('dokument_typ', 'gutachten')
        .like('storage_path', `claims/${fall.claim_id as string}/gutachten/%`)
        .is('geloescht_am', null)
        .is('abgelehnt_am', null)
        .order('hochgeladen_am', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (gut?.storage_path) {
        gutachtenUrlAusBucket = (await getStorageUrl(admin, 'fall-dokumente', gut.storage_path as string)) ?? null
      }
    }

    const claimLifecycle = getClaimLifecycle({
      lead: leadInputForLifecycle,
      auftraege,
      kanzleiFall,
    })

    const kennzeichen = (fall.kennzeichen as string) ?? ''
    const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
    const adresse = (fall.besichtigungsort_adresse as string) || (fall.unfallort as string) || [(fall.schadens_adresse as string), (fall.schadens_plz as string), (fall.schadens_ort as string)].filter(Boolean).join(', ') || ''

    // Gutachten-Freigabe und URL für ClaimSummary-Anspruch-Tab
    const erstgutachtenFuerSummary = auftraege.find((a) => a.typ === 'erstgutachten')
    const gutachtenFreigegebenFuerSummary = !!erstgutachtenFuerSummary?.gutachten_final_freigegeben
    const gutachtenUrlFuerSummary = gutachtenFreigegebenFuerSummary && gutachtenUrlAusBucket ? gutachtenUrlAusBucket : null

    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl md:max-w-none mx-auto space-y-5">
        {/* AAR-864: Live-Aktualisierung — abonniert gutachter_termine,
            auftraege und faelle für diesen Fall, refresht die Page bei
            jedem Event. */}
        <FallRealtimeRefresh fallId={fall.id as string} />

        {/* Header — CMM-28: Zurück-Link nur bei Multi-Fall-Kunden */}
        <div>
          {hatMehrereFaelle && (
            <Link href="/kunde" className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-2 inline-block">&larr; Meine Fälle</Link>
          )}
          <PageHeader
            title={`${(fall.claim_nummer as string | null) ?? 'Schadensfall'}${kennzeichen ? ` · ${kennzeichen}` : ''}${fahrzeug ? ` — ${fahrzeug}` : ''}`}
            description={adresse || undefined}
          />
        </div>

        {/* 13.05.2026 Restore (8f088031-Merge): Abschluss-Aktionen — rendert
            nur wenn fall.abgeschlossen_am gesetzt. Drei CTAs: PDF Gutachten,
            Reklamation, Bewerten. Component returns null wenn nicht
            abgeschlossen. (Portal-Review 5c #576) */}
        <KundeAbschlussCard
          fallId={fall.id as string}
          fallNummer={(fall.claim_nummer as string | null) ?? null}
          abgeschlossenAm={(fall.abgeschlossen_am as string | null) ?? null}
          gutachtenUrl={gutachtenUrlFuerSummary}
          googleReviewUrl={
            svGooglePlaceId
              ? `https://search.google.com/local/writereview?placeid=${svGooglePlaceId}`
              : null
          }
        />

        {/* 13.05.2026 Restore: Trust-Cards-Strip — KB + SV mit Avatar, Name,
            Rolle und Chat-Button. (Portal-Review 5b #575) */}
        <KundeBetreuerStrip
          fallId={fall.id as string}
          kbName={kbName}
          kbAvatarUrl={kbAvatarUrl}
          kbBeschreibung={kbBeschreibung}
          svName={svName}
          svAvatarUrl={svAvatarUrl}
          svBeschreibung={svBeschreibung}
          svVerifiziert={svVerifiziert}
        />

        {/* 13.05.2026 Restore: Google-Bewertungs-Prompt — nach durchgeführtem
            SV-Termin, einmalig, nur wenn SV eine google_place_id hat.
            (CMM-29/30/31/43) */}
        {svGooglePlaceId &&
          svName &&
          !!(svTermin?.durchgefuehrt_am as string | null) &&
          !(fallExtraClaim?.google_review_prompt_gezeigt_am as string | null) && (
            <GoogleReviewPrompt
              fallId={fall.id as string}
              svName={svName}
              googlePlaceId={svGooglePlaceId}
            />
          )}

        {/* CMM-32f: Claim-Stepper — 4 Hauptphasen + aktive Subphase + Termin-
            Sektion (Datum/Uhrzeit/Adresse/Navi). Termin lebt NUR hier, keine
            zweite TerminSectionCard für SV. */}
        {(() => {
          const aktiverSv = svTermin
          const terminInfo = aktiverSv?.start_zeit
            ? {
                terminId: aktiverSv.id as string,
                status: (aktiverSv.status as string | null) ?? null,
                datum: new Date(aktiverSv.start_zeit as string).toLocaleDateString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                }),
                uhrzeit: new Date(aktiverSv.start_zeit as string).toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                adresse: terminAdresse,
                // AAR-858: nur Vorname für Anonymität
                svVorname: svKontakt?.name?.split(' ')[0] ?? null,
                kundeVorname: kundeVorname ?? null,
              }
            : null
          return (
            <ClaimStepper
              lifecycle={claimLifecycle}
              terminInfo={terminInfo}
              bottomSlot={
                verlegungBannerProps ? (
                  <TerminVerlegungBanner {...verlegungBannerProps} embedded />
                ) : null
              }
            />
          )
        })()}

        {/* CMM-36 + CMM-32f: SV-Live-Banner — navy/grün/gelb je nach Phase, Realtime. */}
        {svTermin?.id && (
          <KundeSvLiveBanner
            terminId={svTermin.id as string}
            svName={svName}
            gutachtenHochgeladen={!!auftraege.find((a) => a.typ === 'erstgutachten')?.gutachten_url}
            qcFreigegeben={!!auftraege.find((a) => a.typ === 'erstgutachten')?.gutachten_final_freigegeben}
            inUeberarbeitung={!!(auftraege.find((a) => a.typ === 'erstgutachten') as { zurueckgewiesen_am?: string | null } | undefined)?.zurueckgewiesen_am}
            initial={{
              sv_unterwegs_seit: (svTermin.sv_unterwegs_seit as string | null) ?? null,
              sv_angekommen_am: (svTermin.sv_angekommen_am as string | null) ?? null,
              sv_eta_minuten: (svTermin.sv_eta_minuten as number | null) ?? null,
              durchgefuehrt_am: (svTermin.durchgefuehrt_am as string | null) ?? null,
            }}
          />
        )}

        {/* AAR-770: Mitteilungs-Banner — ganz oben mit Quick-Action */}
        <FallMitteilungenBanner fallId={fall.id as string} rolle="kunde" />

        {/* CMM-33: Banner-Click-Tile → öffnet Pop-over mit allen Slot-
            Drag&Drop-Cards. Kompakt in der Detail-Page, voller Upload-
            Workflow im Pop-over.
            CMM-32e: Während Besichtigung + Vollständigkeits-Check
            (Auftrag-Status besichtigung/gutachten + nicht freigegeben)
            ist der Banner ausgeblendet — der Kunde soll währenddessen
            keine neuen Dokumente nachladen. Nach QC-Freigabe erscheint
            er wieder für Nachreichungen. */}
        {(() => {
          const erst = auftraege.find((a) => a.typ === 'erstgutachten')
          const qcLaeuft =
            !!erst && (erst.status === 'besichtigung' || erst.status === 'gutachten') &&
            !erst.gutachten_final_freigegeben
          if (qcLaeuft) return null
          return (
            <PflichtdokumenteSection
              slots={pflichtSlots}
              fallId={fall.id as string}
              rolle="kunde"
              variant="banner"
            />
          )
        })()}

        {/* CMM-36: KundeJetztZuTunCard entfernt — die Kanzlei-Flow-Aktionen
            sind nicht mehr relevant, Live-Tracking läuft via SV-Live-Banner
            ganz oben, Pflichtdokumente via PflichtdokumenteSection. */}

        {/* AAR-448: Termin-Detail-Card(s) — SV- und KB-Termine mit Quick-Actions */}
        {terminCards.length > 0 && (
          <div className="space-y-3">
            {terminCards.map((tc) => (
              <TerminSectionCard key={tc.termin.id} termin={tc.termin} gegenueber={tc.gegenueber} />
            ))}
          </div>
        )}

        {/* CMM-36: FallStatusCard entfernt — bei laufender Anfahrt redundant zum
            KundeSvLiveBanner, ansonsten nicht aussagekräftig genug. */}

        {/* Nachbesichtigung Soft-Blocker */}
        {((fall.status as string) === 'nachbesichtigung-laeuft' ||
          fall.nachbesichtigung_status === 'angefordert') && (
          <div className="bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 rounded-ios-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-claimondo-navy text-lg">&#9888;</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-claimondo-navy">Nachbesichtigung läuft</p>
                <p className="text-xs text-claimondo-navy">Die Versicherung hat eine erneute Besichtigung angefordert. Ihr Fall wird fortgesetzt sobald das Ergebnis vorliegt.</p>
              </div>
            </div>
            <Link
              href={`/kunde/nachbesichtigung/${fall.id as string}`}
              className="inline-flex items-center text-xs font-medium rounded-ios-md bg-claimondo-navy text-white px-3 py-1.5 hover:bg-claimondo-navy"
            >
              Termine vorschlagen
            </Link>
          </div>
        )}

        {/* AAR-558 (C9): Auszahlungs-Card — nur Netto-Kunden-Anteil. */}
        {kundeView && (
          <AuszahlungCard
            betrag={(kundeView.auszahlung_kunde_betrag as number | null) ?? null}
            eingegangenAm={(kundeView.auszahlung_kunde_eingegangen_am as string | null) ?? null}
            zahlungsweg={(kundeView.auszahlung_zahlungsweg as string | null) ?? null}
          />
        )}

        {/* VS-Kürzung-Hinweis (Brutto-Beträge bewusst nicht gerendert) */}
        {(fall.status as string) === 'vs-kuerzt' && (
          <div className="bg-amber-50 border border-amber-200 rounded-ios-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-700 text-lg">&#9888;</span>
              <p className="text-sm font-semibold text-amber-900">Versicherung hat gekürzt</p>
            </div>
            {typeof fall.vs_kuerzung_grund === 'string' && (fall.vs_kuerzung_grund as string) && (
              <div className="rounded-ios-md bg-white/60 border border-amber-200 p-2 text-[11px] text-amber-800">
                <strong className="block mb-0.5">Begründung der Versicherung:</strong>
                {fall.vs_kuerzung_grund as string}
              </div>
            )}
            <p className="text-[11px] text-amber-700">
              Die Partnerkanzlei bereitet eine Rüge vor. Sie müssen nichts tun — wir melden uns bei Fortschritt.
            </p>
          </div>
        )}

        {(fall.status as string) === 'vs-abgelehnt' && (
          <div className="bg-red-50 border border-red-200 rounded-ios-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-900">Versicherung hat abgelehnt</p>
            <p className="text-xs text-red-700">
              Die Versicherung lehnt die Regulierung ab. Unsere Partnerkanzlei prüft den Fall und meldet sich mit den nächsten Schritten (Rüge oder Klage-Empfehlung).
            </p>
          </div>
        )}

        {(fall.status as string) === 'klage' && (
          <div className="bg-red-50 border border-red-200 rounded-ios-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-900">Fall wird gerichtlich geklärt</p>
            <p className="text-xs text-red-700">
              Ihr Fall wurde an unsere Partnerkanzlei übergeben. Die weitere Kommunikation läuft direkt mit der Kanzlei. Claimondo begleitet den Fall bis zum Abschluss.
            </p>
          </div>
        )}

        {/* CMM-28 Konsolidierung: Eine „Meine Kanzlei"-Card statt 3 separaten
            Cards (SaeuleMeinAnwalt + MeineKanzleiCard + KanzleiAnsprechpartnerBlock).
            Anwalt-Mandatstyp und Vollmacht-Status sind in MeineKanzleiCard
            integriert (vollmachtSigniertAm-Prop). */}
        <MeineKanzleiCard
          kanzlei={kanzleiRow}
          ansprechpartner={{
            name: (fall.kanzlei_ansprechpartner_name as string | null) ?? null,
            position: null,
            email: claimExtra?.kanzlei_ansprechpartner_email ?? null,
            telefon: claimExtra?.kanzlei_ansprechpartner_telefon ?? null,
          }}
          vollmachtSigniertAm={fall.vollmacht_signiert_am as string | null}
          uebergebenAm={claimExtra?.kanzlei_uebergeben_am ?? null}
        />

        {/* 13.05.2026 Restore: Kanzlei-Pfad-Wahl. Switch je nach
            claim.kanzlei_wunsch (Komplettservice / eigene Kanzlei / selbst
            einreichen / Frage). Bei partnerkanzlei rendert die Card null.
            (CMM-32 Polish, #416) */}
        {fall.claim_id && (
          <KanzleiPfadCard
            claimId={fall.claim_id as string}
            kanzleiWunsch={(fall.kanzlei_wunsch as React.ComponentProps<typeof KanzleiPfadCard>['kanzleiWunsch']) ?? null}
            kanzleiName={(fall.kanzlei_ansprechpartner_name as string | null) ?? null}
            kanzleiEmail={claimExtra?.kanzlei_ansprechpartner_email ?? null}
            kanzleiTelefon={claimExtra?.kanzlei_ansprechpartner_telefon ?? null}
            kanzleiUebergebenAm={claimExtra?.kanzlei_uebergeben_am ?? null}
            gutachtenFreigegeben={gutachtenFreigegebenFuerSummary}
            gutachtenUrl={gutachtenUrlAusBucket}
          />
        )}

        {/* 13.05.2026 Restore: Mietwagen-/Nutzungsausfall-Card (XOR). Render
            nur wenn Gutachten OCR-verarbeitet + Schadenstyp klar. Pre-merge
            war diese Card als ausfallSlot in den ClaimStepper eingehängt;
            der heutige Stepper akzeptiert diesen Slot nicht mehr, daher
            standalone. (CMM-32 P3, #416) */}
        {ausfallProps && (
          <KundeAusfallEntschaedigungCard {...ausfallProps} />
        )}

        {/* 2-Säulen Layout (Geld + Betreuer) — Anwalt-Säule entfällt durch
            Konsolidierung in MeineKanzleiCard. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SaeuleMeinGeld
            fallId={fall.id as string}
            status={(fall.status as string) ?? ''}
            schadens_hoehe_netto={fall.schadens_hoehe_netto as number | null}
            totalschaden={!!fall.totalschaden}
            zahlungsweg={fall.zahlungsweg as string | null}
            onZahlungswegSave={updateZahlungsweg}
            gutachtenWerte={claimExtra ? {
              reparaturkosten_brutto: claimExtra.reparaturkosten_brutto,
              minderwert: claimExtra.minderwert,
              wiederbeschaffungswert: claimExtra.wiederbeschaffungswert,
              restwert: claimExtra.restwert,
              ocr_processed_at: claimExtra.gutachten_ocr_processed_at,
            } : null}
          />
          <SaeuleMeinBetreuer
            fallId={fall.id as string}
            kbName={kbName}
            kbTelefon={kbTelefon}
            kbAvatarUrl={kbAvatarUrl}
            kbBeschreibung={kbBeschreibung}
          />
        </div>

        {/* Opt-in Gutachten-Weiterleitung — nur sichtbar wenn Gutachten vorliegt */}
        {gutachtenVerfuegbar && (
          <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-claimondo-navy">Gutachten erhalten?</p>
              <p className="text-xs text-claimondo-ondo mt-0.5">
                Sie können sich das Gutachten auch per E-Mail an sich selbst oder eine Vertrauensperson senden lassen (48h Magic-Link).
              </p>
            </div>
            <GutachtenWeiterleitungButton fallId={fall.id as string} defaultEmail={user.email ?? null} />
          </div>
        )}

        <div className="space-y-4">
          <BankdatenBanner
            fallId={fall.id as string}
            status={(fall.status as string) ?? ''}
            bankdatenHinterlegt={!!fall.bankdaten_hinterlegt_am}
            saveBankdaten={saveBankdaten}
          />
        </div>

        {/* Fortschritt + Fall-Details */}
        <div className="grid md:grid-cols-2 gap-5">
          <FallPhasenPanel
            fall={{
              id: fall.id as string,
              aktuelle_phase: aktuellePhaseSnake,
              abgeschlossen_am: abgeschlossenAmKunde,
            }}
            rolle="kunde"
            variant="progress-card"
            banner={
              szenario === 'ruegefall' ? (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-ios-xl px-3 py-2">
                  <p className="text-xs text-amber-700 font-medium">
                    Die Versicherung hat Einwände erhoben. Unsere Partnerkanzlei kümmert sich darum.
                  </p>
                </div>
              ) : null
            }
          />

          <FallDetailSections
            fall={fall as Record<string, unknown>}
            svName={svName}
            svTelefon={svTelefon}
            svVerifiziert={svVerifiziert}
            kbName={kbName}
            dokumente={dokumente ?? []}
            nachrichten={nachrichten ?? []}
            userId={user.id}
            chatTeilnehmer={chatTeilnehmer}
            aktiverTermin={aktiverTermin}
          />
        </div>
      </div>
    )
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[KundeFallDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-semibold">Fehler beim Laden</p>
        <p className="text-sm text-claimondo-ondo mt-1">Bitte versuchen Sie es erneut.</p>
      </div>
    )
  }
}
