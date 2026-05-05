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
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import FallDetailSections from './FallDetailSections'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
import PflichtdokumenteSection from '@/components/fall/PflichtdokumenteSection'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { MeineKanzleiCard } from '@/components/kunde/kanzlei'
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import { saveBankdaten, updateZahlungsweg } from './actions'
import TerminSectionCard from '@/components/kunde/TerminSectionCard'
import TerminVerlegungBanner from '@/components/kunde/TerminVerlegungBanner'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
import KundeSvLiveBanner from '@/components/kunde/KundeSvLiveBanner'
import ClaimStepper from '@/components/kunde/ClaimStepper'
import KundeAusfallEntschaedigungCard from '@/components/kunde/KundeAusfallEntschaedigungCard'
import KanzleiPfadCard from '@/components/kunde/KanzleiPfadCard'
import SmokeKanzleiButton from '@/components/kunde/SmokeKanzleiButton'
import ClaimSummary from '@/components/kunde/ClaimSummary'
import GoogleReviewPrompt from '@/components/kunde/GoogleReviewPrompt'
import { BelegUploadCard } from '@/components/kunde/beleg-upload'
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
    if (fall.sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('profile_id, verifizierung_status')
        .eq('id', fall.sv_id as string)
        .single()
      if (sv?.profile_id) {
        const { data: p } = await admin
          .from('profiles')
          .select('vorname, nachname, telefon, google_place_id')
          .eq('id', sv.profile_id)
          .single()
        if (p) {
          svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null
          svTelefon = p.telefon
          svGooglePlaceId = (p.google_place_id as string | null) ?? null
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
    // sichtbar sind. Mehrere Faelle pro Claim werden zusammen angezeigt.
    // Abgelehnte Iterationen (KB-Reject-Loop) werden ausgeblendet.
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
      .order('hochgeladen_am', { ascending: false })
    const dokumente = (dokumenteRaw ?? [])
      .filter((d) => {
        const sichtbar = (d.sichtbar_fuer as string[] | null) ?? null
        // Default: sichtbar fuer alle wenn nicht gesetzt (Legacy)
        return !sichtbar || sichtbar.includes('kunde')
      })
      .map((d) => ({
        id: d.id as string,
        typ: d.dokument_typ as string,
        datei_url: admin.storage.from('fall-dokumente').getPublicUrl(d.storage_path as string).data.publicUrl,
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
          ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : ''
      const fmtT = (iso: string | null) =>
        iso
          ? new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
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
    // 'verschoben' absichtlich nicht drin — nach Verschieben ist der neue
    // 'bestaetigt'-Slot der aktive Termin, der alte 'verschoben'-Slot ist Terminal.
    const aktiveStatus = ['reserviert', 'bestaetigt', 'gegenvorschlag']
    const { data: svKandidaten } = await admin
      .from('gutachter_termine')
      .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, durchgefuehrt_am, sv_id, kb_id, created_at')
      .eq('fall_id', id)
      .eq('typ', 'sv_begutachtung')
      .in('status', aktiveStatus)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })

    // CMM-32 Polish: ALLE Termine fuer den Begutachtungs-Verlauf (auch
    // verlegt/verpasst/verschoben/durchgefuehrt). Sortiert chronologisch.
    const { data: alleTermineForVerlauf } = await admin
      .from('gutachter_termine')
      .select('id, status, start_zeit, durchgefuehrt_am, verlegung_quelle_id, verlegung_initiator_kunde, created_at')
      .eq('fall_id', id)
      .eq('typ', 'sv_begutachtung')
      .order('created_at', { ascending: true })
    const STATUS_PRIO: Record<string, number> = { bestaetigt: 1, gegenvorschlag: 2, reserviert: 3 }
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
    let leadInputForLifecycle: {
      sa_unterschrieben: boolean | null
      vollmacht_signiert_am: string | null
      onboarding_complete: boolean | null
      anrede: string | null
      vorname: string | null
      nachname: string | null
    } | null = null
    if (fall.lead_id) {
      const { data: leadRow } = await admin
        .from('leads')
        .select('sa_unterschrieben, vollmacht_signiert_am, onboarding_complete, anrede, vorname, nachname')
        .eq('id', fall.lead_id as string)
        .maybeSingle()
      if (leadRow) {
        leadInputForLifecycle = {
          sa_unterschrieben: (leadRow.sa_unterschrieben as boolean | null) ?? null,
          vollmacht_signiert_am: (leadRow.vollmacht_signiert_am as string | null) ?? null,
          onboarding_complete: (leadRow.onboarding_complete as boolean | null) ?? null,
          anrede: (leadRow.anrede as string | null) ?? null,
          vorname: (leadRow.vorname as string | null) ?? null,
          nachname: (leadRow.nachname as string | null) ?? null,
        }
      }
    }
    // Claim-SSoT-Daten zuerst laden (Reihenfolge: claim > fall > auftrag).
    type ClaimKanzleiWunsch =
      | 'partnerkanzlei'
      | 'eigene_kanzlei'
      | 'keine_kanzlei'
      | 'noch_unentschieden'
      | 'nicht_gefragt'
    let claimRow: {
      kunde_no_show_count: number | null
      letzter_no_show_am: string | null
      kanzlei_wunsch: ClaimKanzleiWunsch | null
      kanzlei_uebergeben_am: string | null
      status: string | null
    } | null = null
    let kanzleiAnsprechpartner: {
      name: string | null
      email: string | null
      telefon: string | null
    } | null = null
    // OCR-Werte werden hier nur server-seitig gelesen, um den Anspruch
    // gegen die VS abzuleiten. Einzelwerte verlassen den Server NICHT —
    // der Kunde sieht nur den Gesamt-Eurobetrag (Anspruch) plus die
    // Mietwagen-/Nutzungsausfall-Card (kombinierte Werte, kein Detail).
    let anspruchVsEur: number | null = null
    let anspruchPositionen: Array<{
      key: string
      label: string
      detail?: string | null
      betragEur: number
    }> | null = null
    let ausfallProps: Parameters<typeof KundeAusfallEntschaedigungCard>[0] | null = null
    let nutzungsausfallBetragEur: number | null = null
    if (fall.claim_id) {
      const { data } = await admin
        .from('claims')
        .select(
          'kunde_no_show_count, letzter_no_show_am, status, ' +
            'reparaturkosten_brutto, minderwert, restwert, wiederbeschaffungswert, ' +
            'totalschaden, gutachten_ocr_processed_at, ' +
            'nutzungsausfall_tage, wiederbeschaffungsdauer_tage, ' +
            'gutachten_nutzungsausfall_tagessatz_eur, gutachten_mietwagen_tagessatz_eur, ' +
            'kanzlei_wunsch, kanzlei_uebergeben_am, ' +
            'kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon',
        )
        .eq('id', fall.claim_id as string)
        .maybeSingle()
      if (data) {
        const row = data as unknown as Record<string, unknown>
        claimRow = {
          kunde_no_show_count: (row.kunde_no_show_count as number | null) ?? null,
          letzter_no_show_am: (row.letzter_no_show_am as string | null) ?? null,
          kanzlei_wunsch: (row.kanzlei_wunsch as ClaimKanzleiWunsch | null) ?? null,
          kanzlei_uebergeben_am: (row.kanzlei_uebergeben_am as string | null) ?? null,
          status: (row.status as string | null) ?? null,
        }
        kanzleiAnsprechpartner = {
          name: (row.kanzlei_ansprechpartner_name as string | null) ?? null,
          email: (row.kanzlei_ansprechpartner_email as string | null) ?? null,
          telefon: (row.kanzlei_ansprechpartner_telefon as string | null) ?? null,
        }
        const { berechneAnspruchVs } = await import('@/lib/claims/anspruch')
        anspruchVsEur = berechneAnspruchVs({
          reparaturkosten_brutto: (row.reparaturkosten_brutto as number | null) ?? null,
          minderwert: (row.minderwert as number | null) ?? null,
          restwert: (row.restwert as number | null) ?? null,
          wiederbeschaffungswert: (row.wiederbeschaffungswert as number | null) ?? null,
          totalschaden: (row.totalschaden as boolean | null) ?? null,
          gutachten_ocr_processed_at: (row.gutachten_ocr_processed_at as string | null) ?? null,
        })

        // CMM-32 Polish: Anspruch-Positionen — Aufschluesselung der Summe.
        // Bewusst nur die direkten Bestandteile (was in berechneAnspruchVs
        // einfliesst). Nutzungsausfall + Mietwagen sind tagessatz-abhaengig
        // und werden in der KundeAusfallEntschaedigungCard separat gezeigt.
        const totalschaden = (row.totalschaden as boolean | null) ?? null
        const reparaturBrutto = (row.reparaturkosten_brutto as number | null) ?? null
        const minderwert = (row.minderwert as number | null) ?? null
        const wbw = (row.wiederbeschaffungswert as number | null) ?? null
        const restwert = (row.restwert as number | null) ?? null
        const positionen: Array<{
          key: string
          label: string
          detail?: string | null
          betragEur: number
        }> = []
        if (totalschaden) {
          if (wbw != null) {
            positionen.push({ key: 'wbw', label: 'Wiederbeschaffungswert', betragEur: wbw })
          }
          if (restwert != null && restwert > 0) {
            positionen.push({
              key: 'restwert',
              label: 'Restwert',
              detail: 'wird vom Wiederbeschaffungswert abgezogen',
              betragEur: -restwert,
            })
          }
          if (minderwert != null && minderwert > 0) {
            positionen.push({ key: 'minderwert', label: 'Wertminderung', betragEur: minderwert })
          }
        } else {
          if (reparaturBrutto != null) {
            positionen.push({
              key: 'rep',
              label: 'Reparaturkosten (brutto)',
              betragEur: reparaturBrutto,
            })
          }
          if (minderwert != null && minderwert > 0) {
            positionen.push({ key: 'minderwert', label: 'Wertminderung', betragEur: minderwert })
          }
        }
        if (positionen.length > 0) anspruchPositionen = positionen
        const _totalschaden = (row.totalschaden as boolean | null) ?? null
        const _mietwagenHat = !!(fall.mietwagen_hat as boolean | null)
        const _nutzungsausfallTage = (row.nutzungsausfall_tage as number | null) ?? null
        const _wbd = (row.wiederbeschaffungsdauer_tage as number | null) ?? null
        const _tagessatz = (row.gutachten_nutzungsausfall_tagessatz_eur as number | null) ?? null
        const _effTage = _totalschaden ? _wbd : _nutzungsausfallTage
        const nutzungsausfallBetragEurCalc =
          !_mietwagenHat && _effTage && _tagessatz ? _effTage * _tagessatz : null
        ausfallProps = {
          totalschaden: _totalschaden,
          ocrVerarbeitet: !!(row.gutachten_ocr_processed_at as string | null),
          mietwagenHat: _mietwagenHat,
          mietwagenSeitDatum: (fall.mietwagen_seit_datum as string | null) ?? null,
          mietwagenVermieter: (fall.mietwagen_vermieter as string | null) ?? null,
          mietwagenLimitTage: (fall.mietwagen_limit_tage as number | null) ?? null,
          mietwagenRechnungVorhanden: !!(fall.mietwagen_rechnung_vorhanden as boolean | null),
          nutzungsausfallTage: _nutzungsausfallTage,
          wiederbeschaffungsdauerTage: _wbd,
          nutzungsausfallTagessatzEur: _tagessatz,
          mietwagenTagessatzEur:
            (row.gutachten_mietwagen_tagessatz_eur as number | null) ?? null,
        }
        if (nutzungsausfallBetragEurCalc) nutzungsausfallBetragEur = nutzungsausfallBetragEurCalc
      }
    }

    // Gutachten-PDF aus dem Storage-Bucket — DB-Quelle: fall_dokumente
    // mit dokument_typ='gutachten' im Claim-Pfad. Sichtbar fuer den Kunden,
    // sobald der Auftrag QC-freigegeben ist (Stepper-Phase regulierung/abschluss).
    let gutachtenUrlAusBucket: string | null = null
    if (fall.claim_id) {
      const { data: gut } = await admin
        .from('fall_dokumente')
        .select('storage_path')
        .in('fall_id', claimFallIds)
        .eq('dokument_typ', 'gutachten')
        .like('storage_path', `claim/${fall.claim_id as string}/gutachten/%`)
        .is('geloescht_am', null)
        .is('abgelehnt_am', null)
        .order('hochgeladen_am', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (gut?.storage_path) {
        gutachtenUrlAusBucket = admin.storage
          .from('fall-dokumente')
          .getPublicUrl(gut.storage_path as string).data.publicUrl
      }
    }

    const claimLifecycle = getClaimLifecycle({
      claim: claimRow,
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
        <FallRealtimeRefresh fallId={fall.id as string} claimId={(fall.claim_id as string | null) ?? null} />

        {/* Header — CMM-28: Zurück-Link nur bei Multi-Fall-Kunden */}
        <div>
          {hatMehrereFaelle && (
            <Link
              href="/kunde"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy mb-3 px-2.5 py-1.5 rounded-lg border border-claimondo-border bg-white hover:bg-[#f8f9fb] transition-colors"
            >
              <span aria-hidden>&larr;</span> Meine Fälle
            </Link>
          )}
          <PageHeader
            title={`${(fall.claim_nummer as string | null) ?? (fall.fall_nummer as string | null) ?? 'Schadensfall'}${kennzeichen ? ` · ${kennzeichen}` : ''}${fahrzeug ? ` — ${fahrzeug}` : ''}`}
            description={adresse || undefined}
          />
        </div>

        {/* Smoke-Helper (sichtbar fuer Aaron's Test-Walkthrough) */}
        <SmokeKanzleiButton fallId={fall.id as string} />

        {/* CMM-43: Google-Bewertungs-Prompt — nach durchgeführtem SV-Termin,
            einmalig, nur wenn SV eine google_place_id hat. */}
        {svGooglePlaceId &&
          svName &&
          !!(svTermin as { durchgefuehrt_am?: string | null } | null)?.durchgefuehrt_am &&
          !(fall.google_review_prompt_gezeigt_am as string | null) && (
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
                durchgefuehrt: !!(aktiverSv.durchgefuehrt_am as string | null),
                verstrichen: (() => {
                  // Termin ist verstrichen wenn: start_zeit + 60min in der Vergangenheit,
                  // durchgefuehrt_am NULL, status nicht abgesagt/storniert/verschoben.
                  const startMs = new Date(aktiverSv.start_zeit as string).getTime()
                  const cutoff = startMs + 60 * 60 * 1000 // 60min Toleranz
                  const status = (aktiverSv.status as string | null) ?? ''
                  const durchgefuehrt = !!(aktiverSv.durchgefuehrt_am as string | null)
                  return (
                    cutoff < Date.now() &&
                    !durchgefuehrt &&
                    !['abgesagt', 'storniert', 'verschoben', 'verlegung_pending'].includes(status)
                  )
                })(),
                // CMM-32 Polish: Geo-basierte Verschuldens-Vermutung. Wenn
                // sv_angekommen_am gesetzt ist, war der SV definitiv vor
                // Ort (Geofence-Hit) — dann ist der Termin nicht durch
                // SV-Schuld verstrichen, sondern wahrscheinlich Kunde-No-
                // Show. Ist sv_angekommen_am NULL, ist der SV nicht da
                // gewesen (Permission war an, sonst hätten wir gar keine
                // Daten — beide Hypothesen blieben offen → 'unklar').
                verstrichenInitiator: (
                  (aktiverSv.sv_angekommen_am as string | null)
                    ? 'kunde'
                    : 'sv'
                ) as 'sv' | 'kunde',
                datum: new Date(aktiverSv.start_zeit as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                }),
                uhrzeit: new Date(aktiverSv.start_zeit as string).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                adresse: terminAdresse,
                // AAR-858: nur Vorname für Anonymität
                svVorname: svKontakt?.name?.split(' ')[0] ?? null,
                kundeVorname: kundeVorname ?? null,
                svAngekommen: (aktiverSv.sv_angekommen_am as string | null) ?? null,
              }
            : null
          // Gutachten-URL fuer den gruenen Erfolgs-Banner — Quelle ist der
          // Storage-Bucket via fall_dokumente (DB-driven, claim-scoped).
          // Anzeige nur wenn ein erstgutachten existiert das QC-freigegeben
          // ist; die Phase-Gating-Logik im Stepper (regulierung/abschluss)
          // entscheidet final, ob der Banner gezeigt wird.
          const erstgutachten = auftraege.find((a) => a.typ === 'erstgutachten')
          // CMM-32 Polish: Anspruch ist an OCR + QC-Freigabe gekoppelt,
          // NICHT am Storage-PDF. Wenn das PDF noch fehlt (Edge-Case oder
          // Mock-Daten), zeigen wir die Summe trotzdem — Download-Button
          // bleibt aber an gutachtenUrlAusBucket gekoppelt.
          const gutachtenFreigegeben = !!erstgutachten?.gutachten_final_freigegeben
          const gutachtenUrlFuerStepper = gutachtenFreigegeben && gutachtenUrlAusBucket ? gutachtenUrlAusBucket : null

          // CMM-32 Polish: Begutachtungs-Verlauf zusammensammeln aus
          // gutachter_termine (Verschoben/Wahrgenommen/Verpasst), Auftrag
          // (Gutachten erstellt + QC bestanden) und Claim (gutachten_datum
          // als Fallback). Datum-getrieben, chronologisch sortiert.
          const begutachtungEvents: Array<{
            key: string
            label: string
            detail?: string | null
            datum: string
            variant?: 'done' | 'warn' | 'error' | 'neutral'
          }> = []
          for (const t of (alleTermineForVerlauf ?? []) as Array<{
            id: string
            status: string | null
            start_zeit: string | null
            durchgefuehrt_am: string | null
            verlegung_quelle_id: string | null
            verlegung_initiator_kunde: boolean | null
            created_at: string | null
          }>) {
            const status = t.status ?? ''
            // Verschoben / verlegt / verpasst — Datum ist created_at des
            // Folge-Slots (= Zeitpunkt der Verschiebung). Bei verpasst ist
            // der alte Slot betroffen — created_at gibt den Anlegezeitpunkt
            // wieder, der Verlegungs-Trigger kommt aus dem Folge-Slot.
            if (
              (status === 'verlegt' || status === 'verschoben' || status === 'verpasst') &&
              t.created_at
            ) {
              const istKundeInitiator = !!t.verlegung_initiator_kunde
              const label = status === 'verpasst'
                ? 'Termin verpasst'
                : 'Termin verschoben'
              const detail = istKundeInitiator
                ? 'durch Kunde'
                : status === 'verpasst'
                  ? null
                  : 'durch Gutachter'
              begutachtungEvents.push({
                key: `t-${t.id}-${status}`,
                label,
                detail,
                datum: t.created_at,
                variant: status === 'verpasst' ? 'error' : 'warn',
              })
            }
            // Termin wahrgenommen
            if (t.durchgefuehrt_am) {
              begutachtungEvents.push({
                key: `t-${t.id}-done`,
                label: 'Termin wahrgenommen',
                datum: t.durchgefuehrt_am,
                variant: 'done',
              })
            }
          }
          // Gutachten erstellt — claim.gutachten_datum als kanonische
          // Quelle (aus OCR), fallback auf erstgutachten.gutachten_url +
          // dessen abgeschlossen_am ist nicht praezise genug.
          const gutachtenDatum = (claimRow as unknown as { gutachten_datum?: string | null })?.gutachten_datum ??
            null
          if (gutachtenDatum) {
            begutachtungEvents.push({
              key: 'gutachten-erstellt',
              label: 'Gutachten erstellt',
              datum: gutachtenDatum,
              variant: 'done',
            })
          }
          // QC bestanden = auftrag.abgeschlossen_am
          if (
            erstgutachten?.gutachten_final_freigegeben &&
            (erstgutachten as { abgeschlossen_am?: string | null }).abgeschlossen_am
          ) {
            begutachtungEvents.push({
              key: 'qc-bestanden',
              label: 'Gutachten freigegeben (Vollständigkeits-Check)',
              datum: (erstgutachten as { abgeschlossen_am: string }).abgeschlossen_am,
              variant: 'done',
            })
          }
          // Side-Quest-Auftraege (Nachbesichtigung, Stellungnahme):
          // Beauftragung, optionale Zurückweisung mit Grund, Freigabe.
          // Erstgutachten-Zurückweisung ist auch sichtbar — hilft dem Kunden
          // zu verstehen wenn das Erstgutachten überarbeitet werden musste.
          const TYP_LABEL: Record<typeof auftraege[number]['typ'], string> = {
            erstgutachten: 'Gutachten',
            nachbesichtigung: 'Nachbesichtigung',
            stellungnahme: 'Stellungnahme',
          }
          for (const a of auftraege) {
            // Beauftragung — nur für Side-Quests anzeigen, das Erstgutachten
            // ist die implizite Geburtsstunde des Falls und braucht kein
            // separates Created-Event.
            if (a.typ !== 'erstgutachten') {
              begutachtungEvents.push({
                key: `a-${a.id}-created`,
                label: `${TYP_LABEL[a.typ]} beauftragt`,
                datum: a.erstellt_am,
                variant: 'neutral',
              })
            }
            // Zurückweisung mit Grund — für alle Auftrags-Typen sichtbar.
            if (a.zurueckgewiesen_am) {
              begutachtungEvents.push({
                key: `a-${a.id}-rejected`,
                label: `${TYP_LABEL[a.typ]} zurückgewiesen`,
                detail: a.zurueckweisung_grund ?? null,
                datum: a.zurueckgewiesen_am,
                variant: 'warn',
              })
            }
            // Freigabe — Erstgutachten-Freigabe ist bereits oben als
            // 'qc-bestanden' enthalten, hier nur die Side-Quests.
            if (
              a.typ !== 'erstgutachten' &&
              a.gutachten_final_freigegeben &&
              a.abgeschlossen_am
            ) {
              begutachtungEvents.push({
                key: `a-${a.id}-done`,
                label: `${TYP_LABEL[a.typ]} freigegeben`,
                datum: a.abgeschlossen_am,
                variant: 'done',
              })
            }
          }
          begutachtungEvents.sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())

          // Pflichtdokumente-Banner als embedded variant — wird OBEN im
          // ClaimStepper-Wrapper gerendert. Sichtbarkeit: wie zuvor —
          // hidden während QC läuft (besichtigung/gutachten unfreigegeben),
          // außer in Auszahlungs-Phase mit signierter Vollmacht.
          const erstQc = auftraege.find((a) => a.typ === 'erstgutachten')
          const qcLaeuft =
            !!erstQc && (erstQc.status === 'besichtigung' || erstQc.status === 'gutachten') &&
            !erstQc.gutachten_final_freigegeben
          const inAuszahlungsPhase =
            (claimLifecycle.mainPhase === 'regulierung' || claimLifecycle.mainPhase === 'abschluss') &&
            !!(fall.vollmacht_signiert_am as string | null)
          const pflichtBannerEmbedded =
            qcLaeuft && !inAuszahlungsPhase
              ? null
              : (
                  <PflichtdokumenteSection
                    slots={pflichtSlots}
                    fallId={fall.id as string}
                    rolle="kunde"
                    variant="embedded"
                  />
                )

          return (
            <ClaimStepper
              lifecycle={claimLifecycle}
              topSlot={pflichtBannerEmbedded}
              terminInfo={terminInfo}
              gutachtenUrl={gutachtenUrlFuerStepper}
              anspruchVsEur={gutachtenFreigegeben ? anspruchVsEur : null}
              lead={leadInputForLifecycle}
              begutachtungEvents={begutachtungEvents}
              anspruchPositionen={
                gutachtenFreigegeben ? anspruchPositionen ?? undefined : undefined
              }
              kanzleiWunsch={claimRow?.kanzlei_wunsch ?? null}
              kanzleiUebergebenAm={claimRow?.kanzlei_uebergeben_am ?? null}
              ausfallSlot={
                ausfallProps ? <KundeAusfallEntschaedigungCard {...ausfallProps} /> : null
              }
              ausfallSlotLexDrive={
                ausfallProps
                  ? <KundeAusfallEntschaedigungCard
                      {...ausfallProps}
                      className="bg-[#0e5be9]/[0.06] border-[#0e5be9]/20"
                      variant="lexdrive"
                    />
                  : null
              }
              nutzungsausfallBetragEur={nutzungsausfallBetragEur}
              claimId={fall.claim_id as string | null}
              fallId={fall.id as string}
              gutachtenFreigegeben={gutachtenFreigegeben}
              bankdatenFehlen={
                claimRow?.kanzlei_wunsch === 'partnerkanzlei' &&
                !!(fall.vollmacht_signiert_am as string | null) &&
                kanzleiFall?.status === 'auszahlung' &&
                !(fall.bankdaten_hinterlegt_am as string | null)
              }
              kanzleiFall={
                kanzleiFall
                  ? {
                      status:
                        (kanzleiFall.status as 'versicherungskontakt' | 'auszahlung') ??
                        'versicherungskontakt',
                      vs_kontakt_am: (kanzleiFall.vs_kontakt_am as string | null) ?? null,
                      ausgezahlt_am: (kanzleiFall.ausgezahlt_am as string | null) ?? null,
                    }
                  : null
              }
              bottomSlot={
                verlegungBannerProps ? (
                  <TerminVerlegungBanner {...verlegungBannerProps} embedded />
                ) : null
              }
            />
          )
        })()}

        {/* CMM-32 Polish: Read-only Claim-Summary mit Kennzeichenhalter
            + Tabs (Fahrzeug · Unfall · Beteiligte). Zeigt nur kuratierte,
            kunden-relevante Felder an. */}
        <ClaimSummary
          uploadSlot={<BelegUploadCard fallId={fall.id as string} />}
          anspruch={{
            positionen: anspruchPositionen,
            totalEur: anspruchVsEur,
            gutachtenFreigegeben: gutachtenFreigegebenFuerSummary,
            gutachtenUrl: gutachtenUrlFuerSummary,
          }}
          dokumente={(dokumente ?? []).map((d) => ({
            id: d.id as string,
            typ: (d.typ as string) ?? 'sonstiges',
            datei_url: d.datei_url as string,
            datei_name: (d.datei_name as string | null) ?? null,
            created_at: d.created_at as string,
          }))}
          data={{
            claim_nummer: (fall.claim_nummer as string | null) ?? null,
            kennzeichen: (fall.kennzeichen as string | null) ?? null,
            kennzeichen_kreis: (fall.kennzeichen_kreis as string | null) ?? null,
            kennzeichen_buchstaben: (fall.kennzeichen_buchstaben as string | null) ?? null,
            kennzeichen_zahl: (fall.kennzeichen_zahl as string | null) ?? null,
            kennzeichen_suffix: (fall.kennzeichen_suffix as string | null) ?? null,
            fahrzeug_hersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
            fahrzeug_modell: (fall.fahrzeug_modell as string | null) ?? null,
            erstzulassung: (fall.erstzulassung as string | null) ?? null,
            kilometerstand: (fall.kilometerstand as number | null) ?? null,
            fahrzeug_aufbau:
              (fall.fahrzeug_aufbau as string | null) ??
              (fall.fahrzeug_typ as string | null) ?? null,
            fahrzeug_baujahr: (fall.fahrzeug_baujahr as number | null) ?? null,
            lackfarbe:
              ((fall.lackfarbe_code as string | null) ?? null) as
                | 'schwarz' | 'weiss' | 'silber' | 'grau' | 'blau' | 'rot'
                | 'gruen' | 'gelb' | 'orange' | 'braun' | 'beige' | 'sonstige'
                | null,
            schadens_adresse:
              (fall.schadens_adresse as string | null) ??
              ([
                (fall.schadens_plz as string | null) ?? null,
                (fall.schadens_ort as string | null) ?? null,
              ].filter(Boolean).join(' ') || null),
            kraftstoff: null,
            fahrgestellnummer: (fall.fin_vin as string | null) ?? null,
            schadens_datum: (fall.schadens_datum as string | null) ?? null,
            schadens_ort: (fall.schadens_ort as string | null) ?? null,
            schadens_plz: (fall.schadens_plz as string | null) ?? null,
            schadens_beschreibung: (fall.schadens_beschreibung as string | null) ?? null,
            schadenart: (fall.schadens_art as string | null) ?? null,
            halter_vorname: (fall.halter_vorname as string | null) ?? null,
            halter_nachname: (fall.halter_nachname as string | null) ?? null,
            halter_ist_kunde: (fall.ist_fahrzeughalter as boolean | null) ?? null,
            vs_eigener_name: null,
            vs_gegner_name: (fall.gegner_versicherung as string | null) ?? null,
            vs_gegner_schaden_nr: (fall.gegner_schadennummer as string | null) ?? null,
            vs_gegner_telefon: null,
            vs_gegner_email: null,
            kunde_vorname: leadInputForLifecycle?.vorname ?? null,
            kunde_nachname: leadInputForLifecycle?.nachname ?? null,
          }}
        />

        {/* CMM-32 Polish: Kanzlei-Pfad-Wahl. Switch je nach
            claim.kanzlei_wunsch: Frage / eigene Kanzlei / selbst einreichen.
            Bei partnerkanzlei rendert die Card null (Standardweg laeuft im
            Stepper-Sub-Stepper). */}
        {fall.claim_id && (
          <KanzleiPfadCard
            claimId={fall.claim_id as string}
            kanzleiWunsch={claimRow?.kanzlei_wunsch ?? null}
            kanzleiName={kanzleiAnsprechpartner?.name ?? null}
            kanzleiEmail={kanzleiAnsprechpartner?.email ?? null}
            kanzleiTelefon={kanzleiAnsprechpartner?.telefon ?? null}
            kanzleiUebergebenAm={claimRow?.kanzlei_uebergeben_am ?? null}
            gutachtenFreigegeben={
              !!auftraege.find((a) => a.typ === 'erstgutachten')?.gutachten_final_freigegeben
            }
            gutachtenUrl={gutachtenUrlAusBucket}
          />
        )}

        {/* CMM-36 + CMM-32f: SV-Live-Banner — immer gemountet solange ein
            aktiver Termin existiert (kein sv_unterwegs_seit-Guard hier,
            damit die Realtime-Subscription den "unterwegs"-Trigger live
            einfängt auch wenn der Kunde die Seite vor dem Start geladen hat). */}
        {svTermin?.id &&
          !(svTermin.durchgefuehrt_am as string | null) && (
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

        {/* CMM-merge: Pflichtdokumente-Banner ist jetzt embedded oben im
            ClaimStepper-Wrapper (siehe topSlot). Separater Render hier
            entfernt damit der Kunde EINEN visuellen Card-Block sieht
            statt zweier gestapelter Banner. */}

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
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-violet-600 text-lg">&#9888;</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-800">Nachbesichtigung läuft</p>
                <p className="text-xs text-violet-600">Die Versicherung hat eine erneute Besichtigung angefordert. Ihr Fall wird fortgesetzt sobald das Ergebnis vorliegt.</p>
              </div>
            </div>
            <Link
              href={`/kunde/nachbesichtigung/${fall.id as string}`}
              className="inline-flex items-center text-xs font-medium rounded-md bg-violet-600 text-white px-3 py-1.5 hover:bg-violet-700"
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-700 text-lg">&#9888;</span>
              <p className="text-sm font-semibold text-amber-900">Versicherung hat gekürzt</p>
            </div>
            {typeof fall.vs_kuerzung_grund === 'string' && (fall.vs_kuerzung_grund as string) && (
              <div className="rounded-md bg-white/60 border border-amber-200 p-2 text-[11px] text-amber-800">
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
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-900">Versicherung hat abgelehnt</p>
            <p className="text-xs text-red-700">
              Die Versicherung lehnt die Regulierung ab. Unsere Partnerkanzlei prüft den Fall und meldet sich mit den nächsten Schritten (Rüge oder Klage-Empfehlung).
            </p>
          </div>
        )}

        {(fall.status as string) === 'klage' && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
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
            email: null,
            telefon: null,
          }}
          vollmachtSigniertAm={fall.vollmacht_signiert_am as string | null}
          uebergebenAm={null}
        />

        {/* CMM-32 Polish: KundeAusfallEntschaedigungCard ist jetzt im
            Stepper-Wrapper (Regulierungs-Panel) integriert — siehe
            ausfallSlot-Prop am ClaimStepper. */}

        {/* Gutachten-Banner lebt jetzt im ClaimStepper (gruener Erfolgsbanner). */}

        {/* Bankdaten-Banner — nur sichtbar wenn LexDrive-Vollmacht +
            Kanzleifall in Auszahlung + Bankdaten fehlen. Sonst zahlt die
            Kanzlei nicht aus. */}
        {claimRow?.kanzlei_wunsch === 'partnerkanzlei' &&
          !!(fall.vollmacht_signiert_am as string | null) &&
          kanzleiFall?.status === 'auszahlung' &&
          !(fall.bankdaten_hinterlegt_am as string | null) && (
          <div className="space-y-4">
            <BankdatenBanner
              fallId={fall.id as string}
              status="regulierung"
              bankdatenHinterlegt={false}
              saveBankdaten={saveBankdaten}
            />
          </div>
        )}

        {/* FallPhasenPanel entfernt — Phasen-Progress lebt im ClaimStepper.
            FallDetailSections schlank gemacht: Fahrzeug-Block lebt jetzt
            in ClaimSummary, hier bleiben nur Mietwagen + Termin-Banner. */}
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
