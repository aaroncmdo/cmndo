import { createClient } from '@/lib/supabase/server'
import { CreditCardIcon, AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'
import { Table, Tr, Td, DataTableContainer } from '@/components/shared/DataTable'

// KFZ-155: Stripe-Connect Auszahlungen Status fuer den Finance-Tab.
//
// Wir haben (noch) keine echte Stripe-Connect Payouts-Tabelle in der DB,
// aber `stripe_events` haelt alle eingehenden Webhook-Events. Wir zeigen
// daher die Connect-Health (verarbeitet vs. fehlerhaft + letzte Events
// nach Typ) — das gibt Aaron sofort Sicht auf den Zahlungs-Health, ohne
// dass wir die Stripe-API live abfragen muessten.

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

async function loadStripeStatus() {
  const supabase = await createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: total7d },
    { count: success7d },
    { count: failed7d },
    { data: lastFailed },
    { data: lastEvents },
  ] = await Promise.all([
    supabase
      .from('stripe_events')
      .select('id', { count: 'exact', head: true })
      .gte('empfangen_am', sevenDaysAgo),
    supabase
      .from('stripe_events')
      .select('id', { count: 'exact', head: true })
      .gte('empfangen_am', sevenDaysAgo)
      .eq('verarbeitet', true)
      .is('fehler', null),
    supabase
      .from('stripe_events')
      .select('id', { count: 'exact', head: true })
      .gte('empfangen_am', sevenDaysAgo)
      .not('fehler', 'is', null),
    supabase
      .from('stripe_events')
      .select('id, event_type, fehler, empfangen_am')
      .not('fehler', 'is', null)
      .order('empfangen_am', { ascending: false })
      .limit(5),
    supabase
      .from('stripe_events')
      .select('id, event_type, verarbeitet, empfangen_am, fehler')
      .order('empfangen_am', { ascending: false })
      .limit(8),
  ])

  // Letzte Anzahlungen aus gutachter_einzahlungen
  const { data: einzahlungen } = await supabase
    .from('gutachter_einzahlungen')
    .select('id, sv_id, betrag, typ, beschreibung, eingezahlt_am')
    .order('eingezahlt_am', { ascending: false })
    .limit(5)

  return {
    total7d: total7d ?? 0,
    success7d: success7d ?? 0,
    failed7d: failed7d ?? 0,
    lastFailed: lastFailed ?? [],
    lastEvents: lastEvents ?? [],
    einzahlungen: einzahlungen ?? [],
  }
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export default async function StripeConnectStatusWidget() {
  const s = await loadStripeStatus()
  const healthOk = s.failed7d === 0 && s.total7d > 0

  return (
    <div className="pb-8">
      <div className="">
        <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4 text-claimondo-ondo" />
              <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
                Stripe-Connect Health
              </h2>
            </div>
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              healthOk ? 'bg-emerald-50 text-emerald-700' : s.failed7d > 0 ? 'bg-red-50 text-red-700' : 'bg-claimondo-bg text-claimondo-ondo'
            }`}>
              {healthOk ? (
                <><CheckCircle2Icon className="w-3 h-3" /> healthy</>
              ) : s.failed7d > 0 ? (
                <><AlertTriangleIcon className="w-3 h-3" /> {s.failed7d} Fehler</>
              ) : (
                'keine Events'
              )}
            </span>
          </div>

          <div className="p-5">
            {/* 3 Counter */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="text-center p-3 bg-claimondo-bg rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Events (7 Tage)</p>
                <p className="text-claimondo-navy text-2xl font-bold tabular-nums">{s.total7d}</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Erfolgreich</p>
                <p className="text-emerald-600 text-2xl font-bold tabular-nums">{s.success7d}</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-ios-xl">
                <p className="text-claimondo-ondo text-xs mb-1">Mit Fehler</p>
                <p className="text-red-600 text-2xl font-bold tabular-nums">{s.failed7d}</p>
              </div>
            </div>

            {/* Letzte Failed Events */}
            {s.lastFailed.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] text-red-600 uppercase tracking-wide font-semibold mb-2">
                  Letzte fehlgeschlagene Events
                </p>
                <ul className="space-y-1.5">
                  {s.lastFailed.map(e => (
                    <li key={e.id} className="flex items-start gap-2 text-xs bg-red-50 border border-red-100 rounded-ios-lg px-3 py-2">
                      <AlertTriangleIcon className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-900 font-medium">{e.event_type}</p>
                        <p className="text-red-700 text-[11px] truncate" title={e.fehler ?? ''}>{e.fehler}</p>
                      </div>
                      <span className="text-[10px] text-red-500 tabular-nums">{fmtTime(e.empfangen_am)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Letzte Anzahlungen / Einzahlungen */}
            {s.einzahlungen.length > 0 && (
              <div>
                <p className="text-[10px] text-claimondo-ondo uppercase tracking-wide font-semibold mb-2">
                  Letzte SV-Einzahlungen via Stripe
                </p>
                <DataTableContainer variant="plain">
                  <Table className="!text-xs">
                    <tbody>
                      {s.einzahlungen.map(e => (
                        <Tr key={e.id} className="border-b border-claimondo-border">
                          <Td className="!px-0 !py-2">{e.typ ?? 'Anzahlung'}</Td>
                          <Td className="!px-0 !py-2 !text-claimondo-ondo truncate max-w-[280px]">{e.beschreibung ?? '—'}</Td>
                          <Td className="!px-0 !py-2 text-right !text-emerald-600 font-semibold tabular-nums">{fmtEur(Number(e.betrag))}</Td>
                          <Td className="!px-0 !py-2 text-right !text-claimondo-ondo/70 tabular-nums">
                            {e.eingezahlt_am ? new Date(e.eingezahlt_am).toLocaleDateString('de-DE') : '—'}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </DataTableContainer>
              </div>
            )}

            {s.lastEvents.length === 0 && (
              <p className="text-xs text-claimondo-ondo text-center py-4">
                Noch keine Stripe-Events erfasst.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
