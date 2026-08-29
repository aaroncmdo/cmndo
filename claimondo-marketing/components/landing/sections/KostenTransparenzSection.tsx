import { getTranslations } from 'next-intl/server'

// Warum ist das fuer Sie kostenlos? — die Antwort auf die haeufigste unausge-
// sprochene Frage vor dem Absenden.
//
// ANLASS (Aaron 29.08.2026): "auf keiner webseite wird erklaert wie wir unser
// geld verdienen […] viele kunden haben angst dass die was zahlen muessen."
// Nachgemessen ueber alle Marketing-Messages: "0 €" steht 233x, "kostenlos"
// 73x — "Provision"/"verdienen" zusammen 7x, und davon stand jeder Treffer auf
// der PARTNER-Seite, die kein Endkunde liest. Wir behaupten also ueber 300x
// "gratis" und begruenden es fast nie. Ohne Begruendung erzeugt genau das
// Misstrauen ("wo ist der Haken?") statt Vertrauen.
//
// Bewusst KEINE weitere Kennzahl-Kachel: die HomeTrustStripSection direkt
// darueber ist bereits ein Zahlenband. Bei einem Vertrauensthema traegt ein
// direkter Satz weiter als eine grosse Ziffer — und die drei Negativ-Aussagen
// ("keine Anmeldegebuehr, keine Vermittlungsgebuehr, keine Rechnung") beant-
// worten die Angst konkreter als jedes "0 €" es koennte.
//
// Inhaltlich gedeckt: Sachverstaendige zahlen eine Plattform-Provision fuer
// vermittelte Auftraege — so steht es auf /gutachter-partner ("Die konkrete
// Plattform-Provision haengt von Auftragsvolumen und Region ab"). Werkstaetten
// zahlen NICHT; dort laeuft es umgekehrt (wir zahlen fuer Inbound-Vermittlung,
// siehe memory/broadcast-provision-modell-inbound-haftpflicht-only). Deshalb
// nennt der Text ausdruecklich nur die Sachverstaendigen.

export async function KostenTransparenzSection() {
  const t = await getTranslations('landing.kosten_transparenz')
  const punkte = t.raw('punkte') as string[]

  return (
    <section className="border-b border-claimondo-border/60 bg-claimondo-bg" aria-labelledby="kosten-transparenz">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-claimondo-ondo">
              {t('eyebrow')}
            </p>
            <h2
              id="kosten-transparenz"
              className="mt-3 text-balance text-3xl font-extrabold leading-tight tracking-tight text-claimondo-navy sm:text-4xl"
            >
              {t('heading')}
            </h2>
          </div>

          <div className="max-w-prose">
            <p className="text-lg leading-relaxed text-claimondo-navy">{t('absatz1')}</p>
            <p className="mt-5 text-base leading-relaxed text-claimondo-shield">{t('absatz2')}</p>

            <ul className="mt-8 space-y-3">
              {punkte.map((p) => (
                <li key={p} className="flex gap-3 text-base text-claimondo-navy">
                  <span
                    aria-hidden
                    className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-claimondo-ondo"
                  />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
