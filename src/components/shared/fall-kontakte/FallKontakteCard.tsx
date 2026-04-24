'use client'

// AAR-754 (Phase C): Shared FallKontakteCard für Admin / SV / Kunde / Makler.
// Zeigt KB, SV und optional Kanzlei als Kontaktblock mit Phone/Mail.
// Rollenspezifische Labels: "Kundenbetreuer" (Admin/SV) / "Ihr Betreuer"
// (Kunde), "Sachverständiger" (Admin/Kunde) / "Mein Gutachter" (Kunde).
//
// Ersetzt:
//  - `src/app/faelle/[id]/_sidebar/FallSidebar.tsx` (Ansprechpartner-Block)
//  - Kunde-`FallDetailSections` inline "Ihr Gutachter"
//  - SV-`StammdatenCard` Kundenbetreuer-Block

import { BriefcaseIcon, HardHatIcon, MailIcon, ScaleIcon } from 'lucide-react'
import Link from 'next/link'
import PhoneButton from '@/components/shared/PhoneButton'

export type FallKontakteRolle = 'admin' | 'kb' | 'sv' | 'kunde' | 'makler'

type Kontakt = {
  id?: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type SvKontakt = (Kontakt & {
  /** Paket-Label — wird als Sub-Text angezeigt (Admin-Only) */
  paket?: string | null
  /** Verifiziert-Badge (Kunde-View) */
  verifiziert?: boolean
  /** Optionaler Deep-Link zur SV-Detailseite (Admin) */
  detailHref?: string | null
}) | null

type FallKontakteCardProps = {
  rolle: FallKontakteRolle
  kundenbetreuer?: Kontakt
  sv?: SvKontakt
  kanzlei?: Kontakt
  /** Überschrift. Default: "Ansprechpartner" */
  title?: string
  /** Klasse auf der Outer-Card (nur Layout/Spacing) */
  className?: string
}

function fullName(k: Kontakt): string | null {
  if (!k) return null
  return [k.vorname, k.nachname].filter(Boolean).join(' ') || null
}

function kbLabel(rolle: FallKontakteRolle): string {
  return rolle === 'kunde' ? 'Ihr Betreuer' : 'Kundenbetreuer'
}

function svLabel(rolle: FallKontakteRolle): string {
  return rolle === 'kunde' ? 'Ihr Gutachter' : 'Sachverständiger'
}

function kanzleiLabel(rolle: FallKontakteRolle): string {
  return rolle === 'kunde' ? 'Ihr Anwalt' : 'Kanzlei'
}

export function FallKontakteCard({
  rolle,
  kundenbetreuer,
  sv,
  kanzlei,
  title = 'Ansprechpartner',
  className = '',
}: FallKontakteCardProps) {
  const kbName = fullName(kundenbetreuer ?? null)
  const svName = fullName(sv ?? null)
  const kanzleiName = fullName(kanzlei ?? null)

  // Leer = nichts rendern
  if (!kbName && !svName && !kanzleiName) return null

  return (
    <section
      className={`bg-white rounded-ios-md border border-claimondo-border p-4 space-y-3 ${className}`}
      aria-label={title}
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo">
        {title}
      </h3>

      {kbName && (
        <KontaktRow
          icon={<BriefcaseIcon className="w-4 h-4 text-claimondo-ondo/70" />}
          label={kbLabel(rolle)}
          name={kbName}
          telefon={kundenbetreuer?.telefon ?? null}
          email={kundenbetreuer?.email ?? null}
        />
      )}

      {svName && (
        <KontaktRow
          icon={<HardHatIcon className="w-4 h-4 text-claimondo-ondo/70" />}
          label={svLabel(rolle)}
          name={svName}
          sub={
            rolle === 'admin' && sv?.paket
              ? `Paket: ${sv.paket}`
              : sv?.verifiziert
                ? 'Verifiziert'
                : null
          }
          telefon={sv?.telefon ?? null}
          email={sv?.email ?? null}
          href={rolle === 'admin' && sv?.detailHref ? sv.detailHref : null}
        />
      )}

      {kanzleiName && (
        <KontaktRow
          icon={<ScaleIcon className="w-4 h-4 text-claimondo-ondo/70" />}
          label={kanzleiLabel(rolle)}
          name={kanzleiName}
          telefon={kanzlei?.telefon ?? null}
          email={kanzlei?.email ?? null}
        />
      )}
    </section>
  )
}

// ─── Internal ──────────────────────────────────────────────────────────

type KontaktRowProps = {
  icon: React.ReactNode
  label: string
  name: string
  sub?: string | null
  telefon: string | null
  email: string | null
  href?: string | null
}

function KontaktRow({ icon, label, name, sub, telefon, email, href }: KontaktRowProps) {
  const body = (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm text-claimondo-navy font-medium truncate">{name}</p>
        {sub && <p className="text-[11px] text-claimondo-ondo">{sub}</p>}
        {(telefon || email) && (
          <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-claimondo-ondo">
            {telefon && (
              <PhoneButton
                nummer={telefon}
                variant="inline"
                label={telefon}
                className="!text-claimondo-ondo hover:!text-claimondo-navy hover:!no-underline"
              />
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-1 hover:text-claimondo-navy min-w-0"
              >
                <MailIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">{email}</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block hover:bg-[#f8f9fb] -m-1 p-1 rounded-lg transition-colors">
        {body}
      </Link>
    )
  }
  return body
}
