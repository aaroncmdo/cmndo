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
import { FallPhasenPanel } from '@/components/shared/fall-phases'
import PageHeader from '@/components/shared/PageHeader'
import FallDetailSections from './FallDetailSections'
import FallStatusCard from '@/components/kunde/FallStatusCard'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
import PflichtdokumenteListe from '@/components/fall/PflichtdokumenteListe'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { MeineKanzleiCard } from '@/components/kunde/kanzlei'
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import SaeuleMeinBetreuer from '@/components/kunde/SaeuleMeinBetreuer'
import AuszahlungCard from '@/components/kunde/AuszahlungCard'
import { saveBankdaten, updateZahlungsweg } from './actions'
import KundeJetztZuTunCard from '@/components/kunde/KundeJetztZuTunCard'
import GutachtenWeiterleitungButton from '@/components/kunde/GutachtenWeiterleitungButton'
import { getKundenJetztZuTun, type KundeSlaRecord } from '@/lib/kunde/jetzt-zu-tun'
import TerminSectionCard from '@/components/kunde/TerminSectionCard'
import { getKundeFallDetailRecord, getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

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
    if (fall.sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('profile_id, verifizierung_status')
        .eq('id', fall.sv_id as string)
        .single()
      if (sv?.profile_id) {
        const { data: p } = await admin.from('profiles').select('vorname, nachname, telefon').eq('id', sv.profile_id).single()
        if (p) { svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null; svTelefon = p.telefon }
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

    // Dokumente laden
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

    // Jetzt-zu-tun-Aktion für diesen Fall berechnen
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

    // Termin-Daten für die Detail-Card (SV + KB)
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
        vollmacht_signiert_am: fall.vollmacht_signiert_am as string | null,
        vollmacht_status: fall.vollmacht_status as string | null,
        gutachter_termin_status: (fall.gutachter_termin_status as string | null) ?? null,
        sv_termin: (fall.sv_termin as string | null) ?? null,
        gutachter_termin_bestaetigt_am: fall.gutachter_termin_bestaetigt_am as string | null,
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
        nachbesichtigung_status: fall.nachbesichtigung_status as string | null,
      },
      kundeSlasDetail,
    )

    const gutachtenVerfuegbar = !!fall.gutachten_eingegangen_am

    const kennzeichen = (fall.kennzeichen as string) ?? ''
    const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
    const adresse = (fall.besichtigungsort_adresse as string) || (fall.unfallort as string) || [(fall.schadens_adresse as string), (fall.schadens_plz as string), (fall.schadens_ort as string)].filter(Boolean).join(', ') || ''

    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl md:max-w-none mx-auto space-y-5">
        {/* Header — CMM-28: Zurück-Link nur bei Multi-Fall-Kunden */}
        <div>
          {hatMehrereFaelle && (
            <Link href="/kunde" className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-2 inline-block">&larr; Meine Fälle</Link>
          )}
          <PageHeader
            title={`${kennzeichen || (fall.fall_nummer as string | null) || 'Schadensfall'}${fahrzeug ? ` — ${fahrzeug}` : ''}`}
            description={adresse || undefined}
          />
        </div>

        {/* AAR-770: Mitteilungs-Banner — ganz oben mit Quick-Action */}
        <FallMitteilungenBanner fallId={fall.id as string} rolle="kunde" />

        {/* AAR-432: Jetzt-zu-tun Matrix — eine konsolidierte Aktions-Card */}
        <KundeJetztZuTunCard aktion={aktion} />

        {/* CMM-23: Pflichtdokumente-Liste mit Status + Download */}
        <PflichtdokumenteListe slots={pflichtSlots} title="Pflichtdokumente" />

        {/* AAR-448: Termin-Detail-Card(s) — SV- und KB-Termine mit Quick-Actions */}
        {terminCards.length > 0 && (
          <div className="space-y-3">
            {terminCards.map((tc) => (
              <TerminSectionCard key={tc.termin.id} termin={tc.termin} gegenueber={tc.gegenueber} />
            ))}
          </div>
        )}

        {/* Status-Card */}
        <FallStatusCard
          fall={{
            id: fall.id as string,
            status: (fall.status as string) ?? '',
            fall_nummer: fall.fall_nummer as string | null,
            sv_termin: fall.sv_termin as string | null,
            anschlussschreiben_am: fall.anschlussschreiben_am as string | null,
            vs_ablehnungsgrund: fall.vs_ablehnungsgrund as string | null,
            storno_grund: fall.storno_grund as string | null,
            abgeschlossen_am: fall.abgeschlossen_am as string | null,
            google_review_gesendet: fall.google_review_gesendet as boolean | null,
            gegner_versicherung: fall.gegner_versicherung as string | null,
            kanzlei_ansprechpartner_name: fall.kanzlei_ansprechpartner_name as string | null,
          }}
          svName={svName ?? undefined}
        />

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
          <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
