import type { FallAkteConfig } from './types'
import { FallAkteColumns } from './layouts/FallAkteColumns'
import { FallAkteTabs } from './layouts/FallAkteTabs'

/**
 * C4a (Fundament, „Eine Akte"): der rollen-parametrisierte Fallakte-Kern (Server-Component,
 * KEIN 'use client' — Interaktivitaet lebt in den Zone-Komponenten). Waehlt den Shell-Modus
 * per config.layout. Implementiert 'columns' (Kunde/Werkstatt) + 'tabs' (C4d/e Staff, Client-Tab-
 * Controller); 'sidebar'/'stack' (C4b SV) bleibt der explizite throw = die Naht, kein Placeholder
 * (DECISIONS 2026-07-31 · C4). Die SV-Tranche fuegt den fehlenden Layout-Zweig hinzu.
 */
export function FallAkte<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const layout = config.layout ?? 'columns'
  switch (layout) {
    case 'columns':
      return <FallAkteColumns config={config} vm={vm} />
    case 'tabs':
      return <FallAkteTabs config={config} vm={vm} />
    // Naht offen — von der SV-Tranche gefuellt:  'sidebar'/'stack' -> C4b (SV).
    default:
      throw new Error(
        `FallAkte: layout="${layout}" noch nicht implementiert (C4b: sidebar/stack)`,
      )
  }
}
