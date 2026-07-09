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

import { getTranslations, getFormatter } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getStorageUrl, getStorageUrlBulk } from '@/lib/storage/url'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import FallDetailSections from './FallDetailSections'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
import PflichtdokumenteSection from '@/components/fall/PflichtdokumenteSection'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { MeineKanzleiCard } from '@/components/kunde/kanzlei'
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
// AAR Fallakte-Kanonisierung: kanonische Status/Notice-Box.
import { NoticeBox } from '@/components/shared/NoticeBox'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import SaeuleMeinBetreuer from '@/components/kunde/SaeuleMeinBetreuer'
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import FiktiveAbrechnungCard from '@/components/kunde/FiktiveAbrechnungCard'
import { saveBankdaten, updateZahlungsweg } from './actions'
import GutachtenWeiterleitungButton from '@/components/kunde/GutachtenWeiterleitungButton'
import GutachtenPdfButton from '@/components/kunde/GutachtenPdfButton'
import KundeAbschlussCard from '@/components/kunde/KundeAbschlussCard'
import KundeBetreuerStrip from '@/components/kunde/KundeBetreuerStrip'
import GoogleReviewPrompt from '@/components/kunde/GoogleReviewPrompt'
import KanzleiPfadCard from '@/components/kunde/KanzleiPfadCard'
import KundeAusfallEntschaedigungCard from '@/components/kunde/KundeAusfallEntschaedigungCard'
import WerkstattCard from '@/components/kunde/WerkstattCard'
import KostenvoranschlagCard from '@/components/kunde/KostenvoranschlagCard'
import WerkstattFinderCard from '@/components/kunde/WerkstattFinderCard'
import SchadensfotoUploadCard from '@/components/kunde/SchadensfotoUploadCard'
import { brauchtWerkstattVermittlung } from '@/lib/werkstatt/vermittlung-core'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import TerminSectionCard from '@/components/kunde/TerminSectionCard'
import TerminVerlegungBanner from '@/components/kunde/TerminVerlegungBanner'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
import KundeSvLiveBanner from '@/components/kunde/KundeSvLiveBanner'
import KundeTerminCheckBanner from '@/components/kunde/KundeTerminCheckBanner'
import { CLAIM_TERMINAL_STATUSES } from '@/lib/termine/close-nur-gutachter-termin'
import { EMBED_B_KLAERUNG_TASK_TYP, TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE } from '@/lib/termine/embed-b-klaerung-task'
import ClaimStepper from '@/components/kunde/ClaimStepper'
import SelbstzahlerReparaturStepper from '@/components/kunde/SelbstzahlerReparaturStepper'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { getKundeFallDetailRecord, getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { isHTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback'

// AAR-864: force-dynamic, damit der Verlegungs-Banner direkt nach dem
// SV-Submit ohne Hard-Reload erscheint (revalidatePath alleine reicht
// nicht zuverlässig wenn der Kunde gerade auf der Page ist).
export const dynamic = 'force-dynamic'

export default async function KundeFallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // CMM-63 Route-Key-Switch: [id] ist jetzt der claim_id (neuer Key), kann aber
  // für Alt-Bookmarks weiterhin eine faelle.id sein (accept-both im Loader).
  const { id: routeId } = await params

  const t = await getTranslations('kunde.fall')
  const format = await getFormatter()

  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()

    // CMM-28: claim-zentrierter Loader. Ownership wird intern aufgelöst
    // (claim_parties.user_id ODER faelle.kunde_id ODER lead.email).
    // CMM-63: accept-both — routeId ist claim_id (neu) ODER faelle.id (Alt-Bookmark).
    const fall = await getKundeFallDetailRecord(admin, user.id, user.email ?? null, routeId)
    if (!fall) notFound()

    // CMM-63: Ab hier ist `id` die aufgelöste faelle.id. Damit bleiben ALLE
    // fall_id-keyed Sub-Queries unten unverändert korrekt — egal ob die Route
    // mit claim_id (neuer Key) oder faelle.id (Alt-Bookmark) aufgerufen wurde.
    const id = fall.id as string
    // CMM-63 Canonicalize: Alt-faelle.id-URL → 308 → kanonische claim_id-URL.
    const claimId = fall.claim_id as string | null
    if (claimId && routeId !== claimId) redirect(`/kunde/faelle/${claimId}`)

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
      // CMM-49 (faelle-Drop-Runway): claim_id->fall_id via Bridge statt .from('faelle').
      // claim_id ist 1:1 mit faelle (live verifiziert: 0 Multi-faelle) -> selbe fall_ids.
      const { data: claimFaelle } = await admin
        .from('faelle_claim_bridge')
        .select('fall_id')
        .eq('claim_id', fall.claim_id as string)
      claimFallIds = ((claimFaelle ?? []) as Array<{ fall_id: string }>).map((f) => f.fall_id)
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
    // KVA-Loop (Kunde-Seite): signierte URL des jüngsten Kostenvoranschlag-PDFs
    // aus den bereits geladenen Dokumenten (Werkstatt lädt dokument_typ='kostenvoranschlag'
    // sichtbar_fuer inkl. 'kunde' hoch). Fallback = Dokumente-Reiter (Card-Hinweis).
    const kostenvoranschlagPdfUrl =
      dokumente
        .filter((d) => d.typ === 'kostenvoranschlag' && d.datei_url)
        .slice(-1)[0]?.datei_url ?? null

    // CMM-23: Pflichtdokumente-Liste laden — identische Filter-Logik wie
    // beim SV im Auftrag, nur aus Kunden-Sicht.
    const pflichtSlots = await getPflichtdokumenteForFall(supabase, id, 'kunde')

    // Aktiven gutachter_termine Eintrag laden (inkl. sv_vorgeschlagene_slots)
    const { data: aktiverTermin } = await admin
      .from('gutachter_termine')
      // CMM-49 (sv_id-Drop): sv_id:assignee_id-Alias — Feldname sv_id bleibt für den
      // AktiverTermin-Consumer, Wert aus assignee_id (value-identisch für SV-Termine).
      .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, sv_id:assignee_id, sv_vorgeschlagene_slots')
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
      .select('id, start_zeit, verlegung_quelle_id, verlegung_grund, assignee_id')
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
      if (verlegungPendingRow.assignee_id) {
        const { data: sv } = await admin
          .from('sachverstaendige')
          .select('profile_id')
          .eq('id', verlegungPendingRow.assignee_id as string)
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
          ? format.dateTime(new Date(iso), {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              timeZone: 'Europe/Berlin',
            })
          : ''
      const fmtT = (iso: string | null) =>
        iso
          ? format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
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

    // AAR-558 (C9): Kunden-sichere Felder aus faelle_kunde_view — jetzt nur noch
    // der Zahlungsweg. auszahlung_kunde_betrag/_eingegangen_am waren in der View
    // hardcoded NULL (keine eigene Spalte); kanonische Quelle siehe kanzleiPayout unten.
    const { data: kundeView } = await supabase
      .from('faelle_kunde_view')
      .select('auszahlung_zahlungsweg')
      .eq('id', id)
      .maybeSingle()

    // AAR-558 Follow-up (Aaron 02.07.): Netto-Kunden-Auszahlbetrag ist keine eigene
    // Spalte — im komplett/Kanzlei-Pfad ist die kanonische SSoT kanzlei_faelle:
    // vs_quote_betrag_ausgezahlt = "Quote ausgezahlt" (der Netto-Betrag AN den Kunden,
    // Aaron-bestätigt) + ausgezahlt_am = Auszahl-Datum. Admin-Client fuer den bereits
    // ownership-verifizierten Fall (Muster wie claims/v_gutachten_werte unten).
    // nur_gutachter hat kein kanzlei_faelle -> null -> Karte bleibt aus (VS zahlt direkt).
    const { data: kanzleiPayout } = await admin
      .from('kanzlei_faelle')
      .select('vs_quote_betrag_ausgezahlt, ausgezahlt_am')
      .eq('fall_id', id)
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
      reparaturkosten_netto: number | null
      reparaturwunsch: string | null
      // SP4a Task 4: Werkstatt-Vermittlung
      reparatur_werkstatt_id: string | null
      // Fiktiv-Gate-Fix: der kanonische brauchtWerkstattVermittlung braucht diese 2
      werkstatt_id: string | null
      reparatur_vermittlung_status: string | null
      // SP-D: Abrechnungsweg fuer den Selbstzahler-Reparatur-Stepper
      abrechnungsweg: string | null
      // WS4: Werkstatt-KVA (claims.kostenvoranschlag_*) fuer die Kunde-KVA-Card
      kostenvoranschlag_netto: number | null
      kostenvoranschlag_brutto: number | null
    } | null = null
    if (fall.claim_id) {
      // Cluster F+G PR-2: Split in 2 Queries — claims für Kanzlei-Felder (Nicht-F+G),
      // v_gutachten_werte (Dual-Source-View) für die 10 F+G-Werte
      const [{ data: cxClaim }, { data: cxView }] = await Promise.all([
        admin
          .from('claims')
          .select('kanzlei_uebergeben_am, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon, reparaturwunsch, reparatur_werkstatt_id, werkstatt_id, reparatur_vermittlung_status, abrechnungsweg, kostenvoranschlag_netto, kostenvoranschlag_brutto')
          .eq('id', fall.claim_id as string)
          .maybeSingle(),
        admin
          .from('v_gutachten_werte')
          .select(
            'totalschaden, gutachten_ocr_processed_at, nutzungsausfall_tage, wiederbeschaffungsdauer_tage, gutachten_nutzungsausfall_tagessatz_eur, gutachten_mietwagen_tagessatz_eur, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert',
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
          reparaturkosten_netto: cxView?.reparaturkosten_netto != null ? Number(cxView.reparaturkosten_netto) : null,
          minderwert: cxView?.minderwert != null ? Number(cxView.minderwert) : null,
          wiederbeschaffungswert: cxView?.wiederbeschaffungswert != null ? Number(cxView.wiederbeschaffungswert) : null,
          restwert: cxView?.restwert != null ? Number(cxView.restwert) : null,
          reparaturwunsch: (cxClaim?.reparaturwunsch as string | null) ?? null,
          // SP4a Task 4: Werkstatt-Vermittlung
          reparatur_werkstatt_id: (cxClaim?.reparatur_werkstatt_id as string | null) ?? null,
          // Fiktiv-Gate-Fix: fuer den kanonischen brauchtWerkstattVermittlung-Gate
          werkstatt_id: (cxClaim?.werkstatt_id as string | null) ?? null,
          reparatur_vermittlung_status: ((cxClaim as Record<string, unknown> | null)?.reparatur_vermittlung_status as string | null) ?? null,
          // SP-D: abrechnungsweg ist type-lagged -> Record-Cast beim Lesen.
          abrechnungsweg: ((cxClaim as Record<string, unknown> | null)?.abrechnungsweg as string | null) ?? null,
          // WS4: Werkstatt-KVA-Betraege (claims-nativ).
          kostenvoranschlag_netto: cxClaim?.kostenvoranschlag_netto != null ? Number(cxClaim.kostenvoranschlag_netto) : null,
          kostenvoranschlag_brutto: cxClaim?.kostenvoranschlag_brutto != null ? Number(cxClaim.kostenvoranschlag_brutto) : null,
        }
      }
    }

    // SP4a Task 4: Werkstatt-Stammdaten + aktiver Reparaturtermin.
    // Ownership ist durch getKundeFallDetailRecord bereits verifiziert.
    // Admin-Client konsistent mit allen anderen page.tsx-Reads.
    let werkstattData: { name: string; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null; telefon: string | null } | null = null
    let reparaturTermin: { id: string; status: string; wunschtermin: string | null; bestaetigter_termin: string | null; absage_grund: string | null } | null = null
    const reparaturWerkstattId = claimExtra?.reparatur_werkstatt_id ?? null
    if (reparaturWerkstattId) {
      const { data: w } = await admin
        .from('werkstaetten')
        .select('name, adresse_strasse, adresse_plz, adresse_ort, telefon')
        .eq('id', reparaturWerkstattId)
        .maybeSingle()
      werkstattData = w as typeof werkstattData
      const { data: t } = await admin
        .from('reparatur_termine')
        .select('id, status, wunschtermin, bestaetigter_termin, absage_grund')
        .eq('claim_id', fall.claim_id as string)
        .neq('status', 'storniert')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      reparaturTermin = t as typeof reparaturTermin
    }

    // WS4: zuletzt hochgeladenes KVA-Dokument (Werkstatt ODER Kunde) fuer die
    // Kunde-KVA-Card — nur fuer Werkstatt-Reparatur-Claims (selbstzahler/kasko-frei),
    // damit normale Claims keinen ueberfluessigen Read machen.
    // WS3: alle Schadenfotos (fall_dokumente dokument_typ='schadensfoto') fuer die
    // SchadensfotoUploadCard — im selben Gate. (Der KVA-PDF-Link kommt aus dem
    // staging-KVA-Loop via kostenvoranschlagPdfUrl, kein separater Load hier.)
    let schadensfotoUrls: string[] = []
    if (fall.claim_id && istWerkstattReparaturWeg(claimExtra?.abrechnungsweg ?? null)) {
      const { data: fotoDocs } = await admin
        .from('fall_dokumente')
        .select('storage_path')
        .in('fall_id', claimFallIds)
        .eq('dokument_typ', 'schadensfoto')
        .is('geloescht_am', null)
        .is('abgelehnt_am', null)
        .order('hochgeladen_am', { ascending: true })
      const fotoUrls = await getStorageUrlBulk(
        admin,
        (fotoDocs ?? []).map((d) => ({ bucket: 'fall-dokumente', path: d.storage_path as string })),
      )
      schadensfotoUrls = fotoUrls.filter((u): u is string => !!u)
    }

    // Fall-Extras: Mietwagen-Felder + Google-Review-Prompt-Marker.
    // CMM-44 SP-A2 (Cluster 2): mietwagen_hat → claims.hat_mietwagen (SSoT) via
    // claims-Embed. CMM-44 SP-B PR2c: alle mietwagen_*-Felder liegen jetzt auf
    // claims (SSoT) — in den claims-Embed gezogen.
    // CMM-44 SP-B PR2a: google_review_prompt_gezeigt_am lebt auf claims (SSoT) —
    // ebenfalls im claims-Embed.
    // CMM-49: mietwagen_*/google_review_prompt_gezeigt_am claims-nativ (SSoT) — claims-direkt
    // via resolveClaimId statt faelle-Embed. faelle-frei.
    const mwClaimId = await resolveClaimId(admin, id)
    const { data: fallExtraClaim } = mwClaimId
      ? await admin
          .from('claims')
          .select('hat_mietwagen, mietwagen_seit_datum, mietwagen_vermieter, mietwagen_limit_tage, mietwagen_rechnung_vorhanden, google_review_prompt_gezeigt_am')
          .eq('id', mwClaimId)
          .maybeSingle()
      : { data: null }
    const ausfallProps: React.ComponentProps<typeof KundeAusfallEntschaedigungCard> | null = claimExtra
      ? {
          totalschaden: claimExtra.totalschaden,
          ocrVerarbeitet: !!claimExtra.gutachten_ocr_processed_at,
          mietwagenHat: !!(fallExtraClaim?.hat_mietwagen as boolean | null),
          mietwagenSeitDatum: (fallExtraClaim?.mietwagen_seit_datum as string | null) ?? null,
          mietwagenVermieter: (fallExtraClaim?.mietwagen_vermieter as string | null) ?? null,
          mietwagenLimitTage: (fallExtraClaim?.mietwagen_limit_tage as number | null) ?? null,
          mietwagenRechnungVorhanden: !!(fallExtraClaim?.mietwagen_rechnung_vorhanden as boolean | null),
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

    // CMM-36: polizeiDocs/SLAs/svLive-Berechnung für KundeJetztZuTunCard
    // entfernt — die Card existiert nicht mehr auf dieser Seite. Live-Tracking
    // läuft über KundeSvLiveBanner (Realtime), Pflichtdokumente über
    // PflichtdokumenteSection.

    // Termin-Daten für die Detail-Card (SV + KB)
    const aktiveStatus = ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben']
    const { data: svKandidaten } = await admin
      .from('gutachter_termine')
      // CMM-49 (sv_id-Drop): assignee_id statt sv_id (typ='sv_begutachtung' → value-identisch).
      .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, durchgefuehrt_am, assignee_id, kb_id, created_at')
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
      // CMM-49 (sv_id-Drop): sv_id aus Select entfernt (unused; kb_beratung-Termine haben ohnehin sv_id=null).
      .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, kb_id')
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
    if (svTermin?.assignee_id ?? fall.sv_id) {
      const svId = (svTermin?.assignee_id as string | null) ?? (fall.sv_id as string | null)
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

    // CMM-44 Claim-Phasen-SSoT (P0): zentraler Loader = die EINE Quelle fuer den
    // Lifecycle (statt Inline-Assembly). Liefert auch auftraege/kanzleiFall fuer
    // die weitere Verwendung unten (kein Doppel-Load).
    const { lifecycle: claimLifecycle, auftraege, kanzleiFall } =
      await getClaimLifecycleForClaim(admin, fall.id as string)
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

    const kennzeichen = (fall.kennzeichen as string) ?? ''
    const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
    const adresse = (fall.besichtigungsort_adresse as string) || (fall.unfallort as string) || [(fall.schadens_adresse as string), (fall.schadens_plz as string), (fall.schadens_ort as string)].filter(Boolean).join(', ') || ''

    // Gutachten-Freigabe und URL für ClaimSummary-Anspruch-Tab
    const erstgutachtenFuerSummary = auftraege.find((a) => a.typ === 'erstgutachten')
    const gutachtenFreigegebenFuerSummary = !!erstgutachtenFuerSummary?.gutachten_final_freigegeben
    const gutachtenUrlFuerSummary = gutachtenFreigegebenFuerSummary && gutachtenUrlAusBucket ? gutachtenUrlAusBucket : null

    // AAR-939: "Kam dein Gutachter?"-Selbstauskunft — Banner bei ueberfaelligem,
    // ungeklaertem nur_gutachter-Termin (weder durchgefuehrt noch No-Show/Ablehnung,
    // Claim nicht terminal, kein offener Dispatcher-Klaerungs-Task). Eng gegated,
    // damit der Banner bei Bestandsdaten / komplett-Claims nicht faelschlich erscheint.
    // Claim service_typ + Terminal-Status (claim-nativ; fall traegt service_typ
    // nicht direkt). Component-Scope, weil sowohl der TerminCheck-Banner als auch
    // die Kanzlei-Cards unten service_typ-abhaengig sind (Aaron: gewaehltes Paket).
    let istNurGutachter = false
    let claimTerminal = false
    if (fall.claim_id) {
      const { data: claimSvc } = await admin
        .from('claims')
        .select('service_typ, status')
        .eq('id', fall.claim_id as string)
        .maybeSingle()
      istNurGutachter = (claimSvc?.service_typ as string | null) === 'nur_gutachter'
      claimTerminal = (CLAIM_TERMINAL_STATUSES as readonly string[]).includes(
        (claimSvc?.status as string | null) ?? '',
      )
    }

    let terminCheckBanner: React.ComponentProps<typeof KundeTerminCheckBanner> | null = null
    if (fall.claim_id) {
      if (istNurGutachter && !claimTerminal) {
        const { data: staleTermin } = await admin
          .from('gutachter_termine')
          .select('id, start_zeit')
          .eq('fall_id', id)
          .lt('end_zeit', new Date().toISOString())
          .is('durchgefuehrt_am', null)
          .is('sv_no_show_am', null)
          .is('sv_ablehnung_am', null)
          .not('status', 'in', TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE)
          .order('end_zeit', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (staleTermin) {
          const { data: offenerTask } = await admin
            .from('tasks')
            .select('id')
            .eq('entity_type', 'termin')
            .eq('entity_id', staleTermin.id as string)
            .eq('task_typ', EMBED_B_KLAERUNG_TASK_TYP)
            .eq('status', 'offen')
            .limit(1)
            .maybeSingle()
          if (!offenerTask) {
            const start = staleTermin.start_zeit as string | null
            const terminLabel = start
              ? `${format.dateTime(new Date(start), { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })} um ${format.dateTime(new Date(start), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`
              : null
            terminCheckBanner = {
              terminId: staleTermin.id as string,
              svVorname: svName ? svName.split(' ')[0] : null,
              terminLabel,
            }
          }
        }
      }
    }

    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl md:max-w-none mx-auto space-y-5">
        {/* AAR-864: Live-Aktualisierung — abonniert gutachter_termine,
            auftraege und faelle für diesen Fall, refresht die Page bei
            jedem Event. */}
        <FallRealtimeRefresh fallId={fall.id as string} claimId={(fall.claim_id as string | null) ?? null} />

        {/* Header — CMM-28: Zurück-Link nur bei Multi-Fall-Kunden */}
        <div>
          {hatMehrereFaelle && (
            <Link href="/kunde" className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-2 inline-block">&larr; {t('detail.meineFaelle')}</Link>
          )}
          <PageHeader
            title={`${(fall.claim_nummer as string | null) ?? t('detail.schadensfall')}${kennzeichen ? ` · ${kennzeichen}` : ''}${fahrzeug ? ` — ${fahrzeug}` : ''}`}
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
          nurSv
        />

        {/* AAR Layout-Audit (2026-06-29): 2-Spalten Master/Detail — links der
            zeitkritische Fortschritts-/Status-Strang, rechts eine sticky Sidebar
            mit Kanzlei + Geld. Nutzt die Desktop-Breite statt Full-Width-Stretch
            und kürzt die Seite. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:items-start">
          <div className="space-y-5 min-w-0">

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
                datum: format.dateTime(new Date(aktiverSv.start_zeit as string), {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  timeZone: 'Europe/Berlin',
                }),
                uhrzeit: format.dateTime(new Date(aktiverSv.start_zeit as string), {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Berlin',
                }),
                adresse: terminAdresse,
                // AAR-858: nur Vorname für Anonymität
                svVorname: svKontakt?.name?.split(' ')[0] ?? null,
                kundeVorname: kundeVorname ?? null,
              }
            : null
          // SP-D + WS2: Werkstatt-Reparatur-Claims (Selbstzahler ODER Kasko mit freier Werkstattwahl)
          // bekommen die reduzierte Reparatur-Strecke (Schaden -> Werkstatt -> Termin -> Reparatur)
          // statt des SV/Gutachten/Regulierungs-Steppers.
          if (istWerkstattReparaturWeg(claimExtra?.abrechnungsweg ?? null)) {
            return (
              <SelbstzahlerReparaturStepper
                hatWerkstatt={!!reparaturWerkstattId}
                terminStatus={(reparaturTermin as { status: string } | null)?.status ?? null}
                abgeschlossen={claimLifecycle.mainPhase === 'abschluss'}
              />
            )
          }
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

        {/* AAR-939: "Kam dein Gutachter?"-Selbstauskunft bei ueberfaelligem,
            ungeklaertem nur_gutachter-Termin (gated server-seitig oben). */}
        {terminCheckBanner && <KundeTerminCheckBanner {...terminCheckBanner} />}

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
                <p className="text-sm font-semibold text-claimondo-navy">{t('nachbesichtigung.titel')}</p>
                <p className="text-xs text-claimondo-navy">{t('nachbesichtigung.text')}</p>
              </div>
            </div>
            <Link
              href={`/kunde/nachbesichtigung/${fall.id as string}`}
              className="inline-flex items-center text-xs font-medium rounded-ios-md bg-claimondo-navy text-white px-3 py-1.5 hover:bg-claimondo-navy"
            >
              {t('nachbesichtigung.termineVorschlagen')}
            </Link>
          </div>
        )}

        {/* AAR-558 (C9): Auszahlungs-Card — nur Netto-Kunden-Anteil. */}
        {kundeView && (
          <AuszahlungCard
            betrag={(kanzleiPayout?.vs_quote_betrag_ausgezahlt as number | null) ?? null}
            eingegangenAm={(kanzleiPayout?.ausgezahlt_am as string | null) ?? null}
            zahlungsweg={(kundeView.auszahlung_zahlungsweg as string | null) ?? null}
          />
        )}

        {/* SP4c: Fiktive-Abrechnung-Card — voraussichtliche Auszahlung auf Gutachten-Basis
            (nur wenn der Kunde die fiktive Abrechnung gewählt hat). */}
        {claimExtra?.reparaturwunsch === 'fiktiv' && (
          <FiktiveAbrechnungCard
            reparaturkostenNetto={claimExtra.reparaturkosten_netto}
            minderwert={claimExtra.minderwert}
            totalschaden={claimExtra.totalschaden}
            wiederbeschaffungswert={claimExtra.wiederbeschaffungswert}
            restwert={claimExtra.restwert}
          />
        )}

        {/* VS-Kürzung-Hinweis (Brutto-Beträge bewusst nicht gerendert) */}
        {(fall.status as string) === 'vs-kuerzt' && (
          <NoticeBox tone="warning" className="rounded-ios-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-warning-strong text-lg">&#9888;</span>
              <p className="text-sm font-semibold text-warning-strong">{t('vsKuerzt.titel')}</p>
            </div>
            {typeof fall.vs_kuerzung_grund === 'string' && (fall.vs_kuerzung_grund as string) && (
              <div className="rounded-ios-md bg-white/60 border border-warning/30 p-2 text-[11px] text-warning-strong">
                <strong className="block mb-0.5">{t('vsKuerzt.begruendung')}</strong>
                {fall.vs_kuerzung_grund as string}
              </div>
            )}
            <p className="text-[11px] text-warning-strong">
              {t('vsKuerzt.hinweis')}
            </p>
          </NoticeBox>
        )}

        {(fall.status as string) === 'vs-abgelehnt' && (
          <NoticeBox tone="danger" className="rounded-ios-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-danger-strong">{t('vsAbgelehnt.titel')}</p>
            <p className="text-xs text-danger-strong">
              {t('vsAbgelehnt.text')}
            </p>
          </NoticeBox>
        )}

        {(fall.status as string) === 'klage' && (
          <NoticeBox tone="danger" className="rounded-ios-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-danger-strong">{t('klage.titel')}</p>
            <p className="text-xs text-danger-strong">
              {t('klage.text')}
            </p>
          </NoticeBox>
        )}
          </div>

          {/* Rechte Sidebar — Kanzlei + Geld (sticky). */}
          <aside className="space-y-5 mt-5 lg:mt-0 lg:sticky lg:top-4 self-start">

        {/* CMM-28 Konsolidierung: Eine „Meine Kanzlei"-Card statt 3 separaten
            Cards (SaeuleMeinAnwalt + MeineKanzleiCard + KanzleiAnsprechpartnerBlock).
            Anwalt-Mandatstyp und Vollmacht-Status sind in MeineKanzleiCard
            integriert (vollmachtSigniertAm-Prop). */}
        {/* service_typ-Gate: Kanzlei/Vollmacht haengt am gewaehlten Paket.
            nur_gutachter hat kein Mandat -> keine Kanzlei-Card (statt sich nur
            auf die hatKanzlei-Datenlage zu verlassen). */}
        {!istNurGutachter && (
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
        )}

        {/* 13.05.2026 Restore: Kanzlei-Pfad-Wahl. Switch je nach
            claim.kanzlei_wunsch (Komplettservice / eigene Kanzlei / selbst
            einreichen / Frage). Bei partnerkanzlei rendert die Card null.
            (CMM-32 Polish, #416) */}
        {!!fall.claim_id && !istNurGutachter && (
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

        {/* WS3 (Reduced-Repair): Schadenfotos-Card — VOR der Werkstatt-Card, damit
            der Werkstatt-/Finder-Schritt die Foto-Kontext-Basis hat. Werkstatt-
            Reparatur-Claims (Selbstzahler/Kasko-frei); kein SV macht Fotos. */}
        {!!fall.claim_id && istWerkstattReparaturWeg(claimExtra?.abrechnungsweg ?? null) && (
          <SchadensfotoUploadCard
            claimId={fall.claim_id as string}
            fotos={schadensfotoUrls.map((url) => ({ url }))}
          />
        )}

        {/* SP4a Task 4: Werkstatt-Card — nur bei hinterlegter Werkstatt. */}
        {werkstattData && (
          <WerkstattCard
            claimId={fall.claim_id as string}
            werkstatt={werkstattData}
            termin={reparaturTermin}
          />
        )}

        {/* KVA-Loop (Kunde-Seite): Kostenvoranschlag-Card — nur bei Reparatur-Claim
            (hinterlegte Werkstatt) mit hochgeladenem KVA. Kunde sieht Betrag + PDF
            und gibt die Reparaturkosten frei (-> claims.reparatur_freigegeben_am).
            Abrechnungsweg-Verfeinerung (KVA nur kasko/selbstzahler) folgt im Design-Schritt. */}
        {reparaturWerkstattId &&
          (fall.kostenvoranschlag_netto != null || fall.kostenvoranschlag_brutto != null) && (
            <KostenvoranschlagCard
              claimId={fall.claim_id as string}
              kostenvoranschlagNetto={(fall.kostenvoranschlag_netto as number | null) ?? null}
              kostenvoranschlagBrutto={(fall.kostenvoranschlag_brutto as number | null) ?? null}
              freigegebenAm={(fall.reparatur_freigegeben_am as string | null) ?? null}
              pdfUrl={kostenvoranschlagPdfUrl}
              reparaturdauerTage={(fall.reparaturdauer_tage_kva as number | null) ?? null}
            />
          )}

        {/* Werkstatt-Finder — Kunde ohne vermittelte Werkstatt. Kanonischer Gate
            brauchtWerkstattVermittlung (reparatur ODER fiktiv, keine Werkstatt,
            Status offen) statt lokalem reparatur-only-Check → deckt fiktive
            Abrechnung ab (SP4d-Drift-Fix, Aaron 08.07.). */}
        {claimExtra && brauchtWerkstattVermittlung(claimExtra) && (
          <WerkstattFinderCard claimId={fall.claim_id as string} />
        )}

        {/* 13.05.2026 Restore: Mietwagen-/Nutzungsausfall-Card (XOR). Render
            nur wenn Gutachten OCR-verarbeitet + Schadenstyp klar. Pre-merge
            war diese Card als ausfallSlot in den ClaimStepper eingehängt;
            der heutige Stepper akzeptiert diesen Slot nicht mehr, daher
            standalone. (CMM-32 P3, #416) */}
        {ausfallProps && (
          <KundeAusfallEntschaedigungCard {...ausfallProps} />
        )}

        {/* Geld + Betreuer — in der 360px-Sidebar gestapelt (1-Spalte). */}
        <div className="grid grid-cols-1 gap-4">
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
          </aside>
        </div>

        {/* Opt-in Gutachten-Weiterleitung — nur sichtbar wenn Gutachten vorliegt */}
        {gutachtenVerfuegbar && (
          <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-claimondo-navy">{t('gutachtenWeiterleitung.titel')}</p>
              <p className="text-xs text-claimondo-ondo mt-0.5">
                {t('gutachtenWeiterleitung.text')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* AV7: direkter Gutachten-PDF-Download fuer den Kunden (neben der Email-Weiterleitung). */}
              {!!fall.claim_id && <GutachtenPdfButton claimId={fall.claim_id as string} />}
              <GutachtenWeiterleitungButton fallId={fall.id as string} defaultEmail={user.email ?? null} />
            </div>
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

        {/* Fortschritt + Fall-Details — Sub-Projekt 3: "Mein Fortschritt"-Duplikat
            (FallPhasenPanel progress-card) entfernt; der ClaimStepper oben ist die
            kanonische Fortschritts-Anzeige. Der Ruegefall-Banner bleibt standalone. */}
        <div className="space-y-5">
          {szenario === 'ruegefall' ? (
            <NoticeBox tone="warning" className="rounded-ios-xl px-3 py-2">
              <p className="text-xs text-warning-strong font-medium">{t('ruegefall.banner')}</p>
            </NoticeBox>
          ) : null}

          <FallDetailSections
            fall={fall as Record<string, unknown>}
            svName={svName}
            svTelefon={svTelefon}
            svVerifiziert={svVerifiziert}
            kbName={kbName}
            dokumente={dokumente ?? []}
            aktiverTermin={aktiverTermin}
          />
        </div>
      </div>
    )
  } catch (err) {
    // redirect() UND notFound()/forbidden()/unauthorized() werfen Control-Flow-
    // Errors (NEXT_REDIRECT / NEXT_HTTP_ERROR_FALLBACK), die an Next's
    // Error-Boundary durchschlagen muessen. Ohne den HTTP-Access-Fallback-Re-Throw
    // faengt dieser catch das notFound() aus dem Ownership-Deny-Pfad ab und liefert
    // HTTP 200 ("Fehler beim Laden") statt 404 (CMM-63 Deny-Smoke deckte das auf).
    if (isRedirectError(err) || isHTTPAccessFallbackError(err)) throw err
    console.error('[KundeFallDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-danger font-semibold">{t('fehler.titel')}</p>
        <p className="text-sm text-claimondo-ondo mt-1">{t('fehler.text')}</p>
      </div>
    )
  }
}
