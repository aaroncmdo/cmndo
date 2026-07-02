import { KontoSicherheitPanel } from '@/components/auth/KontoSicherheitPanel'

// AAR-939: Konto-Sicherheit (2FA-Self-Service) für interne Rollen. Role-guarded
// durch das Portal-Layout; das Panel ist session-scoped (eigene Faktoren).
export default function KontoSicherheitPage() {
  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-bold text-claimondo-navy">
            Konto-Sicherheit
          </h1>
        </div>
      </div>
      <KontoSicherheitPanel />
    </div>
  )
}
