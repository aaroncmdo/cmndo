import { createClient } from '@/lib/supabase/server'
import { TrendingUpIcon, CalendarIcon } from 'lucide-react'

// KFZ-155: Monats-Umsatz "laufend + geplant" fuer den Finance-Tab.
//
// Laufend: Summe der Regulierungsbetraege im aktuellen Monat (MTD).
// Geplant: Lineare Forecast-Hochrechnung — laufend / Tage_bisher * Tage_im_Monat.
//
// Das ist eine bewusst simple Linear-Extrapolation (kein Saisonalitaets-
// Modell), aber sie gibt Aaron das geforderte "geplant"-Bild fuer das
// Monatsende auf einen Blick.

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

async function loadForecast() {
  const supabase = await createClient()

  const now = new Date()
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monatEnde = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const tageImMonat = monatEnde.getDate()
  const tageBisher = Math.max(1, now.getDate())
  const restTage = Math.max(0, tageImMonat - tageBisher)

  // Abgeschlossene Faelle MTD → Umsatz
  const { data: abgeschlossen } = await supabase
    .from('faelle')
    .select('regulierung_betrag')
    .eq('status', 'abgeschlossen')
    .gte('regulierung_am', monatStart.toISOString())
    .lte('regulierung_am', monatEnde.toISOString())
    .not('regulierung_betrag', 'is', null)

  const umsatzLaufend = (abgeschlossen ?? []).reduce(
    (s, r) => s + Number(r.regulierung_betrag ?? 0),
    0,
  )
  const provisionLaufend = umsatzLaufend * 0.1

  // Bezahlte Abrechnungen MTD (zusaetzlich, fuer komplette Sicht)
  const { data: bezahlteRechnungen } = await supabase
    .from('abrechnungen')
    .select('summe_brutto, bezahlt_betrag')
    .not('bezahlt_am', 'is', null)
    .gte('bezahlt_am', monatStart.toISOString())
    .lte('bezahlt_am', monatEnde.toISOString())

  const rechnungenLaufend = (bezahlteRechnungen ?? []).reduce(
    (s, r) => s + Number(r.bezahlt_betrag ?? r.summe_brutto ?? 0),
    0,
  )

  const gesamtLaufend = umsatzLaufend + rechnungenLaufend
  const forecastFactor = tageImMonat / tageBisher
  const gesamtForecast = gesamtLaufend * forecastFactor
  const provisionForecast = provisionLaufend * forecastFactor

  return {
    umsatzLaufend,
    rechnungenLaufend,
    gesamtLaufend,
    gesamtForecast,
    provisionLaufend,
    provisionForecast,
    tageBisher,
    tageImMonat,
    restTage,
    monatName: now.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' }),
  }
}

export default async function MonatsUmsatzForecast() {
  const f = await loadForecast()
  const fortschritt = Math.round((f.tageBisher / f.tageImMonat) * 100)
  const remainingForecast = f.gesamtForecast - f.gesamtLaufend

  return (
    <div className="pb-8">
      <div className="">
        <div className="bg-white rounded-ios-lg shadow-ios-md p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
                Monats-Umsatz {f.monatName}
              </h2>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-claimondo-ondo">
              <CalendarIcon className="w-3 h-3" />
              Tag {f.tageBisher} von {f.tageImMonat} ({fortschritt}%)
            </span>
          </div>

          {/* Laufend vs. Geplant */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-4 bg-emerald-50 rounded-xl">
              <p className="text-[10px] text-emerald-700 uppercase tracking-wide font-semibold mb-1">
                Laufend (bis heute)
              </p>
              <p className="text-3xl font-bold text-emerald-700 tabular-nums">{fmtEur(f.gesamtLaufend)}</p>
              <p className="text-[11px] text-emerald-600 mt-1">
                Provision: {fmtEur(f.provisionLaufend)}
              </p>
            </div>
            <div className="p-4 bg-claimondo-ondo/10 rounded-xl">
              <p className="text-[10px] text-claimondo-shield uppercase tracking-wide font-semibold mb-1">
                Geplant (Forecast Monatsende)
              </p>
              <p className="text-3xl font-bold text-claimondo-shield tabular-nums">{fmtEur(f.gesamtForecast)}</p>
              <p className="text-[11px] text-claimondo-ondo mt-1">
                Provision: {fmtEur(f.provisionForecast)} · noch {f.restTage} {f.restTage === 1 ? 'Tag' : 'Tage'}
              </p>
            </div>
          </div>

          {/* Fortschrittsbalken */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-claimondo-ondo">
              <span>Monats-Fortschritt</span>
              <span className="tabular-nums">
                {fmtEur(f.gesamtLaufend)} / {fmtEur(f.gesamtForecast)}
                {remainingForecast > 0 && (
                  <span className="text-claimondo-ondo/70"> · noch +{fmtEur(remainingForecast)} erwartet</span>
                )}
              </span>
            </div>
            <div className="h-3 bg-[#f8f9fb] rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500"
                style={{ width: `${f.gesamtForecast > 0 ? Math.min(100, (f.gesamtLaufend / f.gesamtForecast) * 100) : 0}%` }}
              />
              <div
                className="bg-claimondo-ondo/30"
                style={{ width: `${f.gesamtForecast > 0 ? Math.max(0, ((f.gesamtForecast - f.gesamtLaufend) / f.gesamtForecast) * 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-claimondo-ondo/70">
              <span>laufend (bezahlt)</span>
              <span>geplant (Forecast)</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="mt-4 pt-4 border-t border-claimondo-border grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-claimondo-ondo">Regulierungs-Umsatz MTD</p>
              <p className="text-claimondo-navy font-semibold tabular-nums">{fmtEur(f.umsatzLaufend)}</p>
            </div>
            <div>
              <p className="text-claimondo-ondo">Bezahlte Rechnungen MTD</p>
              <p className="text-claimondo-navy font-semibold tabular-nums">{fmtEur(f.rechnungenLaufend)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
