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

// ── Google-Reviews (BRIEF 08i: Aaron-kuratierte Whitelist, GBP 2026-06-10) ──
// ORIGINAL-Zitate aus dem GBP — exakt uebernommen, Kuerzungen NUR per „…",
// NIE umformulieren (Bewertungsrecht). Reihenfolge = Whitelist = Slot-Logik
// (Desktop 1-6, Tablet 1-4, Mobile 1+2+5). Themen-Logik fuer kuenftige Pflege:
// Portal/Auszahlung · Schadensfall · Mietwagen/Anwalt · Regulierung ·
// Schnelligkeit · WhatsApp. Ersatzbank (falls Review aus GBP verschwindet):
// Philip Puhl, daniel bonn, Leon Conrady (Texte in BRIEF_08i).
// Relative Zeiten: im 08i-Datenstand nicht mitgeliefert -> leer (nichts
// erfinden); Feld bleibt fuer den GBP-Sync.
export interface Review {
  name: string
  initials: string
  avatarBg: string
  meta: string
  text: string
  /** true = echter Review-Text, false = "Bewertet mit 5 Sternen." */
  hasText: boolean
  /** Google "Local Guide"-Badge (Authority-Anzeige). */
  localGuide?: boolean
}

export const REVIEWS: Review[] = [
  { name: 'Vincent Heinen', initials: 'VH', avatarBg: '#4573A2', meta: '', hasText: true, text: '„Claimondo war von vorne bis hinten einfach nur super. Besonders gut hat mir das Kundenportal gefallen und die schnelle Auszahlung. Die Gutachter haben kompetent und zuverlässig gearbeitet. Ich musste mich um nichts kümmern und würde Claimondo jederzeit weiterempfehlen!“' },
  { name: 'V. R.', initials: 'VR', avatarBg: '#0D1B3E', meta: '', hasText: true, localGuide: true, text: '„Ich bin sehr positiv überrascht gewesen, wie unkompliziert und schnell der Service durch Claimondo erfolgte. Als ich Opfer eines Parkremplers wurde, wusste ich erstmal auch nicht, was ich machen sollte … Claimondo … organisierten mir schnell einen Gutachtertermin und unterstützten mich in der Abwicklung von A bis Z!“' },
  { name: 'Jan', initials: 'J', avatarBg: '#1E3A5F', meta: '', hasText: true, text: '„Schaden wurde gut betreut und vor allem wurde sich um Mietwagen und Kommunikation mit den Rechtsanwälten gekümmert. Kann ich nur empfehlen.“' },
  { name: 'Busra Sevim', initials: 'BS', avatarBg: '#374151', meta: '', hasText: true, text: '„Der Service ist super! Der Gutachter hat super Arbeit geleistet und die Kanzlei hat schnell reguliert. Ich bin sehr zufrieden und kann es nur weiter empfehlen.“' },
  { name: 'Lyubomir Bodurov', initials: 'LB', avatarBg: '#4573A2', meta: '', hasText: true, text: '„Unerwartet schnelle Bearbeitung. Besonders freundlicher Kontakt! Kann nur empfehlen!“' },
  { name: 'Laura Kolde', initials: 'LK', avatarBg: '#0D1B3E', meta: '', hasText: true, text: '„Super Service, auch gute Idee über WhatsApp. Werde euch weiter empfehlen“' },
]

/** Google-Bewertungs-Profil (UWG: Quelle sichtbar machen).
 *  gbpReviewCount = echte Gesamtzahl aus dem GBP (BRIEF 08i, Inhaber-Ansicht
 *  2026-06-10: 5,0 · 22 Rezensionen) — Datenfeld, wird beim Sync aktualisiert;
 *  nirgends hardcoden (Eyebrow + aggregateRating lesen von hier). */
export const GOOGLE_RATING = {
  value: '5.0',
  gbpReviewCount: 22,
  reviewsUrl: 'https://share.google/zj25kQndK5IHp1GCQ',
} as const

// ── Hero-Features (08n N11c: EIN Datenfeld fuer Mobile + sm+) ───────────────
// Entscheid Aaron 2026-06-10: "alles aus einer Hand" + "Versicherung kuerzt?
// Wir holen mit Gegengutachten nach" fliegen aus dem Hero. sm+ zeigt 3
// Features (2.500+ steht dort schon in der Trust-Zeile — kein Doppel),
// Mobile 4 (Mobile-Trust hat kein 2.500+). Beide Sets aus DIESER Quelle —
// Format-Flags statt divergierender Markup-Varianten. {city}-Token wird in
// der HeroSection mit dem Akzent-Span (.loc-uspsm) gerendert.
export interface HeroFeature {
  /** Icon-Key — SVGs liegen in HeroSection (FEATURE_ICON). */
  icon: 'shield' | 'clock' | 'chart' | 'check'
  /** Sichtbar <640 */
  mobile: boolean
  /** Sichtbar >=640 */
  desktop: boolean
  /** Basis-Text ({city}-Token erlaubt) */
  text: string
  /** Optionaler kuerzerer Mobile-Wortlaut (sonst text) */
  textMobile?: string
}

export const HERO_FEATURES: HeroFeature[] = [
  {
    icon: 'shield',
    mobile: true,
    desktop: true,
    text: 'Gutachten, Anwalt & Mietwagen — komplett koordiniert',
    textMobile: 'Gutachten, Anwalt, Mietwagen',
  },
  { icon: 'clock', mobile: true, desktop: true, text: 'In 60 Min vor Ort in {city}' },
  { icon: 'chart', mobile: true, desktop: false, text: '2.500+ Schäden begleitet' },
  { icon: 'check', mobile: true, desktop: true, text: '10+ Jahre Erfahrung' },
]

// ── Praxis-Cases (5) ────────────────────────────────────────────────────────
// erstangebot = Schnell-Angebot der Versicherung · anspruch = durchgesetzt
// (mit unabh. Gutachten + Anwalt). breakdown-Summe == (anspruch - erstangebot).
// ── Partner-Zeile (08o O3: EIN Datenfeld fuer alle drei Lockups) ─────────────
// Vorher drei Varianten (Mobile-Hero "CLAIMONDO UNFALL-ASSISTANCE/PARTNER",
// sm+-Hero "Zertifizierter Claimondo-Partner/Unfall-Assistance", Buero mit
// "...Schadenregulierung aus einer Hand"-Zusatz). brand wird in den Komponenten
// mit <ClaimondoLink> gewrappt.
export const PARTNER_LINE = {
  pre: 'Zertifizierter',
  brand: 'Claimondo-Partner',
  sub: 'Unfall-Assistance',
} as const

// ── Netzwerk-Personen-Karten (08o O2: ersetzen die Icon-Spalten) ─────────────
// EIN Datenfeld, wortgleich lt. Brief; {sv} = Gutachter-Vorname des Clusters
// (CLUSTER.svName — Koeln Stefan / Aachen Markus), Avatar-Aufloesung in der
// NetzwerkSection (sv -> cluster-Asset, monika/lexdrive -> shared).
export interface NetzwerkPerson {
  avatar: 'sv' | 'monika' | 'lexdrive'
  /** '{sv}' wird mit CLUSTER.svName ersetzt. */
  name: string
  funktion: string
  zitat: string
  /** 08p P4: object-position je Asset (Gesicht mittig im runden Crop). */
  avatarPos?: string
}
export const NETZWERK_PERSONEN: NetzwerkPerson[] = [
  {
    avatar: 'sv',
    name: '{sv}',
    funktion: 'Kfz-Sachverständiger',
    zitat: 'Ich bin in 60 Minuten bei Ihnen und dokumentiere Ihren Schaden gerichtsfest — nach BVSK.',
  },
  {
    avatar: 'monika',
    name: 'Monika',
    funktion: 'Schadensbetreuung 24/7 · Claimondo Unfall-Assistance',
    zitat: 'Ich regle alles rund um Ihren Fall: Termin, Mietwagen und den kompletten Papierkram.',
  },
  {
    avatar: 'lexdrive',
    name: 'Partnerkanzlei LexDrive',
    funktion: 'Verkehrsrecht',
    zitat: 'Kürzt die Versicherung, widersprechen wir — und holen die volle Summe für Sie raus.',
  },
]

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

// 08o O4 (Aaron, wortgleich): Copy gestrafft — Titel/Icons/Nummern bleiben,
// Texte <=10 Woerter inkl. Titel (Zaehlung im 08o-Report; Tooltip-info ist
// eigenes UI, kein Step-Text).
export const ABLAUF: AblaufStep[] = [
  { icon: 'phone', title: 'Anrufen', text: 'Per Telefon oder WhatsApp — Rückmeldung **innerhalb einer Stunde**.' },
  { icon: 'calendar', title: 'Termin vor Ort', text: 'Gutachter dokumentiert **gerichtsfest** — meist binnen 24–72 Stunden.' },
  { icon: 'scale', title: 'Anwalt —', titleAccent: '0 € inklusive', text: 'LexDrive setzt Ihren Anspruch durch — **zahlt die Gegenseite**.' },
  { icon: 'car', title: 'Mietwagen oder Geld', text: 'Ersatzwagen oder Nutzungsausfall pro Tag — **Ihre Wahl**.', info: 'Nutzungsausfall je nach Fahrzeugklasse, typisch ca. 23–175 €/Tag (Sanden/Danner-Tabelle). Mietwagen klassengleich zum Normaltarif. Was günstiger ist, klären wir mit Ihnen.' },
  { icon: 'card', title: 'Geld aufs Konto', text: 'Versicherung zahlt **direkt**: Reparatur, Wertminderung, Nutzungsausfall.' },
]

// ── Ablauf-Mobile · Tage-Timeline (#ablaufMobile, "In ~32 Tagen zum Geld") ────
// Eigene Mobile-Darstellung (TAG-0..TAG-32), NICHT die 5-Icon-Desktop-ABLAUF.
export interface AblaufTimelineStep {
  /** data-step 1–5 (Dot-Reveal + amber Step-1-Dot). */
  step: number
  /** Tag-Label: "TAG 0" … "~TAG 32". */
  day: string
  /** Tag-Label-Modifier → ablauf-tl-day--{start|end}. */
  dayMod?: 'start' | 'end'
  title: string
  /** Groesseres End-Titel-Styling (Schritt 5). */
  titleEnd?: boolean
  /** Amber-Pill neben dem Titel (Schritt 3: "0 €"). */
  pill?: string
  /** **fett** via renderRich(sub, subStrong). */
  sub: string
  /** strongClassName: 'text-petrol' bzw. 'font-bold' (Schritt 1 = neutral-bold). */
  subStrong: string
  /** Nutzungsausfall-Tooltip (nur Schritt 4) — **fett** text-petrol. */
  tooltip?: string
  /** End-Dot mit "€"-Symbol (Schritt 5). */
  dotEnd?: boolean
  /** ablauf-tl-item--end (Schritt 5). */
  itemEnd?: boolean
}

export const ABLAUF_TIMELINE: AblaufTimelineStep[] = [
  { step: 1, day: 'TAG 0', dayMod: 'start', title: 'Anrufen', sub: 'Per Telefon oder WhatsApp — Rückruf **innerhalb 60 Min**.', subStrong: 'font-bold' },
  { step: 2, day: 'TAG 1–3', title: 'Termin vor Ort', sub: 'Ihr Sachverständiger im Netzwerk dokumentiert gerichtsfest bei Ihnen.', subStrong: 'text-petrol' },
  { step: 3, day: 'TAG 3–7', title: 'Gutachten + Anwalt', pill: '0 €', sub: '**LexDrive** kämpft für Sie. Kosten trägt die Gegenseite.', subStrong: 'text-petrol' },
  { step: 4, day: 'TAG 7+', title: 'Mietwagen oder Geld', sub: 'Ersatzwagen organisiert — oder Nutzungsausfall aufs Konto. **Ihre Wahl.**', subStrong: 'text-petrol', tooltip: 'Nutzungsausfall je nach Fahrzeugklasse, typisch ca. **23–175 €/Tag** (Sanden/Danner-Tabelle). Mietwagen klassengleich zum Normaltarif.' },
  { step: 5, day: '~TAG 32', dayMod: 'end', title: 'Geld auf dem Konto', titleEnd: true, sub: 'Reparatur, Wertminderung & Nutzungsausfall — direkt von der Versicherung.', subStrong: 'text-petrol', dotEnd: true, itemEnd: true },
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
  // 08k A4.5 Copy-Fix (Aaron): "Gegengutachten" raus aus DIESER Zelle (Zeile
  // "eigenes Gutachten vorlegt" + Fussnote behalten den Begriff).
  { feat: 'Was, wenn die Versicherung Ihr Gutachten kürzt?', normal: 'Niemand widerspricht.', us: '**Anwalt widerspricht und setzt die volle Summe durch**', highlight: true },
  { feat: 'Wenn die Versicherung ihr eigenes Gutachten vorlegt?', normal: 'Sie stehen allein da.', normalLink: { href: 'https://autounfall.io/controlexpert-versicherer-pruefdienst/', label: 'Prüfdienste →' }, us: 'Wir prüfen es **fachlich gegen** (BVSK-Standard)', highlight: true },
  { feat: 'Wer ist Ihr Ansprechpartner?', normal: 'Wechselnd / keiner', us: 'Fester persönlicher Schadensbetreuer' },
  { feat: 'Sehen Sie den Stand Ihres Falls?', normal: 'Nachfragen per Telefon', us: 'Jederzeit im eigenen Online-Portal' },
  { feat: 'Wer organisiert den Mietwagen?', normal: 'Sie selbst.', normalLink: { href: 'https://autounfall.io/mietwagen-anspruch/', label: 'Mietwagen-Anspruch →' }, us: 'Wir — steht vor Ihrer Tür' },
  { feat: 'Wer kämpft mit der Versicherung?', normal: 'Sie selbst (oder eigener Anwalt).', normalLink: { href: 'https://autounfall.io/abtretungserklaerung/', label: 'Abtretung →' }, us: 'Verkehrsanwalt **LexDrive** — inklusive' },
  { feat: 'Ihr Aufwand am Ende', normal: '**10+** Telefonate, Briefe, Wartezeit', us: '**1 Anruf**' },
]

// ── Netzwerk-Mobile · Pain-Cards (4, "Die 4 wichtigsten Fragen") ──────────────
// Nur Mobile (#netzwerkMobile, sm:hidden). IO-Staggered-Reveal ueber data-step.
export interface NetzwerkPainCard {
  /** Zweistelliges Stage-Tag "01"–"04" (Anzeige im Tag-Quadrat). */
  tag: string
  /** data-step 1–4 — Selektor fuer die CSS-Transition-Delays. */
  step: number
  title: string
  /** **fett**-Marker erlaubt; gerendert via renderRich(sub, subStrong). */
  sub: string
  /** strongClassName: 'font-bold' (weiss) bzw. 'netzwerk-pain-allein' (rot). */
  subStrong: string
  linkHref: string
  linkLabel: string
}

export const NETZWERK_PAIN: NetzwerkPainCard[] = [
  { tag: '01', step: 1, title: 'Reicht der Werkstatt-Kostenvoranschlag?', sub: 'Nein — Versicherung erkennt nur ein **neutrales Gutachten** an. Wertminderung & Nutzungsausfall fallen sonst weg.', subStrong: 'font-bold', linkHref: 'https://autounfall.io/gutachter-lohnt-sich/', linkLabel: 'Lohnt sich ein Gutachten? →' },
  { tag: '02', step: 2, title: 'Welches Gutachten brauche ich?', sub: 'Haftpflicht, Kasko, Beweis — falsches Format = Versicherung lehnt ab oder kürzt.', subStrong: 'font-bold', linkHref: 'https://autounfall.io/gutachten-arten/', linkLabel: 'Die Gutachten-Arten →' },
  { tag: '03', step: 3, title: 'Wer organisiert Reparatur & Mietwagen?', sub: 'Allein: Werkstatt-Bindung, Vorkasse-Risiko, Tagessatz-Streit. Bei uns: alles komplett koordiniert.', subStrong: 'font-bold', linkHref: 'https://autounfall.io/mietwagen-anspruch/', linkLabel: 'Mietwagen-Anspruch →' },
  { tag: '04', step: 4, title: 'Wenn die Versicherung kürzt — was tun?', sub: '**Allein:** niemand widerspricht. Bei uns: Gegengutachten + Anwalt setzen volle Summe durch.', subStrong: 'netzwerk-pain-allein', linkHref: 'https://autounfall.io/wertminderung-249-bgb/', linkLabel: 'Wertminderung & §249 BGB →' },
]

// ── Netzwerk-Mobile · 8-Karten Compare-Panel (#netzwerkCompareMobilePanel) ─────
// Eigenes Mobile-Mapping mit Topic-Badges — bewusst NICHT die Desktop-COMPARISON
// (7 Zeilen, andere Copy). Mock v3-praxis-v2 Z.4749-4811.
export interface NetzwerkCompareCard {
  /** Topic-Badge-Text (GELD/SCHUTZ/SERVICE/PORTAL/MOBILITÄT/RECHT/AUFWAND). */
  metaLabel: string
  /** Badge-Farbklasse → cmp-mobile-meta--{metaClass}. */
  metaClass: 'money' | 'risk' | 'service' | 'portal' | 'mob' | 'law' | 'effort'
  question: string
  /** **fett** erlaubt (renderRich; CSS faerbt strong je Tile no/yes). */
  ohne: string
  mit: string
  /** Card-Modifier: '' | 'cmp-mobile-card--accent' | 'cmp-mobile-card--final'. */
  cardClass: string
  /** Mit-Tile als grosses Solo-"1 Anruf"-Tile (nur Karte 8). */
  mitBig?: boolean
  linkHref?: string
  linkLabel?: string
}

export const NETZWERK_COMPARE_MOBILE: NetzwerkCompareCard[] = [
  { metaLabel: 'GELD', metaClass: 'money', question: 'Wer holt das versteckte Geld raus?', ohne: 'Versicherung rechnet knapp.', mit: 'Wertminderung + Nutzungsausfall.', cardClass: '', linkHref: 'https://autounfall.io/wertminderung-249-bgb/', linkLabel: 'Wertminderung & §249 BGB →' },
  { metaLabel: 'SCHUTZ', metaClass: 'risk', question: 'Versicherung kürzt Ihr Gutachten?', ohne: 'Niemand widerspricht.', mit: '**Gegengutachten + Anwalt** setzen volle Summe durch.', cardClass: 'cmp-mobile-card--accent' },
  { metaLabel: 'SCHUTZ', metaClass: 'risk', question: 'Versicherung legt eigenes Gutachten vor?', ohne: 'Sie stehen allein da.', mit: 'Wir prüfen **fachlich gegen**.', cardClass: 'cmp-mobile-card--accent', linkHref: 'https://autounfall.io/controlexpert-versicherer-pruefdienst/', linkLabel: 'Prüfdienste (ControlExpert) →' },
  { metaLabel: 'SERVICE', metaClass: 'service', question: 'Wer ist Ihr Ansprechpartner?', ohne: 'Wechselnd / keiner.', mit: 'Fester persönlicher Schadensbetreuer.', cardClass: '' },
  { metaLabel: 'PORTAL', metaClass: 'portal', question: 'Sehen Sie den Stand Ihres Falls?', ohne: 'Nachfragen per Telefon.', mit: 'Jederzeit im Online-Portal.', cardClass: '' },
  { metaLabel: 'MOBILITÄT', metaClass: 'mob', question: 'Wer organisiert den Mietwagen?', ohne: 'Sie selbst.', mit: 'Wir — steht vor Ihrer Tür.', cardClass: '', linkHref: 'https://autounfall.io/mietwagen-anspruch/', linkLabel: 'Mietwagen-Anspruch →' },
  { metaLabel: 'RECHT', metaClass: 'law', question: 'Wer kämpft mit der Versicherung?', ohne: 'Sie (oder eigener Anwalt).', mit: '**LexDrive** — inklusive.', cardClass: '', linkHref: 'https://autounfall.io/abtretungserklaerung/', linkLabel: 'Abtretungserklärung →' },
  { metaLabel: 'AUFWAND', metaClass: 'effort', question: 'Ihr Aufwand am Ende', ohne: '**10+** Telefonate, Briefe, Wartezeit.', mit: '**1 Anruf**', cardClass: 'cmp-mobile-card--final', mitBig: true },
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
      'Ihr Sachverständiger vor Ort in **{city}** ist zertifizierter Partner im Claimondo-Netzwerk (über 90 Sachverständige in NRW). Sie bekommen **alles komplett koordiniert**:',
    bullets: [
      { strong: 'Kfz-Gutachten', rest: 'ingenieurbasiert & gerichtsfest' },
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
export function faqAnswerText(e: FaqEntry, city: City, region: string, achsenText: string): string {
  let t = fillTokens(e.intro, city, region)
  // achsenText ist bereits aufgeloest (per-Stadt LOKALDATEN ?? Cluster-Fallback) —
  // identische Quelle wie FaqAccordion, damit JSON-LD == sichtbarer Text bleibt.
  if (e.axes) t += ' ' + achsenText + '.'
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
