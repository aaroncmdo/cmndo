// P0 (Kunde-Detail-Rebuild): EIN konsolidierter Server-Loader → EIN typisiertes ViewModel.
// Ersetzt die 24 verstreuten Loader der alten page.tsx. Nutzt die geteilte Phasen-SSoT
// (getClaimLifecycleForClaim, lifecycle.ts — NICHT v_claim_workstate, das ist 470d55c9-Ops)
// + kunde-only-Loader. Die reine Zonen-/Aufgaben-Ableitung (kunde-zonen.ts) konsumiert dieses
// ViewModel — dort liegt die getestete „vollständig DB-getrieben"-Logik.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import { getClaimDetail } from '@/lib/claims/detail/get-claim-detail'
import { getSvKontakt, getKbKontakt, type SvKontakt, type KbKontakt } from '@/lib/kunde/get-kontakt'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import { getKundeTermine, type KundeTermin } from '@/lib/claims/kunde-termine'
import { getStorageUrlBulk } from '@/lib/storage/url'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'
import type { TerminSectionProps } from '@/components/kunde/TerminSectionCard'

export type KundeGutachtenWerte = {
  totalschaden: boolean | null
  reparaturkostenNetto: number | null
  reparaturkostenBrutto: number | null
  minderwert: number | null
  wiederbeschaffungswert: number | null
  restwert: number | null
  nutzungsausfallTage: number | null
  wiederbeschaffungsdauerTage: number | null
  // P3 (GeldZone): fuer SaeuleMeinGeld.gutachtenWerte.ocr_processed_at + Ausfall-Card.
  ocrProcessedAt: string | null
  nutzungsausfallTagessatzEur: number | null
  mietwagenTagessatzEur: number | null
}

// P3 (GeldZone): Props-Basis fuer KundeAusfallEntschaedigungCard (Nutzungsausfall/Mietwagen, XOR).
// Spiegelt die page.tsx-lokale `ausfallProps`-Berechnung (mietwagen_* claims-nativ + tagessaetze/
// tage aus v_gutachten_werte).
export type KundeAusfallDaten = {
  totalschaden: boolean | null
  ocrVerarbeitet: boolean
  mietwagenHat: boolean
  mietwagenSeitDatum: string | null
  mietwagenVermieter: string | null
  mietwagenLimitTage: number | null
  mietwagenRechnungVorhanden: boolean
  nutzungsausfallTage: number | null
  wiederbeschaffungsdauerTage: number | null
  nutzungsausfallTagessatzEur: number | null
  mietwagenTagessatzEur: number | null
}

export type KundeDokument = { id: string; typ: string; datei_url: string; datei_name: string | null; created_at: string }

// P3 (DoksTermineZone): aktiver gutachter_termine fuer FallDetailSections (Gegenvorschlag-Slots etc.).
export type KundeAktiverTermin = {
  id: string
  status: string
  start_zeit: string
  end_zeit: string
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
  sv_id: string | null
  sv_vorgeschlagene_slots?: Array<{ datum: string; uhrzeit: string }> | null
}

// P3 (DoksTermineZone): Pflichtdok-Banner-Gate (qcLaeuft) + KB-Termin-Card + Dokumente + aktiver Termin.
export type KundeDoks = {
  qcLaeuft: boolean
  kbTerminCard: TerminSectionProps | null
  dokumente: KundeDokument[]
  aktiverTermin: KundeAktiverTermin | null
}

// P3 (StatusZone): aktiver SV-Begutachtungstermin (mit Realtime-Feldern) — Stepper-terminInfo + SvLiveBanner.
export type KundeSvTermin = {
  id: string
  status: string | null
  start: string | null
  kanal: string | null
  svUnterwegsSeit: string | null
  svAngekommenAm: string | null
  svEtaMinuten: number | null
  durchgefuehrtAm: string | null
}

// P3 (StatusZone): Status-Strang-Daten (Stepper + SvLive + Abschluss + GoogleReview).
export type KundeStatus = {
  svTermin: KundeSvTermin | null
  kundeVorname: string | null
  svLive: { gutachtenHochgeladen: boolean; qcFreigegeben: boolean; inUeberarbeitung: boolean }
  gutachtenUrl: string | null
  gutachtenFreigegeben: boolean
  googleReviewGezeigtAm: string | null
  svGooglePlaceId: string | null
}

export type KundeClaimViewModel = {
  claimId: string
  fallId: string
  fall: Record<string, unknown> // flacher getKundeFallDetailRecord-Record (bestehend)
  lifecycle: ClaimLifecycle
  termine: KundeTermin[]
  team: { kb: KbKontakt | null; sv: SvKontakt | null }
  geld: {
    forderungNetto: number | null
    auszahlungNetto: number | null
    // P3 (GeldZone): AuszahlungCard — eingegangenAm/zahlungsweg + Sichtbarkeit (faelle_kunde_view-Row).
    auszahlungEingegangenAm: string | null
    auszahlungZahlungsweg: string | null
    auszahlungCardSichtbar: boolean
    kvaNetto: number | null
    kvaBrutto: number | null
    // P3 (GeldZone): KostenvoranschlagCard — signierte PDF-URL + Werkstatt-Gate.
    kvaPdfUrl: string | null
    reparaturWerkstattId: string | null
    reparaturdauerTageKva: number | null
    // P3 (GeldZone): FiktiveAbrechnungCard-Gate (claims.reparaturwunsch === 'fiktiv').
    reparaturwunsch: string | null
    gutachtenWerte: KundeGutachtenWerte | null
    // P3 (GeldZone): KundeAusfallEntschaedigungCard (null wenn keine Gutachten-/claims-Basis).
    ausfall: KundeAusfallDaten | null
  }
  pflichtdokumente: { offen: number; slots: PflichtSlotForView[] }
  doks: KundeDoks
  status: KundeStatus
  defaultEmail: string | null
  flags: {
    abrechnungsweg: string | null
    istReparaturRoute: boolean
    bankdatenOffen: boolean
    gutachtenVerfuegbar: boolean
    reparaturFreigegeben: boolean
  }
}

function num(v: unknown): number | null {
  return v != null ? Number(v) : null
}

export async function getKundeClaimView(
  admin: SupabaseClient,
  userId: string,
  userEmail: string | null,
  claimId: string,
): Promise<KundeClaimViewModel | null> {
  // AAR (Kunde-Detail-Rebuild): auf die geteilte Datenschicht ausgerichtet — getClaimDetail
  // (rollen-aware Facade, staging #4039) ist das Ownership-Gate + liefert core/lifecycle/auftraege/
  // pflichtDokumente (inkl. C1-Fix fallIdOf → korrekt fall_id-gekeyte Pflichtdokumente). Ersetzt die
  // 3 frueheren Einzel-Loader (getKundeFallDetailRecord/getClaimLifecycleForClaim/getPflichtdokumenteForFall).
  const detail = await getClaimDetail(admin, claimId, 'kunde', { userId, email: userEmail })
  if (!detail) return null
  const fall = detail.core
  const fallId = fall.id as string
  const resolvedClaimId = (fall.claim_id as string | null) ?? claimId
  const pflichtSlots = detail.pflichtDokumente

  const [termine, kb, sv, payoutRes, gwRes, kundeViewRes, claimExtraRes, dokumenteRes, aktiverTerminRes, kbTerminRes, svTerminRes, kundeProfilRes] =
    await Promise.all([
      getKundeTermine(admin, { fallIds: [fallId], claimIds: [resolvedClaimId] }),
      getKbKontakt(admin, (fall.kundenbetreuer_id as string | null) ?? null),
      getSvKontakt(admin, (fall.sv_id as string | null) ?? null),
      // Netto-Kunden-Auszahlbetrag: kanonische SSoT kanzlei_faelle.vs_quote_betrag_ausgezahlt
      // (Aaron 02.07.); nur_gutachter/direkt-Zahlung -> keine kanzlei_faelle-Row -> null.
      admin
        .from('kanzlei_faelle')
        .select('vs_quote_betrag_ausgezahlt, ausgezahlt_am')
        .eq('fall_id', fallId)
        .maybeSingle(),
      // Gutachten-F+G-Werte aus der Dual-Source-View v_gutachten_werte (P3: +ocr/tagessaetze fuer GeldZone).
      admin
        .from('v_gutachten_werte')
        .select('totalschaden, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert, nutzungsausfall_tage, wiederbeschaffungsdauer_tage, gutachten_ocr_processed_at, gutachten_nutzungsausfall_tagessatz_eur, gutachten_mietwagen_tagessatz_eur')
        .eq('claim_id', resolvedClaimId)
        .maybeSingle(),
      // P3 (GeldZone): Kunden-Zahlungsweg der Auszahlung (faelle_kunde_view) — Card-Gate = Row existiert.
      admin
        .from('faelle_kunde_view')
        .select('auszahlung_zahlungsweg')
        .eq('id', fallId)
        .maybeSingle(),
      // P3 (GeldZone): claims-native Extras (Reparatur-Route-Gate + Mietwagen fuer die Ausfall-Card).
      admin
        .from('claims')
        .select('reparaturwunsch, reparatur_werkstatt_id, hat_mietwagen, mietwagen_seit_datum, mietwagen_vermieter, mietwagen_limit_tage, mietwagen_rechnung_vorhanden, google_review_prompt_gezeigt_am')
        .eq('id', resolvedClaimId)
        .maybeSingle(),
      // P3 (DoksTermineZone): alle sichtbaren Fall-Dokumente (FallDetailSections + KVA-PDF-Ableitung).
      admin
        .from('fall_dokumente')
        .select('id, dokument_typ, storage_path, original_filename, hochgeladen_am')
        .eq('fall_id', fallId)
        .is('geloescht_am', null)
        .is('abgelehnt_am', null)
        .order('hochgeladen_am'),
      // P3 (DoksTermineZone): aktiver gutachter_termine (FallDetailSections Gegenvorschlag/Slots).
      admin
        .from('gutachter_termine')
        .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, sv_id:assignee_id, sv_vorgeschlagene_slots')
        .eq('fall_id', fallId)
        .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // P3 (DoksTermineZone): aktiver KB-Beratungstermin (eigene TerminSectionCard; SV lebt im Stepper).
      admin
        .from('gutachter_termine')
        .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, kb_id')
        .eq('fall_id', fallId)
        .eq('typ', 'kb_beratung')
        .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben'])
        .is('cancelled_at', null)
        .gte('start_zeit', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // P3 (StatusZone): aktiver SV-Begutachtungstermin (Realtime-Felder) — Stepper-terminInfo + SvLive.
      // Array (kein limit) → JS-Sort nach Status-Prio wie die Live-page.tsx.
      admin
        .from('gutachter_termine')
        .select('id, status, start_zeit, kanal, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, durchgefuehrt_am')
        .eq('fall_id', fallId)
        .eq('typ', 'sv_begutachtung')
        .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben'])
        .is('cancelled_at', null)
        .order('created_at', { ascending: false }),
      // P3 (StatusZone): Kunde-Vorname (terminInfo „X ist da").
      admin.from('profiles').select('vorname').eq('id', userId).maybeSingle(),
    ])

  // Dokumentenliste (mit signierten URLs) — Basis fuer FallDetailSections + KVA-PDF-Ableitung.
  const dokRows = (dokumenteRes.data ?? []) as Array<{
    id: string; dokument_typ: string; storage_path: string; original_filename: string | null; hochgeladen_am: string
  }>
  const dokUrls = await getStorageUrlBulk(admin, dokRows.map((d) => ({ bucket: 'fall-dokumente', path: d.storage_path })))
  const dokumente: KundeDokument[] = dokRows.map((d, i) => ({
    id: d.id,
    typ: d.dokument_typ,
    datei_url: dokUrls[i] ?? '',
    datei_name: d.original_filename ?? null,
    created_at: d.hochgeladen_am,
  }))
  // KVA-PDF = juengstes kostenvoranschlag-Dokument mit URL (aus der Liste, wie page.tsx).
  const kvaPdfUrl = dokumente.filter((d) => d.typ === 'kostenvoranschlag' && d.datei_url).slice(-1)[0]?.datei_url ?? null

  const aktiverTermin = (aktiverTerminRes.data as KundeAktiverTermin | null) ?? null

  // KB-Termin-Card (Gegenueber-Kontakt inkl. email). SV-Termin lebt im ClaimStepper (StatusZone),
  // daher hier NUR der KB-Beratungstermin (Doppel-Card vermeiden — wie in der Live-page.tsx).
  const kbTerminRow = kbTerminRes.data as {
    id: string; status: string | null; start_zeit: string | null; end_zeit: string | null
    kanal: string | null; video_link: string | null; kb_id: string | null
  } | null
  let kbTerminCard: TerminSectionProps | null = null
  if (kbTerminRow) {
    const kbId = kbTerminRow.kb_id ?? (fall.kundenbetreuer_id as string | null) ?? null
    let gegenueber: TerminSectionProps['gegenueber'] = null
    if (kbId) {
      const { data: p } = await admin
        .from('profiles')
        .select('vorname, nachname, telefon, anzeigename, avatar_url, email')
        .eq('id', kbId)
        .maybeSingle()
      if (p) {
        gegenueber = {
          rolle: 'kundenbetreuer',
          name: (p.anzeigename as string | null) || [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
          telefon: (p.telefon as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        }
      }
    }
    kbTerminCard = {
      termin: {
        id: kbTerminRow.id,
        typ: 'kb_beratung',
        status: kbTerminRow.status ?? 'reserviert',
        start_zeit: kbTerminRow.start_zeit ?? null,
        end_zeit: kbTerminRow.end_zeit ?? null,
        kanal: kbTerminRow.kanal ?? null,
        video_link: kbTerminRow.video_link ?? null,
        sv_unterwegs_seit: null,
        sv_angekommen_am: null,
        sv_eta_minuten: null,
        adresse: null,
      },
      gegenueber,
    }
  }

  // qcLaeuft: waehrend Besichtigung/Vollstaendigkeits-Check (erstgutachten-Auftrag, nicht freigegeben)
  // ist der Pflichtdok-Banner ausgeblendet (Kunde soll nicht nachladen). Danach wieder sichtbar.
  const erstAuftrag = detail.auftraege.find((a) => a.typ === 'erstgutachten')
  const qcLaeuft =
    !!erstAuftrag &&
    (erstAuftrag.status === 'besichtigung' || erstAuftrag.status === 'gutachten') &&
    !erstAuftrag.gutachten_final_freigegeben

  const abrechnungsweg = (fall.abrechnungsweg as string | null) ?? null
  const reparaturFreigegeben = !!fall.reparatur_freigegeben_am
  const mainPhase = detail.lifecycle.mainPhase
  const istGeldPhase = mainPhase === 'regulierung' || mainPhase === 'abschluss'

  const payout = payoutRes.data as { vs_quote_betrag_ausgezahlt: number | null; ausgezahlt_am: string | null } | null
  const kundeView = kundeViewRes.data as { auszahlung_zahlungsweg: string | null } | null
  const claimExtra = claimExtraRes.data as Record<string, unknown> | null
  const gw = gwRes.data as Record<string, unknown> | null
  const gutachtenWerte: KundeGutachtenWerte | null = gw
    ? {
        totalschaden: (gw.totalschaden as boolean | null) ?? null,
        reparaturkostenNetto: num(gw.reparaturkosten_netto),
        reparaturkostenBrutto: num(gw.reparaturkosten_brutto),
        minderwert: num(gw.minderwert),
        wiederbeschaffungswert: num(gw.wiederbeschaffungswert),
        restwert: num(gw.restwert),
        nutzungsausfallTage: num(gw.nutzungsausfall_tage),
        wiederbeschaffungsdauerTage: num(gw.wiederbeschaffungsdauer_tage),
        ocrProcessedAt: (gw.gutachten_ocr_processed_at as string | null) ?? null,
        nutzungsausfallTagessatzEur: num(gw.gutachten_nutzungsausfall_tagessatz_eur),
        mietwagenTagessatzEur: num(gw.gutachten_mietwagen_tagessatz_eur),
      }
    : null
  // Ausfall-Card-Basis (spiegelt page.tsx `ausfallProps`): gerendert sobald claim-/gutachten-Daten
  // existieren; die Card selbst entscheidet Sichtbarkeit (ocrVerarbeitet/Totalschaden/Mietwagen).
  const ausfall: KundeAusfallDaten | null =
    gw || claimExtra
      ? {
          totalschaden: (gw?.totalschaden as boolean | null) ?? null,
          ocrVerarbeitet: !!(gw?.gutachten_ocr_processed_at as string | null),
          mietwagenHat: !!(claimExtra?.hat_mietwagen as boolean | null),
          mietwagenSeitDatum: (claimExtra?.mietwagen_seit_datum as string | null) ?? null,
          mietwagenVermieter: (claimExtra?.mietwagen_vermieter as string | null) ?? null,
          mietwagenLimitTage: num(claimExtra?.mietwagen_limit_tage),
          mietwagenRechnungVorhanden: !!(claimExtra?.mietwagen_rechnung_vorhanden as boolean | null),
          nutzungsausfallTage: num(gw?.nutzungsausfall_tage),
          wiederbeschaffungsdauerTage: num(gw?.wiederbeschaffungsdauer_tage),
          nutzungsausfallTagessatzEur: num(gw?.gutachten_nutzungsausfall_tagessatz_eur),
          mietwagenTagessatzEur: num(gw?.gutachten_mietwagen_tagessatz_eur),
        }
      : null
  const pflichtOffen = pflichtSlots.filter((s) => s.status === 'offen').length

  // Status-Strang (StatusZone): aktiver SV-Begutachtungstermin nach Status-Prio (bestaetigt>gegenvorschlag>
  // reserviert>verschoben, wie page.tsx) + Realtime-Felder; SvLive/Abschluss-Flags aus erstAuftrag.
  const SV_STATUS_PRIO: Record<string, number> = { bestaetigt: 1, gegenvorschlag: 2, reserviert: 3, verschoben: 4 }
  const svTerminRow =
    ((svTerminRes.data ?? []) as Array<Record<string, unknown>>)
      .slice()
      .sort((a, b) => (SV_STATUS_PRIO[(a.status as string) ?? ''] ?? 9) - (SV_STATUS_PRIO[(b.status as string) ?? ''] ?? 9))[0] ?? null
  const svTermin: KundeSvTermin | null = svTerminRow
    ? {
        id: svTerminRow.id as string,
        status: (svTerminRow.status as string | null) ?? null,
        start: (svTerminRow.start_zeit as string | null) ?? null,
        kanal: (svTerminRow.kanal as string | null) ?? null,
        svUnterwegsSeit: (svTerminRow.sv_unterwegs_seit as string | null) ?? null,
        svAngekommenAm: (svTerminRow.sv_angekommen_am as string | null) ?? null,
        svEtaMinuten: (svTerminRow.sv_eta_minuten as number | null) ?? null,
        durchgefuehrtAm: (svTerminRow.durchgefuehrt_am as string | null) ?? null,
      }
    : null
  const gutachtenFreigegeben = !!erstAuftrag?.gutachten_final_freigegeben
  const status: KundeStatus = {
    svTermin,
    kundeVorname: (kundeProfilRes.data as { vorname: string | null } | null)?.vorname ?? null,
    svLive: {
      gutachtenHochgeladen: !!erstAuftrag?.gutachten_url,
      qcFreigegeben: gutachtenFreigegeben,
      inUeberarbeitung: !!(erstAuftrag as { zurueckgewiesen_am?: string | null } | undefined)?.zurueckgewiesen_am,
    },
    gutachtenUrl: gutachtenFreigegeben
      ? (dokumente.filter((d) => d.typ === 'gutachten' && d.datei_url).slice(-1)[0]?.datei_url ?? null)
      : null,
    gutachtenFreigegeben,
    googleReviewGezeigtAm: (claimExtra?.google_review_prompt_gezeigt_am as string | null) ?? null,
    svGooglePlaceId: sv?.googlePlaceId ?? null,
  }

  return {
    claimId: resolvedClaimId,
    fallId,
    fall,
    lifecycle: detail.lifecycle,
    termine,
    team: { kb, sv },
    geld: {
      forderungNetto: num(fall.schadens_hoehe_netto),
      auszahlungNetto: num(payout?.vs_quote_betrag_ausgezahlt),
      auszahlungEingegangenAm: payout?.ausgezahlt_am ?? null,
      auszahlungZahlungsweg: kundeView?.auszahlung_zahlungsweg ?? null,
      auszahlungCardSichtbar: !!kundeView,
      kvaNetto: num(fall.kostenvoranschlag_netto),
      kvaBrutto: num(fall.kostenvoranschlag_brutto),
      kvaPdfUrl,
      reparaturWerkstattId: (claimExtra?.reparatur_werkstatt_id as string | null) ?? null,
      reparaturdauerTageKva: num(fall.reparaturdauer_tage_kva),
      reparaturwunsch: (claimExtra?.reparaturwunsch as string | null) ?? null,
      gutachtenWerte,
      ausfall,
    },
    pflichtdokumente: { offen: pflichtOffen, slots: pflichtSlots },
    doks: { qcLaeuft, kbTerminCard, dokumente, aktiverTermin },
    status,
    defaultEmail: userEmail,
    flags: {
      abrechnungsweg,
      istReparaturRoute: istWerkstattReparaturWeg(abrechnungsweg),
      // bankdatenOffen: Geld-Phase erreicht + noch keine Bankdaten hinterlegt (lifecycle-getrieben).
      bankdatenOffen: istGeldPhase && !fall.bankdaten_hinterlegt_am,
      gutachtenVerfuegbar: !!fall.gutachten_eingegangen_am,
      reparaturFreigegeben,
    },
  }
}
