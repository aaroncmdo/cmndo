import { EinstiegClient } from './EinstiegClient'

/**
 * Zustand 1 — Modus-Wahl und Standort (CONTRACT F-01).
 *
 * Aufbau woertlich nach `mockup-levelup_3`: dunkler Kopf, Signalstreifen,
 * dunkler Hero als BLOCK auf heller Flaeche, darunter helle Abschnitte.
 *
 * ⚠ Die erste Fassung war durchgehend dunkel. Die Farbtokens stimmten dabei
 * exakt — es fehlte der KONTRAST. Eine Palette, die nur auf einer Flaeche
 * liegt, wirkt voellig anders als dieselbe Palette in Bloecken.
 */
export default function Startseite() {
  return (
    <>
      <header className="kopf">
        <div className="huelle">
          <span className="logo">
            <span className="plakette">SV</span> LevelUp
          </span>
          <span className="text-sm text-white/45">Für Kfz-Sachverständige</span>
        </div>
      </header>

      <div className="streifen" />

      <main className="min-h-dvh bg-flaeche text-text">
        <section className="hero">
          <div className="huelle py-4">
            <p className="augbraue">Kostenlos · Ergebnis in 10 Minuten</p>

            <h1
              className="display mt-3 text-white"
              style={{ fontSize: 'clamp(2.3rem, 5.6vw, 4.2rem)' }}
            >
              Auf welchem <em>Level</em>
              <br />
              steht Ihr Büro?
            </h1>

            <p className="mt-5 max-w-[62ch] text-[1.17rem] leading-relaxed text-white/80">
              Wir nehmen Ihre Website, Ihr Google-Profil und die Konkurrenz im Umkreis auf den
              Prüfstand. Jede Zahl bekommt eine Quelle und ein Datum; was sich nicht messen lässt,
              wird als solches vermerkt und nicht durch eine Null ersetzt.
            </p>

            <EinstiegClient />
          </div>
        </section>

        {/*
          Der helle Abschnitt ist kein Beiwerk: Er gibt dem dunklen Hero seine
          Kante. Drei Sätze zu dem, was den Check von einem Verkaufsgespräch
          unterscheidet — keine Kachelreihe mit Symbolen.
        */}
        <section className="abschnitt abschnitt-hell">
          <div className="huelle">
            <p className="augbraue">Was Sie bekommen</p>
            <div className="mt-7 grid gap-10 md:grid-cols-3">
              <div>
                <h2 className="display text-[1.3rem] text-ink">Gemessen, nicht geschätzt</h2>
                <p className="mt-2 max-w-[38ch] leading-relaxed">
                  Jede Zahl im Befund nennt, woher sie stammt und wann sie erhoben wurde. Sie
                  können jede einzelne nachprüfen.
                </p>
              </div>
              <div>
                <h2 className="display text-[1.3rem] text-ink">Ihr Umkreis, nicht die Branche</h2>
                <p className="mt-2 max-w-[38ch] leading-relaxed">
                  Verglichen wird mit den Büros, die tatsächlich neben Ihnen sitzen — nicht mit
                  einem bundesweiten Durchschnitt, den niemand kennt.
                </p>
              </div>
              <div>
                <h2 className="display text-[1.3rem] text-ink">Auch die Lücken</h2>
                <p className="mt-2 max-w-[38ch] leading-relaxed">
                  Was sich nicht erheben ließ, steht als Lücke da — mit dem Grund dahinter. Eine
                  Null wäre eine Behauptung.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="abschnitt">
          <div className="huelle">
            <p className="max-w-[64ch] text-sm leading-relaxed text-muted">
              Der Check ist anonym: Es entsteht kein Kundenkonto und kein Eintrag in einer
              Interessentenliste. Gespeichert werden der Prüfauftrag und seine Ergebnisse, damit
              Sie den Link später erneut öffnen können.
            </p>
          </div>
        </footer>
      </main>
    </>
  )
}
