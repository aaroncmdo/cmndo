import { ladeLokalinhalt } from '@/lib/lokalinhalt'

// Ortstiefe aus stadt_lokalinhalte — der Block, der diese Seite von den
// anderen LP-Seiten derselben Domain unterscheidet.
//
// Rendert NICHTS, solange kein freigegebener Inhalt vorliegt (der Normalfall,
// bis jemand ueber /admin/marketing/lokal-content erzeugt). Die Seite sieht
// dann exakt aus wie vorher — deshalb ist der Einbau regressionsfrei.
//
// Die Quellen der Unfallschwerpunkte werden MITGERENDERT und verlinkt: eine
// Ortsangabe ohne Beleg waere eine Tatsachenbehauptung ueber einen realen Ort.
// Der Read wirft Hotspots ohne abrufbare Quelle vorher raus.

export async function LokalinhaltSection({
  stadtSlug,
  stadtName,
}: {
  stadtSlug: string
  stadtName: string
}) {
  const inhalt = await ladeLokalinhalt(stadtSlug)
  if (!inhalt) return null

  const achsen = [
    ...inhalt.hauptachsen.autobahnen,
    ...inhalt.hauptachsen.bundesstrassen,
    ...inhalt.hauptachsen.knoten,
  ]

  return (
    <section id="ortstiefe" className="px-4 py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-bold text-ink">
          Unfallschwerpunkte und Stadtgebiet in {stadtName}
        </h2>

        {inhalt.topografieAnker ? (
          <p className="mt-4 text-ink/80 leading-relaxed">{inhalt.topografieAnker}</p>
        ) : null}

        {inhalt.stadtbezirke.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-ink">Wo wir in {stadtName} unterwegs sind</h3>
            <ul className="mt-3 space-y-2 text-ink/80">
              {inhalt.stadtbezirke.map((b) => (
                <li key={b.name}>
                  <strong className="text-ink">{b.name}</strong>
                  {b.ortsteile.length > 0 ? <> — {b.ortsteile.join(', ')}</> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {achsen.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-ink">Verkehrsachsen rund um {stadtName}</h3>
            <p className="mt-3 text-ink/80 leading-relaxed">{achsen.join(' · ')}</p>
          </div>
        ) : null}

        {inhalt.unfallHotspots.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-ink">Bekannte Unfallstellen</h3>
            <ul className="mt-3 space-y-4">
              {inhalt.unfallHotspots.map((h) => (
                <li key={h.ort}>
                  <strong className="text-ink">{h.ort}</strong>
                  {h.einzelfall ? (
                    <span className="ml-2 text-xs text-ink/60">(Einzelmeldung, keine Statistik)</span>
                  ) : null}
                  <p className="mt-1 text-ink/80 leading-relaxed">{h.beschreibung}</p>
                  {/* Nur das erste Token als href: gate.ts erlaubt der Quelle einen Zusatz
                      ("<url> (Polizei Bonn, 30.01.2025)") und prueft auch nur dieses. Ungeteilt
                      ergibt das einen toten Link — 57 von 107 veroeffentlichten Hotspots waren
                      betroffen. Die Trennregel muss dieselbe bleiben wie in gate.ts:211. */}
                  <a
                    href={h.quelle.split(/\s+/)[0]}
                    rel="nofollow noopener"
                    target="_blank"
                    className="mt-1 inline-block text-sm underline text-ink/60 hover:text-ink"
                  >
                    Quelle
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {inhalt.lokaleFaqs.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-ink">Fragen aus {stadtName}</h3>
            <dl className="mt-3 space-y-4">
              {inhalt.lokaleFaqs.map((f) => (
                <div key={f.frage}>
                  <dt className="font-semibold text-ink">{f.frage}</dt>
                  <dd className="mt-1 text-ink/80 leading-relaxed">{f.antwort}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {inhalt.aiGenerated ? (
          <p className="mt-8 text-xs text-ink/50">
            Ortsangaben KI-gestützt zusammengestellt und redaktionell geprüft; Unfallstellen nur mit
            benannter Quelle.
          </p>
        ) : null}
      </div>
    </section>
  )
}
