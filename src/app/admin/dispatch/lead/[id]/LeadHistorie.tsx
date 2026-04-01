'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HistoryIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

type HistoryEntry = {
  id: string
  feld: string
  alter_wert: string | null
  neuer_wert: string | null
  geaendert_von: string | null
  geaendert_am: string
}

const FELD_LABELS: Record<string, string> = {
  vorname: 'Vorname', nachname: 'Nachname', email: 'E-Mail', telefon: 'Telefon',
  status: 'Status', qualifizierungs_phase: 'Phase', schadenfall_typ: 'Schadenfall-Typ',
  kunden_konstellation: 'Kunden-Konstellation', source_channel: 'Quelle',
  personenschaden_flag: 'Personenschaden', mietwagen_flag: 'Mietwagen', leasing_flag: 'Leasing',
  gegner_name: 'Gegner-Name', gegner_versicherung: 'Gegner-Versicherung',
  gegner_kennzeichen: 'Gegner-Kennzeichen', gegner_bekannt: 'Gegner bekannt',
  eigene_versicherung: 'Eigene Versicherung', eigene_policennr: 'Policennr.',
  polizei_aktenzeichen: 'Polizei-AZ', polizeibericht_pflicht: 'Polizeibericht Pflicht',
  sa_unterschrieben: 'SA unterschrieben', vollmacht_unterschrieben: 'Vollmacht unterschrieben',
  gutachter_termin: 'Gutachter-Termin', rueckruf_datum: 'Rückruf-Datum',
  rueckruf_erledigt: 'Rückruf erledigt', rueckruf_notiz: 'Rückruf-Notiz',
  notiz: 'Notiz', disqualifiziert: 'Disqualifiziert', disqualifiziert_grund: 'DQ-Grund',
  wa_gesendet: 'WA gesendet', flow_link_geoeffnet: 'FlowLink geöffnet',
  flow_link_abgeschlossen: 'FlowLink abgeschlossen', zugewiesen_an: 'Zugewiesen an',
  anruf_versuche: 'Anruf-Versuche', letzter_anruf_am: 'Letzter Anruf',
  letzter_anruf_status: 'Anruf-Status', kontaktversuche: 'Kontaktversuche',
  mandatstyp: 'Mandatstyp', schadensursache: 'Schadensursache',
  fahrzeug_standort_plz: 'Fahrzeug PLZ', fahrzeug_standort_adresse: 'Fahrzeug Adresse',
  kennzeichen: 'Kennzeichen', fahrzeug_hersteller: 'Hersteller', fahrzeug_modell: 'Modell',
  sf_variante: 'SF-Variante', halter_name: 'Halter', firma_name: 'Firma',
  leasing_geber: 'Leasinggeber', finanzierung_bank: 'Finanzierungs-Bank',
}

function formatValue(feld: string, val: string | null): string {
  if (val === null || val === '') return '—'
  if (val === 'true') return 'Ja'
  if (val === 'false') return 'Nein'
  // Try to format dates
  if (feld.includes('datum') || feld.includes('termin') || feld.includes('_am') || feld.includes('_at')) {
    try {
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      }
    } catch { /* not a date */ }
  }
  return val
}

export default function LeadHistorie({ leadId }: { leadId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data } = await supabase
        .from('lead_historie')
        .select('id, feld, alter_wert, neuer_wert, geaendert_von, geaendert_am')
        .eq('lead_id', leadId)
        .order('geaendert_am', { ascending: false })
        .limit(200)

      const history = data ?? []
      setEntries(history)

      // Resolve user names
      const userIds = [...new Set(history.map(h => h.geaendert_von).filter(Boolean) as string[])]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, vorname, nachname')
          .in('id', userIds)

        const map: Record<string, string> = {}
        for (const p of profiles ?? []) {
          map[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
        }
        setProfileMap(map)
      }

      setLoading(false)
    }
    load()
  }, [leadId])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <HistoryIcon className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-medium text-gray-500">Historie</h2>
        </div>
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Group by date
  const grouped: Record<string, HistoryEntry[]> = {}
  for (const e of entries) {
    const day = new Date(e.geaendert_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(e)
  }

  const days = Object.keys(grouped)
  const visibleDays = expanded ? days : days.slice(0, 3)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HistoryIcon className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-medium text-gray-500">Historie ({entries.length} Änderungen)</h2>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">Noch keine Änderungen protokolliert</p>
      ) : (
        <div className="space-y-4">
          {visibleDays.map(day => (
            <div key={day}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{day}</p>
              <div className="space-y-1.5">
                {grouped[day].map(entry => {
                  const label = FELD_LABELS[entry.feld] ?? entry.feld
                  const userName = entry.geaendert_von ? (profileMap[entry.geaendert_von] ?? '') : ''
                  return (
                    <div key={entry.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <PencilIcon className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-gray-700">{label}</span>
                          <span className="text-[10px] text-gray-400">geändert</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                          <span className="text-red-400 line-through truncate max-w-[120px]">{formatValue(entry.feld, entry.alter_wert)}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-emerald-600 font-medium truncate max-w-[120px]">{formatValue(entry.feld, entry.neuer_wert)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-400 tabular-nums">
                          {new Date(entry.geaendert_am).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {userName && <p className="text-[9px] text-gray-400">{userName}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {days.length > 3 && (
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-[#4573A2] hover:text-[#1E3A5F] font-medium mx-auto transition-colors">
              {expanded ? <><ChevronUpIcon className="w-3 h-3" /> Weniger anzeigen</> : <><ChevronDownIcon className="w-3 h-3" /> Alle {days.length} Tage anzeigen</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
