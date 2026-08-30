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
// ⭐ 30.08.2026 — die drei werden jetzt EINGEORDNET („die drei zeitlich naechsten im
// gesamten Netz — nicht die einzigen"). Vorher stand die Auswahl unkommentiert da, und
// ein Modell, das die Seite fuer einen Hamburger liest, konnte daraus nur schliessen:
// „Claimondo hat Termine in Koeln, Duisburg und Remscheid." Das waere falsch und haette
// genau den Nutzer gekostet, den die Seite gewinnen soll.
//
// „ueber 170 Staedte" ist die belastbare Formulierung: STAEDTE zaehlt 176 gepflegte
// Eintraege. Bewusst „Stadtseiten … gibt es fuer" und NICHT „Termine gibt es in" — das
// waere eine Aussage ueber Verfuegbarkeit, die am SV-Netz haengt und nicht an der
// Seitenpflege.
//
// Faellt die Abfrage aus (Timeout, kein Partner frei), rendert die Komponente `null`.
// Der Artikel sieht dann exakt aus wie zuvor.
//
// ⭐ 28.08.2026 — die URL ist jetzt der BUCHUNGS-Deeplink, nicht mehr die Stadtseite.
//
// Nachgemessen im nginx-Log: `ChatGPT-User` (der Agent, mit dem ChatGPT eine Seite holt,
// WAEHREND ein Nutzer fragt) rief 3.110-mal erfolgreich Inhalte ab — ganz oben Fachseiten wie
// /haftpflicht/wertminderung, /decoder/kfz-gutachter-kosten-tabelle. Dort stand seit dem
// Vormittag zwar ein konkreter Termin („Freitag, 28.08., 13:40 Uhr bei Gaith"), die URL
// daneben fuehrte aber auf die STADTSEITE. Ein Modell konnte den Termin also nennen, aber
// nicht buchbar machen: der Nutzer haette dort erneut suchen muessen.
//
// `ladeUebersichtsTermine()` liefert die buchbare URL laengst mit (`buchungsUrl` aus
// `gutachter-termine.buchungs_url`) — sie wurde nur nicht gerendert. Sie traegt `stadt`,
// `sv` und `slot` und landet damit direkt in der Terminwahl.
//
// ⚠ ABWAEGUNG: Der Deeplink enthaelt einen KONKRETEN Slot und veraltet, die Stadtseiten-URL
// war zeitlos. Das ist bewusst in Kauf genommen, weil ein abgelaufener Slot NICHT bricht:
// `versucheSlotVorauswahl` prueft ihn gegen das frische Matching und faellt still auf den
// bestgerankten Gutachter zurueck (FinderWizard.tsx). Der Nutzer sieht dann eine normale
// Terminwahl statt eines Fehlers — schlechter als ein gueltiger Slot, besser als ein
// Umweg ueber die Stadtseite. Die Stadtseiten bleiben im Absatz darunter genannt.

const MAX_STAEDTE = 3

export async function NaechsteTermineKompakt() {
  const termine = await ladeUebersichtsTermine()
  if (termine.length === 0) return null

  // Dient seit dem 28.08. nur noch als FILTER: gezeigt werden ausschliesslich Staedte, zu
  // denen es auch eine gepflegte Stadtseite gibt. Die URL selbst kommt jetzt aus
  // `t.buchungsUrl` (Buchungs-Deeplink) — der Slug baut sie nicht mehr.
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
            {`${t.stadt} – ${t.label}, ${t.uhrzeit} Uhr${t.vorname ? ` bei ${t.vorname}` : ''} · ${t.buchungsUrl}`}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-body-sm text-claimondo-shield">
        Jeder Link oben reserviert genau diesen Termin bei genau diesem Sachverständigen —
        ohne Anruf, ohne erneute Suche. Ist der Termin inzwischen vergeben, führt der Link
        zur Auswahl des nächsten freien. Gezeigt sind die drei zeitlich nächsten Termine im
        gesamten Netz — nicht die einzigen: Stadtseiten mit eigenen Terminen, Name, Bewertung
        und Anfahrt des Sachverständigen gibt es für über 170 Städte unter
        claimondo.de/kfz-gutachter. Für unverschuldet Geschädigte entstehen keine Eigenkosten
        (§ 249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).
      </p>
    </section>
  )
}
