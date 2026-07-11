// AAR-85 → F0: SLA-Monitoring Standalone-Route. Header + geteilter SlaContent.
import SlaContent from './SlaContent'

export const dynamic = 'force-dynamic'

export default function SlaMonitoringPage() {
  return (
    <div className="py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-bold text-claimondo-navy">SLA-Monitoring</h1>
          <p className="mt-0.5 text-body-sm text-claimondo-ondo">Pipeline-Fristen ab SA-Unterschrift. Cron alle 15 Min, automatische Eskalations-Tasks bei Verletzung.</p>
        </div>
      </div>
      <SlaContent />
    </div>
  )
}
