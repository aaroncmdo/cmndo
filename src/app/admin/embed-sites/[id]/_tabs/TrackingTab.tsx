import type { ReactNode } from 'react'
import { EuroIcon, ActivityIcon, BarChart3Icon, EyeIcon } from 'lucide-react'
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

/** ok/success -> gruen, error/fail -> rot, sonst neutral. */
function webhookBadgeCls(status: string | null): string {
  if (!status) return 'bg-claimondo-bg text-claimondo-ondo'
  const s = status.toLowerCase()
  if (s.startsWith('2') || s.includes('ok') || s.includes('success')) {
    return 'bg-success-soft text-success-strong'
  }
  return 'bg-danger-soft text-danger-strong'
}

export default function TrackingTab({ site }: { site: EmbedSiteDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Abrechnung & Limits"
        icon={<EuroIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Der Lead-Preis und das Rate-Limit waren für Admins bisher nirgends sichtbar."
        bodyClassName={GRID}
      >
        <Feld
          label="Preis pro Lead"
          value={`${site.einzelpreisEur.toLocaleString('de-DE')} €`}
        />
        <Feld label="Max. Anfragen / Stunde" value={site.maxAnfragenProH} />
        <Feld label="Anfragen gesamt" value={String(site.anfragenGesamt)} />
        <Feld
          label="Letzte Anfrage"
          value={
            site.letzteAnfrageAm
              ? new Date(site.letzteAnfrageAm).toLocaleString('de-DE', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : null
          }
        />
      </SectionCard>

      <SectionCard
        title="Widget-Nutzung"
        icon={<EyeIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Config-Loads des Widgets — zeigt, ob und wo das Snippet eingebaut ist, schon bevor Anfragen kommen."
        bodyClassName={GRID}
      >
        <Feld label="Widget-Loads" value={String(site.configHits)} />
        <Feld
          label="Zuletzt geladen"
          value={
            site.letzterConfigHitAm
              ? new Date(site.letzterConfigHitAm).toLocaleString('de-DE', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : null
          }
        />
        <Feld
          label="Zuletzt geladen von"
          value={
            site.letzterConfigOrigin ? (
              <span className="font-mono text-body-xs">{site.letzterConfigOrigin}</span>
            ) : null
          }
        />
      </SectionCard>

      <SectionCard
        title="Webhook-Health"
        icon={<ActivityIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Ob der Tracking-Webhook läuft — bisher nur in der DB sichtbar."
        headerAction={
          site.trackingWebhookUrl ? (
            <StatusBadge colorCls={webhookBadgeCls(site.webhookLastStatus)}>
              {site.webhookLastStatus ?? 'Noch kein Aufruf'}
            </StatusBadge>
          ) : (
            <StatusBadge colorCls="bg-claimondo-bg text-claimondo-ondo">
              Nicht konfiguriert
            </StatusBadge>
          )
        }
        bodyClassName="space-y-4"
      >
        <div className={GRID}>
          <Feld
            label="Webhook-URL"
            value={
              site.trackingWebhookUrl ? (
                <span className="font-mono text-body-xs">{site.trackingWebhookUrl}</span>
              ) : null
            }
          />
          <Feld
            label="Secret"
            value={
              site.hatWebhookSecret ? (
                <StatusBadge colorCls="bg-success-soft text-success-strong">Gesetzt</StatusBadge>
              ) : (
                <StatusBadge colorCls="bg-warning-soft text-warning-strong">Fehlt</StatusBadge>
              )
            }
          />
          <Feld
            label="Letzter Aufruf"
            value={
              site.webhookLastAt
                ? new Date(site.webhookLastAt).toLocaleString('de-DE', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : null
            }
          />
        </div>
        {site.webhookLastError && (
          <p className="text-body-sm text-danger-strong bg-danger-soft rounded-ios-sm px-3 py-2 break-words">
            <span className="font-semibold">Letzter Fehler: </span>
            {site.webhookLastError}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Conversion-Tracking"
        icon={<BarChart3Icon className="w-4 h-4 text-claimondo-ondo" />}
        bodyClassName={GRID}
      >
        <Feld
          label="GA4 Measurement-ID"
          value={<span className="font-mono">{site.ga4MeasurementId}</span>}
        />
        <Feld
          label="Google-Ads Customer-ID"
          value={<span className="font-mono">{site.gadsCustomerId}</span>}
        />
        <Feld
          label="Ads Conversion-ID"
          value={<span className="font-mono">{site.gadsConversionId}</span>}
        />
        <Feld
          label="Ads Conversion-Label"
          value={<span className="font-mono">{site.gadsConversionLabel}</span>}
        />
      </SectionCard>
    </div>
  )
}
