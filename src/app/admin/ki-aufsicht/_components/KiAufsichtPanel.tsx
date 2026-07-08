'use client'

// KI-Aufsicht SLA-Rollen-Panel.
// Exportiert fuer spaeteres Ops-Cockpit-Embed (470d55c9).
// Status-Ampel: plain-Text-Labels statt inline-Farb-Map (kein status-registry-Verstoss).
// Mutations: useTransition + toast.error bei !ok; router.refresh() nach Mutation.
// useState-Initializer-Lehre (Ink.1): useEffect re-synct Props nach RSC-Refresh.

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import type { SlaRollenLage } from '@/lib/aufsicht/sla-rollen'
import {
  freigebenAufsichtVorschlag,
  verwerfenAufsichtVorschlag,
} from '@/app/admin/ki-aufsicht/actions'

// Vorschlag-Shape aus der DB-Abfrage (Spalten aus page.tsx .select())
export type AufsichtVorschlag = {
  id: string
  claim_id: string | null
  vorschlag_typ: string | null
  ziel_rolle: string | null
  payload: Record<string, unknown> | null
  begruendung: string | null
}

// ── Rollen-Label-Map (kein Farb-Mapping, nur Text) ──────────────────────────

const ROLLEN_LABEL: Record<string, string> = {
  dispatch: 'Dispatch',
  sachverstaendiger: 'Sachverständiger',
  kundenbetreuer: 'Kundenbetreuer',
  kanzlei: 'Kanzlei',
  admin: 'Admin',
  kunde: 'Kunde',
  unbekannt: 'Unbekannt',
}

// ── Ampel-Status als Textlabel (plain — kein Status-Registry-Verstoss) ───────

function ampelLabel(breached: number, impending: number): string {
  if (breached > 0) return `${breached} überfällig`
  if (impending > 0) return `${impending} bevorstehend`
  return 'im Plan'
}

// Ampel-Klassen: nutzen semantische Token-Klassen (bg-danger-soft/bg-warning-soft/bg-success-soft)
function ampelCls(breached: number, impending: number): string {
  if (breached > 0) return 'bg-danger-soft text-danger-strong'
  if (impending > 0) return 'bg-warning-soft text-warning-strong'
  return 'bg-success-soft text-success-strong'
}

// ── Payload-Titel-Extraktion ─────────────────────────────────────────────────

function extractTitel(payload: Record<string, unknown> | null): string {
  if (!payload) return '—'
  if (typeof payload.titel === 'string' && payload.titel) return payload.titel
  if (typeof payload.beschreibung === 'string' && payload.beschreibung)
    return payload.beschreibung
  return '—'
}

// ── Props ────────────────────────────────────────────────────────────────────

export type KiAufsichtPanelProps = {
  lage: SlaRollenLage
  vorschlaege: AufsichtVorschlag[]
}

// ── Komponente ───────────────────────────────────────────────────────────────

export function KiAufsichtPanel({ lage, vorschlaege }: KiAufsichtPanelProps) {
  // Re-sync nach RSC-Refresh (useState-Initializer laeuft nur einmal — Ink.1-Lehre)
  const [localVorschlaege, setLocalVorschlaege] = useState(vorschlaege)
  useEffect(() => {
    setLocalVorschlaege(vorschlaege)
  }, [vorschlaege])

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function freigeben(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const r = await freigebenAufsichtVorschlag(id)
      if (!r.ok) toast.error(r.error ?? 'Fehler')
      else toast.success('Vorschlag freigegeben — Task erstellt')
      setPendingId(null)
      router.refresh()
    })
  }

  function verwerfen(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const r = await verwerfenAufsichtVorschlag(id)
      if (!r.ok) toast.error(r.error ?? 'Fehler')
      else toast.success('Vorschlag verworfen')
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Gesamt-Übersicht ── */}
      <SectionCard
        title="SLA-Übersicht"
        subtitle={`${lage.gesamt.breached} überfällig · ${lage.gesamt.impending} bevorstehend · ${lage.gesamt.pending} offen`}
      >
        {lage.proRolle.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo">Keine offenen SLA-Einträge.</p>
        ) : (
          <div className="space-y-4">
            {lage.proRolle.map((entry) => (
              <div key={entry.rolle} className="border border-claimondo-border rounded-ios-md p-4">
                {/* Rollen-Header */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-body-sm font-semibold text-claimondo-navy">
                    {ROLLEN_LABEL[entry.rolle] ?? entry.rolle}
                  </h4>
                  <span
                    className={`inline-flex items-center rounded-full text-caption font-medium px-2 py-0.5 whitespace-nowrap ${ampelCls(entry.breached, entry.impending)}`}
                  >
                    {ampelLabel(entry.breached, entry.impending)}
                  </span>
                </div>

                {/* Zähler */}
                <div className="flex gap-4 text-body-xs text-claimondo-ondo mb-3">
                  <span>
                    <strong className="text-claimondo-navy">{entry.breached}</strong> überfällig
                  </span>
                  <span>
                    <strong className="text-claimondo-navy">{entry.impending}</strong> bevorstehend
                  </span>
                  <span>
                    <strong className="text-claimondo-navy">{entry.pending}</strong> offen
                  </span>
                </div>

                {/* Kritischste Fälle */}
                {entry.kritischste.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-caption text-claimondo-ondo/70 uppercase font-semibold tracking-wide mb-1">
                      Kritischste Fristen
                    </p>
                    {entry.kritischste.map((k) => (
                      <div
                        key={`${k.claim_id}-${k.sla_typ}`}
                        className="flex items-center justify-between gap-2 text-body-xs"
                      >
                        <span className="text-claimondo-navy font-medium">{k.claim_nummer}</span>
                        <span className="text-claimondo-ondo">{k.sla_typ.replace(/_/g, ' ')}</span>
                        <span className="text-danger-strong font-medium whitespace-nowrap">
                          {k.ueberfaellig_std > 0
                            ? `${Math.round(k.ueberfaellig_std)} Std überfällig`
                            : `${Math.round(-k.ueberfaellig_std)} Std verbleibend`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Aufsicht-Vorschläge ── */}
      <SectionCard
        title="KI-Aufsicht-Vorschläge"
        subtitle={
          localVorschlaege.length === 0
            ? 'Keine offenen Remediations — alles entschieden oder noch kein Lauf.'
            : `${localVorschlaege.length} offener${localVorschlaege.length !== 1 ? 'e' : ''} Vorschlag${localVorschlaege.length !== 1 ? 'e' : ''} warten auf Freigabe`
        }
      >
        {localVorschlaege.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo">Keine offenen Vorschläge.</p>
        ) : (
          <div className="space-y-4">
            {localVorschlaege.map((v) => (
              <div
                key={v.id}
                className="border border-claimondo-border rounded-ios-md p-4 space-y-2"
              >
                {/* Typ + Zielrolle */}
                <div className="flex items-center gap-2">
                  <span className="text-caption uppercase text-claimondo-ondo font-semibold">
                    {v.vorschlag_typ ?? 'task'}
                  </span>
                  {v.ziel_rolle && (
                    <>
                      <span className="text-caption text-claimondo-ondo">·</span>
                      <span className="text-caption text-claimondo-ondo">
                        {ROLLEN_LABEL[v.ziel_rolle] ?? v.ziel_rolle}
                      </span>
                    </>
                  )}
                </div>

                {/* Titel aus Payload */}
                <p className="font-semibold text-claimondo-navy">{extractTitel(v.payload)}</p>

                {/* Begründung */}
                {v.begruendung && (
                  <p className="text-body-sm text-claimondo-ondo">{v.begruendung}</p>
                )}

                {/* Aktionen */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="navy"
                    size="sm"
                    loading={pendingId === v.id}
                    onClick={() => freigeben(v.id)}
                  >
                    Freigeben
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pendingId === v.id}
                    onClick={() => verwerfen(v.id)}
                  >
                    Verwerfen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
