import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
// AAR-569 (V3) / AAR-727: Shared FallPhasenPanel (glass-light progress-card)
// ersetzt den alten Szenario-Stepper + den manuellen Progress-Bar-Wrapper.
import { FallPhasenPanel } from '@/components/shared/fall-phases'
import PageHeader from '@/components/shared/PageHeader'
import FallDetailSections from './FallDetailSections'
import FallStatusCard from '@/components/kunde/FallStatusCard'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
// AAR-710: Pflichtdokumente-Banner pro Fall (vorher global im Layout).
import { PflichtdokumenteBanner } from '@/components/kunde/PflichtdokumenteBanner'
// AAR-Banner-Doppelung: DokumenteSection-Import entfernt; PflichtdokumenteBanner ist Single Source.
import SaeuleMeinAnwalt from '@/components/kunde/SaeuleMeinAnwalt'
// AAR-765: Richtige „Meine Kanzlei"-Card mit echten Kontaktdaten
import { MeineKanzleiCard } from '@/components/kunde/kanzlei'
// AAR-770: Mitteilungs-Banner ganz oben in der Fallakte
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import SaeuleMeinBetreuer from '@/components/kunde/SaeuleMeinBetreuer'
// AAR-558 (C9): Auszahlungs- + Eskalations-Ergebnis-Card aus faelle_kunde_view
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import EskalationsErgebnisCard from '@/components/kunde/EskalationsErgebnisCard'
import { saveBankdaten, updateZahlungsweg } from './actions'
// AAR-319: FAQ-Bot-Card + Historie-Loader
import { FaqBotCard } from './_components/FaqBotCard'
import { ladeKundenFaqHistorie } from './faq-bot-actions'
// AAR-432: Jetzt-zu-tun-Card + Gutachten-Weiterleitung
import KundeJetztZuTunCard from '@/components/kunde/KundeJetztZuTunCard'
import GutachtenWeiterleitungButton from '@/components/kunde/GutachtenWeiterleitungButton'
import { getKundenJetztZuTun, type KundeSlaRecord } from '@/lib/kunde/jetzt-zu-tun'
// AAR-448: Termin-Detail-Card mit Quick-Actions
import TerminSectionCard from '@/components/kunde/TerminSectionCard'
// AAR-651: Zentrale Fall-Loader-Lib — FALL_SELECT_KUNDE ist die shared
// Spalten-Liste (52 Felder ohne Brutto-Beträge, AAR-558 C9 Leak-Fix).
import { getFallById, FALL_SELECT_KUNDE } from '@/lib/fall/queries'

export default async function KundeFallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()

    // AAR-651: Zentrale Lib mit FALL_SELECT_KUNDE (52 Felder ohne Brutto-Beträge,
    // AAR-558 C9 Leak-Fix). Ownership-Check bleibt separat unten wegen Email-Fallback.
    const fall = await getFallById(supabase, id, FALL_SELECT_KUNDE)
    if (!fall) notFound()

    // Ownership: kunde_id oder lead-email
    const owned = fall.kunde_id === user.id
    if (!owned) {
      if (fall.lead_id) {
        const { data: lead } = await admin.from('leads').select('email').eq('id', fall.lead_id).single()
        if (lead?.email !== user.email) notFound()
      } else {
        notFound()
      }
    }

    // AAR-765: Kanzlei-Daten laden (Name, Adresse, Email aus kanzleien-Tabelle)
    //          wenn dem Fall eine Kanzlei zugeordnet ist.
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

    // AAR-711: mandatstyp lebt auf leads, nicht auf faelle. Separat laden für SaeuleMeinAnwalt.
    let mandatstyp: string | null = null
    if (fall.lead_id) {
      const { data: leadMandat } = await admin
        .from('leads')
        .select('mandatstyp')
        .eq('id', fall.lead_id)
        .maybeSingle()
      mandatstyp = (leadMandat?.mandatstyp as string | null) ?? null
    }

    // SV-Daten laden
    let svName: string | null = null
    let svTelefon: string | null = null
    let svVerifiziert = false
    if (fall.sv_id) {
      // AAR-692: verifizierung_status mit laden → „Verifiziert"-Badge beim Kunden
      // wenn der SV Tier 2 komplett durch hat (Berufshaftpflicht, Gewerbe etc.).
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('profile_id, verifizierung_status')
        .eq('id', fall.sv_id)
        .single()
      if (sv?.profile_id) {
        const { data: p } = await admin.from('profiles').select('vorname, nachname, telefon').eq('id', sv.profile_id).single()
        if (p) { svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null; svTelefon = p.telefon }
      }
      svVerifiziert = sv?.verifizierung_status === 'geprueft'
    }

    // KB-Daten laden
    // AAR-369: anzeigename + avatar_url mitladen, damit Kunde echten Betreuer sieht
    let kbName: string | null = null
    let kbTelefon: string | null = null
    let kbAvatarUrl: string | null = null
    let kbBeschreibung: string | null = null
    if (fall.kundenbetreuer_id) {
      const { data: kb } = await admin
        .from('profiles')
        .select('vorname, nachname, telefon, anzeigename, avatar_url, profilbeschreibung')
        .eq('id', fall.kundenbetreuer_id)
        .single()
      if (kb) {
        kbName = (kb.anzeigename as string | null) || [kb.vorname, kb.nachname].filter(Boolean).join(' ') || null
        kbTelefon = kb.telefon
        kbAvatarUrl = (kb.avatar_url as string | null) ?? null
        kbBeschreibung = (kb.profilbeschreibung as string | null) ?? null
      }
    }

    // AAR-553: Dokumente aus fall_dokumente laden. datei_url wird on-the-
    // fly aus storage_path via getPublicUrl abgeleitet.
    const { data: dokumenteRaw } = await admin.from('fall_dokumente')
      .select('id, dokument_typ, storage_path, original_filename, hochgeladen_am')
      .eq('fall_id', id)
      .is('geloescht_am', null)
      .order('hochgeladen_am')
    const dokumente = (dokumenteRaw ?? []).map(d => ({
      id: d.id as string,
      typ: d.dokument_typ as string,
      datei_url: admin.storage.from('fall-dokumente').getPublicUrl(d.storage_path as string).data.publicUrl,
      datei_name: (d.original_filename as string | null) ?? null,
      created_at: d.hochgeladen_am as string,
    }))

    // Nachrichten laden (alle Kanaele inkl. Gruppe)
    const { data: nachrichten } = await admin.from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: true })

    // KFZ-129: Chat-Teilnehmer laden
    const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
    const chatTeilnehmer = await getChatTeilnehmer(id)

    // AAR-Banner-Doppelung: pflichtdokumente-Loader entfernt.
    // PflichtdokumenteBanner macht eigene Query mit Filter für Kunden-Slots,
    // DokumenteSection wurde aus dem Render-Tree entfernt. Wenn ein Kunde
    // hochladen muss, klickt er „Jetzt hochladen" im Banner → Onboarding Step 3.

    // KFZ-134 + KFZ-192: Aktiven gutachter_termine Eintrag laden (inkl. sv_vorgeschlagene_slots)
    const { data: aktiverTermin } = await admin
      .from('gutachter_termine')
      .select('id, status, start_zeit, end_zeit, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, sv_id, sv_vorgeschlagene_slots')
      .eq('fall_id', id)
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // AAR-319: FAQ-Bot-Historie für diesen Kunden + Fall laden (RLS schützt)
    const faqHistory = await ladeKundenFaqHistorie(id)

    // AAR-558 (C9): Kunden-sichere Felder aus faelle_kunde_view laden.
    // Die View erzwingt per Column-Filter dass NUR auszahlung_kunde_betrag
    // sichtbar ist (nicht Brutto-regulierung, nicht Gutachter-Honorar).
    const { data: kundeView } = await supabase
      .from('faelle_kunde_view')
      .select(
        'auszahlung_kunde_betrag, auszahlung_kunde_eingegangen_am, auszahlung_zahlungsweg, eskalation_tag_14_ergebnis, eskalation_tag_14_ergebnis_am, eskalation_tag_21_ergebnis, eskalation_tag_21_ergebnis_am, eskalation_tag_28_ergebnis, eskalation_tag_28_ergebnis_am',
      )
      .eq('id', id)
      .maybeSingle()

    // AAR-569 (V3): Szenario-Label bleibt für den Rügefall-Banner erhalten —
    // die Phasen-Visualisierung kommt aber jetzt zentral aus der shared
    // PhasePipeline + Visibility-Matrix (rolle='kunde').
    const fallStatus = (fall.status as string) ?? ''
    let szenario = (fall.szenario as string) ?? 'normalfall'
    if (fallStatus === 'klage' && szenario !== 'klagefall') szenario = 'klagefall'
    else if (
      ['vs-kuerzt', 'vs-abgelehnt', 'nachbesichtigung-laeuft'].includes(fallStatus) &&
      szenario === 'normalfall'
    ) {
      szenario = 'ruegefall'
    }

    // AAR-569 (V3) / AAR-727: Panel baut Pipeline-Daten + Progress-% intern.
    const aktuellePhaseSnake = (fall.aktuelle_phase as string | null | undefined) ?? null
    const abgeschlossenAmKunde =
      (fall.abgeschlossen_am as string | null | undefined) ?? null

    // AAR-432: Jetzt-zu-tun-Aktion für diesen Fall berechnen
    const { data: polizeiDocs } = await admin
      .from('pflichtdokumente')
      .select('dokument_typ, dokument_url, status')
      .eq('fall_id', id)
    const polizeiberichtUploaded = !!(polizeiDocs ?? []).find(
      (d) => d.dokument_typ === 'polizeibericht' && !!d.dokument_url,
    )
    const hatOffeneNachreichung = !!(polizeiDocs ?? []).find(
      (d) => d.status === 'nachgereicht_angefordert',
    )
    let kundeSlasDetail: KundeSlaRecord[] = []
    try {
      const { data: slas } = await admin
        .from('sla_tracking')
        .select('fall_id, blocker_rolle, blocker_grund, status, breach_at')
        .eq('fall_id', id)
        .eq('blocker_rolle', 'kunde')
        .eq('status', 'breached')
      kundeSlasDetail = (slas ?? []) as KundeSlaRecord[]
    } catch { /* non-critical */ }

    // SV-Live-Status für diesen Fall (sv_unterwegs/sv_angekommen)
    let svLive: { unterwegs: boolean; vorOrt: boolean; eta: number | null } = {
      unterwegs: false,
      vorOrt: false,
      eta: null,
    }
    try {
      const { data: termine } = await admin
        .from('gutachter_termine')
        .select('sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, durchgefuehrt_am')
        .eq('fall_id', id)
        .eq('typ', 'sv_begutachtung')
        .is('durchgefuehrt_am', null)
        .not('sv_unterwegs_seit', 'is', null)
        .order('sv_unterwegs_seit', { ascending: false })
        .limit(1)
      const t = termine?.[0]
      if (t) {
        svLive = {
          unterwegs: !t.sv_angekommen_am,
          vorOrt: !!t.sv_angekommen_am,
          eta: t.sv_eta_minuten ? Number(t.sv_eta_minuten) : null,
        }
      }
    } catch { /* non-critical */ }

    // AAR-448: Termin-Daten für die Detail-Card (SV + KB)
    // AAR-704A: cancelled_at-Filter + Priorisierung „bestaetigt vor reserviert,
    // dann jüngster created_at". Vorher zog `order start_zeit ASC limit 1`
    // den ÄLTESTEN aktiven Termin — wenn der SV manuell einen neuen Termin
    // angelegt hatte ohne den alten zu cancellen (AAR-704C), zeigte die
    // Fallansicht den veralteten Eintrag.
    const aktiveStatus = ['reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben']
    const { data: svKandidaten } = await admin
      .from('gutachter_termine')
      .select('id, typ, status, start_zeit, end_zeit, kanal, video_link, sv_unterwegs_seit, sv_angekommen_am, sv_eta_minuten, sv_id, kb_id, created_at')
      .eq('fall_id', id)
      .eq('typ', 'sv_begutachtung')
      .in('status', aktiveStatus)
      .is('durchgefuehrt_am', null)
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

    // Gegenüber-Daten auflösen (SV-Kontakt + KB-Kontakt)
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

    // Sortier-Logik: SV + KB-Termin nach Start-Zeit
    const terminCards: Array<{
      termin: React.ComponentProps<typeof TerminSectionCard>['termin']
      gegenueber: React.ComponentProps<typeof TerminSectionCard>['gegenueber']
    }> = []
    if (svTermin) {
      terminCards.push({
        termin: {
          id: svTermin.id as string,
          typ: 'sv_begutachtung',
          status: (svTermin.status as string) ?? 'reserviert',
          start_zeit: svTermin.start_zeit as string | null,
          end_zeit: svTermin.end_zeit as string | null,
          kanal: svTermin.kanal as string | null,
          video_link: svTermin.video_link as string | null,
          sv_unterwegs_seit: svTermin.sv_unterwegs_seit as string | null,
          sv_angekommen_am: svTermin.sv_angekommen_am as string | null,
          sv_eta_minuten: (svTermin.sv_eta_minuten as number | null) ?? null,
          adresse: terminAdresse,
        },
        gegenueber: svKontakt ? { rolle: 'sachverstaendiger', ...svKontakt } : null,
      })
    }
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

    const aktion = getKundenJetztZuTun(
      {
        id: fall.id as string,
        onboarding_complete: (fall.onboarding_complete as boolean | null) ?? null,
        sa_unterschrieben: (fall.sa_unterschrieben as boolean | null) ?? null,
        vollmacht_signiert_am: (fall as Record<string, unknown>).vollmacht_signiert_am as string | null,
        vollmacht_status: (fall as Record<string, unknown>).vollmacht_status as string | null,
        gutachter_termin_status: (fall.gutachter_termin_status as string | null) ?? null,
        sv_termin: (fall.sv_termin as string | null) ?? null,
        gutachter_termin_bestaetigt_am: (fall as Record<string, unknown>).gutachter_termin_bestaetigt_am as string | null,
        anschlussschreiben_am: (fall.anschlussschreiben_am as string | null) ?? null,
        regulierung_am: (fall.regulierung_am as string | null) ?? null,
        polizei_vor_ort: (fall.polizei_vor_ort as boolean | null) ?? null,
        polizeibericht_uploaded: polizeiberichtUploaded,
        hat_offene_nachreichung: hatOffeneNachreichung,
        sv_unterwegs_seit: svLive.unterwegs ? new Date().toISOString() : null,
        sv_angekommen_am: svLive.vorOrt ? new Date().toISOString() : null,
        sv_name: svName,
        sv_eta_minuten: svLive.eta,
        status: (fall.status as string | null) ?? null,
        abgeschlossen_am: fall.abgeschlossen_am as string | null,
        nachbesichtigung_status: (fall as Record<string, unknown>).nachbesichtigung_status as string | null,
      },
      kundeSlasDetail,
    )

    const gutachtenVerfuegbar = !!(fall as Record<string, unknown>).gutachten_eingegangen_am

    const kennzeichen = (fall.kennzeichen as string) ?? ''
    const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
    const adresse = (fall.besichtigungsort_adresse as string) || (fall.unfallort as string) || [(fall.schadens_adresse as string), (fall.schadens_plz as string), (fall.schadens_ort as string)].filter(Boolean).join(', ') || ''

    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl md:max-w-none mx-auto space-y-5">
        {/* Header */}
        <div>
          <Link href="/kunde" className="text-xs text-claimondo-ondo/70 hover:text-[#4573A2] mb-2 inline-block">&larr; Meine Fälle</Link>
          <PageHeader
            title={`${kennzeichen || (fall.fall_nummer as string | null) || 'Schadensfall'}${fahrzeug ? ` — ${fahrzeug}` : ''}`}
            description={adresse || undefined}
          />
        </div>

        {/* AAR-770: Mitteilungs-Banner — ganz oben mit Quick-Action */}
        <FallMitteilungenBanner fallId={fall.id as string} rolle="kunde" />

        {/* AAR-432: Jetzt-zu-tun Matrix — eine konsolidierte Aktions-Card */}
        <KundeJetztZuTunCard aktion={aktion} />

        {/* AAR-710: Pflichtdokumente-Banner — pro Fall, oben im Detail. */}
        <PflichtdokumenteBanner fallId={fall.id as string} />

        {/* AAR-448: Termin-Detail-Card(s) — SV- und KB-Termine mit Quick-Actions */}
        {terminCards.length > 0 && (
          <div className="space-y-3">
            {terminCards.map((tc) => (
              <TerminSectionCard key={tc.termin.id} termin={tc.termin} gegenueber={tc.gegenueber} />
            ))}
          </div>
        )}

        {/* KFZ-206: Status-Card — AAR-558 (C9): Brutto-Betrags-Felder entfernt,
            Auszahlungs-Summe kommt aus AuszahlungCard. */}
        <FallStatusCard
          fall={{
            id: fall.id as string,
            status: (fall.status as string) ?? '',
            fall_nummer: fall.fall_nummer as string | null,
            sv_termin: fall.sv_termin as string | null,
            anschlussschreiben_am: fall.anschlussschreiben_am as string | null,
            vs_ablehnungsgrund: (fall as Record<string, unknown>).vs_ablehnungsgrund as string | null,
            storno_grund: fall.storno_grund as string | null,
            abgeschlossen_am: fall.abgeschlossen_am as string | null,
            google_review_gesendet: fall.google_review_gesendet as boolean | null,
            gegner_versicherung: fall.gegner_versicherung as string | null,
            kanzlei_ansprechpartner_name: fall.kanzlei_ansprechpartner_name as string | null,
          }}
          svName={svName ?? undefined}
        />

        {/* KFZ-210: Nachbesichtigung Soft-Blocker. AAR-558 (C11): Banner greift
            sobald nachbesichtigung_status = 'angefordert' ODER Fall-Status
            nachbesichtigung-laeuft — vorher nur letzteres, was Fälle verpasste
            bei denen der Kunde-Status noch nicht umgeschaltet wurde. */}
        {((fall.status as string) === 'nachbesichtigung-laeuft' ||
          (fall as Record<string, unknown>).nachbesichtigung_status === 'angefordert') && (
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

        {/* AAR-558 (C9): Eskalations-Ergebnis-Card — sichtbar sobald Kanzlei
            ein Tag-14/21/28-Ergebnis eingetragen hat. */}
        {kundeView && (
          <EskalationsErgebnisCard
            tag14Ergebnis={(kundeView.eskalation_tag_14_ergebnis as string | null) ?? null}
            tag14Am={(kundeView.eskalation_tag_14_ergebnis_am as string | null) ?? null}
            tag21Ergebnis={(kundeView.eskalation_tag_21_ergebnis as string | null) ?? null}
            tag21Am={(kundeView.eskalation_tag_21_ergebnis_am as string | null) ?? null}
            tag28Ergebnis={(kundeView.eskalation_tag_28_ergebnis as string | null) ?? null}
            tag28Am={(kundeView.eskalation_tag_28_ergebnis_am as string | null) ?? null}
          />
        )}

        {/* AAR-558 (C9): Auszahlungs-Card — nur Netto-Kunden-Anteil. */}
        {kundeView && (
          <AuszahlungCard
            betrag={(kundeView.auszahlung_kunde_betrag as number | null) ?? null}
            eingegangenAm={(kundeView.auszahlung_kunde_eingegangen_am as string | null) ?? null}
            zahlungsweg={(kundeView.auszahlung_zahlungsweg as string | null) ?? null}
          />
        )}

        {/* AAR-558 (C9) Brutto-Leak-Fix: VS-Kürzung — Kürzungs-/Teilregulierungs-
            Beträge (Brutto) werden dem Kunden nicht mehr angezeigt; nur noch
            der Begründungs-Text und der Hinweis auf die Kanzlei-Rüge. Die
            ausgezahlte Netto-Summe erscheint nach Regulierung in AuszahlungCard. */}
        {(fall.status as string) === 'vs-kuerzt' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-700 text-lg">&#9888;</span>
              <p className="text-sm font-semibold text-amber-900">Versicherung hat gekürzt</p>
            </div>
            {typeof (fall as Record<string, unknown>).vs_kuerzung_grund === 'string' &&
              ((fall as Record<string, unknown>).vs_kuerzung_grund as string) && (
                <div className="rounded-md bg-white/60 border border-amber-200 p-2 text-[11px] text-amber-800">
                  <strong className="block mb-0.5">Begründung der Versicherung:</strong>
                  {(fall as Record<string, unknown>).vs_kuerzung_grund as string}
                </div>
              )}
            <p className="text-[11px] text-amber-700">
              Die Partnerkanzlei bereitet eine Rüge vor. Sie müssen nichts tun — wir melden uns bei Fortschritt.
            </p>
          </div>
        )}

        {/* AAR-171: VS hat abgelehnt — noch härterer Hinweis */}
        {(fall.status as string) === 'vs-abgelehnt' && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-900">Versicherung hat abgelehnt</p>
            <p className="text-xs text-red-700">
              Die Versicherung lehnt die Regulierung ab. Unsere Partnerkanzlei prüft den Fall und meldet sich mit den nächsten Schritten (Rüge oder Klage-Empfehlung).
            </p>
          </div>
        )}

        {/* AAR-171: Klage übergeben — Kunde sieht dass der Fall bei der Kanzlei liegt */}
        {(fall.status as string) === 'klage' && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-900">Fall wird gerichtlich geklärt</p>
            <p className="text-xs text-red-700">
              Ihr Fall wurde an unsere Partnerkanzlei übergeben. Die weitere Kommunikation läuft direkt mit der Kanzlei. Claimondo begleitet den Fall bis zum Abschluss.
            </p>
          </div>
        )}

        {/* AAR-765: „Meine Kanzlei" — datengetriebene Kontakt-Card mit
            Ansprechpartner, Telefon, Mail, Adresse. Zeigt sich nur wenn
            dem Fall eine Kanzlei zugeordnet ist. */}
        <MeineKanzleiCard
          kanzlei={kanzleiRow}
          ansprechpartner={{
            name: (fall.kanzlei_ansprechpartner_name as string | null) ?? null,
            position: (fall.kanzlei_ansprechpartner_position as string | null) ?? null,
            email: (fall.kanzlei_ansprechpartner_email as string | null) ?? null,
            telefon: (fall.kanzlei_ansprechpartner_telefon as string | null) ?? null,
          }}
          vollmachtSigniertAm={
            (fall as Record<string, unknown>).vollmacht_signiert_am as string | null
          }
          uebergebenAm={(fall.kanzlei_uebergeben_am as string | null) ?? null}
        />

        {/* ═══ 5-Säulen Layout (KFZ-206) ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* S1: Mein Anwalt (nur bei Komplett-Service) */}
          <SaeuleMeinAnwalt
            mandatstyp={mandatstyp}
            serviceTyp={(fall as Record<string, unknown>).service_typ as string | null}
            vollmacht_status={!!(fall as Record<string, unknown>).vollmacht_signiert_am}
            kanzlei_name={fall.kanzlei_ansprechpartner_name as string | null}
          />

          {/* S2: Mein Geld — AAR-558 (C9): Nur eigene Forderung + Zahlungsweg,
              keine Brutto-Beträge mehr. Auszahlungs-Summe kommt aus AuszahlungCard. */}
          <SaeuleMeinGeld
            fallId={fall.id as string}
            status={(fall.status as string) ?? ''}
            schadens_hoehe_netto={fall.schadens_hoehe_netto as number | null}
            totalschaden={!!((fall as Record<string, unknown>).totalschaden)}
            zahlungsweg={(fall as Record<string, unknown>).zahlungsweg as string | null}
            onZahlungswegSave={updateZahlungsweg}
          />

          {/* S5: Mein Betreuer */}
          <SaeuleMeinBetreuer
            fallId={fall.id as string}
            kbName={kbName}
            kbTelefon={kbTelefon}
            kbAvatarUrl={kbAvatarUrl}
            kbBeschreibung={kbBeschreibung}
          />
        </div>

        {/* AAR-432: Opt-in Gutachten-Weiterleitung — nur sichtbar wenn Gutachten vorliegt */}
        {/* AAR-452: flex-col auf Mobile, damit der Button auf 375px nicht den Text quetscht. */}
        {gutachtenVerfuegbar && (
          <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0D1B3E]">Gutachten erhalten?</p>
              <p className="text-xs text-claimondo-ondo mt-0.5">
                Sie können sich das Gutachten auch per E-Mail an sich selbst oder eine Vertrauensperson senden lassen (48h Magic-Link).
              </p>
            </div>
            <GutachtenWeiterleitungButton fallId={fall.id as string} defaultEmail={user.email ?? null} />
          </div>
        )}

        {/* S3: Meine Aufgaben (Bankdaten).
            AAR-Banner-Doppelung: DokumenteSection entfernt — der gelbe
            PflichtdokumenteBanner oben ist die EINZIGE Source-of-Truth für
            offene Kunden-Uploads. Doppelte Listen verwirrten den Kunden
            (Aaron-Vorgabe „nur ein Banner, nur was wir laut Lead brauchen"). */}
        <div className="space-y-4">
          <BankdatenBanner
            fallId={fall.id as string}
            status={(fall.status as string) ?? ''}
            bankdatenHinterlegt={!!(fall as Record<string, unknown>).bankdaten_hinterlegt_am}
            saveBankdaten={saveBankdaten}
          />
        </div>

        {/* S4: Mein Fortschritt + Fall-Details */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* AAR-569 (V3) / AAR-727: Glass-Panel mit Progress-Bar + Pipeline.
              Labels kommen aus der Visibility-Matrix (rolle='kunde') —
              kundenfreundlich (z. B. „Schaden gemeldet" statt Notion-Subphase). */}
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
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
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

          {/* AAR-319: FAQ-Bot für den Kunden — kennt seinen eigenen Fall */}
          <FaqBotCard fallId={fall.id as string} initialHistory={faqHistory} />
        </div>
      </div>
    )
  } catch (err) {
    console.error('[KundeFallDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-semibold">Fehler beim Laden</p>
        <p className="text-sm text-claimondo-ondo mt-1">Bitte versuchen Sie es erneut.</p>
      </div>
    )
  }
}
