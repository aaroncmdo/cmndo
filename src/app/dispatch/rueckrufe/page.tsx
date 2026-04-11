import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RueckrufActions from './RueckrufActions'

export default async function DispatchRueckrufe() {
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, email, qualifizierungs_phase, rueckruf_datum, rueckruf_notiz, anruf_versuche, letzter_anruf_am, letzter_anruf_status, created_at')
    .eq('qualifizierungs_phase', 'rueckruf')
    .or('rueckruf_erledigt.is.null,rueckruf_erledigt.eq.false')
    .order('rueckruf_datum', { ascending: true, nullsFirst: false })

  return (
    <div className="py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Rückrufe</h1>
        <span className="text-sm text-gray-500">{leads?.length ?? 0} offen</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {(leads ?? []).map((lead) => {
          const isOverdue = lead.rueckruf_datum && new Date(lead.rueckruf_datum) < new Date()
          return (
            <div key={lead.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <Link href={`/dispatch/leads/${lead.id}`} className="text-sm font-medium text-gray-900 hover:text-[#4573A2]">
                  {lead.vorname} {lead.nachname}
                </Link>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  {lead.telefon && (
                    <a href={`tel:${lead.telefon}`} className="text-[#4573A2] hover:underline">{lead.telefon}</a>
                  )}
                  {lead.rueckruf_datum && (
                    <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                      {new Date(lead.rueckruf_datum).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {isOverdue && ' (überfällig)'}
                    </span>
                  )}
                  {lead.rueckruf_notiz && (
                    <span className="text-gray-400 truncate max-w-[200px]">{lead.rueckruf_notiz}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                  <span>Versuche: {lead.anruf_versuche ?? 0}</span>
                  {lead.letzter_anruf_am && (
                    <span>Letzter: {new Date(lead.letzter_anruf_am).toLocaleDateString('de-DE')} ({lead.letzter_anruf_status ?? '?'})</span>
                  )}
                </div>
              </div>

              <RueckrufActions
                leadId={lead.id}
                anrufVersuche={lead.anruf_versuche ?? 0}
              />
            </div>
          )
        })}
        {(!leads || leads.length === 0) && (
          <p className="px-5 py-12 text-sm text-gray-400 text-center">Keine offenen Rückrufe</p>
        )}
      </div>
    </div>
  )
}
