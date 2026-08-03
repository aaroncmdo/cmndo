import type { FallAkteConfig } from './types'
import { FallAkteColumns } from './layouts/FallAkteColumns'

/**
 * C4a (Fundament, „Eine Akte"): der rollen-parametrisierte Fallakte-Kern (Server-Component,
 * KEIN 'use client' — Interaktivitaet lebt in den Zone-Komponenten). Waehlt den Shell-Modus
 * per config.layout. C4a implementiert NUR 'columns' (Kunde jetzt, Werkstatt/C4c spaeter);
 * 'sidebar' (C4b SV) + 'tabs' (C4d/e Staff) sind bewusst ein expliziter throw = die Naht, kein
 * Placeholder (DECISIONS 2026-07-31 · C4). Die Folge-Tranchen fuegen je einen Layout-Zweig hinzu.
 */
export function FallAkte<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const layout = config.layout ?? 'columns'
  switch (layout) {
    case 'columns':
      return <FallAkteColumns config={config} vm={vm} />
    // Naht offen — von den Folge-Tranchen gefuellt:
    //   'sidebar' -> C4b (SV),  'tabs' -> C4d/e (Staff, Client-Tab-Controller).
    default:
      throw new Error(
        `FallAkte: layout="${layout}" noch nicht implementiert (C4b: sidebar, C4d/e: tabs)`,
      )
  }
}
