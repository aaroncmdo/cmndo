import { EinstiegClient } from './EinstiegClient'

/**
 * Zustand 1 — Modus-Wahl und Standort (CONTRACT F-01).
 *
 * Server Component: der Rahmen ist statisch, nur die Formularlogik (Karte
 * waehlen -> Felder erscheinen) braucht den Client.
 */
export default function Startseite() {
  return (
    <main className="min-h-dvh bg-nacht text-chrom">
      <div className="mx-auto max-w-[1120px] px-[26px] py-20 md:py-24">
        <p className="display text-sm tracking-[0.16em] text-signal">
          Sichtbarkeits-Check für Kfz-Sachverständige
        </p>

        {/*
          ⚠ Die Ueberschrift traegt das Suchwort, nicht nur die Frage.
          „Wo stehen Sie gerade?" war gestalterisch stark und fuer die Suche
          wertlos — kein einziges Wort, nach dem jemand sucht. Die H1 ist das
          staerkste Signal einer Seite; sie darf die Frage stellen, muss aber
          sagen, worum es geht.
        */}
        <h1 className="display mt-3 text-white" style={{ fontSize: 'clamp(2.3rem, 5.6vw, 4.2rem)' }}>
          Wo steht Ihr
          <br />
          Sachverständigenbüro?
        </h1>

        <p className="mt-4 max-w-[62ch] text-[1.14rem] leading-relaxed text-white/80">
          Zwei Wege, ein Check. Wer gerade aufbaut, braucht andere Zahlen als wer seit zehn Jahren
          im Markt ist. Jede Zahl bekommt eine Quelle und ein Datum; was nicht messbar ist, wird als
          solches vermerkt — und nicht durch eine Null ersetzt.
        </p>

        <EinstiegClient />

        <p className="mt-14 max-w-[62ch] text-xs leading-relaxed text-white/40">
          Der Check ist anonym: es entsteht kein Kundenkonto und kein Eintrag in einer
          Interessentenliste. Gespeichert werden der Prüfauftrag und seine Ergebnisse, damit Sie
          den Link später erneut öffnen können.
        </p>
      </div>
    </main>
  )
}
