import { KontoSicherheitPanel } from '@/components/auth/KontoSicherheitPanel'
import PageHeader from '@/components/shared/PageHeader'

// AAR-939: Konto-Sicherheit (2FA-Self-Service) für interne Rollen. Role-guarded
// durch das Portal-Layout; das Panel ist session-scoped (eigene Faktoren).
export default function KontoSicherheitPage() {
  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto space-y-5">
      <PageHeader title="Konto-Sicherheit" size="lg" />
      <KontoSicherheitPanel />
    </div>
  )
}
