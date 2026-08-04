import type { ReactNode } from 'react'
import type { FallakteTabDef } from '@/components/shared/fall-tabs'

/**
 * C4a (Fundament, „Eine Akte"): der rollen-parametrisierte Fallakte-Kern-Contract. Traegt ALLE
 * Generalisierungs-Naehte (layout-Variante, Header-Slot, server-injizierte ReactNode-Bloecke),
 * damit C4b (SV, layout='stack'), C4c (Werkstatt) und C4d/e (Staff, layout='tabs') je nur eine
 * config + evtl. einen Layout-Zweig ergaenzen — keinen Kern-Refactor.
 * Siehe docs/superpowers/plans/2026-07-31-fundament-c4a.md + DECISIONS.md (2026-07-31 · C4).
 */

export type FallAkteLayout = 'columns' | 'stack' | 'tabs'

/** Header simpel ({title,…}, Kunde/Werkstatt) ODER ein Custom-ReactNode (SV FallHeader, Staff IdentityHeader). */
export type FallAkteHeader =
  | { title: string; description?: string | null; badges?: ReactNode }
  | { custom: ReactNode }

/** Server-injizierte ReactNode-Slots. Alle optional. */
export type FallAkteSlots = {
  /** Volle Breite, VOR dem Header (SV: FallWindowDropzone). Nur layout='stack'. */
  beforeHeader?: ReactNode
  /** Volle Breite, direkt unter dem Header (SV: Stepper/Geo + topServerBlocks + Konfrontation). */
  topBlocks?: ReactNode
  /** Volle Breite, ganz unten (SV: vorOrtCard; Werkstatt: Interaktiv-Segment + Copilot + Chat). */
  footer?: ReactNode
  /** Linke Spalte (Staff: FallPhasenPanel) — nur layout='tabs'. */
  aside?: ReactNode
  /** Rechte Spalte (Staff: FallSidebar) — nur layout='tabs'. */
  sidebar?: ReactNode
}

/**
 * Eine Zone ist eine (teils async) Server-Component, die ein rollen-spezifisches vm nimmt.
 * Rueckgabe ReactNode ODER Promise<ReactNode> (React-19-JSXElementConstructor) — deshalb NICHT
 * React.ComponentType, das async-Server-Components nicht typt (z.B. Kunde-DoksTermineZone).
 */
export type FallAkteZone<Vm> = (props: { vm: Vm }) => ReactNode | Promise<ReactNode>

export type FallAkteConfig<Vm, ZK extends string> = {
  /** Shell-Modus. Default 'columns'. */
  layout?: FallAkteLayout
  /** Optionaler Outer-Wrapper-className: SV-Full-Bleed (`min-h-full bg-claimondo-bg -mx-…`) via 'stack',
   *  Werkstatt (`max-w-3xl … space-y-4`) via 'columns'. Fallback = der Layout-Default. */
  wrapperClassName?: string
  /** Geordnete, phasen-adaptive Zonen-Reihenfolge (Kunde: deriveKundeZonen). */
  zones: (vm: Vm) => ZK[]
  /** Zone-Key -> Zone-Komponente (duerfen Client-Components sein). */
  zoneComponents: Record<ZK, FallAkteZone<Vm>>
  /** Kopf: {title,description,badges} ODER {custom}. */
  header: (vm: Vm) => FallAkteHeader
  /** Optionaler „Zurueck"-Link (Kunde: Multi-Fall). */
  backLink?: (vm: Vm) => { href: string; label: string } | null
  /** Optionale Realtime-Subscription (Kunde/SV/Staff: FallRealtimeRefresh). */
  realtime?: (vm: Vm) => { fallId: string; claimId: string | null } | null
  /** Optionale server-injizierte ReactNode-Bloecke. */
  slots?: (vm: Vm) => FallAkteSlots
  /** C4d/e (nur layout='tabs'): Tab-Definitionen — Reihenfolge + Meta (label/icon) fuer die Tab-Bar. */
  tabs?: ReadonlyArray<FallakteTabDef>
  /** C4d/e (nur layout='tabs'): Tab-Inhalt je id, VORGERENDERT — der Controller mountet nur den
   *  aktiven (heterogene Props je Tab -> vorrendern statt zones(vm), das eine Prop-Buendelung erzwaenge). */
  tabContent?: Record<string, ReactNode>
  /** C4d/e (nur layout='tabs'): optionale Rechts-Aktion in der Tab-Bar (Staff: TaskAnlegenButton). */
  tabRightSlot?: ReactNode
}
