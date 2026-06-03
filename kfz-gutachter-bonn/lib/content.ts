// Cluster-AGNOSTISCHER Content (identisch ueber alle 3 Cluster). Nur der
// Stadtname/Region/Residents wird per Token interpoliert ({city}/{region}/
// {residents}). Quelle: preview-complete.html. Klone uebernehmen diese Datei
// 1:1 (kein Edit noetig — Stadt kommt aus lib/cluster.ts).

import type { City } from './cluster'

/** Ersetzt {city} / {region} / {residents} in einem Template-String. */
export function fillTokens(
  tpl: string,
  city: City,
  region: string,
): string {
  return tpl
    .replaceAll('{city}', city.name)
    .replaceAll('{region}', region)
    .replaceAll('{residents}', city.residents)
}

// ── Google-Reviews (7, statisch) ───────────────────────────────────────────
export interface Review {
  name: string
  initials: string
  avatarBg: string
  meta: string
  text: string
  /** true = echter Review-Text, false = "Bewertet mit 5 Sternen." */
  hasText: boolean
}

export const REVIEWS: Review[] = [
  { name: 'Vincent Heinen', initials: 'VH', avatarBg: '#4573A2', meta: 'vor 5 Tagen', hasText: true, text: '„Claimondo war von vorne bis hinten einfach nur super. Besonders gut hat mir das Kundenportal gefallen und die Schnelligkeit der Abwicklung.“' },
  { name: 'Kevin Privat', initials: 'KP', avatarBg: '#0D1B3E', meta: 'vor 6 Tagen · Local Guide', hasText: false, text: 'Bewertet mit 5 Sternen.' },
  { name: 'daniel bonn', initials: 'DB', avatarBg: '#1E3A5F', meta: 'vor 6 Tagen', hasText: true, text: '„Top Service! Gut erreichbar, schnell und kompetent.“' },
  { name: 'charli st.', initials: 'CS', avatarBg: '#374151', meta: 'vor 6 Tagen', hasText: false, text: 'Bewertet mit 5 Sternen.' },
  { name: 'Daniel Bundesmann', initials: 'DB', avatarBg: '#4573A2', meta: 'vor 6 Tagen', hasText: true, text: '„Vielen Dank für die hervorragende Abwicklung.“' },
  { name: 'David Nelles', initials: 'DN', avatarBg: '#0D1B3E', meta: 'vor 3 Tagen', hasText: false, text: 'Bewertet mit 5 Sternen.' },
  { name: 'Victoria Weden', initials: 'VW', avatarBg: '#1E3A5F', meta: 'vor 3 Tagen', hasText: false, text: 'Bewertet mit 5 Sternen.' },
]

/** Google-Bewertungs-Profil (UWG: Quelle sichtbar machen). */
export const GOOGLE_RATING = {
  value: '5.0',
  count: 7,
  reviewsUrl: 'https://share.google/zj25kQndK5IHp1GCQ',
} as const

// ── Praxis-Cases (5) ────────────────────────────────────────────────────────
// erstangebot = Schnell-Angebot der Versicherung · anspruch = durchgesetzt
// (mit unabh. Gutachten + Anwalt). breakdown-Summe == (anspruch - erstangebot).
// ⚠️ Bilder sind KI-Platzhalter (data-placeholder) — vor Live durch echte Fotos.
export interface CaseBreakdown {
  label: string
  betrag: number
  beleg: string
}
export interface PraxisCase {
  img: string
  label: string
  alt: string
  erstangebot: number
  anspruch: number
  breakdown: CaseBreakdown[]
}

export const CASES: PraxisCase[] = [
  {
    img: 'praxis-auffahrunfall.webp',
    label: 'Auffahrunfall an der Ampel',
    alt: 'Bremsrempler an der Ampel — Auffahrunfall mit Heckschaden',
    erstangebot: 2800,
    anspruch: 5100,
    breakdown: [
      { label: 'Korrekte Reparaturkosten (Markenwerkstatt-Sätze)', betrag: 950, beleg: 'BGH VI ZR 53/09' },
      { label: 'Merkantile Wertminderung', betrag: 650, beleg: 'BGH VI ZR 357/03 — auch ohne Verkaufsabsicht' },
      { label: 'Nutzungsausfall (Reparaturdauer)', betrag: 400, beleg: 'Sanden/Danner-Tabelle' },
      { label: 'UPE-Aufschläge + Verbringungskosten', betrag: 300, beleg: 'BGH VI ZR 401/12 · VI ZR 65/18' },
    ],
  },
  {
    img: 'praxis-parkschaden.webp',
    label: 'Parkschaden · Verursacher unbekannt',
    alt: 'Tiefer Kratzer an parkendem Auto, Verursacher unbekannt',
    erstangebot: 1850,
    anspruch: 4123,
    breakdown: [
      { label: 'Vollständige Reparaturkalkulation (statt KVA)', betrag: 1150, beleg: 'Gutachten statt KVA — verdeckte Schäden erfasst' },
      { label: 'Merkantile Wertminderung', betrag: 480, beleg: 'BGH VI ZR 357/03' },
      { label: 'Beilackierung (Farbangleichung)', betrag: 343, beleg: 'BGH VI ZR 174/24 (25.03.2025)' },
      { label: 'Nebenkosten + Ersatz Kindersitz', betrag: 300, beleg: 'Herstellervorgabe Austausch nach Unfall' },
    ],
  },
  {
    img: 'praxis-abbieger-kreuzung.webp',
    label: 'Abbieger übersieht Vorfahrt',
    alt: 'Seitenaufprall an Kreuzung nach Vorfahrtsmissachtung',
    erstangebot: 4900,
    anspruch: 8750,
    breakdown: [
      { label: 'Korrekte Reparaturkosten + verdeckte Strukturschäden', betrag: 1600, beleg: 'Schadenfeststellung hinter Stoßstange/Träger' },
      { label: 'Merkantile Wertminderung', betrag: 900, beleg: 'BGH VI ZR 357/03' },
      { label: 'Mietwagen 12 Tage (klassengleich)', betrag: 850, beleg: 'Normaltarif, Reparaturdauer' },
      { label: 'Beilackierung + UPE-Aufschläge', betrag: 500, beleg: 'BGH VI ZR 174/24 · VI ZR 401/12' },
    ],
  },
  {
    img: 'praxis-dooring-fahrrad.webp',
    label: 'Fahrradfahrer · geöffnete Autotür',
    alt: 'Fahrrad an offener Autotür — Dooring-Unfall im Stadtverkehr',
    erstangebot: 1200,
    anspruch: 3680,
    breakdown: [
      { label: 'Korrekte Reparaturkosten Tür/Türrahmen + Lack', betrag: 1180, beleg: 'Vollständige Kalkulation statt Pauschale' },
      { label: 'Merkantile Wertminderung', betrag: 400, beleg: 'BGH VI ZR 357/03' },
      { label: 'Nutzungsausfall', betrag: 350, beleg: 'Sanden/Danner-Tabelle' },
      { label: 'Heilbehandlungskosten / Auslagenpauschale', betrag: 550, beleg: '§ 249 BGB — belegpflichtig' },
    ],
  },
  {
    img: 'praxis-spurwechsel-seitenschaden.webp',
    label: 'Spurwechsel · Seitenschaden',
    alt: 'Seitenstreif-Schaden nach Spurwechsel auf mehrspuriger Straße',
    erstangebot: 3300,
    anspruch: 6420,
    breakdown: [
      { label: 'Korrekte Stundenverrechnungssätze (Markenwerkstatt)', betrag: 1250, beleg: 'BGH VI ZR 53/09' },
      { label: 'Merkantile Wertminderung', betrag: 700, beleg: 'BGH VI ZR 357/03' },
      { label: 'Nutzungsausfall', betrag: 600, beleg: 'Sanden/Danner-Tabelle' },
      { label: 'UPE-Aufschläge + Verbringungskosten', betrag: 570, beleg: 'BGH VI ZR 401/12 · VI ZR 65/18' },
    ],
  },
]

// ── Ablauf (5 Schritte) ──────────────────────────────────────────────────────
export interface AblaufStep {
  /** Icon-Key → SVG in AblaufSection. */
  icon: 'phone' | 'calendar' | 'scale' | 'car' | 'card'
  title: string
  titleAccent?: string
  text: string
  /** Nutzungsausfall-Tooltip (nur Schritt 4). */
  info?: string
}

export const ABLAUF: AblaufStep[] = [
  { icon: 'phone', title: 'Anrufen', text: 'Per Telefon oder WhatsApp melden — wir melden uns **innerhalb einer Stunde**.' },
  { icon: 'calendar', title: 'Termin vor Ort', text: 'DAT-Sachverständiger dokumentiert gerichtsfest — in der Regel **binnen 24–72 Stunden** bei Ihnen.' },
  { icon: 'scale', title: 'Anwalt inklusive', titleAccent: '— 0 €', text: '**LexDrive** kämpft für Sie gegen die Versicherung. Kosten trägt die Gegenseite.' },
  { icon: 'car', title: 'Mietwagen oder Geld', text: 'Ersatzwagen organisiert — oder Nutzungsausfall pro Tag aufs Konto. **Ihre Wahl.**', info: 'Nutzungsausfall je nach Fahrzeugklasse, typisch ca. 23–175 €/Tag (Sanden/Danner-Tabelle). Mietwagen klassengleich zum Normaltarif. Was günstiger ist, klären wir mit Ihnen.' },
  { icon: 'card', title: 'Geld aufs Konto', text: 'Reparatur, Wertminderung und Nutzungsausfall — die Versicherung zahlt **direkt aufs Konto**.' },
]

// ── Leistungen / Besichtigung (6 Schritte) ───────────────────────────────────
export interface LeistungStep {
  /** Bild in /assets/img/shared/besichtigung/ */
  img: string
  /** Spezifischer Bild-alt (Mock-exakt, SEO/a11y) statt generischem Titel. */
  alt: string
  title: string
  text: string
  badgeLabel: string
  badgeText: string
}

export const LEISTUNGEN: LeistungStep[] = [
  { img: 'schritt-1-erstaufnahme.png', alt: 'Kfz-Gutachter dokumentiert das Unfallfahrzeug', title: 'Alles aufnehmen', text: 'Zuerst halten wir Ihr Fahrzeug rundherum mit der Kamera fest und notieren alle Fahrzeugdaten.', badgeLabel: 'Vorteil:', badgeText: 'lückenlos festgehalten — keine Diskussion mit der Versicherung.' },
  { img: 'schritt-2-lackmessgeraet.png', alt: 'Lackschichtdicke und Spaltmaße werden gemessen', title: 'Lack & Spalten prüfen', text: 'Mit einem Messgerät prüfen wir Lack und Spaltmaße — alte Reparaturen werden sichtbar.', badgeLabel: 'Versteckt:', badgeText: 'alte Reparaturen & Nachlackierungen.' },
  { img: 'schritt-3-strukturschaden.png', alt: 'Verdeckte Strukturschäden hinter der Stoßstange', title: 'Hinter die Stoßstange schauen', text: 'Wir schauen dort nach, wo man von außen nichts sieht — hinter Stoßstange und Verkleidung.', badgeLabel: 'Versteckt:', badgeText: 'verbogene Träger & Crashboxen.' },
  { img: 'schritt-4-unterboden.png', alt: 'Unterboden und Achsgeometrie prüfen', title: 'Unterboden & Achse', text: 'Auf der Hebebühne prüfen wir Unterboden und Achse — ein Aufprall verzieht das oft.', badgeLabel: 'Versteckt:', badgeText: 'schiefe Achse, einseitiger Verschleiß.' },
  { img: 'schritt-5-technik.png', alt: 'Prüfung der Assistenzsysteme', title: 'Technik & Assistenten', text: 'Moderne Autos stecken voller Sensoren. Nach einem Unfall müssen die oft neu eingestellt werden.', badgeLabel: 'Versteckt:', badgeText: 'verstellte Assistenzsysteme.' },
  { img: 'schritt-6-gutachten.png', alt: 'Gerichtsfestes Gutachten wird erstellt', title: 'Gutachten & Auszahlung', text: 'Aus allem erstellen wir Ihr unabhängiges, gerichtsfestes Gutachten inklusive Wertminderung.', badgeLabel: 'Ihr Vorteil:', badgeText: 'die volle, korrekte Summe.' },
]

// ── Vergleichstabelle "Claimondo-Netzwerk" (8 Zeilen) ────────────────────────
export interface CompareRow {
  feat: string
  normal: string
  normalLink?: { href: string; label: string }
  us: string
  /** amber-Schutz-Highlight (Gegengutachten/Gegenpruefung). */
  highlight?: boolean
}

export const COMPARISON: CompareRow[] = [
  { feat: 'Wer holt das versteckte Geld raus?', normal: 'Versicherung rechnet knapp.', normalLink: { href: 'https://autounfall.io/wertminderung-249-bgb/', label: 'Wertminderung →' }, us: 'Wertminderung, Nutzungsausfall, korrekte Ersatzteilpreise' },
  { feat: 'Was, wenn die Versicherung Ihr Gutachten kürzt?', normal: 'Niemand widerspricht.', us: '**Gegengutachten + Anwalt** setzen die volle Summe durch', highlight: true },
  { feat: 'Wenn die Versicherung ihr eigenes Gutachten vorlegt?', normal: 'Sie stehen allein da.', normalLink: { href: 'https://autounfall.io/controlexpert-versicherer-pruefdienst/', label: 'Prüfdienste →' }, us: 'Wir prüfen es **fachlich gegen** (DAT-/BVSK-Standard)', highlight: true },
  { feat: 'Wer ist Ihr Ansprechpartner?', normal: 'Wechselnd / keiner', us: 'Fester persönlicher Schadensbetreuer' },
  { feat: 'Sehen Sie den Stand Ihres Falls?', normal: 'Nachfragen per Telefon', us: 'Jederzeit im eigenen Online-Portal' },
  { feat: 'Wer organisiert den Mietwagen?', normal: 'Sie selbst.', normalLink: { href: 'https://autounfall.io/mietwagen-anspruch/', label: 'Mietwagen-Anspruch →' }, us: 'Wir — steht vor Ihrer Tür' },
  { feat: 'Wer kämpft mit der Versicherung?', normal: 'Sie selbst (oder eigener Anwalt).', normalLink: { href: 'https://autounfall.io/abtretungserklaerung/', label: 'Abtretung →' }, us: 'Verkehrsanwalt **LexDrive** — inklusive' },
  { feat: 'Ihr Aufwand am Ende', normal: '**10+** Telefonate, Briefe, Wartezeit', us: '**1 Anruf**' },
]

// ── FAQ (5 kuratiert, v3-praxis-v2) ── strukturiert: reiche UI + Plain-Text-JSON-LD ──
// Sync-Pflicht (SEA, Aaron-Direktive): faqAnswerText() baut den Schema-Plain-Text aus
// DENSELBEN Teilen wie die sichtbare FaqAccordion -> UI und JSON-LD bleiben deckungsgleich.
export interface FaqBullet {
  strong: string
  rest: string
}
export interface FaqEntry {
  /** Frage ({city}/{region}-Token). */
  q: string
  /** 0-Euro-Amber-Badge (nur Q1). */
  badge?: string
  /** Antwort-Haupttext ({city}-Token). */
  intro: string
  /** Q2: Hauptachsen-Liste anhaengen (aus CLUSTER.achsen). */
  axes?: boolean
  /** Q4: Trust-Bullet-Liste mit Icon. */
  bullets?: FaqBullet[]
  /** Q4: kursive Schluss-Sentenz. */
  schluss?: string
  /** Q5: Werkstatt-Andock-CTA-Text ({city}-Token). */
  workshop?: string
}

export const FAQ: FaqEntry[] = [
  {
    q: 'Was kostet das Gutachten?',
    badge: '0 €',
    intro:
      'Bei unverschuldetem Unfall in **{city}** 0 €. Die gegnerische Haftpflichtversicherung trägt alle Kosten — inkl. **Anfahrt zu Ihnen nach Hause, an die Unfallstelle oder zur Werkstatt**. Bei Kaskoschäden richtet sich der Preis nach der Schadenhöhe.',
  },
  {
    q: 'Wann brauche ich einen Gutachter?',
    intro:
      'Ab etwa **750 €** Schaden oder wenn die Schuldfrage unklar ist. Idealerweise noch am Unfalltag, damit alle Spuren gesichert werden. Wir sind in **{city}** in der Regel **in 60 Minuten vor Ort** — auch über die Hauptachsen',
    axes: true,
  },
  {
    q: 'Darf ich frei wählen?',
    intro:
      'Ja. **§ 249 BGB** sichert Ihnen das Recht auf **freie Gutachterwahl** bei unverschuldetem Unfall. Die gegnerische Versicherung darf Ihnen keinen eigenen Sachverständigen vorschreiben — auch wenn sie es manchmal versucht.',
  },
  {
    q: 'Was bedeutet „Claimondo-Partner“?',
    intro:
      'Ihr Sachverständiger vor Ort in **{city}** ist zertifizierter Partner im Claimondo-Netzwerk (über 90 Sachverständige in NRW). Sie bekommen **alles aus einer Hand**:',
    bullets: [
      { strong: 'DAT-Gutachten', rest: 'ingenieurbasiert & gerichtsfest' },
      { strong: 'Verkehrsrechts-Anwalt', rest: 'LexDrive Partnerkanzlei' },
      { strong: 'Mietwagen', rest: 'solange Ihr Auto ausfällt' },
      { strong: 'Live-Tracking', rest: 'jeder Schritt im Portal sichtbar' },
    ],
    schluss: 'Bis zur vollständigen Auszahlung. Ihr Aufwand: ein Anruf.',
  },
  {
    q: 'Gutachter oder Werkstatt?',
    intro:
      'Beides hat einen Platz. Die Werkstatt repariert — bewertet aber **nicht neutral**. Ein unabhängiger Kfz-Gutachter dokumentiert den Schaden gerichtsfest und sichert Ihren vollen Anspruch — Wertminderung, Nutzungsausfall, Mietwagen.',
    workshop: 'Wir kommen **auch in Ihre Werkstatt in {city}** — bringen Sie das Gutachten mit, der Rest läuft.',
  },
]

/** Plain-Text-Antwort fuer JSON-LD — aus denselben Teilen wie die sichtbare FAQ (Sync garantiert). */
export function faqAnswerText(e: FaqEntry, city: City, region: string, achsen: string[]): string {
  let t = fillTokens(e.intro, city, region)
  if (e.axes) t += ' ' + achsen.join(' · ') + '.'
  if (e.bullets) t += ' ' + e.bullets.map((b) => `${b.strong} — ${b.rest}`).join('. ') + '.'
  if (e.schluss) t += ' ' + e.schluss
  if (e.workshop) t += ' ' + fillTokens(e.workshop, city, region)
  return t.replaceAll('**', '') // Bold-Marker raus -> reiner Plain-Text fuer JSON-LD
}

// ── Ratgeber-Karten (4) ──────────────────────────────────────────────────────
export interface RatgeberCard {
  topic: string
  eyebrow: string
  title: string
  text: string
  href: string
  icon: 'euro' | 'file' | 'user' | 'check'
  /** Banner-Bild (autounfall-io-Hero) in /assets/img/ratgeber/ — passt zum verlinkten Artikel. */
  img: string
}

export const RATGEBER: RatgeberCard[] = [
  { topic: 'kosten', eyebrow: 'Kosten', title: 'Was kostet ein Kfz-Gutachter?', text: 'Wer das Gutachten zahlt, wie hoch das Honorar üblicherweise ist — und warum bei einem unverschuldeten Unfall 0 € auf Sie zukommen.', href: 'https://autounfall.io/gutachter-kosten/', icon: 'euro', img: 'gutachter-kosten.webp' },
  { topic: 'arten', eyebrow: 'Gutachten-Arten', title: 'Haftpflicht, Kasko, Beweis — welches Gutachten?', text: 'Der Unterschied zwischen den Gutachten-Arten — und welches in Ihrem Fall die Versicherung anerkennen muss.', href: 'https://autounfall.io/gutachten-arten/', icon: 'file', img: 'gutachten-arten.webp' },
  { topic: 'wer-beauftragt', eyebrow: 'Wer beauftragt?', title: 'Wer darf den Gutachter beauftragen?', text: 'Die gegnerische Versicherung darf Ihnen keinen Gutachter aufzwingen. Sie wählen — und wir erklären, warum das so wichtig ist.', href: 'https://autounfall.io/gutachter-wer-beauftragt/', icon: 'user', img: 'gutachter-wer-beauftragt.webp' },
  { topic: 'lohnt-sich', eyebrow: 'Entscheidungs-Hilfe', title: 'Lohnt sich ein eigener Gutachter?', text: 'Ab welcher Schadenshöhe ein unabhängiges Gutachten Sinn macht — und welche Posten ohne Gutachten regelmäßig untergehen.', href: 'https://autounfall.io/gutachter-lohnt-sich/', icon: 'check', img: 'gutachter-lohnt-sich.webp' },
]
