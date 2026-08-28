import { ladeUebersichtsTermine } from '@/lib/termine/naechster-termin'

// Freie Vor-Ort-Termine als schmaler Streifen auf der STARTSEITE.
//
// WARUM HIER: Auswertung der nginx-Zugriffslogs vom 24.08.2026 (14 Stunden) — die
// KI-Crawler rufen die Startseite **26×** ab (OAI-SearchBot 62, ChatGPT-User 60,
// ClaudeBot 43, PerplexityBot 37 Zugriffe insgesamt), die Stadtseiten dagegen 16×
// und llms.txt genau **1×**. Die meistgelesene Seite trug bis hierher keine einzige
// Aussage darüber, WANN jemand einen Termin bekommt.
//
// Das ist der Unterschied zu jedem Wettbewerber: andere haben Texte über Gutachter,
// wir haben eine konkrete, heute gültige Verfügbarkeit samt fertigem Buchungslink.
// Ein Modell, das eine konkrete Frage beantworten soll, nimmt die konkrete Quelle.
//
// Bewusst KEINE Slot-Liste und keine Anzahl — nur der früheste Termin je Stadt
// (Aaron-Entscheidung 24.08.): das verrät die Auslastung des Netzes nicht.
//
// Fällt die Abfrage aus oder ist gerade nirgends etwas frei, rendert die Komponente
// `null` — die Startseite sieht dann exakt aus wie zuvor.
//
// ⭐ 28.08.2026 — NACHGEMESSEN, und der Streifen erfüllte seinen eigenen Zweck nicht.
//
// Der Log über alle rotierten access.logs zeigt inzwischen 19.158 KI-Zugriffe, davon
// 5.486 mit `ChatGPT-User` — dem Agent, mit dem ChatGPT eine Seite holt, WÄHREND ein
// Nutzer fragt. Die Startseite ist mit 357 Abrufen sein häufigstes Ziel. Trotzdem meldete
// die Messung des ausgelieferten TEXTES: keine Uhrzeit, keine buchbare URL. 464 KB HTML
// ohne eine einzige buchbare Tatsache.
//
// Drei Ursachen, alle in dieser Datei:
//   1. Die URL stand nur im `href`. Ein LLM-Web-Tool ersetzt `<a href>` durch eine
//      nummerierte Referenz und verliert den Zielwert — dieselbe Falle, die den
//      Buchungslink auf den Stadtseiten drei Tage lang wirkungslos machte.
//   2. `t.label` ist „Freitag, 28.08." — ein DATUM. Ohne `t.uhrzeit` ist das keine
//      Terminangabe, und genau die Uhrzeit ist das, was ein Modell zitieren kann.
//   3. Drei `<span>`-Fragmente statt eines Textknotens.
//
// 2 und 3 sind hier behoben. Für die sichtbare URL ist der schmale Streifen der falsche
// Ort (3 × ~125 Zeichen sprengen das Layout) — sie steht deshalb im
// `NaechsteTermineKompakt`-Block vor dem Footer, im selben Muster wie auf den ~30
// Ratgeber-Seiten.

export async function VerfuegbarkeitStreifen() {
  const termine = await ladeUebersichtsTermine()
  if (termine.length === 0) return null

  return (
    <section className="border-y border-claimondo-border bg-white py-4" aria-label="Freie Vor-Ort-Termine">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5">
        <p className="text-caption font-bold uppercase tracking-wide text-claimondo-shield/70">
          Nächste freie Vor-Ort-Termine
        </p>
        {termine.map((t) => (
          <a
            key={t.stadt}
            href={t.buchungsUrl}
            className="text-body-sm text-claimondo-navy transition-colors hover:text-claimondo-ondo"
          >
            {/* EIN Textknoten, und MIT Uhrzeit — siehe Kopfkommentar. Die drei frueheren
                <span>-Fragmente zerfielen beim Text-Strippen, und ohne Zeit ist „Freitag,
                28.08." keine Terminangabe, sondern ein Datum. */}
            {`${t.stadt} · ${t.label}, ${t.uhrzeit} Uhr${t.vorname ? ` · ${t.vorname}` : ''}`}
          </a>
        ))}
      </div>
    </section>
  )
}
