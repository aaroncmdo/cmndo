'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
// Tr = Kopfzeile/Leerzeile, ClickableTr = drillbare Body-Zeilen.
import { DataTableContainer, Table, Thead, Tbody, Tr, ClickableTr, Th, Td } from '@/components/shared/DataTable'
import { setEmbedFunnelModus } from './actions'

interface SiteRow {
  id: string
  name: string
  slug: string
  variante: string
  aktiv: boolean
  funnel_modus: 'callback' | 'flowlink'
  sv_name: string
  anfragen_gesamt: number
  letzte_anfrage_am: string | null
  // Impression-Telemetrie: Config-Loads des Widgets (eingebaut? wo?)
  config_hits: number
  letzter_config_hit_am: string | null
  letzter_config_origin: string | null
}

function kurzDatum(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function EmbedSitesAdminClient({ sites }: { sites: SiteRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggleModus(id: string, current: 'callback' | 'flowlink') {
    const next: 'callback' | 'flowlink' = current === 'flowlink' ? 'callback' : 'flowlink'
    setBusyId(id)
    startTransition(async () => {
      const res = await setEmbedFunnelModus(id, next)
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler beim Umstellen')
        return
      }
      toast.success(next === 'flowlink' ? 'Auf Self-Service umgestellt.' : 'Auf Callback umgestellt.')
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Embed-Sites — Funnel-Modus"
        size="lg"
        description="Pro SV-Embed: Callback (SV ruft den Kunden zurück) oder Self-Service (Kunde erhält den /flow-Buchungslink). Self-Service ist admin-kontrolliert."
      />

      <SectionCard>
        <h2 className="text-sm font-semibold text-claimondo-navy mb-1">Alle Embed-Sites ({sites.length})</h2>
        <p className="text-xs text-claimondo-ondo mb-3">
          Default ist Callback. Self-Service schaltet den kanonischen /flow-Funnel für die Kunden dieses SV frei
          (Kunde bekommt den Buchungslink per WhatsApp/SMS/E-Mail).
        </p>
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Gutachter</Th>
                <Th>Slug</Th>
                <Th>Variante</Th>
                <Th>Anfragen</Th>
                <Th>Widget-Loads</Th>
                <Th>Funnel-Modus</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sites.map((s) => (
                // P1: Zeile drillbar — Soft-Nav oeffnet den Drawer, Deep-Link die Full-Page.
                <ClickableTr key={s.id} onClick={() => router.push(`/admin/embed-sites/${s.id}`)}>
                  <Td>
                    {s.name}
                    {!s.aktiv && <span className="ml-2 text-xs text-claimondo-ondo">(pausiert)</span>}
                  </Td>
                  <Td>{s.sv_name}</Td>
                  <Td className="font-mono text-xs">{s.slug}</Td>
                  <Td>{s.variante}</Td>
                  <Td>
                    <div>{s.anfragen_gesamt}</div>
                    {s.letzte_anfrage_am && (
                      <div className="text-xs text-claimondo-ondo">{kurzDatum(s.letzte_anfrage_am)}</div>
                    )}
                  </Td>
                  <Td>
                    <div>{s.config_hits}</div>
                    {s.letzter_config_origin && (
                      <div className="text-xs text-claimondo-ondo font-mono">
                        {s.letzter_config_origin}
                        {s.letzter_config_hit_am ? ` · ${kurzDatum(s.letzter_config_hit_am)}` : ''}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {/* Aktions-Zelle: stopPropagation, sonst navigiert der Funnel-Toggle
                        die Zeile mit weg. Das Button-Primitive reicht kein Event durch
                        (onClick: () => void), also faengt der Wrapper den Bubble ab. */}
                    <div
                      className="flex items-center gap-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span
                        className={
                          s.funnel_modus === 'flowlink'
                            ? 'text-sm font-medium text-claimondo-navy'
                            : 'text-sm text-claimondo-ondo'
                        }
                      >
                        {s.funnel_modus === 'flowlink' ? 'Self-Service' : 'Callback'}
                      </span>
                      <Button
                        variant="bare"
                        size="sm"
                        loading={busyId === s.id}
                        onClick={() => toggleModus(s.id, s.funnel_modus)}
                      >
                        {s.funnel_modus === 'flowlink' ? '→ Callback' : '→ Self-Service'}
                      </Button>
                    </div>
                  </Td>
                </ClickableTr>
              ))}
              {sites.length === 0 && (
                <Tr>
                  <Td colSpan={7}>Noch keine Embed-Sites angelegt.</Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      </SectionCard>
    </div>
  )
}
