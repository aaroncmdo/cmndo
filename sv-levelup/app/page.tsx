/**
 * Einstiegsseite. In P3 kommt hier die Modus-Wahl (Weg A Aufbau / Weg B
 * Bestand) plus das URL-Feld hin, das erst nach der Wahl erscheint
 * (CONTRACT F-01, Zustand 1 aus mockup-levelup-v2.html).
 *
 * Fuer P1 ist das der Build- und Deploy-Nachweis: die Marke steht, die
 * Tokens greifen, das Projekt rendert.
 */
export default function Startseite() {
  return (
    <main className="min-h-dvh bg-nacht text-chrom">
      <div className="mx-auto max-w-[1120px] px-[26px] py-24">
        <p className="text-signal display text-sm tracking-[0.16em]">
          Sichtbarkeits-Check für Kfz-Sachverständige
        </p>

        <h1 className="display mt-3 text-white" style={{ fontSize: 'clamp(2.3rem, 5.6vw, 4.2rem)' }}>
          Wo stehen Sie
          <br />
          gerade?
        </h1>

        <p className="mt-4 max-w-[60ch] text-[1.14rem] leading-relaxed text-white/80">
          Zwei Wege, ein Check. Wer gerade aufbaut, braucht andere Zahlen als wer seit zehn Jahren
          im Markt ist. Jede Zahl bekommt eine Quelle und ein Datum; was nicht messbar ist, wird als
          solches vermerkt — und nicht ersetzt.
        </p>

        <p className="mt-12 text-sm text-white/45">
          Die Auswahl des Prüfumfangs entsteht im nächsten Bauabschnitt.
        </p>
      </div>
    </main>
  )
}
