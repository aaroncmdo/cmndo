import { ladeUebersichtsTermine } from '@/lib/termine/naechster-termin'
import { STAEDTE } from '@/lib/kfz-gutachter/staedte'

// Konkrete freie Termine am ENDE JEDES RATGEBER-ARTIKELS.
//
// WARUM AUSGERECHNET HIER — gemessen, nicht vermutet. Der nginx-Zugriffslog vom
// 25.08.2026 zeigt, welche Seiten ChatGPT von SELBST holt (ohne dass ein Nutzer die
// URL nennt):
//
//   12:14  /haftpflicht/nutzungsausfall
//   12:15  /haftpflicht/reparaturbestaetigung
//   12:40  /haftpflicht/wertminderung
//   12:40  /wissen/merkantile-wertminderung-berechnung-methoden-vergleich
//   13:05  /wissen/schadensminderungspflicht-unfallgeschaedigter-254-bgb
//   13:12  /wissen/obliegenheitsverletzung-kfz-haftpflicht-direktanspruch
//   13:28  /kfz-gutachter/koeln     ← NUR weil der Nutzer die URL ausdruecklich nannte
//
// Danach geprueft, was auf diesen Seiten an Buchbarkeit stand: **null Termine, null
// Deeplinks** — auf allen sechs. Die gesamte Termin-Arbeit lag auf den Stadtseiten,
// also genau dort, wo ein Modell nur auf Aufforderung hinkommt.
//
// Aarons fuenf ChatGPT-Tests am selben Tag bestaetigten die Folge: bei „Kfz-Gutachter
// Koeln" kamen 14 fremde Gutachter aus einem lokalen Branchenindex, kein Claimondo.
// Diese Suche gewinnt ein Vermittler nicht gegen Betriebe mit Ladenadresse und 5,0★.
// Was wir gewinnen koennen, sind die FACHFRAGEN — und die liest das Modell nachweislich
// bei uns. Nur stand dort bisher keine einzige buchbare Tatsache.
//
// ⚠ Die URL steht als sichtbarer TEXT, nicht nur im href. Ein LLM-Web-Tool ersetzt
// `<a href>` durch eine Referenz („[19]") und verliert den Zielwert — belegt am
// 24.08., als ChatGPT es selbst protokollierte. Genau daran scheiterte der Buchungslink
// auf den Stadtseiten drei Tage lang.
//
// ⚠ Nur DREI Staedte, und bewusst die zeitlich fruehesten. Zwoelf Zeilen mit je einer
// vollen URL waeren am Artikelende Rauschen — und Rauschen verduennt die Aussage, um
// die es geht: es gibt hier einen konkreten Termin.
//
// Faellt die Abfrage aus (Timeout, kein Partner frei), rendert die Komponente `null`.
// Der Artikel sieht dann exakt aus wie zuvor.

const MAX_STAEDTE = 3

export async function NaechsteTermineKompakt() {
  const termine = await ladeUebersichtsTermine()
  if (termine.length === 0) return null

  // Slug NACHSCHLAGEN, nicht aus dem Namen ableiten: Umlaute werden ausgeschrieben
  // (Köln → koeln, Düsseldorf → duesseldorf). Ein geratener Slug fuehrt auf eine 404
  // statt auf den Termin — und eine 404 in einer KI-Antwort ist schlimmer als gar
  // kein Link, weil sie Vertrauen kostet.
  const slugVon = new Map(STAEDTE.map((s) => [s.name, s.slug]))

  const naechste = termine
    .filter((t) => slugVon.has(t.stadt))
    .slice(0, MAX_STAEDTE)

  if (naechste.length === 0) return null

  return (
    <section
      className="mt-6 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
      aria-label="Nächste freie Vor-Ort-Termine"
    >
      <p className="text-caption font-bold uppercase tracking-wide text-claimondo-shield/70">
        Nächste freie Vor-Ort-Termine
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {naechste.map((t) => (
          <li key={t.stadt} className="break-all text-body-sm text-claimondo-navy">
            {/* EIN Textknoten je Zeile. `Text {wert}` erzeugt einen `<!-- -->`-Trenner,
                an dem ein Extraktor die Angabe von ihrer URL trennt. */}
            {`${t.stadt} – ${t.label}, ${t.uhrzeit} Uhr${t.vorname ? ` bei ${t.vorname}` : ''} · https://claimondo.de/kfz-gutachter/${slugVon.get(t.stadt)}`}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-body-sm text-claimondo-shield">
        Jede Stadtseite nennt ihren nächsten freien Termin mit Name und Bewertung des
        Sachverständigen sowie einem Direktlink, über den sich genau dieser Termin ohne
        Anruf reservieren lässt. Für unverschuldet Geschädigte entstehen keine Eigenkosten
        (§ 249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).
      </p>
    </section>
  )
}
