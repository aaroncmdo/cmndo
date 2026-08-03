import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
import type { FallAkteConfig } from '../types'

/**
 * C4a: der 'columns'-Layout-Modus — 1:1 aus dem Kunde-Prototyp (KundeClaimView) extrahiert.
 * Zentrierte Spalte (mobile-first), optionaler Multi-Fall-Zurueck-Link + Header, dann die Zonen
 * als lg:columns-2-Masonry (je Zone id="zone-<key>" + break-inside-avoid = die AufgabenZone-CTA-
 * Sprungziele, muessen erhalten bleiben). Header-Slot ({title,description,badges} ODER {custom})
 * + optionaler topBlocks/footer-Slot (Werkstatt/SV nutzen sie, Kunde nicht -> byte-identisch).
 */
export function FallAkteColumns<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const zones = config.zones(vm)
  const header = config.header(vm)
  const backLink = config.backLink?.(vm) ?? null
  const realtime = config.realtime?.(vm) ?? null
  const slots = config.slots?.(vm) ?? {}

  return (
    <div className="mx-auto px-4 pt-5 pb-8 max-w-xl lg:max-w-5xl">
      {/* Live-Aktualisierung: abonniert gutachter_termine/auftraege/faelle des Falls und
          refresht die server-gerenderten Zonen bei jedem Event (AAR-864-Muster). */}
      {realtime && <FallRealtimeRefresh fallId={realtime.fallId} claimId={realtime.claimId} />}

      <div className="mb-4">
        {backLink && (
          <Link
            href={backLink.href}
            className="text-body-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-2 inline-block"
          >
            &larr; {backLink.label}
          </Link>
        )}
        {'custom' in header ? (
          header.custom
        ) : (
          <>
            <PageHeader title={header.title} description={header.description || undefined} />
            {header.badges}
          </>
        )}
      </div>

      {slots.topBlocks}

      {/* Mobile: fokussierte Single-Column in Zonen-Reihenfolge. Desktop (lg): dieselben Zonen
          in 2 Spalten (CSS-Columns) — Single-Render, daher bleiben die id-Anker + die Reihenfolge
          erhalten; break-inside-avoid haelt jede Zone zusammen. */}
      <div className="lg:columns-2 lg:gap-6">
        {zones.map((z) => {
          const Zone = config.zoneComponents[z]
          return (
            <div id={`zone-${z}`} key={z} className="mb-4 break-inside-avoid">
              <Zone vm={vm} />
            </div>
          )
        })}
      </div>

      {slots.footer}
    </div>
  )
}
