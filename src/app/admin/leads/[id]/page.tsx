import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LeadDetailClient from './LeadDetailClient'

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

  // Zugehörige Fälle laden
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <Link
          href="/admin/leads"
          className="text-sm text-zinc-400 hover:text-white transition-colors mb-6 inline-block"
        >
          ← Zurück zu Leads
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">
            {lead.vorname ?? ''} {lead.nachname ?? ''}
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">{lead.email ?? '—'}</p>
        </div>

        {/* Status + Details */}
        <LeadDetailClient lead={lead} />

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

        {/* Timestamps */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Zeitstempel</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow
              label="Erstellt am"
              value={lead.created_at ? new Date(lead.created_at).toLocaleString('de-DE') : null}
            />
            <InfoRow
              label="Aktualisiert am"
              value={lead.updated_at ? new Date(lead.updated_at).toLocaleString('de-DE') : null}
            />
            <InfoRow
              label="Rückruf-Termin"
              value={lead.rueckruf_termin ? new Date(lead.rueckruf_termin).toLocaleString('de-DE') : null}
            />
          </div>
        </div>

        {/* Notiz */}
        {lead.notiz && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Notiz</h2>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{lead.notiz}</p>
          </div>
        )}

        {/* Zugehörige Fälle */}
        {faelle && faelle.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">
              Zugehörige Fälle ({faelle.length})
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
                      {fall.schadens_ursache ?? '—'}
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
      <p className="text-sm text-zinc-200">{value || '—'}</p>
    </div>
  )
}
