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
import { reparaturPhaseErreicht } from '@/lib/werkstatt/reparatur-phase-erreicht'
import { brauchtWerkstattVermittlung } from '@/lib/werkstatt/vermittlung-core'
import { getKundeTermine, type KundeTermin } from '@/lib/claims/kunde-termine'
import { getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
import { istBankdatenPhase } from '@/lib/kunde/bankdaten-status'
import { getStorageUrlBulk } from '@/lib/storage/url'
import { getSichtbarFuerRolle } from '@/lib/dokumente/sichtbarkeit'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'
import type { TerminSectionProps } from '@/components/kunde/TerminSectionCard'
import { istClaimGeschlossen } from '@/lib/claims/terminal-status'
import { EMBED_B_KLAERUNG_TASK_TYP, TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE } from '@/lib/termine/embed-b-klaerung-task'

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
  // S2: SV-geprüft-Marker — treibt das „vom Gutachter geprüft"-Badge in SaeuleMeinGeld.
  manuellUeberschrieben: boolean | null
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

// P3 (StatusZone Edge-Banner): Verlegungs-Vorschlag (ClaimStepper-bottomSlot) + „kam dein Gutachter?".
// Rohe ISO-Daten — StatusZone formatiert (Berlin) beim Rendern.
export type KundeVerlegung = {
  pendingTerminId: string
  alterStart: string | null
  neuesStart: string | null
  svVorname: string
  grund: string | null
}
export type KundeTerminCheck = { terminId: string; svVorname: string | null; terminStart: string | null }

// P3 (StatusZone): Status-Strang-Daten (Stepper + SvLive + Abschluss + GoogleReview + Edge-Banner).
export type KundeStatus = {
  svTermin: KundeSvTermin | null
  kundeVorname: string | null
  svLive: { gutachtenHochgeladen: boolean; qcFreigegeben: boolean; inUeberarbeitung: boolean }
  gutachtenUrl: string | null
  gutachtenFreigegeben: boolean
  googleReviewGezeigtAm: string | null
  svGooglePlaceId: string | null
  verlegung: KundeVerlegung | null
  terminCheck: KundeTerminCheck | null
}

// P4 (GeldZone-Completion): Kanzlei-Karten-Daten (MeineKanzleiCard + KanzleiPfadCard) — in der
// alten page.tsx in der phasen-unabhaengigen Sidebar. `gutachtenUrlRaw` ist bewusst NICHT
// freigegeben-gated (Selbst-Einreichen-Download im KanzleiPfad), im Gegensatz zu status.gutachtenUrl.
export type KundeKanzlei = {
  row: { name: string | null; email: string | null; adresse: string | null } | null
  ansprechpartnerName: string | null
  ansprechpartnerEmail: string | null
  ansprechpartnerTelefon: string | null
  wunsch: string | null
  uebergebenAm: string | null
  vollmachtSigniertAm: string | null
  gutachtenUrlRaw: string | null
  /** Item 7: Regulierungs-Verlauf (Ereignis-Zeitleiste aus kanzlei_faelle) fuer die Kunde-Sicht. */
  verlauf: {
    anschlussschreibenAm: string | null
    vsKontaktAm: string | null
    vsReaktionAm: string | null
    vsReaktionTyp: string | null
    regulierungAngekuendigtAm: string | null
    regulierungAm: string | null
    ausgezahltAm: string | null
    kuerzungsBetrag: number | null
    vsKuerzungGrund: string | null
    klageUebergebenAm: string | null
  } | null
}

// P4 (GeldZone-Completion): Werkstatt-/Reparatur-Karten-Daten (SchadensfotoUploadCard +
// WerkstattCard + WerkstattFinderCard) — reparatur-only Fallakte (Selbstzahler/Kasko-frei).
export type KundeWerkstatt = {
  data: { name: string; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null; telefon: string | null } | null
  reparaturTermin: { id: string; status: string; wunschtermin: string | null; bestaetigter_termin: string | null; absage_grund: string | null } | null
  schadensfotoUrls: string[]
  schlussrechnungUrl: string | null
  // Slice 1b: juengste SV-Rechnung (rechnung_gutachten, kunde-sichtbar) fuer Normal-Claim-Belege.
  svRechnungUrl: string | null
  brauchtVermittlung: boolean
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
    // R1 (Repair-Audit): Kunde-KVA-Ablehnung — Zeitpunkt + Grund (steuert KostenvoranschlagCard-State).
    kvaAbgelehntAm: string | null
    kvaAbgelehntGrund: string | null
    // P3 (GeldZone): FiktiveAbrechnungCard-Gate (claims.reparaturwunsch === 'fiktiv').
    reparaturwunsch: string | null
    // Aaron 30.08.: Der Kunde darf die Abrechnungsart aendern — bis das Gutachten vorliegt.
    // Danach ist sie final. Serverseitig ermittelt; die Durchsetzung liegt in
    // setzeAuszahlungsart, dieses Flag steuert nur die Anzeige.
    auszahlungsartGesperrt: boolean
    auszahlungsartGesperrtSeit: string | null
    gutachtenWerte: KundeGutachtenWerte | null
    // P3 (GeldZone): KundeAusfallEntschaedigungCard (null wenn keine Gutachten-/claims-Basis).
    ausfall: KundeAusfallDaten | null
  }
  pflichtdokumente: { offen: number; slots: PflichtSlotForView[] }
  doks: KundeDoks
  status: KundeStatus
  kanzlei: KundeKanzlei
  werkstatt: KundeWerkstatt
  hatMehrereFaelle: boolean
  defaultEmail: string | null
  /**
   * D2: Die automatisch erzeugte Unfallskizze. Der Kunde bekommt sie als ENTWURF zu sehen —
   * bewusst nicht an `unfallskizze_bestaetigt` gegatet: das Flag bedeutet „Mitarbeiter hat
   * freigegeben", und dieser manuelle Schritt ist auf prod noch nie erfolgt (0 von allen).
   * Eine Anzeige daran zu haengen hiesse, sie tot zu bauen. Der Kunde ist ohnehin die einzige
   * Instanz, die weiss, ob die Darstellung stimmt.
   */
  unfallskizze: { svg: string } | null
  flags: {
    abrechnungsweg: string | null
    istReparaturRoute: boolean
    // Kasko-WB Phase 1: Tariffrage vor dem Finder; gebunden -> Info statt Finder.
    kaskoBindungOffen: boolean
    kaskoGebunden: boolean
    kaskoTarifName: string | null
    bankdatenOffen: boolean
    gutachtenVerfuegbar: boolean
    reparaturFreigegeben: boolean
    // P4: nur_gutachter hat kein Mandat/Kanzlei -> gated die Kanzlei-Karten (+ terminCheck).
    istNurGutachter: boolean
    // P4: „wuerde eine Kanzlei-Karte Inhalt haben?" -> GeldZone-Sichtbarkeit (preserve-all).
    kanzleiSichtbar: boolean
    // Task 11: WerkstattFinderCard-Gate — Haftpflicht: erst nach fertigem Gutachten; Selbstzahler/Kasko: sofort.
    reparaturPhaseErreicht: boolean
    // T4: Claim ist terminal (abgeschlossen/storniert) — gatet die „Gutachtertermin wählen"-Aufgabe.
    istTerminal: boolean
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

  const [termine, kb, sv, payoutRes, gwRes, kundeViewRes, claimExtraRes, dokumenteRes, aktiverTerminRes, kbTerminRes, svTerminRes, kundeProfilRes, verlegungRes, kanzleiRowRes, alleFaelle] =
    await Promise.all([
      getKundeTermine(admin, { fallIds: [fallId], claimIds: [resolvedClaimId] }),
      getKbKontakt(admin, (fall.kundenbetreuer_id as string | null) ?? null),
      getSvKontakt(admin, (fall.sv_id as string | null) ?? null),
      // Netto-Kunden-Auszahlbetrag: kanonische SSoT kanzlei_faelle.vs_quote_betrag_ausgezahlt
      // (Aaron 02.07.); nur_gutachter/direkt-Zahlung -> keine kanzlei_faelle-Row -> null.
      admin
        .from('kanzlei_faelle')
        .select(
          'vs_quote_betrag_ausgezahlt, ausgezahlt_am, anschlussschreiben_am, anschlussschreiben_sendedatum, vs_kontakt_am, vs_reaktion_am, vs_reaktion_typ, regulierung_angekuendigt_am, regulierung_am, kuerzungs_betrag, vs_kuerzung_grund, klage_uebergeben_am',
        )
        .eq('fall_id', fallId)
        .maybeSingle(),
      // Gutachten-F+G-Werte aus der Dual-Source-View v_gutachten_werte (P3: +ocr/tagessaetze fuer GeldZone).
      admin
        .from('v_gutachten_werte')
        // `fertiggestellt_am` (Aaron 30.08.): sperrt die Abrechnungsart-Auswahl — liegt das
        // Gutachten vor, ist sie final. Die View fuehrt das Feld bereits, deshalb kostet die
        // Sperre hier keine zusaetzliche Abfrage.
        .select('totalschaden, reparaturkosten_netto, reparaturkosten_brutto, minderwert, wiederbeschaffungswert, restwert, nutzungsausfall_tage, wiederbeschaffungsdauer_tage, gutachten_ocr_processed_at, gutachten_nutzungsausfall_tagessatz_eur, gutachten_mietwagen_tagessatz_eur, gutachten_ocr_manuell_ueberschrieben, fertiggestellt_am')
        .eq('claim_id', resolvedClaimId)
        .maybeSingle(),
      // P3 (GeldZone): Kunden-Zahlungsweg der Auszahlung (faelle_kunde_view) — Card-Gate = Row existiert.
      admin
        .from('faelle_kunde_view')
        .select('auszahlung_zahlungsweg')
        .eq('id', fallId)
        .maybeSingle(),
      // P3/P4 (GeldZone): claims-native Extras (Reparatur-Route-Gate + Mietwagen fuer die
      // Ausfall-Card + P4: Kanzlei-Ansprechpartner/Uebergabe + Werkstatt-Vermittlung-Gate).
      admin
        .from('claims')
        .select('reparaturwunsch, reparatur_werkstatt_id, hat_mietwagen, mietwagen_seit_datum, mietwagen_vermieter, mietwagen_limit_tage, mietwagen_rechnung_vorhanden, google_review_prompt_gezeigt_am, service_typ, operative_status, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon, kanzlei_uebergeben_am, werkstatt_id, reparatur_vermittlung_status, abrechnungsweg, freie_werkstattwahl, werkstattbindung_quelle, eigene_versicherung_name, eigene_kasko_tarif_name')
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
        .or(bezugOrExpr('fall', fallId))
        .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // P3 (DoksTermineZone): aktiver KB-Beratungstermin (eigene TerminSectionCard; SV lebt im Stepper).
      admin
        .from('gutachter_termine')
        .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, kb_id')
        .or(bezugOrExpr('fall', fallId))
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
        .or(bezugOrExpr('fall', fallId))
        .eq('typ', 'sv_begutachtung')
        .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben', 'dispatch_pending', 'sv_gesucht'])
        .is('cancelled_at', null)
        .order('created_at', { ascending: false }),
      // P3 (StatusZone): Kunde-Vorname (terminInfo „X ist da").
      admin.from('profiles').select('vorname').eq('id', userId).maybeSingle(),
      // P3 (StatusZone Edge-Banner): pending Verlegungs-Vorschlag (nur zukuenftige).
      admin
        .from('gutachter_termine')
        .select('id, start_zeit, verlegung_quelle_id, verlegung_grund, assignee_id')
        .or(bezugOrExpr('fall', fallId))
        .eq('status', 'verlegung_pending')
        .gt('start_zeit', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // P4 (GeldZone): Kanzlei-Stammdaten (MeineKanzleiCard) — nur wenn eine Kanzlei zugeordnet ist.
      fall.kanzlei_id
        ? admin.from('kanzleien').select('name, email, adresse').eq('id', fall.kanzlei_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      // P4 (Shell-Header): „← Meine Faelle"-Link nur bei Multi-Fall-Kunden (wie Live-page.tsx).
      getKundeFaelle(admin, userId, userEmail),
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

  // abrechnungsweg ist claims-nativ + NICHT im getKundeFallDetailRecord-Core-Select (nur in claims)
  // → aus dem claims-Read (claimExtraRes) lesen, nicht aus fall (sonst immer null → istReparaturRoute
  // nie true → SelbstzahlerReparaturStepper + Schadensfoto-Card würden nie rendern). Über claimExtraRes.data
  // (nicht die claimExtra-const, die erst weiter unten deklariert wird → TDZ). fall-Fallback für den Fall,
  // dass der Core den Wert später mitträgt. (Gegentest-Fund 10.07.)
  const abrechnungsweg =
    ((claimExtraRes.data as Record<string, unknown> | null)?.abrechnungsweg as string | null) ??
    (fall.abrechnungsweg as string | null) ??
    null
  const reparaturFreigegeben = !!fall.reparatur_freigegeben_am

  const payout = payoutRes.data as {
    vs_quote_betrag_ausgezahlt: number | null
    ausgezahlt_am: string | null
    anschlussschreiben_am: string | null
    anschlussschreiben_sendedatum: string | null
    vs_kontakt_am: string | null
    vs_reaktion_am: string | null
    vs_reaktion_typ: string | null
    regulierung_angekuendigt_am: string | null
    regulierung_am: string | null
    kuerzungs_betrag: number | null
    vs_kuerzung_grund: string | null
    klage_uebergeben_am: string | null
  } | null
  const kundeView = kundeViewRes.data as { auszahlung_zahlungsweg: string | null } | null
  const claimExtra = claimExtraRes.data as Record<string, unknown> | null

  // ── P4 (GeldZone-Completion): Kanzlei- + Werkstatt-/Reparatur-Karten-Daten ─────────────────
  // Diese Karten standen in der alten page.tsx in der phasen-unabhaengigen Sidebar; hier als
  // vm-Daten gebuendelt, damit die GeldZone sie 1:1 (mit den Live-Gates) wrappen kann.
  const istNurGutachter = (claimExtra?.service_typ as string | null) === 'nur_gutachter'

  // Werkstatt-Stammdaten + aktiver Reparaturtermin — nur bei vermittelter Werkstatt.
  const reparaturWerkstattId = (claimExtra?.reparatur_werkstatt_id as string | null) ?? null
  let werkstattData: KundeWerkstatt['data'] = null
  let reparaturTermin: KundeWerkstatt['reparaturTermin'] = null
  if (reparaturWerkstattId) {
    const [werkstattRes, reparaturTerminRes] = await Promise.all([
      admin.from('werkstaetten').select('name, adresse_strasse, adresse_plz, adresse_ort, telefon').eq('id', reparaturWerkstattId).maybeSingle(),
      admin
        .from('reparatur_termine')
        .select('id, status, wunschtermin, bestaetigter_termin, absage_grund')
        .eq('claim_id', resolvedClaimId)
        .neq('status', 'storniert')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    werkstattData = (werkstattRes.data as KundeWerkstatt['data']) ?? null
    reparaturTermin = (reparaturTerminRes.data as KundeWerkstatt['reparaturTermin']) ?? null
  }
  // Schadenfotos + Roh-Gutachten-URL aus der bereits signierten Dokumentenliste ableiten (kein
  // zusaetzlicher Storage-Call). gutachtenUrlRaw ist bewusst NICHT freigegeben-gated (KanzleiPfad).
  const schadensfotoUrls = dokumente.filter((d) => d.typ === 'schadensfoto' && d.datei_url).map((d) => d.datei_url)
  const gutachtenUrlRaw = dokumente.filter((d) => d.typ === 'gutachten' && d.datei_url).slice(-1)[0]?.datei_url ?? null
  const schlussrechnungUrl =
    dokumente.filter((d) => d.typ === 'schlussrechnung' && d.datei_url).slice(-1)[0]?.datei_url ?? null
  // Slice 1b: juengste SV-Rechnung (rechnung_gutachten, kunde-sichtbar) fuer Normal-Claim-Belege.
  // Analoges Muster zu schlussrechnungUrl und gutachtenUrlRaw.
  const svRechnungUrl =
    dokumente.filter((d) => d.typ === 'rechnung_gutachten' && d.datei_url).slice(-1)[0]?.datei_url ?? null
  const brauchtVermittlung = brauchtWerkstattVermittlung({
    reparaturwunsch: (claimExtra?.reparaturwunsch as string | null) ?? null,
    reparatur_werkstatt_id: reparaturWerkstattId,
    werkstatt_id: (claimExtra?.werkstatt_id as string | null) ?? null,
    reparatur_vermittlung_status: (claimExtra?.reparatur_vermittlung_status as string | null) ?? null,
    freie_werkstattwahl: (claimExtra?.freie_werkstattwahl as boolean | null | undefined) ?? null,
  })
  const werkstatt: KundeWerkstatt = { data: werkstattData, reparaturTermin, schadensfotoUrls, schlussrechnungUrl, svRechnungUrl, brauchtVermittlung }

  const kanzleiRow = (kanzleiRowRes.data as { name: string | null; email: string | null; adresse: string | null } | null) ?? null
  const kanzleiAnsprechpartnerName = (fall.kanzlei_ansprechpartner_name as string | null) ?? null
  const kanzlei: KundeKanzlei = {
    row: kanzleiRow,
    ansprechpartnerName: kanzleiAnsprechpartnerName,
    ansprechpartnerEmail: (claimExtra?.kanzlei_ansprechpartner_email as string | null) ?? null,
    ansprechpartnerTelefon: (claimExtra?.kanzlei_ansprechpartner_telefon as string | null) ?? null,
    wunsch: (fall.kanzlei_wunsch as string | null) ?? null,
    uebergebenAm: (claimExtra?.kanzlei_uebergeben_am as string | null) ?? null,
    vollmachtSigniertAm: (fall.vollmacht_signiert_am as string | null) ?? null,
    gutachtenUrlRaw,
    verlauf: payout
      ? {
          anschlussschreibenAm: payout.anschlussschreiben_am ?? payout.anschlussschreiben_sendedatum ?? null,
          vsKontaktAm: payout.vs_kontakt_am ?? null,
          vsReaktionAm: payout.vs_reaktion_am ?? null,
          vsReaktionTyp: payout.vs_reaktion_typ ?? null,
          regulierungAngekuendigtAm: payout.regulierung_angekuendigt_am ?? null,
          regulierungAm: payout.regulierung_am ?? null,
          ausgezahltAm: payout.ausgezahlt_am ?? null,
          kuerzungsBetrag: payout.kuerzungs_betrag ?? null,
          vsKuerzungGrund: payout.vs_kuerzung_grund ?? null,
          klageUebergebenAm: payout.klage_uebergeben_am ?? null,
        }
      : null,
  }
  // kanzleiSichtbar: „wuerde MeineKanzleiCard ODER KanzleiPfadCard etwas rendern?" — treibt die
  // GeldZone-Sichtbarkeit auch in fruehen Phasen (preserve-all). MeineKanzlei zeigt bei Kanzlei-/
  // AP-Name; KanzleiPfad nur bei kanzlei_wunsch='eigene_kanzlei'. nur_gutachter hat kein Mandat.
  const kanzleiSichtbar =
    !istNurGutachter && (!!kanzleiRow?.name || !!kanzleiAnsprechpartnerName || kanzlei.wunsch === 'eigene_kanzlei')

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
        manuellUeberschrieben: (gw.gutachten_ocr_manuell_ueberschrieben as boolean | null) ?? null,
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
  // reserviert>verschoben>dispatch_pending>sv_gesucht, wie page.tsx) + Realtime-Felder; SvLive/Abschluss-Flags
  // aus erstAuftrag. dispatch_pending/sv_gesucht (T1): Dead-Pin/noch-kein-SV-Termine — jetzt sichtbar statt
  // komplett ausgeblendet, StatusZone/ClaimStepper zeigen dafuer "wird bestaetigt" statt Live-Status.
  const SV_STATUS_PRIO: Record<string, number> = { bestaetigt: 1, gegenvorschlag: 2, reserviert: 3, verschoben: 4, dispatch_pending: 5, sv_gesucht: 6 }
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
  // Task 11: WerkstattFinderCard-Phasen-Gate — Haftpflicht erst nach abgeschlossenem Gutachten.
  // Boolean-Signal (gutachtenFreigegeben) statt v_gutachten_werte.fertiggestellt_am (Spalte existiert dort nicht).
  const reparaturPhaseOk = reparaturPhaseErreicht(
    { abrechnungsweg },
    { gutachtenAbgeschlossen: gutachtenFreigegeben, totalschaden: (gw?.totalschaden as boolean | null) ?? null },
  )

  // Edge-Banner: Verlegungs-Vorschlag (alter Termin-Start + SV-Vorname nachladen, wie page.tsx).
  const verlegungRow = verlegungRes.data as {
    id: string; start_zeit: string | null; verlegung_quelle_id: string | null; verlegung_grund: string | null; assignee_id: string | null
  } | null
  let verlegung: KundeVerlegung | null = null
  if (verlegungRow?.verlegung_quelle_id) {
    const { data: alterTermin } = await admin
      .from('gutachter_termine').select('start_zeit').eq('id', verlegungRow.verlegung_quelle_id).maybeSingle()
    let vSvVorname = ''
    if (verlegungRow.assignee_id) {
      const { data: vSv } = await admin.from('sachverstaendige').select('profile_id').eq('id', verlegungRow.assignee_id).maybeSingle()
      if (vSv?.profile_id) {
        const { data: vp } = await admin.from('profiles').select('vorname, anzeigename').eq('id', vSv.profile_id as string).maybeSingle()
        vSvVorname = ((vp?.vorname as string | null) ?? (vp?.anzeigename as string | null) ?? '') as string
      }
    }
    verlegung = {
      pendingTerminId: verlegungRow.id,
      alterStart: (alterTermin?.start_zeit as string | null) ?? null,
      neuesStart: verlegungRow.start_zeit ?? null,
      svVorname: vSvVorname,
      grund: verlegungRow.verlegung_grund ?? null,
    }
  }

  // Edge-Banner: „kam dein Gutachter?" — nur_gutachter (oben berechnet) + ueberfaelliger
  // ungeklaerter Termin + kein offener Klaerungs-Task.
  // T3-slice-2c: Terminal-Gate auf operative_status (istClaimGeschlossen prueft CLOSED_OPERATIVE_STATUS).
  const claimTerminal = istClaimGeschlossen({ operativeStatus: (claimExtra?.operative_status as string | null) ?? null })
  let terminCheck: KundeTerminCheck | null = null
  if (istNurGutachter && !claimTerminal) {
    const { data: staleTermin } = await admin
      .from('gutachter_termine')
      .select('id, start_zeit')
      .or(bezugOrExpr('fall', fallId))
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
        terminCheck = {
          terminId: staleTermin.id as string,
          svVorname: sv?.name ? sv.name.split(' ')[0] : null,
          terminStart: (staleTermin.start_zeit as string | null) ?? null,
        }
      }
    }
  }

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
    verlegung,
    terminCheck,
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
      kvaAbgelehntAm: (fall.kva_abgelehnt_am as string | null) ?? null,
      kvaAbgelehntGrund: (fall.kva_abgelehnt_grund as string | null) ?? null,
      reparaturwunsch: (claimExtra?.reparaturwunsch as string | null) ?? null,
      // Aaron 30.08.: aenderbar bis zum fertigen Gutachten, danach final.
      auszahlungsartGesperrt: Boolean(gw?.fertiggestellt_am),
      auszahlungsartGesperrtSeit: (gw?.fertiggestellt_am as string | null) ?? null,
      gutachtenWerte,
      ausfall,
    },
    pflichtdokumente: { offen: pflichtOffen, slots: pflichtSlots },
    // Rolle-Sichtbarkeits-Filter: interne Typen (abrechnung_intern, ki_kalkulation, kanzlei_paket,
    // gutachter_fotos, vorschaden_bericht usw.) werden aus der gerenderten Liste entfernt.
    // Die typ-spezifischen Ableitungen (schlussrechnungUrl, svRechnungUrl, kvaPdfUrl etc.) nutzen
    // die ungefilterte lokale `dokumente`-Variable (oben) — die sind bereits typ-gated.
    doks: { qcLaeuft, kbTerminCard, dokumente: getSichtbarFuerRolle(dokumente, 'kunde'), aktiverTermin },
    status,
    kanzlei,
    werkstatt,
    hatMehrereFaelle: alleFaelle.length > 1,
    defaultEmail: userEmail,
    // `unfallskizze_generiert_am` steht NICHT in den Rollen-Spaltenlisten von
    // getClaimForRole — bewusst nicht nachgezogen: das Datum traegt hier nichts,
    // die Kennzeichnung als Entwurf schon.
    unfallskizze: (fall.unfallskizze_svg as string | null)
      ? { svg: fall.unfallskizze_svg as string }
      : null,
    flags: {
      abrechnungsweg,
      istReparaturRoute: istWerkstattReparaturWeg(abrechnungsweg),
      // Kasko-WB Phase 1: Tariffrage vor dem Finder; gebunden -> Info statt Finder.
      kaskoBindungOffen: abrechnungsweg === 'kasko' && (claimExtra?.freie_werkstattwahl ?? null) === null && (claimExtra?.werkstattbindung_quelle ?? null) === null,
      kaskoGebunden: abrechnungsweg === 'kasko' && claimExtra?.freie_werkstattwahl === false,
      kaskoTarifName: (claimExtra?.eigene_kasko_tarif_name as string | null | undefined) ?? null,
      reparaturPhaseErreicht: reparaturPhaseOk,
      // bankdatenOffen == „Bankdaten-Banner ist in dieser Phase aktiv & noch nicht hinterlegt"
      // (istBankdatenPhase = kanonische Payout-Status-Liste, geteilt mit BankdatenBanner) — haelt
      // Aufgabe + GeldZone-Sichtbarkeit exakt synchron zum Banner.
      bankdatenOffen: istBankdatenPhase(fall.status as string | null) && !fall.bankdaten_hinterlegt_am,
      gutachtenVerfuegbar: !!fall.gutachten_eingegangen_am,
      reparaturFreigegeben,
      istNurGutachter,
      kanzleiSichtbar,
      istTerminal: claimTerminal,
    },
  }
}
