// src/lib/brand/service-pitch.ts
//
// Doc 44 §7: Zentrales Brand-Constants-Modul für den Service-Pitch.
// Alle Hero-/CTA-/Section-Wordings für claimondo.de Hauptseite und
// kfzgutachter.claimondo.de leben HIER und nirgendwo sonst.
//
// BRAND-CRITICAL: Änderungen MÜSSEN durch Aaron (User) reviewed werden.
// Drift-Risiko: wenn Wordings in einzelnen Components hartkodiert werden,
// verlieren beide Seiten ihre Konsistenz. Im Doubt: hier ergänzen, dort
// importieren.

import type { LucideIcon } from 'lucide-react'
import {
  Smartphone,
  User,
  FileText,
  Clock,
  Wallet,
  Bell,
  Eye,
  FolderX,
} from 'lucide-react'

// ─── Hero-Headlines ─────────────────────────────────────────────

export const SERVICE_PITCH_HEADLINES = {
  /** Hauptseite claimondo.de — Cluster-1 Painpoint-zentrierter Hero. */
  claimondo: 'Sie reden mit niemandem. Wir mit allen.',
  /** kfzgutachter-LP — mit Stadt-Insertion, Fallback ohne Stadt. */
  kfzgutachterLp: (stadtName?: string): string =>
    stadtName
      ? `Unfall in ${stadtName}. Sie reden mit niemandem.`
      : 'Sie hatten Unfall. Sie reden mit niemandem.',
} as const

// ─── Sub-Headlines ──────────────────────────────────────────────

export const SERVICE_PITCH_SUB_HEADLINE_CLAIMONDO =
  'Wir koordinieren Gutachter, Anwalt und Werkstatt — und führen die Verhandlung mit der gegnerischen Versicherung. Für Sie 0 € (§ 249 BGB). 32 Tage Ø Auszahlung statt 4–6 Monate Branchen-Durchschnitt.'

export const SERVICE_PITCH_SUB_HEADLINE_KFZGUTACHTER_LP =
  'Wir disponieren Ihren Gutachter (< 48 h), führen die Versicherungs-Verhandlung und setzen Ihren Anspruch BGH-konform durch. 0 € für Sie.'

// ─── Hero-Bullets (5 Service-Realität, Brand-Konsistenz-Anker) ─

export type ServiceRealityBullet = {
  label: string
  Icon: LucideIcon
}

export const SERVICE_REALITY_BULLETS: ServiceRealityBullet[] = [
  { label: 'Ihr Fall. Immer in der Tasche.', Icon: Smartphone },
  { label: 'Ein Berater. Eine Nummer. Immer dieselbe.', Icon: User },
  { label: 'Sie sehen jeden Brief, jeden Anruf, jeden Cent.', Icon: FileText },
  { label: '32 Tage statt 4 Monate. Im Schnitt.', Icon: Clock },
  { label: '0 € für Sie. (§ 249 BGB).', Icon: Wallet },
]

// ─── Service-Realität-Section Cards (6 Cards mit Body-Text) ────

export type ServiceRealityCard = ServiceRealityBullet & {
  body: string
}

export const SERVICE_REALITY_CARDS_DETAILED: ServiceRealityCard[] = [
  {
    label: 'Ihr Fall. Immer in der Tasche.',
    Icon: Smartphone,
    body: 'Status checken — beim Kaffee, im Stau, um 3 Uhr morgens. Ein Tab in Ihrem Handy. Alles drin.',
  },
  {
    label: 'Wir melden uns. Sie müssen nicht nachfragen.',
    Icon: Bell,
    body: 'Push: „Gutachter unterwegs." Push: „Anwalt hat geantwortet." Push: „Geld ist da." Sie checken nicht — wir benachrichtigen.',
  },
  {
    label: 'Ein Berater. Eine Nummer. Immer dieselbe.',
    Icon: User,
    body: 'Ihren Ansprechpartner haben Sie mit Foto, Direktwahl und Sprechzeiten. Kein Call-Center-Roulette.',
  },
  {
    label: 'Sie wissen vor der Versicherung, was los ist.',
    Icon: Eye,
    body: 'Wenn die Versicherung kürzt, sehen Sie es am selben Tag. Der Anwalt schreibt zurück, bevor Sie „Wartezeit" tippen können.',
  },
  {
    label: 'Kein Aktendeckel. Alles digital.',
    Icon: FolderX,
    body: 'Null Papier. Für uns nicht, für Sie nicht. Was anderswo ein Briefumschlag ist, ist bei uns ein Tap.',
  },
  {
    label: '32 Tage statt 4 Monate.',
    Icon: Clock,
    body: 'Branchen-Durchschnitt: 4–6 Monate. Bei uns: 32 Tage. Weil disponiert statt vermittelt — und alles digital.',
  },
]

// ─── Plattform-Mechanik-Section Steps (3 Steps, Uber-Prinzip) ──

export type PlattformMechanikStep = {
  nr: 1 | 2 | 3
  titel: string
  body: string
}

export const PLATTFORM_MECHANIK_STEPS: PlattformMechanikStep[] = [
  {
    nr: 1,
    titel: 'Disponiert',
    body: 'Nächster freier Gutachter — nicht der, der in drei Wochen Zeit hat. Wie Uber, aber für Schadensgutachten.',
  },
  {
    nr: 2,
    titel: 'In der Tasche',
    body: 'Sachverständiger hat alle Daten mobile, sieht alles live, kann sofort zurückpingen. Kein Papierkram, keine Aktenlieferung.',
  },
  {
    nr: 3,
    titel: 'Kürzungs-Alarm',
    body: 'Wenn die Versicherung kürzen will, schreibt unser Anwalt zurück — bevor Sie „Wartezeit" tippen können.',
  },
]

// ─── CTAs ──────────────────────────────────────────────────────

export const SERVICE_PITCH_CTAS = {
  primary: 'Lassen Sie uns mit der Versicherung reden →',
  primaryAlt: 'Mein Team übernimmt das →',
  secondary: 'Erst mal Bewertung in 15 Min →',
  tertiary: 'Lieber direkt sprechen? Rückruf < 15 Min →',
  serviceRealitaet: 'Mit Live-Status starten →',
  plattformMechanik: 'So sieht das in der Praxis aus →',
} as const

// ─── ANSPRUECHE-Re-Frame (Cluster-1-Sicht) ─────────────────────

export const ANSPRUECHE_REFRAMED = [
  {
    titel: 'Reparatur oder Wiederbeschaffungswert',
    text: 'Wir verhandeln vollständige Erstattung inkl. UPE-Aufschläge, Verbringung und Beilackierung mit der Versicherung. BGH VI ZR 65/18 + VI ZR 174/24.',
    href: '/haftpflicht/reparaturkosten',
  },
  {
    titel: 'Merkantile Wertminderung',
    text: 'Wir setzen die Wertminderung nach Sanden/Danner-Formel durch — auch wenn die Versicherung „angemessen" anbietet. BGH VI ZR 357/03.',
    href: '/haftpflicht/wertminderung',
  },
  {
    titel: 'Mietwagen oder Nutzungsausfall',
    text: 'Wir verhandeln Mietwagen für die gesamte Reparaturdauer oder Nutzungsausfallpauschale 23–175 €/Tag nach Sanden/Danner-Klasse.',
    href: '/haftpflicht/nutzungsausfall',
  },
  {
    titel: 'Gutachter- und Anwaltskosten',
    text: 'Wir holen Gutachter- und Anwaltskosten von der gegnerischen Haftpflichtversicherung ein — §249 BGB. Sie zahlen 0 €.',
    href: '/kosten-kfz-gutachten',
  },
] as const

// ─── Section-Headlines (Schärfungen) ───────────────────────────

export const SECTION_HEADLINES = {
  anspruecheReframed: 'Vier Gespräche — wir führen sie, nicht Sie.',
  misstrauenReframed:
    'Wenn die Versicherung schreibt „Wir kümmern uns". Was die Übersetzung ist.',
  schadensreportReframed:
    '32 Tage. Branchen-Durchschnitt: 4–6 Monate. Hier sind die Daten.',
  lpServicePitch: 'Sie melden den Schaden. Wir reden mit der Versicherung.',
  lpDreiStep: 'Disponiert. Verhandelt. Ausgezahlt.',
} as const
