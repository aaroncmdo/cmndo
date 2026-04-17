import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { berechneProgress, SZENARIO_PHASEN } from '@/components/kunde/stepperConfig'
import ScenarioStepper from '@/components/kunde/ScenarioStepper'
import FallDetailSections from './FallDetailSections'
import FallStatusCard from '@/components/kunde/FallStatusCard'
import BankdatenBanner from '@/components/kunde/BankdatenBanner'
import DokumenteSection from '@/components/kunde/DokumenteSection'
import SaeuleMeinAnwalt from '@/components/kunde/SaeuleMeinAnwalt'
import SaeuleMeinGeld from '@/components/kunde/SaeuleMeinGeld'
import SaeuleMeinBetreuer from '@/components/kunde/SaeuleMeinBetreuer'
import { saveBankdaten, uploadPflichtdokumentKunde, updateZahlungsweg } from './actions'
// AAR-319: FAQ-Bot-Card + Historie-Loader
import { FaqBotCard } from './_components/FaqBotCard'
import { ladeKundenFaqHistorie } from './faq-bot-actions'

export default async function KundeFallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()

    // Fall laden
    const { data: fall } = await supabase.from('faelle').select('*').eq('id', id).single()
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

    // SV-Daten laden
    let svName: string | null = null
    let svTelefon: string | null = null
    if (fall.sv_id) {
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
      if (sv?.profile_id) {
        const { data: p } = await admin.from('profiles').select('vorname, nachname, telefon').eq('id', sv.profile_id).single()
        if (p) { svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || null; svTelefon = p.telefon }
      }
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

    // Dokumente laden
    const { data: dokumente } = await admin.from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at')
      .eq('fall_id', id)
      .order('created_at')

    // Nachrichten laden (alle Kanaele inkl. Gruppe)
    const { data: nachrichten } = await admin.from('nachrichten')
      .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', id)
      .order('created_at', { ascending: true })

    // KFZ-129: Chat-Teilnehmer laden
    const { getChatTeilnehmer } = await import('@/lib/chatGruppe')
    const chatTeilnehmer = await getChatTeilnehmer(id)

    // KFZ-206: Pflichtdokumente laden
    const { data: pflichtdokumente } = await admin.from('pflichtdokumente')
      .select('id, titel, status, datei_url, datei_name')
      .eq('fall_id', id)
      .order('created_at')

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

    // AAR-171: Szenario aus DB übernehmen, aber auto-bump auf ruegefall/klagefall
    // wenn der Status das bereits signalisiert — so muss der KB nicht manuell
    // szenario setzen, der Kunde sieht trotzdem die richtige Erklär-Phase.
    const fallStatus = (fall.status as string) ?? ''
    let szenario = ((fall.szenario as string) ?? 'normalfall') as keyof typeof SZENARIO_PHASEN
    if (fallStatus === 'klage' && szenario !== 'klagefall') szenario = 'klagefall'
    else if (
      ['vs-kuerzt', 'vs-abgelehnt', 'nachbesichtigung-laeuft'].includes(fallStatus) &&
      szenario === 'normalfall'
    ) {
      szenario = 'ruegefall'
    }
    const phasen = SZENARIO_PHASEN[szenario] ?? SZENARIO_PHASEN.normalfall
    const progress = berechneProgress(fall as Record<string, unknown>, phasen)

    const kennzeichen = (fall.kennzeichen as string) ?? ''
    const fahrzeug = [(fall.fahrzeug_hersteller as string), (fall.fahrzeug_modell as string)].filter(Boolean).join(' ')
    const adresse = (fall.besichtigungsort_adresse as string) || (fall.unfallort as string) || [(fall.schadens_adresse as string), (fall.schadens_plz as string), (fall.schadens_ort as string)].filter(Boolean).join(', ') || ''

    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl md:max-w-none mx-auto space-y-5">
        {/* Header */}
        <div>
          <Link href="/kunde" className="text-xs text-gray-400 hover:text-[#4573A2] mb-2 inline-block">&larr; Meine Fälle</Link>
          <h1 className="text-lg font-bold text-[#0D1B3E]">
            {kennzeichen || fall.fall_nummer || 'Schadensfall'}{fahrzeug ? ` — ${fahrzeug}` : ''}
          </h1>
          {adresse && <p className="text-sm text-gray-500 mt-0.5">{adresse}</p>}
        </div>

        {/* KFZ-206: Status-Card */}
        <FallStatusCard
          fall={{
            id: fall.id as string,
            status: (fall.status as string) ?? '',
            fall_nummer: fall.fall_nummer as string | null,
            sv_termin: fall.sv_termin as string | null,
            anschlussschreiben_am: fall.anschlussschreiben_am as string | null,
            vs_ablehnungsgrund: (fall as Record<string, unknown>).vs_ablehnungsgrund as string | null,
            regulierung_betrag: fall.regulierung_betrag as number | null,
            zahlung_betrag: (fall as Record<string, unknown>).zahlung_betrag as number | null,
            zahlung_eingegangen_am: (fall as Record<string, unknown>).zahlung_eingegangen_am as string | null,
            storno_grund: fall.storno_grund as string | null,
            abgeschlossen_am: fall.abgeschlossen_am as string | null,
            google_review_gesendet: fall.google_review_gesendet as boolean | null,
            versicherung_name: fall.versicherung_name as string | null,
            kanzlei_ansprechpartner_name: fall.kanzlei_ansprechpartner_name as string | null,
          }}
          svName={svName ?? undefined}
        />

        {/* KFZ-210: Nachbesichtigung Soft-Blocker */}
        {(fall.status as string) === 'nachbesichtigung-laeuft' && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-violet-600 text-lg">&#9888;</span>
            <div>
              <p className="text-sm font-semibold text-violet-800">Nachbesichtigung läuft</p>
              <p className="text-xs text-violet-600">Die Versicherung hat eine erneute Besichtigung angefordert. Ihr Fall wird fortgesetzt sobald das Ergebnis vorliegt.</p>
            </div>
          </div>
        )}

        {/* AAR-171: VS-Kürzung / VS-Ablehnung — Kunde transparent informieren
            welchen Betrag die Versicherung gekürzt hat und dass die Kanzlei
            bereits an der Rüge arbeitet. */}
        {(fall.status as string) === 'vs-kuerzt' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-700 text-lg">&#9888;</span>
              <p className="text-sm font-semibold text-amber-900">Versicherung hat gekürzt</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Postgres liefert NUMERIC als string → erst parsen, dann auf > 0 prüfen
                  damit 0-Werte (wenig aussagekräftig) nicht als „0,00 EUR" angezeigt werden */}
              {(() => {
                const raw = (fall as Record<string, unknown>).kuerzungs_betrag
                const n = raw == null ? null : Number(raw)
                if (n == null || Number.isNaN(n) || n <= 0) return null
                return (
                  <div>
                    <p className="text-amber-700">Kürzungsbetrag</p>
                    <p className="text-amber-900 font-semibold">
                      {n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                )
              })()}
              {(() => {
                const raw = (fall as Record<string, unknown>).regulierung_betrag
                const n = raw == null ? null : Number(raw)
                if (n == null || Number.isNaN(n) || n <= 0) return null
                return (
                  <div>
                    <p className="text-amber-700">Teilregulierung</p>
                    <p className="text-amber-900 font-semibold">
                      {n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                )
              })()}
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

        {/* ═══ 5-Säulen Layout (KFZ-206) ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* S1: Mein Anwalt (nur bei Komplett-Service) */}
          <SaeuleMeinAnwalt
            mandatstyp={(fall as Record<string, unknown>).mandatstyp as string | null}
            serviceTyp={(fall as Record<string, unknown>).service_typ as string | null}
            vollmacht_status={!!(fall as Record<string, unknown>).vollmacht_signiert_am}
            kanzlei_name={fall.kanzlei_ansprechpartner_name as string | null}
          />

          {/* S2: Mein Geld */}
          <SaeuleMeinGeld
            fallId={fall.id as string}
            status={(fall.status as string) ?? ''}
            schadenhoehe_netto={fall.schadenhoehe_netto as number | null}
            regulierung_betrag={fall.regulierung_betrag as number | null}
            kuerzungs_betrag={(fall as Record<string, unknown>).kuerzungs_betrag as number | null}
            zahlung_betrag={(fall as Record<string, unknown>).zahlung_betrag as number | null}
            ist_totalschaden={!!((fall as Record<string, unknown>).ist_totalschaden)}
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

        {/* S3: Meine Aufgaben (Docs + Bankdaten) */}
        <div className="space-y-4">
          <BankdatenBanner
            fallId={fall.id as string}
            status={(fall.status as string) ?? ''}
            bankdatenHinterlegt={!!(fall as Record<string, unknown>).bankdaten_hinterlegt_am}
            saveBankdaten={saveBankdaten}
          />
          <DokumenteSection
            fallId={fall.id as string}
            pflichtdokumente={(pflichtdokumente ?? []) as { id: string; titel: string; status: string; datei_url: string | null; datei_name: string | null }[]}
            uploadDokument={uploadPflichtdokumentKunde}
          />
        </div>

        {/* S4: Mein Fortschritt + Fall-Details */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-base font-semibold text-[#0D1B3E]">Mein Fortschritt</p>
              <span className="text-base font-bold text-[#4573A2]">{progress.pct}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full mb-5">
              <div className="h-full bg-[#4573A2] rounded-full transition-all duration-700" style={{ width: `${progress.pct}%` }} />
            </div>
            <ScenarioStepper phasen={phasen} progress={progress} />
            {szenario === 'ruegefall' && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-700 font-medium">Die Versicherung hat Einwände erhoben. Unsere Partnerkanzlei kümmert sich darum.</p>
              </div>
            )}
          </div>

          <FallDetailSections
            fall={fall as Record<string, unknown>}
            svName={svName}
            svTelefon={svTelefon}
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
        <p className="text-sm text-gray-500 mt-1">Bitte versuchen Sie es erneut.</p>
      </div>
    )
  }
}
