// Task 5: Werkstatt KVA-Upload Portal-Seite.
// Auth/Werkstatt-Gate kommt aus (shell)/layout.tsx.

import { WerkstattKvaFlow } from '@/components/werkstatt/WerkstattKvaFlow'

export const dynamic = 'force-dynamic'

export default function WerkstattKvaPage() {
  return <WerkstattKvaFlow />
}
