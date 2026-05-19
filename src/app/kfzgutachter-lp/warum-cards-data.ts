// src/app/kfzgutachter-lp/warum-cards-data.ts
//
// Inhalte der 3 "Warum unabhängiger Gutachter"-Karten in einer pure-data-
// Datei. Bewusst NICHT in 'use server' — sonst werden die Konstanten beim
// Client-Bundle zu undefined (AGENTS.md §use-server-Konstanten-Falle).
// Die page.tsx (Server) + WarumCardsClient.tsx (Client) importieren beide
// von hier.

import { Scale, ShieldCheck, BadgeCheck, type LucideIcon } from 'lucide-react'

export type WarumCtaKind = 'open-popover' | 'scroll-to-form'

export type WarumStatRow = { label: string; amount: string }

export type WarumCard = {
  slug: 'recht' | 'kuerzungen' | 'anwalt'
  Icon: LucideIcon
  titel: string
  /** Sichtbar im collapsed-State (1–3 Sätze). */
  text: string
  /** Sub-Label unter dem Text, BGH-Quellen. */
  quelle: string
  /** Expanded-State: kurze Bullet-Liste (jeweils 1 Satz). */
  bullets: string[]
  /** Optional: Tabellen-artige Stats für Karte 2 (Kürzungen). */
  stats?: WarumStatRow[]
  /** Abschluss-Hinweis vor dem CTA (kann fett oder neutral sein). */
  hinweis?: string
  cta: {
    label: string
    kind: WarumCtaKind
    /** Für open-popover: welche Step-Variante anpeilen. */
    popoverStep?: 1 | 2 | 3
  }
}

export const WARUM_CARDS: WarumCard[] = [
  {
    slug: 'recht',
    Icon: Scale,
    titel: 'Sie wählen Ihren Gutachter selbst',
    text:
      'Bei unverschuldetem Unfall bestimmen Sie nach §249 BGB den Sachverständigen Ihres Vertrauens — den Gutachter der gegnerischen Versicherung müssen Sie nicht akzeptieren.',
    quelle: '§249 BGB · BGH VI ZR 119/04',
    bullets: [
      'BGH-Bestätigung: Der Geschädigte hat das uneingeschränkte Wahlrecht des Sachverständigen (VI ZR 119/04).',
      'Versicherer schlagen oft eigene Gutachter vor — diese sind unverbindlich und müssen nicht akzeptiert werden.',
    ],
    cta: {
      label: 'Gutachter in Ihrer Region zeigen',
      kind: 'open-popover',
      popoverStep: 2,
    },
  },
  {
    slug: 'kuerzungen',
    Icon: ShieldCheck,
    titel: 'Versicherer-Prüfdienste kürzen systematisch',
    text:
      'Prüfdienstleister wie ControlExpert, K-Expert oder DEKRA arbeiten im Auftrag der Gegenseite und kürzen häufig Wertminderung, UPE-Aufschläge und Verbringung.',
    quelle: 'BGH VI ZR 65/18 · VI ZR 174/24',
    bullets: [],
    stats: [
      { label: 'Wertminderung', amount: '~750 €' },
      { label: 'UPE-Aufschläge', amount: '~280 €' },
      { label: 'Verbringungskosten', amount: '~180 €' },
    ],
    hinweis:
      '30–40 % davon holt unsere Partnerkanzlei BGH-konform zurück.',
    cta: {
      label: 'Schaden prüfen lassen',
      kind: 'scroll-to-form',
    },
  },
  {
    slug: 'anwalt',
    Icon: BadgeCheck,
    titel: 'Anwaltlich durchgesetzt — ohne Ihr Zutun',
    text:
      'Unsere Partnerkanzlei für Verkehrsrecht reguliert Reparaturkosten, Wertminderung, Mietwagen, Nutzungsausfall und Schmerzensgeld direkt gegen die gegnerische Versicherung. Sie bleiben außen vor.',
    quelle: 'BGH VI ZR 38/22 ff.',
    bullets: [
      'Reparaturkosten + UPE-Aufschläge',
      'Wertminderung (BGH VI ZR 38/22)',
      'Mietwagen oder Nutzungsausfall (BGH VI ZR 65/18)',
      'Schmerzensgeld bei Personenschaden',
    ],
    hinweis: 'Kostenfrei für Sie — die Anwaltskosten trägt die gegnerische Versicherung.',
    cta: {
      label: 'Rückruf in 15 Min',
      kind: 'open-popover',
      popoverStep: 3,
    },
  },
]
