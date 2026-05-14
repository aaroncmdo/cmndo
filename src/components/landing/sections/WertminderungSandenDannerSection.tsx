// Wertminderung-Sanden/Danner-Section aus prototype.html §7b.
// 2-Spalten: Text + Rechenbeispiel links, Tabelle Fahrzeugalter × % × Beispiel rechts.
// Wissensdatenbank §7 + BGH VI ZR 357/03.

type Row = { alter: string; prozent: string; beispiel: string; muted?: boolean }

const TABLE: Row[] = [
  { alter: '1. Jahr',    prozent: '25 %',                 beispiel: '1.500 €' },
  { alter: '2. Jahr',    prozent: '20 %',                 beispiel: '1.200 €' },
  { alter: '3. Jahr',    prozent: '15 %',                 beispiel: '900 €' },
  { alter: '4. Jahr',    prozent: '10 %',                 beispiel: '600 €' },
  { alter: '5.+ Jahr',   prozent: 'Einzelfallprüfung',    beispiel: 'je nach Modell & km-Stand', muted: true },
]

export function WertminderungSandenDannerSection() {
  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby="wertminderung-heading">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            Was viele verschenken
          </p>
          <h2 id="wertminderung-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
            Wertminderung — der unsichtbare Schaden, den nur ein Gutachter sieht.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Auch nach perfekter Reparatur sinkt der Marktwert eines Unfallfahrzeugs.
            Diese <strong>merkantile Wertminderung</strong> zahlt die gegnerische
            Versicherung — meist zwischen <strong>500 € und 2.500 €</strong>.
            Werkstatt-Kostenvoranschläge berechnen sie <em>nie</em>.
          </p>

          <div className="mt-6 rounded-2xl border-l-4 border-claimondo-ondo bg-claimondo-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-claimondo-ondo">
              Rechenbeispiel
            </p>
            <p className="mt-2 text-sm text-claimondo-shield">
              VW Golf, 2 Jahre alt, Reparaturkosten 6.000 €
            </p>
            <p className="mt-1 text-sm font-bold text-claimondo-navy">
              Faustformel-Wertminderung:{' '}
              <span className="text-claimondo-ondo">1.200 €</span>{' '}
              (20 % der Reparaturkosten)
            </p>
            <p className="mt-2 text-xs text-claimondo-shield/80">
              Grundlage: Sanden/Danner-Formel · BGH VI ZR 357/03 lehnt eine starre
              Altersgrenze ab.
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
                    Fahrzeugalter
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">
                    Wertminderung (% der Reparaturkosten)
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider">
                    Beispiel bei 6.000 € Schaden
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-claimondo-border text-sm">
                {TABLE.map((r) => (
                  <tr key={r.alter} className={r.muted ? 'bg-claimondo-bg/50' : ''}>
                    <td className="px-5 py-3 font-semibold text-claimondo-navy">{r.alter}</td>
                    <td className="px-5 py-3 text-claimondo-shield">{r.prozent}</td>
                    <td className={r.muted ? 'px-5 py-3 italic text-claimondo-shield' : 'px-5 py-3 font-bold text-claimondo-ondo'}>
                      {r.beispiel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-claimondo-shield/70">
            Faustformel-Werte nach Sanden/Danner. Genauer Betrag wird im Gutachten ermittelt —
            abhängig von Marktwert, km-Laufleistung und Schadenshöhe.
          </p>
        </div>
      </div>
    </section>
  )
}
