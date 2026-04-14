// AAR-68: Mitarbeiter Nachrichten-Inbox — gefiltert auf Faelle des KB
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircleIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterNachrichten() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Faelle des KB ermitteln
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen')
    .eq('kundenbetreuer_id', user.id)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap = new Map((faelle ?? []).map(f => [f.id, f]))

  // Letzte Nachricht pro Fall (gruppiert)
  const { data: nachrichten } = fallIds.length > 0 ? await supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_rolle, nachricht, gelesen, created_at')
    .in('fall_id', fallIds)
    .neq('sender_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  : { data: [] }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Nachrichten</h1>
        <p className="text-sm text-gray-500 mt-1">Eingehende Nachrichten zu Ihren Faellen.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {(nachrichten ?? []).map(n => {
          const fall = fallMap.get(n.fall_id as string)
          return (
            <Link key={n.id} href={`/admin/faelle/${n.fall_id}#nachrichten`}
              className={`block px-4 py-3 hover:bg-gray-50 transition-colors ${!n.gelesen ? 'bg-blue-50/30' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  !n.gelesen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  <MessageCircleIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-900">
                      {fall?.fall_nummer ?? (n.fall_id as string).slice(0, 8)}
                      {fall?.kennzeichen && <span className="text-xs text-gray-400 ml-2">{fall.kennzeichen}</span>}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{n.nachricht}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">via {n.kanal} · {n.sender_rolle}</p>
                </div>
                {!n.gelesen && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
              </div>
            </Link>
          )
        })}
        {(!nachrichten || nachrichten.length === 0) && (
          <p className="px-4 py-12 text-center text-gray-400 text-sm">Keine Nachrichten</p>
        )}
      </div>
    </div>
  )
}
