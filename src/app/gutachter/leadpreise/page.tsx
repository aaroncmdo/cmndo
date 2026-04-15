import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import { paketLabelMitKontingent } from '@/lib/sachverstaendige/kontingent'

export default async function LeadpreisePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // AAR-209: paket_faelle_gesamt zusätzlich laden für konsistenten
  // Kontingent-Resolver (dieselben Quellen wie willkommen + dashboard).
  const sv = await getGutachterForUser<{
    id: string; paket: string; kontingent_soll: number | null;
    max_faelle_monat: number | null; paket_faelle_gesamt: number | null;
  }>(supabase, user.id, 'id, paket, kontingent_soll, max_faelle_monat, paket_faelle_gesamt')
  if (!sv) redirect('/gutachter')

  const { data: tabelle } = await supabase.from('leadpreise_tabelle')
    .select('schadenhoehe_bis_netto, paketpreis_netto, einzelpreis_netto, version, created_at')
    .eq('aktiv', true)
    .order('schadenhoehe_bis_netto', { ascending: true })

  const paketLabel = paketLabelMitKontingent(sv)

  const standDatum = tabelle?.[0]?.created_at
    ? new Date(tabelle[0].created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    : 'März 2026'

  function eur(val: number) { return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

  return (
    <div className="h-full overflow-y-auto py-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Lead-Preis-Tabelle</h1>
        <p className="text-sm text-gray-500 mb-1">Stand: {standDatum} (Version {tabelle?.[0]?.version ?? 'v1'})</p>
        <p className="text-xs text-gray-400 mb-5">Diese Tabelle ist Bestandteil deines Kooperationsvertrags (Anhang). Änderungen werden dir vorab schriftlich mitgeteilt.</p>

        {/* Erläuterung */}
        <div className="bg-[#4573A2]/5 border border-[#7BA3CC]/30 rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-[#0D1B3E] mb-2">Wie funktioniert die Berechnung?</p>
          <ul className="text-xs text-[#1E3A5F] space-y-1.5 list-disc pl-4">
            <li>Solange du innerhalb deines monatlichen Kontingents ({paketLabel}) bist, gilt der <strong>Paket-Preis</strong>. Ab dem ersten Fall über dem Kontingent gilt der <strong>Einzel-Preis</strong>.</li>
            <li>Pro Fall im Kontingent werden <strong>150 EUR</strong> von deinem Werbebudget verrechnet (solange Guthaben vorhanden), den Rest zahlst du in der Monatsabrechnung.</li>
          </ul>
          <div className="mt-3 bg-white rounded-lg border border-gray-200 px-3 py-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Beispiel {paketLabel}</p>
            <p className="text-xs text-gray-700">Schaden 6.000 EUR im Kontingent: <strong>216 EUR</strong> Lead-Preis − <strong>150 EUR</strong> Werbebudget = <strong>66 EUR</strong> Nachzahlung</p>
          </div>
        </div>

        {/* Tabelle */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Schadenhöhe (Netto-RK bis)</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Paket-Preis (im Kontingent)</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Einzel-Preis (über Kontingent)</th>
              </tr>
            </thead>
            <tbody>
              {(tabelle ?? []).map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-800 font-medium tabular-nums">{eur(Number(row.schadenhoehe_bis_netto))} EUR</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{eur(Number(row.paketpreis_netto))} EUR</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{eur(Number(row.einzelpreis_netto))} EUR</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
            <p className="text-[10px] text-gray-400">{tabelle?.length ?? 0} Einträge · Alle Preise netto zzgl. 19% MwSt</p>
          </div>
        </div>
      </div>
    </div>
  )
}
