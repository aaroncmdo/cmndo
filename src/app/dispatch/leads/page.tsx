import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PhoneIcon, ExternalLinkIcon } from 'lucide-react'

const PHASE_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'neu', label: 'Neu' },
  { value: 'rueckruf', label: 'Rückruf' },
  { value: 'in-qualifizierung', label: 'In Qualifizierung' },
  { value: 'flow-versendet', label: 'Flow gesendet' },
  { value: 'nicht-erreicht', label: 'Nicht erreicht' },
  { value: 'kalt', label: 'Kalt' },
  { value: 'disqualifiziert', label: 'Disqualifiziert' },
  { value: 'konvertiert', label: 'Konvertiert' },
]

const PHASE_BADGES: Record<string, string> = {
  'neu': 'bg-blue-100 text-blue-700',
  'nicht-erreicht': 'bg-gray-100 text-gray-600',
  'rueckruf': 'bg-amber-100 text-amber-700',
  'in-qualifizierung': 'bg-violet-100 text-violet-700',
  'flow-versendet': 'bg-emerald-100 text-emerald-700',
  'sa-ausstehend': 'bg-cyan-100 text-cyan-700',
  'konvertiert': 'bg-green-100 text-green-800',
  'disqualifiziert': 'bg-red-100 text-red-700',
  'kalt': 'bg-gray-200 text-gray-500',
}

function flowLinkBadge(offen: boolean | null, abgeschlossen: boolean | null): { label: string; cls: string } {
  if (abgeschlossen) return { label: 'Abgeschlossen', cls: 'bg-green-100 text-green-700' }
  if (offen) return { label: 'Offen', cls: 'bg-amber-100 text-amber-700' }
  return { label: '—', cls: 'text-gray-300' }
}

export default async function DispatchLeads({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, email, qualifizierungs_phase, schadenfall_typ, service_typ, source_channel, flow_link_geoeffnet, flow_link_abgeschlossen, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (params.phase) {
    query = query.eq('qualifizierungs_phase', params.phase)
  }

  const { data: leads } = await query
  const activePhase = params.phase ?? ''

  return (
    <div className="py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Leads</h1>
        <span className="text-sm text-gray-500">{leads?.length ?? 0} Ergebnisse</span>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {PHASE_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={opt.value ? `/dispatch/leads?phase=${opt.value}` : '/dispatch/leads'}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activePhase === opt.value
                ? 'bg-[#0D1B3E] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Telefon</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">FlowLink</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Service</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Erstellt</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(leads ?? []).map((lead) => {
                const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
                return (
                  <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/dispatch/leads/${lead.id}`} className="font-medium text-gray-900 hover:text-[#4573A2]">
                        {lead.vorname} {lead.nachname}
                      </Link>
                      {lead.schadenfall_typ && (
                        <span className="ml-2 text-[10px] text-gray-400">{lead.schadenfall_typ}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.telefon ? (
                        <a href={`tel:${lead.telefon}`} className="flex items-center gap-1 text-[#4573A2] hover:underline">
                          <PhoneIcon className="w-3 h-3" />
                          {lead.telefon}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGES[lead.qualifizierungs_phase] ?? 'bg-gray-100 text-gray-600'}`}>
                        {PHASE_OPTIONS.find(o => o.value === lead.qualifizierungs_phase)?.label ?? lead.qualifizierungs_phase}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {lead.service_typ === 'nur_gutachter' ? 'Nur SV' : 'Komplett'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dispatch/leads/${lead.id}`} className="text-gray-400 hover:text-[#4573A2]">
                        <ExternalLinkIcon className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {(!leads || leads.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Keine Leads gefunden</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
