// F0: SLA-Tab — header-los (der Hub-Header liefert Titel + Untertitel), geteilter SlaContent.
import SlaContent from '@/app/admin/sla/SlaContent'

export const dynamic = 'force-dynamic'

export default function FaelleHubSlaPage() {
  return (
    <div className="py-6 space-y-6">
      <SlaContent />
    </div>
  )
}
