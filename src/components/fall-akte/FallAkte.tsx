import type { FallAkteConfig } from './types'
import { FallAkteColumns } from './layouts/FallAkteColumns'
import { FallAkteStack } from './layouts/FallAkteStack'

/**
 * C4a (Fundament, „Eine Akte"): der rollen-parametrisierte Fallakte-Kern (Server-Component,
 * KEIN 'use client' — Interaktivitaet lebt in den Zone-Komponenten). Waehlt den Shell-Modus
 * per config.layout. Implementiert 'columns' (Kunde) + 'stack' (C4b SV, Werkstatt/C4c reused);
 * 'tabs' (C4d/e Staff) bleibt ein expliziter throw = die Naht, kein Placeholder (DECISIONS
 * 2026-07-31 · C4). Die Staff-Tranche fuegt den 'tabs'-Zweig hinzu.
 */
export function FallAkte<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const layout = config.layout ?? 'columns'
  switch (layout) {
    case 'columns':
      return <FallAkteColumns config={config} vm={vm} />
    case 'stack':
      return <FallAkteStack config={config} vm={vm} />
    // Naht offen — von der Staff-Tranche gefuellt:
    //   'tabs' -> C4d/e (Staff, Client-Tab-Controller).
    default:
      throw new Error(
        `FallAkte: layout="${layout}" noch nicht implementiert (C4d/e: tabs)`,
      )
  }
}
