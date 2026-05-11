import { login } from './actions'
import LoginClient from './LoginClient'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-claimondo-bg">
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight"><span className="text-claimondo-navy">Claim</span><span className="text-claimondo-ondo">ondo</span></h1>
          <p className="mt-2 text-sm text-claimondo-ondo">Melde dich mit deinem Konto an</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-claimondo-border rounded-3xl p-8 shadow-lg">
          <LoginClient loginAction={login} />
          <ErrorMessage searchParams={searchParams} />
        </div>

        <p className="text-center text-claimondo-ondo text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}

// AAR-609: Defensiv gegen fehlerhaft serialisierte Error-Objekte. Wenn eine
// Server-Action oder ein externer Callback versehentlich das komplette
// AuthError-Objekt statt error.message in die URL schreibt, landet hier
// "{}" oder "undefined" oder "[object Object]" — alles unlesbar. Wir filtern
// diese Sentinel-Werte raus und zeigen einen generischen Fallback.
function normalizeLoginError(raw: string | undefined): string | null {
  if (!raw) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const trimmed = decoded.trim()
  if (!trimmed) return null
  if (trimmed === '{}' || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
    return 'Login fehlgeschlagen'
  }
  return trimmed
}

async function ErrorMessage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const message = normalizeLoginError(params.error)
  if (!message) return null
  return (
    <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-center mt-4">
      {message}
    </p>
  )
}
