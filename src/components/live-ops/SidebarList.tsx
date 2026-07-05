'use client'

import { useState, useMemo } from 'react'
import { tokens } from '@/lib/design-tokens'
import { Badge } from '@/components/primitives/Badge/Badge.web'
import { Text } from '@/components/primitives/Text/Text.web'
import type { SvLiveOps, TerminPin } from '@/lib/live-ops'

// ------------------------------------------------------------------ Props

export interface SidebarListProps {
  svs: SvLiveOps[]
  termine: TerminPin[]
  hoveredSvId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

// ------------------------------------------------------------------ Hilfsfunktionen

function typTone(
  typ: string,
): 'info' | 'success' | 'warning' | 'navy' | 'neutral' {
  switch (typ) {
    case 'kfz':
      return 'info'
    case 'dat':
      return 'warning'
    case 'akademie':
      return 'success'
    case 'buero':
      return 'navy'
    default:
      return 'neutral'
  }
}

function typLabel(typ: string): string {
  switch (typ) {
    case 'kfz':
      return 'KFZ'
    case 'dat':
      return 'DAT'
    case 'akademie':
      return 'Akademie'
    case 'buero':
      return 'Büro'
    default:
      return typ
  }
}

function formatTerminZeit(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    })
  } catch {
    return iso
  }
}

// ------------------------------------------------------------------ SV-Item

interface SvItemProps {
  sv: SvLiveOps
  hovered: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

function SvItem({ sv, hovered, onHover, onSelect }: SvItemProps) {
  const unterwegs = sv.car.mode !== 'none'
  const auslastungPct =
    sv.gesamt > 0 ? Math.round((sv.genutzt / sv.gesamt) * 100) : 0

  return (
    <button
      type="button"
      onClick={() => onSelect(sv.id)}
      onMouseEnter={() => onHover(sv.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
        textAlign: 'left',
        background: hovered
          ? `color-mix(in srgb, var(--brand-secondary, #4573A2) 8%, transparent)`
          : 'none',
        border: 'none',
        borderRadius: tokens.radius.sm,
        padding: `${tokens.spacing[2]}px ${tokens.spacing[2]}px`,
        cursor: 'pointer',
        transition: 'background 100ms ease',
      }}
      aria-label={`${sv.name} öffnen`}
    >
      {/* Zeile 1: Name + Unterwegs-Indikator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing[1],
          minWidth: 0,
        }}
      >
        {unterwegs && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: tokens.colors.success,
              flexShrink: 0,
            }}
            aria-label="Unterwegs"
          />
        )}
        <Text variant="bodySm" color="navy" truncate as="span">
          {sv.name}
        </Text>
        {sv.gesperrt && (
          <Badge tone="danger" size="sm">
            Gesperrt
          </Badge>
        )}
      </div>

      {/* Zeile 2: Typ-Badge + Auslastung */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing[1],
        }}
      >
        <Badge tone={typTone(sv.typ)} size="sm">
          {typLabel(sv.typ)}
        </Badge>
        <Text variant="caption" color="lightBlue" as="span">
          {sv.genutzt}/{sv.gesamt} ({auslastungPct}%)
        </Text>
        {sv.urlaub && !sv.gesperrt && (
          <Badge tone="warning" size="sm">
            Urlaub
          </Badge>
        )}
      </div>
    </button>
  )
}

// ------------------------------------------------------------------ Termin-Item

interface TerminItemProps {
  termin: TerminPin
}

function TerminItem({ termin }: TerminItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: `${tokens.spacing[1]}px ${tokens.spacing[2]}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing[1],
        }}
      >
        <Text variant="caption" color="navy" as="span" truncate>
          {formatTerminZeit(termin.startZeit)} — {termin.kundeName}
        </Text>
      </div>
      <Text variant="caption" color="lightBlue" as="span" truncate>
        {termin.svName} · {termin.claimNummer}
      </Text>
    </div>
  )
}

// ------------------------------------------------------------------ Component

export default function SidebarList({
  svs,
  termine,
  hoveredSvId,
  onHover,
  onSelect,
}: SidebarListProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')

  // Sortierung: unterwegs zuerst, dann Rest
  const sorted = useMemo<SvLiveOps[]>(() => {
    const unterwegs = svs.filter((sv) => sv.car.mode !== 'none')
    const rest = svs.filter((sv) => sv.car.mode === 'none')
    return [...unterwegs, ...rest]
  }, [svs])

  // Suche: filtert über Name und Typ
  const filtered = useMemo<SvLiveOps[]>(() => {
    if (!query.trim()) return sorted
    const q = query.toLowerCase()
    return sorted.filter(
      (sv) =>
        sv.name.toLowerCase().includes(q) ||
        sv.typ.toLowerCase().includes(q),
    )
  }, [sorted, query])

  const unterwegsCount = svs.filter((sv) => sv.car.mode !== 'none').length

  return (
    <div
      style={{
        position: 'absolute',
        top: 72,
        right: 12,
        zIndex: 10,
        backgroundColor: 'rgba(248,249,251,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: tokens.radius.md,
        boxShadow: tokens.shadow.md,
        border: `1px solid ${tokens.cssColors.border}`,
        width: 228,
        maxHeight: 'calc(100vh - 160px)',
        display: 'flex',
        flexDirection: 'column',
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
          flexShrink: 0,
          width: '100%',
          padding: `${tokens.spacing[2]}px ${tokens.spacing[3]}px`,
          background: 'none',
          border: 'none',
          borderBottom: collapsed
            ? 'none'
            : `1px solid ${tokens.cssColors.border}`,
          cursor: 'pointer',
        }}
        aria-expanded={!collapsed}
        aria-label="SV-Liste ein-/ausklappen"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[1] }}>
          <Text variant="bodySm" color="navy" as="span">
            SVs
          </Text>
          {unterwegsCount > 0 && (
            <Badge tone="success" size="sm">
              {unterwegsCount} unterwegs
            </Badge>
          )}
        </div>
        <span
          style={{
            fontSize: 10,
            color: tokens.cssColors.lightBlue,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
            display: 'inline-block',
          }}
        >
          ▼
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Suchfeld */}
          <div
            style={{
              flexShrink: 0,
              padding: `${tokens.spacing[1]}px ${tokens.spacing[2]}px`,
              borderBottom: `1px solid ${tokens.cssColors.border}`,
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name oder Typ suchen…"
              style={{
                width: '100%',
                fontSize: tokens.typo.bodySm.size,
                color: tokens.cssColors.navy,
                backgroundColor: tokens.cssColors.bg,
                border: `1px solid ${tokens.cssColors.border}`,
                borderRadius: tokens.radius.sm,
                padding: `${tokens.spacing[1]}px ${tokens.spacing[2]}px`,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              aria-label="SVs suchen"
            />
          </div>

          {/* Liste */}
          <div style={{ overflowY: 'auto', flex: 1, padding: tokens.spacing[1] }}>
            {filtered.length === 0 && (
              <div
                style={{
                  padding: tokens.spacing[3],
                  textAlign: 'center',
                }}
              >
                <Text variant="caption" color="lightBlue" as="p">
                  Keine SVs gefunden
                </Text>
              </div>
            )}

            {/* SV-Items */}
            {filtered.map((sv) => (
              <SvItem
                key={sv.id}
                sv={sv}
                hovered={hoveredSvId === sv.id}
                onHover={onHover}
                onSelect={onSelect}
              />
            ))}

            {/* Heutige Termine */}
            {termine.length > 0 && (
              <>
                <div
                  style={{
                    height: 1,
                    backgroundColor: tokens.cssColors.border,
                    margin: `${tokens.spacing[2]}px 0`,
                  }}
                />
                <div
                  style={{
                    padding: `${tokens.spacing[1]}px ${tokens.spacing[2]}px`,
                    marginBottom: 2,
                  }}
                >
                  <Text variant="caption" color="lightBlue" as="span">
                    Heutige Termine ({termine.length})
                  </Text>
                </div>
                {termine.map((termin) => (
                  <TerminItem key={termin.id} termin={termin} />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
