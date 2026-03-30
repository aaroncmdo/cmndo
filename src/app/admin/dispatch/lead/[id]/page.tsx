import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LeadStepper from './LeadStepper'
import RueckrufSection from './RueckrufSection'
import LeadNotizen from './LeadNotizen'
import LeadTimeline from './LeadTimeline'

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  // Zugehoerige Faelle laden
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  // Timeline: aus Fall laden falls vorhanden
  const fallId = faelle?.[0]?.id ?? null
  const { data: timelineEntries } = fallId
    ? await supabase
        .from('timeline')
        .select('id, typ, titel, beschreibung, created_at')
        .eq('fall_id', fallId)
        .order('created_at', { ascending: false })
        .limit(30)
    : { data: [] }

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <Link
          href="/admin/dispatch"
          className="text-sm text-zinc-400 hover:text-white transition-colors mb-6 inline-block"
        >
          &larr; Zurueck zu Dispatch
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">
            {lead.vorname ?? ''} {lead.nachname ?? ''}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm">
            {lead.telefon && (
              <a href={`tel:${lead.telefon}`} className="text-blue-400 hover:text-blue-300 transition-colors">
                {lead.telefon}
              </a>
            )}
            {lead.email && <span className="text-zinc-500">{lead.email}</span>}
            {lead.created_at && (
              <span className="text-zinc-600 text-xs">
                Erstellt: {new Date(lead.created_at).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <PhaseProgressBar phase={lead.qualifizierungs_phase ?? 'neu'} />

        {/* Rueckruftermin */}
        <RueckrufSection
          lead={{
            id: lead.id,
            rueckruf_datum: lead.rueckruf_datum ?? null,
            rueckruf_notiz: lead.rueckruf_notiz ?? null,
            rueckruf_erledigt: lead.rueckruf_erledigt ?? null,
          }}
        />

        {/* Qualifizierungs-Stepper (7 Schritte) */}
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
          }}
        />

        {/* Notizen */}
        <LeadNotizen leadId={lead.id} notiz={lead.notiz ?? ''} />

        {/* Kontakt */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Kontaktdaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="E-Mail" value={lead.email} />
            <InfoRow label="Telefon" value={lead.telefon} />
            <InfoRow label="Quelle" value={lead.source_channel} />
            <InfoRow label="Domain" value={lead.source_domain} />
            <InfoRow label="Kontaktversuche" value={String(lead.kontaktversuche ?? 0)} />
            <InfoRow label="Verpasste Anrufe" value={String(lead.verpasste_anrufe ?? 0)} />
          </div>
        </div>

        {/* Timeline */}
        <LeadTimeline
          lead={{
            created_at: lead.created_at,
            qualifizierungs_phase: lead.qualifizierungs_phase ?? 'neu',
            rueckruf_datum: lead.rueckruf_datum ?? null,
            rueckruf_erledigt: lead.rueckruf_erledigt ?? false,
            sa_unterschrieben: lead.sa_unterschrieben ?? false,
            gutachter_termin: lead.gutachter_termin ?? null,
            wa_gesendet: lead.wa_gesendet ?? false,
          }}
          timelineEntries={timelineEntries ?? []}
        />

        {/* Zugehoerige Faelle */}
        {faelle && faelle.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">
              Zugehoerige Faelle ({faelle.length})
            </h2>
            <div className="space-y-2">
              {faelle.map((fall) => (
                <Link
                  key={fall.id}
                  href={`/admin/faelle/${fall.id}`}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                >
                  <div>
                    <span className="text-blue-400 font-mono text-xs">
                      {fall.fall_nummer ?? fall.id.slice(0, 8)}
                    </span>
                    <span className="text-zinc-400 text-xs ml-3">
                      {fall.schadens_ursache ?? '\u2014'}
                    </span>
                  </div>
                  <span className="text-zinc-500 text-xs">
                    {fall.created_at ? new Date(fall.created_at).toLocaleDateString('de-DE') : ''}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm text-zinc-200">{value || '\u2014'}</p>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-5">
      <div className="flex items-center gap-1">
        {PHASES.map((p, i) => (
          <div key={p.key} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full h-1.5 rounded-full ${
              i <= currentIdx ? 'bg-blue-500' : 'bg-zinc-800'
            }`} />
            <span className={`text-[9px] ${i <= currentIdx ? 'text-blue-400' : 'text-zinc-600'}`}>
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
