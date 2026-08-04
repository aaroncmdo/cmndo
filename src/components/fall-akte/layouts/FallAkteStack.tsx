import PageHeader from '@/components/shared/PageHeader'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
import type { FallAkteConfig, FallAkteZone } from '../types'

/**
 * C4b: der 'stack'-Layout-Modus — vertikaler Full-Width-Block-Flow (SV jetzt; Werkstatt/C4c reused).
 * Anders als 'columns' (Kunde) sind die Zonen EINSPALTIG gestapelt (kein `columns-2`/`break-inside`).
 * Bausteine (alle optional per config/slots):
 *   - `config.wrapperClassName` = Outer-Wrapper (SV: Full-Bleed `min-h-full bg-claimondo-bg -mx-…`).
 *   - `slots.beforeHeader` (SV: FallWindowDropzone) — VOR dem Header.
 *   - Header-Slot: `{custom}` (SV: sticky FallHeader mit Drawer) ODER `{title,description,badges}`.
 *   - `slots.topBlocks` (SV: Stepper/Geo + topServerBlocks + Konfrontation) — volle Breite unter dem Header.
 *   - die Zonen im `max-w-7xl … space-y`-Flow (je `id="zone-<key>"`).
 *   - `slots.footer` (SV: vorOrtCard) — volle Breite ganz unten.
 * Server-Component; die Zonen/Slots duerfen Client-Components sein (SV-Interaktivitaet lebt dort,
 * nicht im Kern — DECISIONS 2026-07-31 · C4).
 */
export function FallAkteStack<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const zones = config.zones(vm)
  const header = config.header(vm)
  const realtime = config.realtime?.(vm) ?? null
  const slots = config.slots?.(vm) ?? {}

  return (
    <div className={config.wrapperClassName ?? 'min-h-full'}>
      {realtime && <FallRealtimeRefresh fallId={realtime.fallId} claimId={realtime.claimId} />}
      {slots.beforeHeader}

      {'custom' in header ? (
        header.custom
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <PageHeader title={header.title} description={header.description || undefined} />
          {header.badges}
        </div>
      )}

      {slots.topBlocks}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-4 sm:space-y-6">
        {zones.map((z) => {
          // C4a-Cast: Record<ZK, FallAkteZone<Vm>>[ZK] loest sich fuer generisches ZK nicht auf
          // FallAkteZone<Vm> auf -> JSX LibraryManagedAttributes bricht (TS2322, s. #4940).
          const Zone = config.zoneComponents[z] as FallAkteZone<Vm>
          return (
            <div id={`zone-${z}`} key={z}>
              <Zone vm={vm} />
            </div>
          )
        })}
      </div>

      {slots.footer}
    </div>
  )
}
