// Wertminderung-Sanden/Danner-Section aus prototype.html §7b.
// 2-Spalten: Text + Rechenbeispiel links, Tabelle Fahrzeugalter × % × Beispiel rechts.
// Wissensdatenbank §7 + BGH VI ZR 357/03.

import { getTranslations } from 'next-intl/server'

type TableRow = { alter: string; prozent: string; beispiel: string }

// muted=true nur für die letzte Zeile (5.+ Jahr)
const MUTED_INDEX = 4

export async function WertminderungSandenDannerSection() {
  const t = await getTranslations('vorteile')

  const zeilen = t.raw('wertminderung.tabelle_zeilen') as TableRow[]

  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby="wertminderung-heading">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            {t('wertminderung.eyebrow')}
          </p>
          <h2 id="wertminderung-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
            {t('wertminderung.heading')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            {t.rich('wertminderung.body', {
              strong: (chunks) => <strong>{chunks}</strong>,
              em: (chunks) => <em>{chunks}</em>,
            })}
          </p>

          <div className="mt-6 rounded-2xl border-l-4 border-claimondo-ondo bg-claimondo-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-claimondo-ondo">
              {t('wertminderung.rechenbeispiel_eyebrow')}
            </p>
            <p className="mt-2 text-sm text-claimondo-shield">
              {t('wertminderung.rechenbeispiel_fahrzeug')}
            </p>
            <p className="mt-1 text-sm font-bold text-claimondo-navy">
              {t('wertminderung.rechenbeispiel_ergebnis_pre')}{' '}
              <span className="text-claimondo-ondo">{t('wertminderung.rechenbeispiel_betrag')}</span>{' '}
              {t('wertminderung.rechenbeispiel_ergebnis_suf')}
            </p>
            <p className="mt-2 text-xs text-claimondo-shield/80">
              {t('wertminderung.rechenbeispiel_quelle')}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          {/* AAR-Mobile-Audit 14.05.2026: overflow-hidden → overflow-x-auto,
              die 3-spaltige Tabelle ist auf Mobile (390px) zu breit. Statt
              abzuschneiden, horizontal scrollen lassen. `min-w-0` auf dem
              grid-Child verhindert dass die Tabelle den ganzen Viewport
              sprengt — sie scrollt jetzt nur INNERHALB der Card. */}
          <div className="overflow-x-auto rounded-3xl border border-claimondo-border bg-white shadow-claimondo-md">
            <table className="w-full min-w-[480px] text-left">
              <thead className="bg-claimondo-navy text-white">
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">
                    {t('wertminderung.tabelle_kopf_alter')}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">
                    {t('wertminderung.tabelle_kopf_prozent')}
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">
                    {t('wertminderung.tabelle_kopf_beispiel')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-claimondo-border text-sm">
                {zeilen.map((r, i) => {
                  const muted = i === MUTED_INDEX
                  return (
                    <tr key={r.alter} className={muted ? 'bg-claimondo-bg/50' : ''}>
                      <td className="px-5 py-3 font-semibold text-claimondo-navy">{r.alter}</td>
                      <td className="px-5 py-3 text-claimondo-shield">{r.prozent}</td>
                      <td className={muted ? 'px-5 py-3 italic text-claimondo-shield' : 'px-5 py-3 font-bold text-claimondo-ondo'}>
                        {r.beispiel}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-claimondo-shield/70">
            {t('wertminderung.tabelle_fusszeile')}
          </p>
        </div>
      </div>
    </section>
  )
}
