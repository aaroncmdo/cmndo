// AAR-64 → F0: Kanzlei-Board Standalone-Route. Header + geteilter KanzleiBoardContent.
import { ScaleIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import KanzleiBoardContent from './KanzleiBoardContent'

export const dynamic = 'force-dynamic'

export default function KanzleiBoardPage() {
  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="Kanzlei-Board"
        description="Admin-Sicht auf zugewiesene Kanzleien und LexDrive-Kommunikation. LexDrive nutzt Salesforce intern — kein eigenes Login-Portal."
        icon={ScaleIcon}
      />
      <KanzleiBoardContent />
    </div>
  )
}
