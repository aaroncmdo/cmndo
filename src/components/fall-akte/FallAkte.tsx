import type { FallAkteConfig } from './types'
import { FallAkteColumns } from './layouts/FallAkteColumns'
import { FallAkteStack } from './layouts/FallAkteStack'
import { FallAkteTabs } from './layouts/FallAkteTabs'

/**
 * C4a (Fundament, „Eine Akte"): der rollen-parametrisierte Fallakte-Kern (Server-Component,
 * KEIN 'use client' — Interaktivitaet lebt in den Zone-Komponenten). Waehlt den Shell-Modus
 * per config.layout. C4 KOMPLETT: 'columns' (Kunde/Werkstatt) + 'stack' (C4b SV) + 'tabs' (C4d/e
 * Staff, Client-Tab-Controller) sind alle implementiert. Der default-throw bleibt die Naht fuer
 * ein kuenftiges, noch nicht gebautes Layout (DECISIONS 2026-07-31 · C4).
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
    case 'tabs':
      return <FallAkteTabs config={config} vm={vm} />
    default:
      throw new Error(
        `FallAkte: layout="${layout}" noch nicht implementiert`,
      )
  }
}
