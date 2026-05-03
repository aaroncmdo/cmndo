'use client'

// Aaron 2026-04-30: Ansprechpartner-Card direkt in der SV-Fallakte
// (vorher nur über den FallakteDrawer-Tab erreichbar — Drawer wurde
// auf Aaron-Wunsch aus dem Header genommen).

import { MailIcon, PhoneIcon, UsersIcon } from 'lucide-react'
import type { TeamMitglied } from './FallakteDrawer'

const ROLLE_LABEL: Record<TeamMitglied['rolle'], string> = {
  kundenbetreuer: 'Kundenbetreuer',
  kanzlei: 'Kanzlei',
  kunde: 'Kunde',
}

const ROLLE_ORDER: Record<TeamMitglied['rolle'], number> = {
  kundenbetreuer: 0,
  kanzlei: 1,
  kunde: 2,
}

function initialen(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export default function AnsprechpartnerCard({ team }: { team: TeamMitglied[] }) {
  if (team.length === 0) return null
  const ordered = [...team].sort((a, b) => ROLLE_ORDER[a.rolle] - ROLLE_ORDER[b.rolle])
  return (
    <div className="rounded-2xl bg-white border border-claimondo-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <UsersIcon className="w-4 h-4 text-claimondo-navy" />
        <p className="text-sm font-semibold text-claimondo-navy">Ansprechpartner</p>
      </div>
      <ul className="space-y-3">
        {ordered.map((m, i) => (
          <li key={`${m.rolle}-${i}`}>
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1">
              {ROLLE_LABEL[m.rolle]}
            </p>
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-full bg-claimondo-navy text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initialen(m.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-claimondo-navy truncate">
                  {m.name || '—'}
                </p>
                {m.telefon && (
                  <a
                    href={`tel:${m.telefon}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy"
                  >
                    <PhoneIcon className="w-3 h-3 shrink-0" />
                    {m.telefon}
                  </a>
                )}
                {m.email && (
                  <a
                    href={`mailto:${m.email}`}
                    className="block mt-0.5 inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy truncate"
                  >
                    <MailIcon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{m.email}</span>
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
