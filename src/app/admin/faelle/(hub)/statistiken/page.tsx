// F0: Statistiken-Tab — embedded (kein eigener PageHeader; der Hub-Header liefert den Titel),
// geteilter StatistikenContent.
import StatistikenContent from '@/app/admin/statistiken/StatistikenContent'

export default function FaelleHubStatistikenPage() {
  return <StatistikenContent embedded />
}
