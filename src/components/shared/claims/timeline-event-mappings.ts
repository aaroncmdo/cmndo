// AAR-843: Timeline-Event-Display-Mappings
//
// Single Source für Timeline-Events. Parallel zu status-mappings.ts und
// phase-mappings.ts strukturiert. Zwei Label-Varianten pro Event:
//   labelKunde — kunde-friendly, Lay-Sprache
//   labelInternal — fachlich, für Admin/KB

import type { LucideIcon } from 'lucide-react'
import {
  CircleIcon,
  InboxIcon,
  UserCheckIcon,
  GitBranchIcon,
  CarFrontIcon,
  ClipboardListIcon,
  FileCheckIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  PauseCircleIcon,
  ScaleIcon,
  PhoneCallIcon,
  WrenchIcon,
  MailIcon,
  EuroIcon,
  CarIcon,
  SendIcon,
  StickyNoteIcon,
} from 'lucide-react'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'
import { formatEURausEuro } from '@/lib/format/currency'

export type TimelineEventKategorie =
  | 'phase'
  | 'gutachten'
  | 'reparatur'
  | 'vs'
  | 'zahlung'
  | 'kanzlei'
  | 'kommunikation'
  | 'manuell'

type EventDisplay = {
  icon: LucideIcon
  tone: StatusBadgeTone
  kategorie: TimelineEventKategorie
  /** Fachsprache für Admin/KB/SV */
  labelInternal: (payload: Record<string, unknown>) => string
  /** Kunde-friendly Lay-Sprache */
  labelKunde:    (payload: Record<string, unknown>) => string
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

function n(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const num = Number.parseFloat(v)
    return Number.isFinite(num) ? num : null
  }
  return null
}

const VS_TYP_LABEL: Record<string, string> = {
  forderung:        'Forderung an Versicherung',
  mahnung_1:        'Mahnung Stufe 1 an Versicherung',
  mahnung_2:        'Mahnung Stufe 2 an Versicherung',
  klage_androhung:  'Klage angedroht',
  sonstige:         'Schreiben an Versicherung',
}

const ABLEHNUNGS_LABEL: Record<string, string> = {
  verjaehrung:                'Verjährung',
  haftung_strittig:           'strittige Haftung',
  fahrzeug_bereits_repariert: 'bereits durchgeführter Reparatur',
  vollmacht_fehlt:            'fehlender Vollmacht',
  sonstiges:                  'sonstigen Gründen',
}

export const TIMELINE_EVENT_DISPLAY: Record<string, EventDisplay> = {
  // ── Phase-Events ─────────────────────────────────────────────────────────
  'lead.aufgenommen': {
    icon: InboxIcon, tone: 'info', kategorie: 'phase',
    labelInternal: () => 'Lead aufgenommen',
    labelKunde:    () => 'Schaden gemeldet',
  },
  'lead.konvertiert': {
    icon: GitBranchIcon, tone: 'info', kategorie: 'phase',
    labelInternal: () => 'Lead in Claim konvertiert',
    labelKunde:    () => 'Schadenakte angelegt',
  },
  'phase.geaendert': {
    icon: GitBranchIcon, tone: 'ondo', kategorie: 'phase',
    labelInternal: (p) => `Phase: ${s(p.from_phase, '—')} → ${s(p.to_phase, '—')}${p.grund ? ` (${s(p.grund)})` : ''}`,
    labelKunde:    (p) => `Status geändert: ${s(p.to_phase)}`,
  },

  // ── Manuelle claims-Endzustände (claim.<status>) ─────────────────────────
  'claim.in_kommunikation_vs': {
    icon: PhoneCallIcon, tone: 'brand', kategorie: 'phase',
    labelInternal: (p) => `Status auf "in Kommunikation mit VS"${p.endzustand_grund ? ` — ${s(p.endzustand_grund)}` : ''}`,
    labelKunde:    () => 'Wir verhandeln mit der Versicherung',
  },
  'claim.reguliert': {
    icon: CheckCircleIcon, tone: 'success', kategorie: 'phase',
    labelInternal: (p) => {
      const betrag = n(p.regulierungs_betrag)
      return `Reguliert${betrag ? ` · ${formatEURausEuro(betrag)}` : ''}${p.endzustand_grund ? ` — ${s(p.endzustand_grund)}` : ''}`
    },
    labelKunde: (p) => {
      const betrag = n(p.regulierungs_betrag)
      return betrag ? `Erfolgreich reguliert: ${formatEURausEuro(betrag)}` : 'Erfolgreich reguliert'
    },
  },
  'claim.abgelehnt': {
    icon: XCircleIcon, tone: 'danger', kategorie: 'phase',
    labelInternal: (p) => `Abgelehnt · ${ABLEHNUNGS_LABEL[s(p.vs_ablehnungs_grund)] ?? s(p.vs_ablehnungs_grund)}`,
    labelKunde:    (p) => `Versicherung hat abgelehnt — ${ABLEHNUNGS_LABEL[s(p.vs_ablehnungs_grund)] ?? 'Sachgrund'}`,
  },
  'claim.an_externe_kanzlei_uebergeben': {
    icon: ScaleIcon, tone: 'brand', kategorie: 'phase',
    labelInternal: () => 'An externe Kanzlei übergeben',
    labelKunde:    () => 'An deine Kanzlei übergeben',
  },
  'claim.storniert': {
    icon: PauseCircleIcon, tone: 'neutral', kategorie: 'phase',
    labelInternal: (p) => `Storniert${p.endzustand_grund ? ` — ${s(p.endzustand_grund)}` : ''}`,
    labelKunde:    () => 'Bearbeitung gestoppt',
  },

  // ── Gutachten-Events ─────────────────────────────────────────────────────
  'gutachten.beauftragt': {
    icon: ClipboardListIcon, tone: 'info', kategorie: 'gutachten',
    labelInternal: () => 'Gutachter beauftragt',
    labelKunde:    () => 'Gutachter beauftragt',
  },
  'gutachten.fertig': {
    icon: FileCheckIcon, tone: 'success', kategorie: 'gutachten',
    labelInternal: () => 'Gutachten final',
    labelKunde:    () => 'Gutachten ist da',
  },
  'termin.gebucht': {
    icon: CalendarIcon, tone: 'info', kategorie: 'gutachten',
    labelInternal: (p) => `Besichtigungstermin gebucht${p.typ ? ` (${s(p.typ)})` : ''}`,
    labelKunde:    () => 'Besichtigungstermin gebucht',
  },
  'termin.durchgefuehrt': {
    icon: CarFrontIcon, tone: 'success', kategorie: 'gutachten',
    labelInternal: () => 'Besichtigung durchgeführt',
    labelKunde:    () => 'Gutachter hat dein Fahrzeug besichtigt',
  },

  // ── Repair-Events ────────────────────────────────────────────────────────
  'repair.geplant': {
    icon: WrenchIcon, tone: 'info', kategorie: 'reparatur',
    labelInternal: () => 'Reparatur geplant',
    labelKunde:    () => 'Reparatur geplant',
  },
  'repair.in_arbeit': {
    icon: WrenchIcon, tone: 'ondo', kategorie: 'reparatur',
    labelInternal: () => 'Reparatur läuft',
    labelKunde:    () => 'Reparatur hat begonnen',
  },
  'repair.abgeschlossen': {
    icon: CheckCircleIcon, tone: 'success', kategorie: 'reparatur',
    labelInternal: () => 'Reparatur abgeschlossen',
    labelKunde:    () => 'Reparatur abgeschlossen',
  },

  // ── VS-Korrespondenz ────────────────────────────────────────────────────
  'vs.brief_versendet': {
    icon: MailIcon, tone: 'info', kategorie: 'vs',
    labelInternal: (p) => `${VS_TYP_LABEL[s(p.typ)] ?? 'VS-Brief'} · ${s(p.kanal, 'kanal')}${p.versicherung ? ` · ${s(p.versicherung)}` : ''}`,
    labelKunde:    (p) => VS_TYP_LABEL[s(p.typ)] ?? 'Brief an Versicherung verschickt',
  },

  // ── Zahlung ──────────────────────────────────────────────────────────────
  'payment.erhalten': {
    icon: EuroIcon, tone: 'success', kategorie: 'zahlung',
    labelInternal: (p) => `Zahlungseingang${n(p.erhaltener_betrag) ? ` · ${formatEURausEuro(n(p.erhaltener_betrag)!)}` : ''}`,
    labelKunde:    (p) => `Zahlung erhalten${n(p.erhaltener_betrag) ? `: ${formatEURausEuro(n(p.erhaltener_betrag)!)}` : ''}`,
  },
  'payment.teilweise': {
    icon: EuroIcon, tone: 'warning', kategorie: 'zahlung',
    labelInternal: (p) => `Teilzahlung${n(p.erhaltener_betrag) ? ` · ${formatEURausEuro(n(p.erhaltener_betrag)!)}` : ''}`,
    labelKunde:    () => 'Teilzahlung erhalten',
  },
  'payment.final': {
    icon: EuroIcon, tone: 'success', kategorie: 'zahlung',
    labelInternal: () => 'Zahlung final abgeschlossen',
    labelKunde:    () => 'Zahlung final abgeschlossen',
  },

  // ── Mietwagen ────────────────────────────────────────────────────────────
  'mietwagen.gestartet': {
    icon: CarIcon, tone: 'info', kategorie: 'reparatur',
    labelInternal: (p) => `Mietwagen-Anmietung gestartet${p.anbieter ? ` · ${s(p.anbieter)}` : ''}`,
    labelKunde:    () => 'Mietwagen erhalten',
  },
  'mietwagen.beendet': {
    icon: CarIcon, tone: 'success', kategorie: 'reparatur',
    labelInternal: (p) => `Mietwagen-Rückgabe${p.tage_gesamt ? ` · ${p.tage_gesamt} Tage` : ''}`,
    labelKunde:    () => 'Mietwagen zurückgegeben',
  },

  // ── Kommunikation: Airdrop ──────────────────────────────────────────────
  'airdrop.versendet': {
    icon: SendIcon, tone: 'info', kategorie: 'kommunikation',
    labelInternal: () => 'Einladung an Verursacher versendet',
    labelKunde:    () => 'Einladung an Verursacher versendet',
  },

  // ── Manuelle Notizen ─────────────────────────────────────────────────────
  'manuell.notiz': {
    icon: StickyNoteIcon, tone: 'neutral', kategorie: 'manuell',
    labelInternal: (p) => s(p.titel, 'Notiz'),
    labelKunde:    (p) => s(p.titel, 'Notiz'),
  },
}

const FALLBACK: EventDisplay = {
  icon: CircleIcon, tone: 'neutral', kategorie: 'manuell',
  labelInternal: (p) => `Event: ${JSON.stringify(p).slice(0, 60)}`,
  labelKunde:    () => 'Aktualisierung',
}

export function getEventDisplay(eventTyp: string): EventDisplay {
  return TIMELINE_EVENT_DISPLAY[eventTyp] ?? FALLBACK
}

/** Resolved Label für Rolle */
export function eventLabel(
  eventTyp: string,
  payload: Record<string, unknown>,
  viewerRole: 'admin' | 'kb' | 'sv' | 'kunde',
): string {
  const display = getEventDisplay(eventTyp)
  return viewerRole === 'kunde' ? display.labelKunde(payload) : display.labelInternal(payload)
}

export const KATEGORIE_LABEL: Record<TimelineEventKategorie, string> = {
  phase:         'Phase',
  gutachten:     'Gutachten',
  reparatur:     'Reparatur',
  vs:            'VS-Korrespondenz',
  zahlung:       'Zahlung',
  kanzlei:       'Kanzlei',
  kommunikation: 'Kommunikation',
  manuell:       'Notiz',
}
