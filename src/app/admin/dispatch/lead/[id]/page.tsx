import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LeadStepper from './LeadStepper'
import RueckrufSection from './RueckrufSection'
import LeadNotizen from './LeadNotizen'
import LeadTimeline from './LeadTimeline'
import DisqualifizierungButton from './DisqualifizierungButton'
import LeadActionsMenu from './LeadActionsMenu'
import LeadHistorie from './LeadHistorie'
import LeadInlineFields from './LeadInlineFields'
import LeadDetailTabs from './LeadDetailTabs'
import FallDokumenteSidebar from '@/components/faelle/FallDokumenteSidebar'

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lead: any = null
  let faelle: Array<{ id: string; fall_nummer: string | null; status: string | null; schadens_ursache: string | null; created_at: string | null }> = []
  let timelineEntries: Array<{ id: string; typ: string | null; titel: string | null; beschreibung: string | null; created_at: string | null }> = []

  try {
    const supabase = await createClient()

    const { data: leadData } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (!leadData) notFound()
    lead = leadData

    // Zugehoerige Faelle laden
    const { data: faelleData } = await supabase
      .from('faelle')
      .select('id, fall_nummer, status, schadens_ursache, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })

    faelle = faelleData ?? []

    // Timeline: aus Fall laden falls vorhanden
    const fallId = faelle?.[0]?.id ?? null
    const { data: tlData } = fallId
      ? await supabase
          .from('timeline')
          .select('id, typ, titel, beschreibung, created_at')
          .eq('fall_id', fallId)
          .order('created_at', { ascending: false })
          .limit(30)
      : { data: [] }

    timelineEntries = tlData ?? []
  } catch (err) {
    console.error('[LeadDetailPage] Server Error:', err)
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold text-red-600 mb-2">Fehler beim Laden</h1>
        <p className="text-gray-500 text-sm">{String(err)}</p>
      </div>
    )
  }

  if (!lead) notFound()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sticky Header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex-shrink-0 px-4 py-3">
        <div>
          <Link
            href="/admin/dispatch"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2 inline-block"
          >
            &larr; Dispatch
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {lead.vorname ?? ''} {lead.nachname ?? ''}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm">
                {lead.telefon && (
                  <a href={`tel:${lead.telefon}`} className="text-[#4573A2] hover:text-[#1E3A5F] transition-colors font-mono text-xs">
                    {lead.telefon}
                  </a>
                )}
                {lead.email && <span className="text-gray-500 text-xs">{lead.email}</span>}
                {lead.created_at && (
                  <span className="text-gray-400 text-[10px]">
                    Erstellt: {new Date(lead.created_at).toLocaleDateString('de-DE')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lead.qualifizierungs_phase !== 'disqualifiziert' && lead.qualifizierungs_phase !== 'konvertiert' && (
                <DisqualifizierungButton leadId={lead.id} />
              )}
              {lead.disqualifiziert && (
                <span className="bg-red-50 text-red-400 text-xs font-bold px-3 py-1 rounded-full">
                  DISQUALIFIZIERT: {lead.disqualifiziert_grund ?? 'Unbekannt'}
                </span>
              )}
              <LeadActionsMenu
                leadId={lead.id}
                leadName={`${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || 'Lead'}
                leadData={{
                  vorname: lead.vorname as string | null,
                  nachname: lead.nachname as string | null,
                  telefon: lead.telefon as string | null,
                  email: lead.email as string | null,
                  kennzeichen: lead.kennzeichen as string | null,
                  fahrzeug_hersteller: lead.fahrzeug_hersteller as string | null,
                  fahrzeug_modell: lead.fahrzeug_modell as string | null,
                  schadenfall_typ: lead.schadenfall_typ as string | null,
                  source_channel: lead.source_channel as string | null,
                }}
              />
            </div>
          </div>

          {/* Phase Progress */}
          <PhaseProgressBar phase={lead.qualifizierungs_phase ?? 'neu'} />
        </div>
      </div>

      {/* ── Tabs + Content ─────────────────────────────────────────── */}
      <LeadDetailTabs
        uebersichtContent={
          <div className="space-y-0">
            {/* Rueckruftermin */}
            <RueckrufSection
              lead={{
                id: lead.id,
                rueckruf_datum: lead.rueckruf_datum ?? null,
                rueckruf_notiz: lead.rueckruf_notiz ?? null,
                rueckruf_erledigt: lead.rueckruf_erledigt ?? null,
              }}
            />

            {/* Qualifizierungs-Stepper mit Notizen/Timeline rechts */}
            <LeadStepper
              lead={{
                id: lead.id,
                vorname: lead.vorname,
                nachname: lead.nachname,
                telefon: lead.telefon,
                email: lead.email,
                status: lead.status,
                schadenfall_typ: lead.schadenfall_typ ?? null,
                kunden_konstellation: lead.kunden_konstellation ?? null,
                spezifikation: lead.spezifikation ?? null,
                schadenart: lead.schadenart ?? null,
                sf_variante: lead.sf_variante ?? null,
                gegner_name: lead.gegner_name ?? null,
                gegner_versicherung: lead.gegner_versicherung ?? null,
                gegner_kennzeichen: lead.gegner_kennzeichen ?? null,
                gegner_bekannt: lead.gegner_bekannt ?? null,
                eigene_versicherung: lead.eigene_versicherung ?? null,
                eigene_policennr: lead.eigene_policennr ?? null,
                polizei_aktenzeichen: lead.polizei_aktenzeichen ?? null,
                polizeibericht_pflicht: lead.polizeibericht_pflicht ?? null,
                personenschaden_flag: lead.personenschaden_flag ?? null,
                mietwagen_flag: lead.mietwagen_flag ?? null,
                schadensursache: lead.schadensursache ?? null,
                leasing_geber: lead.leasing_geber ?? null,
                leasing_flag: lead.leasing_flag ?? null,
                finanzierung_bank: lead.finanzierung_bank ?? null,
                finanzierung_flag: lead.finanzierung_flag ?? null,
                firma_name: lead.firma_name ?? null,
                firma_ustid: lead.firma_ustid ?? null,
                unfallhergang: lead.unfallhergang ?? null,
                gewerbe_flag: lead.gewerbe_flag ?? null,
                halter_name: lead.halter_name ?? null,
                halter_ungleich_fahrer_flag: lead.halter_ungleich_fahrer_flag ?? null,
                qualifizierungs_phase: lead.qualifizierungs_phase ?? null,
                fahrzeug_standort_plz: lead.fahrzeug_standort_plz ?? null,
                fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? null,
                gutachter_termin: lead.gutachter_termin ?? null,
                sa_unterschrieben: lead.sa_unterschrieben ?? false,
                sa_datum: lead.sa_datum ?? null,
                vollmacht_unterschrieben: lead.vollmacht_unterschrieben ?? false,
                vollmacht_datum: lead.vollmacht_datum ?? null,
                mandatstyp: lead.mandatstyp ?? null,
                wa_gesendet: lead.wa_gesendet ?? false,
                kennzeichen: lead.kennzeichen ?? null,
                fahrzeug_hersteller: lead.fahrzeug_hersteller ?? null,
                fahrzeug_modell: lead.fahrzeug_modell ?? null,
                fahrzeug_farbe: lead.fahrzeug_farbe ?? null,
                erstzulassung: lead.erstzulassung ?? null,
                fin: lead.fin ?? null,
                kilometerstand: lead.kilometerstand ?? null,
              }}
              rightSidebar={
                <>
                  <LeadNotizen leadId={lead.id} notiz={lead.notiz ?? ''} />
                  <LeadTimeline
                    lead={{
                      id: lead.id,
                      created_at: lead.created_at,
                      qualifizierungs_phase: lead.qualifizierungs_phase ?? 'neu',
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    timelineEntries={(timelineEntries ?? []) as any}
                  />
                  {/* KFZ-172: Pflichtdokumente fuer Lead-Phase */}
                  <FallDokumenteSidebar
                    fallId={faelle?.[0]?.id ?? lead.id}
                    aktuellePhase="lead"
                    szenario={((lead.schadenfall_typ as string) ?? '').includes('strittig') ? 'haftpflicht_strittig' : 'haftpflicht_eindeutig'}
                    dokumente={[]}
                  />
                </>
              }
            />

            {/* Zugehoerige Faelle */}
            {faelle && faelle.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-medium text-gray-500 mb-4">
                  Zugehoerige Faelle ({faelle.length})
                </h2>
                <div className="space-y-2">
                  {faelle.map((fall) => (
                    <Link
                      key={fall.id}
                      href={`/admin/faelle/${fall.id}`}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-100/50 hover:bg-gray-100 transition-colors"
                    >
                      <div>
                        <span className="text-[#7BA3CC] font-mono text-xs">
                          {fall.fall_nummer ?? fall.id.slice(0, 8)}
                        </span>
                        <span className="text-gray-500 text-xs ml-3">
                          {fall.schadens_ursache ?? '\u2014'}
                        </span>
                      </div>
                      <span className="text-gray-500 text-xs">
                        {fall.created_at ? new Date(fall.created_at).toLocaleDateString('de-DE') : ''}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
        felderContent={
          <div>
            <LeadInlineFields lead={{
              id: lead.id,
              vorname: lead.vorname ?? null,
              nachname: lead.nachname ?? null,
              telefon: lead.telefon ?? null,
              email: lead.email ?? null,
              source_channel: lead.source_channel ?? null,
              source_domain: lead.source_domain ?? null,
              schadenfall_typ: lead.schadenfall_typ ?? null,
              kunden_konstellation: lead.kunden_konstellation ?? null,
              spezifikation: lead.spezifikation ?? null,
              schadenart: lead.schadenart ?? null,
              gegner_name: lead.gegner_name ?? null,
              gegner_versicherung: lead.gegner_versicherung ?? null,
              gegner_kennzeichen: lead.gegner_kennzeichen ?? null,
              gegner_bekannt: lead.gegner_bekannt ?? null,
              eigene_versicherung: lead.eigene_versicherung ?? null,
              eigene_policennr: lead.eigene_policennr ?? null,
              polizei_aktenzeichen: lead.polizei_aktenzeichen ?? null,
              personenschaden_flag: lead.personenschaden_flag ?? null,
              mietwagen_flag: lead.mietwagen_flag ?? null,
              leasing_flag: lead.leasing_flag ?? null,
              finanzierung_flag: lead.finanzierung_flag ?? null,
              gewerbe_flag: lead.gewerbe_flag ?? null,
              halter_ungleich_fahrer_flag: lead.halter_ungleich_fahrer_flag ?? null,
              kennzeichen: lead.kennzeichen ?? null,
              fahrzeug_hersteller: lead.fahrzeug_hersteller ?? null,
              fahrzeug_modell: lead.fahrzeug_modell ?? null,
              kontaktversuche: lead.kontaktversuche ?? null,
              verpasste_anrufe: lead.verpasste_anrufe ?? null,
              firma_name: lead.firma_name ?? null,
              halter_name: lead.halter_name ?? null,
              leasing_geber: lead.leasing_geber ?? null,
              finanzierung_bank: lead.finanzierung_bank ?? null,
            }} />
          </div>
        }
        historieContent={
          <div>
            <LeadHistorie leadId={lead.id} />
          </div>
        }
      />
    </div>
  )
}

const PHASES = [
  { key: 'neu', label: 'Neu' },
  { key: 'erstkontakt', label: 'Kontakt' },
  { key: 'schadentyp-erfasst', label: 'Schadentyp' },
  { key: 'konstellation-erfasst', label: 'Konstell.' },
  { key: 'gegner-daten', label: 'Gegner' },
  { key: 'gutachtertermin', label: 'Termin' },
  { key: 'sa-unterschrieben', label: 'SA' },
  { key: 'flow-gesendet', label: 'Flow' },
  { key: 'abgeschlossen', label: 'Fertig' },
]

function PhaseProgressBar({ phase }: { phase: string }) {
  const currentIdx = PHASES.findIndex(p => p.key === phase)
  return (
    <div className="flex items-center gap-1 mt-3">
      {PHASES.map((p, i) => (
        <div key={p.key} className="flex-1 flex flex-col items-center gap-0.5">
          <div className={`w-full h-1 rounded-full ${
            i <= currentIdx ? 'bg-[#4573A2]' : 'bg-gray-100'
          }`} />
          <span className={`text-[8px] ${i <= currentIdx ? 'text-[#4573A2]' : 'text-gray-300'}`}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  )
}
