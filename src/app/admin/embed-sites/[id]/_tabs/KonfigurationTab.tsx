import type { ReactNode } from 'react'
import { SettingsIcon, MailIcon, ShieldIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { EmbedSiteDetail } from '@/lib/embed-sites/queries'

function Feld({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-claimondo-ondo/70">{label}</dt>
      <dd className="text-body-sm text-claimondo-navy break-words">{value || '—'}</dd>
    </div>
  )
}

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4'

export default function KonfigurationTab({ site }: { site: EmbedSiteDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Site"
        icon={<SettingsIcon className="w-4 h-4 text-claimondo-ondo" />}
        headerAction={
          <StatusBadge
            colorCls={
              site.aktiv
                ? 'bg-success-soft text-success-strong'
                : 'bg-danger-soft text-danger-strong'
            }
          >
            {site.aktiv ? 'Aktiv' : 'Pausiert'}
          </StatusBadge>
        }
        bodyClassName={GRID}
      >
        <Feld label="Name" value={site.name} />
        <Feld label="Slug" value={<span className="font-mono">{site.slug}</span>} />
        <Feld label="Variante" value={site.variante} />
        <Feld label="Funnel-Modus" value={site.funnelModus} />
        {!site.aktiv && <Feld label="Pause-Grund" value={site.pausedGrund} />}
        <Feld
          label="Angelegt"
          value={new Date(site.erstelltAm).toLocaleDateString('de-DE')}
        />
      </SectionCard>

      <SectionCard
        title="Zustellung"
        icon={<MailIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Wohin die Leads dieser Site laufen."
        bodyClassName={GRID}
      >
        <Feld label="Empfänger-E-Mail" value={site.empfaengerEmail} />
        <Feld label="CC-E-Mail" value={site.ccEmail} />
        <Feld
          label="WhatsApp-Routing"
          value={<span className="font-mono">{site.baileysRoutingNummer}</span>}
        />
        <Feld label="SV-Telefon" value={site.svTelefon} />
      </SectionCard>

      <SectionCard
        title="Sicherheit"
        icon={<ShieldIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Domain-Allowlist und AGB — bislang für Admins nicht einsehbar."
        bodyClassName="space-y-4"
      >
        <div>
          <dt className="text-caption text-claimondo-ondo/70 mb-1">
            Erlaubte Domains ({site.erlaubteDomains.length})
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {site.erlaubteDomains.length === 0 ? (
              <StatusBadge colorCls="bg-warning-soft text-warning-strong">
                Keine Allowlist gesetzt
              </StatusBadge>
            ) : (
              site.erlaubteDomains.map((d) => (
                <StatusBadge key={d} colorCls="bg-claimondo-bg text-claimondo-ondo">
                  <span className="font-mono">{d}</span>
                </StatusBadge>
              ))
            )}
          </dd>
        </div>
        <div className={GRID}>
          <Feld
            label="AGB akzeptiert"
            value={
              site.agbAkzeptiertAm
                ? new Date(site.agbAkzeptiertAm).toLocaleDateString('de-DE')
                : null
            }
          />
          <Feld label="AGB-Version" value={site.agbVersion} />
        </div>
      </SectionCard>
    </div>
  )
}
