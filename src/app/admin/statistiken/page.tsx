// KFZ-153 → F0: Statistiken Standalone-Route. Typen-Re-Export (StatistikenClient importiert
// sie via `from './page'`) + geteilter StatistikenContent.
import StatistikenContent from './StatistikenContent'

export type {
  UserStatistikRolle,
  StatistikFall,
  StatistikKlassifizierung,
  Benchmark,
} from './StatistikenContent'

export default function StatistikenPage() {
  return <StatistikenContent />
}
