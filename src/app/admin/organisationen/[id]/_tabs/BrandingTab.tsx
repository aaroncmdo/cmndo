import Image from 'next/image'
import { PaletteIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { OrganisationDetail } from '@/lib/organisationen/queries'

// Hinweis Token-Audit: die Farbwerte kommen aus der DB (org.brandPrimary o.ä.),
// es stehen KEINE Hex-Literale im Quelltext -> das Inline-`style` ist zulaessig.
function Swatch({ label, hex }: { label: string; hex: string | null }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span
        className="w-8 h-8 rounded-ios-sm border border-claimondo-border shrink-0"
        style={hex ? { backgroundColor: hex } : undefined}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-caption text-claimondo-ondo/70">{label}</span>
        <span className="block text-body-sm font-mono text-claimondo-navy">{hex ?? '—'}</span>
      </span>
    </div>
  )
}

export default function BrandingTab({ org }: { org: OrganisationDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Whitelabel-Branding"
        icon={<PaletteIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Ist das Custom-Branding aktiv, brandet diese Organisation ihr Portal — und die Sicht ihrer Kunden."
        headerAction={
          <StatusBadge
            colorCls={
              org.useCustomBranding
                ? 'bg-success-soft text-success-strong'
                : 'bg-claimondo-bg text-claimondo-ondo'
            }
          >
            {org.useCustomBranding ? 'Aktiv' : 'Inaktiv'}
          </StatusBadge>
        }
        bodyClassName="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <Swatch label="Primär" hex={org.brandPrimary} />
        <Swatch label="Sekundär" hex={org.brandSecondary} />
        <Swatch label="Akzent" hex={org.brandAccent} />
      </SectionCard>

      <SectionCard title="Logo" bodyClassName="space-y-3">
        {org.logoUrl ? (
          <Image
            src={org.logoUrl}
            alt={`Logo ${org.name}`}
            width={200}
            height={80}
            className="h-16 w-auto object-contain"
            unoptimized
          />
        ) : (
          <p className="text-body-sm text-claimondo-ondo/70">Kein Logo hinterlegt.</p>
        )}
        {org.brandExtractedAt && (
          <p className="text-caption text-claimondo-ondo/70">
            Farben zuletzt aus dem Logo extrahiert am{' '}
            {new Date(org.brandExtractedAt).toLocaleDateString('de-DE')}
          </p>
        )}
      </SectionCard>
    </div>
  )
}
