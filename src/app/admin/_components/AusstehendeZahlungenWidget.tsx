import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AlertCircleIcon, ArrowRightIcon, EuroIcon } from 'lucide-react'

// KFZ-155: Ausstehende Zahlungen Widget — top 5 Eintraege fuer das Dashboard.
//
// Quellen:
//   1. SVs mit Anzahlung offen (vertrag_unterschrieben=true UND
//      portal_zugang_freigeschaltet=false UND onboarding_anzahlung_betrag>0)
//   2. abrechnungen.bezahlt_am IS NULL UND faellig_am < CURRENT_DATE
//   3. abrechnungen mit storniert_am IS NULL UND status='versendet' und ueberfaellig
//
// Das volle Tabelle laeuft in /admin/abrechnungen, hier nur Top 5 + Link.

type Eintrag = {
  key: string
  name: string
  email: string | null
  betrag: number
  faelligSeitTage: number | null
  status: 'anzahlung_offen' | 'rechnung_ueberfaellig' | 'einzug_failed'
  href: string
}

const STATUS_LABEL: Record<Eintrag['status'], { label: string; bg: string; text: string }> = {
  anzahlung_offen: { label: 'Anzahlung offen', bg: 'bg-amber-50', text: 'text-amber-700' },
  rechnung_ueberfaellig: { label: 'Rechnung ueberfaellig', bg: 'bg-red-50', text: 'text-red-700' },
  einzug_failed: { label: 'Einzug failed', bg: 'bg-red-100', text: 'text-red-700' },
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function tageSeit(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

async function loadAusstehende(): Promise<{ rows: Eintrag[]; gesamt: number; total: number }> {
  const supabase = await createClient()
  const eintraege: Eintrag[] = []

  // 1. SVs mit offener Anzahlung — Vertrag unterzeichnet aber nicht freigeschaltet
  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, onboarding_anzahlung_betrag, onboarding_anzahlung_faellig_am, vertrag_unterschrieben_am, vertrag_unterschrieben, portal_zugang_freigeschaltet')
    .eq('vertrag_unterschrieben', true)
    .eq('portal_zugang_freigeschaltet', false)
    .gt('onboarding_anzahlung_betrag', 0)
    .limit(20)

  const svProfileIds = (svRows ?? []).map(r => r.profile_id).filter(Boolean) as string[]
  let profileMap = new Map<string, { vorname: string | null; nachname: string | null; email: string | null }>()
  if (svProfileIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname, email')
      .in('id', svProfileIds)
    profileMap = new Map((profs ?? []).map(p => [p.id, p]))
  }

  for (const r of svRows ?? []) {
    const profile = r.profile_id ? profileMap.get(r.profile_id) : null
    eintraege.push({
      key: `sv-${r.id}`,
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || '—' : '—',
      email: profile?.email ?? null,
      betrag: Number(r.onboarding_anzahlung_betrag ?? 0),
      faelligSeitTage: tageSeit(r.vertrag_unterschrieben_am),
      status: 'anzahlung_offen',
      href: `/admin/sachverstaendige/${r.id}`,
    })
  }

  // 2. + 3. Abrechnungen ueberfaellig oder mit Einzugs-Fehler
  const today = new Date().toISOString().slice(0, 10)
  const { data: rRows } = await supabase
    .from('abrechnungen')
    .select('id, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, summe_brutto, faellig_am, bezahlt_am, status, storniert_am')
    .is('bezahlt_am', null)
    .is('storniert_am', null)
    .lt('faellig_am', today)
    .order('faellig_am', { ascending: true })
    .limit(20)

  for (const r of rRows ?? []) {
    const failed = (r.status ?? '').toLowerCase().includes('failed') || (r.status ?? '').toLowerCase().includes('einzug')
    eintraege.push({
      key: `r-${r.id}`,
      name: r.empfaenger_name ?? '—',
      email: r.empfaenger_email ?? null,
      betrag: Number(r.summe_brutto ?? 0),
      faelligSeitTage: tageSeit(r.faellig_am),
      status: failed ? 'einzug_failed' : 'rechnung_ueberfaellig',
      // AAR-614: Vorher wurde auf /admin/sachverstaendige/{empfaenger_id}
      // gelinkt wenn empfaenger_typ === 'gutachter'. Zwei Probleme:
      // (a) Inserts setzen empfaenger_typ = 'sv' (nicht 'gutachter') → Check tot.
      // (b) Bei SV-Sammelabrechnungen ist empfaenger_id die Organisations-ID,
      //     nicht sachverstaendige.id → 404.
      // Klick auf die Zeile → immer Abrechnungs-Tabelle (Detail-Drilldown).
      href: '/admin/abrechnungen',
    })
  }

  // Sortieren nach faelligkeit (laengste zuerst), dann betrag absteigend
  eintraege.sort((a, b) => {
    const ta = a.faelligSeitTage ?? 0
    const tb = b.faelligSeitTage ?? 0
    if (tb !== ta) return tb - ta
    return b.betrag - a.betrag
  })

  const gesamt = eintraege.reduce((s, e) => s + e.betrag, 0)
  return { rows: eintraege.slice(0, 5), gesamt, total: eintraege.length }
}

export default async function AusstehendeZahlungenWidget() {
  const { rows, gesamt, total } = await loadAusstehende()

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <EuroIcon className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-700">Ausstehende Zahlungen</h2>
          {total > 0 && (
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {total} offen
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 tabular-nums font-medium">{fmtEur(gesamt)}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-2">
              <EuroIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs text-gray-500">Keine offenen Forderungen.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map(e => {
              const badge = STATUS_LABEL[e.status]
              return (
                <li key={e.key}>
                  <Link
                    href={e.href}
                    className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                        {e.email && <p className="text-[11px] text-gray-500 truncate">{e.email}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          {e.faelligSeitTage !== null && (
                            <span className="text-[10px] text-gray-400">
                              seit {e.faelligSeitTage} {e.faelligSeitTage === 1 ? 'Tag' : 'Tagen'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtEur(e.betrag)}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
        <Link
          href="/admin/abrechnungen"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#4573A2] hover:text-[#1E3A5F] transition-colors"
        >
          Alle anzeigen <ArrowRightIcon className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

// Re-export der Loader-Funktion fuer den Finance-Tab (volle Tabelle).
export { loadAusstehende }

export function StatusBadge({ status }: { status: Eintrag['status'] }) {
  const b = STATUS_LABEL[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${b.bg} ${b.text}`}>
      <AlertCircleIcon className="w-3 h-3" />
      {b.label}
    </span>
  )
}
