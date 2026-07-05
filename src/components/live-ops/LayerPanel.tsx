'use client'

import { useState } from 'react'
import { tokens } from '@/lib/design-tokens'
import { Checkbox } from '@/components/ui/checkbox'
import type { LayerKey, LayerState, FilterState } from './types'

// ------------------------------------------------------------------ Props

export interface LayerPanelProps {
  layers: LayerState
  onToggle: (k: LayerKey) => void
  filter: FilterState
  onFilter: (f: Partial<FilterState>) => void
}

// ------------------------------------------------------------------ Hilfsfunktionen

const LAYER_LABELS: Record<LayerKey, string> = {
  svs: 'SVs',
  autos: 'Autos',
  termine: 'Termine',
  routen: 'Routen',
  tagesrouten: 'Tagesrouten',
  deadpins: 'Dead-Pins',
  leads: 'Leads',
}

const LAYER_KEYS: LayerKey[] = [
  'svs',
  'autos',
  'termine',
  'routen',
  'tagesrouten',
  'deadpins',
  'leads',
]

const TYP_OPTIONS = [
  { value: 'alle', label: 'Alle Typen' },
  { value: 'kfz', label: 'KFZ' },
  { value: 'dat', label: 'DAT' },
  { value: 'akademie', label: 'Akademie' },
  { value: 'buero', label: 'Büro' },
]

// ------------------------------------------------------------------ Component

export default function LayerPanel({
  layers,
  onToggle,
  filter,
  onFilter,
}: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      style={{
        position: 'absolute',
        top: 72,
        left: 12,
        zIndex: 10,
        backgroundColor: 'rgba(248,249,251,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: tokens.radius.md,
        boxShadow: tokens.shadow.md,
        border: `1px solid ${tokens.cssColors.border}`,
        minWidth: 188,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: `${tokens.spacing[2]}px ${tokens.spacing[3]}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: collapsed
            ? 'none'
            : `1px solid ${tokens.cssColors.border}`,
        }}
        aria-expanded={!collapsed}
        aria-label="Layer-Panel ein-/ausklappen"
      >
        <span
          style={{
            fontSize: tokens.typo.bodySm.size,
            fontWeight: 600,
            color: tokens.cssColors.navy,
          }}
        >
          Layer
        </span>
        <span
          style={{
            fontSize: 10,
            color: tokens.cssColors.lightBlue,
            marginLeft: tokens.spacing[2],
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
            display: 'inline-block',
          }}
        >
          ▼
        </span>
      </button>

      {!collapsed && (
        <div
          style={{
            padding: `${tokens.spacing[2]}px ${tokens.spacing[3]}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing[1],
          }}
        >
          {/* Layer-Checkboxen */}
          {LAYER_KEYS.map((key) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing[2],
                cursor: 'pointer',
                paddingTop: 3,
                paddingBottom: 3,
              }}
            >
              <Checkbox
                checked={layers[key]}
                onCheckedChange={() => onToggle(key)}
              />
              <span
                style={{
                  fontSize: tokens.typo.bodySm.size,
                  color: tokens.cssColors.navy,
                  userSelect: 'none',
                }}
              >
                {LAYER_LABELS[key]}
              </span>
            </label>
          ))}

          {/* Trennlinie */}
          <div
            style={{
              height: 1,
              backgroundColor: tokens.cssColors.border,
              marginTop: tokens.spacing[1],
              marginBottom: tokens.spacing[1],
            }}
          />

          {/* Typ-Filter */}
          <div>
            <span
              style={{
                fontSize: tokens.typo.caption.size,
                color: tokens.cssColors.lightBlue,
                fontWeight: 600,
                display: 'block',
                marginBottom: tokens.spacing[1],
              }}
            >
              Typ
            </span>
            <select
              value={filter.typ}
              onChange={(e) => onFilter({ typ: e.target.value })}
              style={{
                width: '100%',
                fontSize: tokens.typo.bodySm.size,
                color: tokens.cssColors.navy,
                backgroundColor: tokens.cssColors.bg,
                border: `1px solid ${tokens.cssColors.border}`,
                borderRadius: tokens.radius.sm,
                padding: `4px ${tokens.spacing[2]}px`,
                cursor: 'pointer',
                outline: 'none',
              }}
              aria-label="SV-Typ filtern"
            >
              {TYP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Nur-Verifiziert */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing[2],
              cursor: 'pointer',
              paddingTop: 3,
              paddingBottom: 3,
            }}
          >
            <Checkbox
              checked={filter.nurVerifiziert}
              onCheckedChange={(checked) =>
                onFilter({ nurVerifiziert: !!checked })
              }
            />
            <span
              style={{
                fontSize: tokens.typo.bodySm.size,
                color: tokens.cssColors.navy,
                userSelect: 'none',
              }}
            >
              Nur verifiziert
            </span>
          </label>

          {/* Nur-Unterwegs */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing[2],
              cursor: 'pointer',
              paddingTop: 3,
              paddingBottom: 3,
            }}
          >
            <Checkbox
              checked={filter.nurUnterwegs}
              onCheckedChange={(checked) =>
                onFilter({ nurUnterwegs: !!checked })
              }
            />
            <span
              style={{
                fontSize: tokens.typo.bodySm.size,
                color: tokens.cssColors.navy,
                userSelect: 'none',
              }}
            >
              Nur unterwegs
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
