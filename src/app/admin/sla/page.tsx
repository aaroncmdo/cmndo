// AAR-85 → F0: SLA-Monitoring Standalone-Route. Header + geteilter SlaContent.
import PageHeader from '@/components/shared/PageHeader'
import SlaContent from './SlaContent'

export const dynamic = 'force-dynamic'

export default function SlaMonitoringPage() {
  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="SLA-Monitoring"
        description="Pipeline-Fristen ab SA-Unterschrift. Cron alle 15 Min, automatische Eskalations-Tasks bei Verletzung."
        size="lg"
      />
      <SlaContent />
    </div>
  )
}
