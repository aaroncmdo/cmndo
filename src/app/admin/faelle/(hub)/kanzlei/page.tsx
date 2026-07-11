// F0: Kanzlei-Board-Tab — header-los (der Hub-Header liefert Titel + Untertitel), geteilter Content.
import KanzleiBoardContent from '@/app/admin/kanzlei-board/KanzleiBoardContent'

export const dynamic = 'force-dynamic'

export default function FaelleHubKanzleiPage() {
  return (
    <div className="py-6 space-y-6">
      <KanzleiBoardContent />
    </div>
  )
}
