import type { Article } from '@/lib/article-types'

// Port von ARTICLE-auffahrunfall.html (Text 1:1, Markup → Content-Layer).
// Interne Links auf /<slug> umgeschrieben. CTA/Telefon laufen ueber die
// Template-Komponenten (kein Footprint im Content).
export const auffahrunfall: Article = {
  slug: 'auffahrunfall',
  title: 'Auffahrunfall: Wer haftet — und wann der Anscheinsbeweis fällt',
  h1: 'Auffahrunfall — wer haftet wirklich?',
  h1Accent: 'Auffahrunfall',
  description:
    'Der Anscheinsbeweis spricht gegen den Auffahrenden — wann er erschüttert wird, Ihre Ansprüche als Geschädigter, Sonderfälle, Sofortmaßnahmen.',
  eyebrow: 'Schuldfrage · Schaden-Typ · 8 Min Lesezeit',
  pillar: { name: 'Schuldfrage', slug: 'schuldfrage' },
  hero: {
    src: '/heroes/auffahrunfall.png',
    alt: 'Editorial-Illustration: zwei Autos beim Auffahrunfall mit Aufprallpunkt und Abstands-Markierung — Anscheinsbeweis',
    width: 1536,
    height: 1024,
  },
  datePublished: '2026-05-22',
  dateModified: '2026-05-22',
  author: 'nicolas-kitta',
  readingNote: '~1.400 Wörter',
  quickAnswer: [
    '**Beim Auffahrunfall haftet in der Regel der Auffahrende** — es gilt der Anscheinsbeweis: zu geringer Abstand (§ 4 StVO) oder Unaufmerksamkeit.',
    'Aber dieser Anschein ist **erschütterbar**: bei grundlosem starken Bremsen, Spurwechsel kurz davor oder Zurückrollen kann es zu Mithaftung oder Haftungsumkehr kommen. Wer aufgefahren wurde, ist bei klarer Lage Geschädigter mit **vollem Anspruch nach § 249 BGB**.',
  ],
  atAGlance: [
    { term: 'Anscheinsbeweis', detail: 'gegen Auffahrenden' },
    { term: '§ 4 StVO', detail: 'Sicherheitsabstand' },
    { term: 'erschütterbar', detail: 'im Einzelfall' },
    { term: '§ 249 BGB', detail: 'voller Anspruch' },
  ],
  body: `## Wer haftet beim Auffahrunfall?

Bei einem klassischen Auffahrunfall greift der **Anscheinsbeweis** (Beweis des ersten Anscheins) zulasten des Auffahrenden. Die Lebenserfahrung sagt: Wer auf den Vordermann auffährt, hat entweder den **Sicherheitsabstand nach § 4 StVO** nicht eingehalten oder war unaufmerksam. Deshalb haftet zunächst der hintere Fahrer — er muss das Gegenteil beweisen, nicht der Geschädigte.

## Wann der Anscheinsbeweis erschüttert wird

Der Anschein ist kein Automatismus. Er kann **erschüttert** werden, wenn ein atypischer Ablauf bewiesen wird — typische Konstellationen:

- **Grundloses starkes Bremsen** des Vordermanns (kein Verkehrsgrund, „Bremser").
- **Spurwechsel kurz vor dem Auffahren:** wechselt der Vordermann unmittelbar vorher knapp ein, kann die Haftung kippen (§ 7 StVO).
- **Zurückrollen oder Zurücksetzen** des vorderen Fahrzeugs.
- **Defekte Bremslichter** des Vordermanns.

In solchen Fällen ist eine **Mithaftungsquote** oder sogar eine Haftungsumkehr möglich. Entscheidend ist der Beweis — und genau hier zählt frühe Beweissicherung. Mehr zur Beweis-Mechanik im Artikel [Anscheinsbeweis erklärt](/anscheinsbeweis-erklaert).

## Ihre Ansprüche als Geschädigter

Wurde auf Sie aufgefahren und ist die Haftung der Gegenseite klar, haben Sie nach § 249 BGB Anspruch auf vollständigen Schadensersatz:

- Reparaturkosten bzw. Wiederbeschaffungswert (bei Totalschaden),
- [merkantile Wertminderung](/merkantile-wertminderung),
- Nutzungsausfall oder Mietwagen,
- Sachverständigenkosten (eigenes [Gutachten](/gutachter-lohnt-sich) bei Schaden über ~750 €),
- Schmerzensgeld bei Verletzungen (z. B. HWS).

## Sonderfälle

- **Kettenauffahrunfall:** Mehrere Fahrzeuge — die Haftung ist oft komplex, hier hilft ein Gutachten zur Schadensabgrenzung pro Fahrzeug.
- **Auffahren im Stop-and-go / an der Ampel:** Anscheinsbeweis bleibt meist bestehen.
- **Auffahren nach Spurwechsel des Vordermanns:** häufigster Fall der Anschein-Erschütterung.

## Was direkt nach dem Auffahrunfall zu tun ist

Sichern Sie die Beweise, bevor sie verschwinden: Fotos von Endstellung, Schäden und Bremsspuren, Kontaktdaten von Zeugen, bei Personenschaden oder unklarer Lage die Polizei. Danach ein **unabhängiges Schadensgutachten** — es dokumentiert Schaden und Unfallhergang und ist die Grundlage Ihrer Forderung. Bei Fremdverschulden trägt die gegnerische Haftpflicht die Gutachterkosten.`,
  faq: [
    {
      q: 'Wer haftet beim Auffahrunfall?',
      a: 'In der Regel der Auffahrende — Anscheinsbeweis wegen zu geringem Abstand (§ 4 StVO) oder Unaufmerksamkeit. Der Anschein kann im Einzelfall erschüttert werden.',
    },
    {
      q: 'Wann wird der Anscheinsbeweis erschüttert?',
      a: 'Bei grundlosem starken Bremsen, Spurwechsel kurz davor, Zurückrollen oder defekten Bremslichtern des Vordermanns. Dann ist Mithaftung oder Haftungsumkehr möglich — muss aber bewiesen werden.',
    },
    {
      q: 'Welche Ansprüche habe ich als Aufgefahrener?',
      a: 'Bei klarer Haftung der Gegenseite voller Schadensersatz nach § 249 BGB: Reparatur/Wiederbeschaffung, Wertminderung, Nutzungsausfall/Mietwagen, Sachverständigenkosten, ggf. Schmerzensgeld.',
    },
  ],
  sources: [
    '§ 4 StVO — Sicherheitsabstand',
    '§ 7 StVO — Fahrstreifenwechsel',
    '§ 249 BGB — Schadensersatz / vollständige Wiederherstellung',
    'BGH-Rechtsprechung zum Anscheinsbeweis beim Auffahrunfall und seiner Erschütterung',
  ],
}
