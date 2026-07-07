'use client'
// KB-Cockpit Phase 1b: Hover-Split Popover fuer MeineArbeitBoard cards.
// Zeigt Claim-Felder mit Inline-Editier-Funktion + naechste-beste-Aktion CTA.
// Keine inline Status-/Farb-Maps (check:status-registry-konform).
// Farbe via Claimondo-Token, Radii via rounded-ios-*.

import { useState } from 'react'
import { CLAIM_WORKFLOW_META } from '@/lib/ops/claim-workflow-meta'
import { updateClaimField, ALLOWED_CLAIM_FIELDS } from '@/app/mitarbeiter/claim-edit-actions'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'

// Pure helper: exported so tests can call it directly (env=node, no jsdom needed).
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (field === 'schadens_hoehe_netto' && typeof value === 'number') {
    return new Intl.NumberFormat('de-DE').format(value) + ' €'
  }
  return String(value)
}

const FIELD_LABEL: Record<string, string> = {
  notizen: 'Notizen',
  interne_notizen: 'Interne Notizen',
  schadens_hoehe_netto: 'Schadenshöhe (netto)',
}

function EditableRow({
  claimId,
  field,
  initialValue,
}: {
  claimId: string
  field: string
  initialValue: string | number | null
}) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState<string>(initialValue !== null && initialValue !== undefined ? String(initialValue) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const parsedValue: string | number | null =
      field === 'schadens_hoehe_netto'
        ? localValue === '' ? null : Number(localValue.replace(',', '.'))
        : localValue === '' ? null : localValue

    const res = await updateClaimField(claimId, field, parsedValue)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
    } else {
      setEditing(false)
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-caption text-claimondo-ondo/70 shrink-0">
          {FIELD_LABEL[field] ?? field}
        </span>
        {!editing && (
          <button
            type="button"
            aria-label={`${FIELD_LABEL[field] ?? field} bearbeiten`}
            className="text-caption text-claimondo-ondo/50 hover:text-claimondo-ondo transition-colors shrink-0"
            onClick={() => { setEditing(true); setError(null) }}
          >
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1">
          <input
            type={field === 'schadens_hoehe_netto' ? 'number' : 'text'}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            className="w-full rounded-ios-sm border border-claimondo-border px-2 py-1 text-body-xs text-claimondo-navy bg-white focus:outline-none focus:border-claimondo-ondo"
            autoFocus
            disabled={saving}
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-caption px-2 py-0.5 rounded-ios-sm bg-claimondo-navy text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null) }}
              disabled={saving}
              className="text-caption px-2 py-0.5 rounded-ios-sm border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50 transition-colors"
            >
              Abbrechen
            </button>
          </div>
          {error && (
            <p className="text-caption text-danger-strong">{error}</p>
          )}
        </div>
      ) : (
        <span className="text-body-xs text-claimondo-navy break-words">
          {formatFieldValue(field, localValue !== '' ? (field === 'schadens_hoehe_netto' ? Number(localValue) : localValue) : null)}
        </span>
      )}
    </div>
  )
}

export default function ClaimHoverCard({ item }: { item: ClaimWorkItem }) {
  const meta = CLAIM_WORKFLOW_META[item.subState]
  const fallUrl = item.fallId ? `/faelle/${item.fallId}` : null

  return (
    <div className="w-80 rounded-ios-xl border border-claimondo-border bg-white shadow-md p-3 flex flex-col gap-3">
      {/* Header: Titel + Claim-Nummer */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-body-sm font-semibold text-claimondo-navy truncate">
            {item.display.title}
          </p>
          {item.claimNummer && (
            <p className="text-caption font-mono text-claimondo-ondo/70">
              {item.claimNummer}
            </p>
          )}
        </div>
        {item.display.kennzeichen && (
          <span className="text-caption font-mono text-claimondo-ondo shrink-0 bg-claimondo-bg rounded-ios-sm px-1.5 py-0.5 border border-claimondo-border">
            {item.display.kennzeichen}
          </span>
        )}
      </div>

      {/* Naechste-beste-Aktion */}
      <div className="flex items-center gap-1.5">
        <span className="text-caption text-claimondo-ondo/70">Nächste Aktion:</span>
        <span className="text-caption font-medium text-claimondo-navy bg-claimondo-bg rounded-ios-sm px-1.5 py-0.5 border border-claimondo-border">
          {meta.ctaLabel}
        </span>
      </div>

      {/* Schadenshöhe (Anzeige, nicht editierbar direkt via claim-Display) */}
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-claimondo-ondo/70">Schadenshöhe</span>
        <span className="text-body-xs text-claimondo-navy">
          {formatFieldValue('schadens_hoehe_netto', item.display.schadenhoehe)}
        </span>
      </div>

      {/* Editierbare Felder */}
      <div className="flex flex-col gap-2 border-t border-claimondo-border pt-2">
        {ALLOWED_CLAIM_FIELDS.map((field) => (
          <EditableRow
            key={field}
            claimId={item.id}
            field={field}
            initialValue={null}
          />
        ))}
      </div>

      {/* Quick Actions */}
      {fallUrl && (
        <div className="border-t border-claimondo-border pt-2">
          <a
            href={fallUrl}
            className="text-body-xs text-claimondo-ondo hover:text-claimondo-navy transition-colors underline underline-offset-2"
          >
            Fall öffnen →
          </a>
        </div>
      )}
    </div>
  )
}
