'use client'

import type { BrandThemeV2 } from '@/lib/branding/theme'
import type { FontPair } from '@/lib/branding/fonts'
import { HomeIcon, UsersIcon, CalendarIcon, FileTextIcon, BellIcon } from 'lucide-react'

// AAR-422: Komplette App-Preview — Sidebar + Header + Card + Buttons. Wird
// vom BrandingEditor in Echtzeit gerendert wenn Theme oder Font wechselt.
// Kein API-Call, kein externes State — pure Darstellung.

type Props = {
  theme: BrandThemeV2
  fontPair: FontPair
  logoUrl?: string | null
  firmenname?: string | null
}

export default function LivePreview({ theme, fontPair, logoUrl, firmenname }: Props) {
  return (
    <div
      className="rounded-2xl border border-claimondo-border overflow-hidden shadow-sm"
      style={{ background: theme.background }}
    >
      {/* Header-Leiste (Brand-Name + Notifications) */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ background: theme.surface, borderColor: theme.border }}
      >
        <div className="flex items-center gap-2">
          {logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt="" className="h-6 w-auto object-contain" />
          )}
          <span
            style={{
              fontFamily: fontPair.cssStack.heading,
              fontWeight: 700,
              fontSize: 14,
              color: theme.textPrimary,
            }}
          >
            {firmenname ?? 'Mein Sachverständigenbüro'}
          </span>
        </div>
        <BellIcon className="w-4 h-4" style={{ color: theme.textSecondary }} />
      </div>

      {/* Body: Sidebar + Content */}
      <div className="flex" style={{ minHeight: 260 }}>
        {/* Sidebar */}
        <div
          className="w-36 py-3 px-2 flex flex-col gap-0.5"
          style={{ background: theme.sidebarBg, color: theme.sidebarText }}
        >
          <SidebarItem
            icon={<HomeIcon className="w-3.5 h-3.5" />}
            label="Dashboard"
            active
            activeBg={theme.sidebarActive}
          />
          <SidebarItem icon={<FileTextIcon className="w-3.5 h-3.5" />} label="Fälle" />
          <SidebarItem icon={<UsersIcon className="w-3.5 h-3.5" />} label="Kunden" />
          <SidebarItem icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Termine" />
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          <h3
            style={{
              fontFamily: fontPair.cssStack.heading,
              fontWeight: 700,
              fontSize: 18,
              color: theme.textPrimary,
              lineHeight: 1.2,
            }}
          >
            Willkommen zurück
          </h3>
          <p
            style={{
              fontFamily: fontPair.cssStack.body,
              fontSize: 12,
              color: theme.textSecondary,
            }}
          >
            {fontPair.preview} Sie haben 3 neue Termine und 2 offene Nachfragen.
          </p>

          {/* Card */}
          <div
            className="rounded-lg p-3 space-y-2"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontFamily: fontPair.cssStack.heading,
                  fontWeight: 600,
                  fontSize: 12,
                  color: theme.textPrimary,
                }}
              >
                Schaden #1234
              </span>
              <StatusPill label="Neu" bg={theme.success} />
            </div>
            <p
              style={{
                fontFamily: fontPair.cssStack.body,
                fontSize: 11,
                color: theme.textSecondary,
              }}
            >
              Sachschaden an VW Golf · Vor-Ort-Termin morgen 14:00
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              style={{
                fontFamily: fontPair.cssStack.body,
                background: theme.primary,
                color: theme.textOnPrimary,
                fontSize: 12,
                fontWeight: 600,
              }}
              className="px-3 py-1.5 rounded-lg"
            >
              Bestätigen
            </button>
            <button
              type="button"
              style={{
                fontFamily: fontPair.cssStack.body,
                background: 'transparent',
                color: theme.secondary,
                border: `1px solid ${theme.secondary}`,
                fontSize: 12,
                fontWeight: 500,
              }}
              className="px-3 py-1.5 rounded-lg"
            >
              Später
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarItem({
  icon, label, active, activeBg,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  activeBg?: string
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px]"
      style={{
        background: active ? activeBg : 'transparent',
        opacity: active ? 1 : 0.8,
        fontWeight: active ? 600 : 500,
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  )
}

function StatusPill({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded"
      style={{ background: bg, color: '#FFFFFF', fontWeight: 600 }}
    >
      {label}
    </span>
  )
}
