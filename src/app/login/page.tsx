import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { login } from './actions'
import LoginClient from './LoginClient'
import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue } from '@/lib/auth/safe-continue'

export const metadata: Metadata = {
  // AAR-878: absolute überschreibt das Layout-Template `%s | Claimondo`, damit
  // der Browser-Tab schlicht „Login — Claimondo" statt „Login | Claimondo"
  // zeigt. Indexierbarkeit bleibt aktiv (proxy.ts erlaubt /login explizit für
  // Brand-Queries „Claimondo Login" — Konsolidierung vom 2026-05-12).
  title: { absolute: 'Login — Claimondo' },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; continue?: string }>
}) {
  const params = await searchParams

  // AAR-login-embed: continue aus dem Login-Widget / Marketing-Header. Wenn der
  // User schon eingeloggt ist, das Formular NICHT zeigen -> direkt weiterleiten
  // (nur wenn continue gesetzt ist, damit normale Logins keinen Extra-Roundtrip
  // bezahlen).
  if (params.continue) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('rolle')
        .eq('id', user.id)
        .single()
      redirect(safeContinue(params.continue) ?? roleToPath(profile?.rolle as string | null | undefined))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-claimondo-bg">
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight"><span className="text-claimondo-navy">Claim</span><span className="text-claimondo-ondo">ondo</span></h1>
          <p className="mt-2 text-sm text-claimondo-ondo">Melde dich mit deinem Konto an</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-claimondo-border rounded-ios-lg p-8 shadow-claimondo-md">
          <LoginClient loginAction={login} continueUrl={params.continue ?? null} />
          <ErrorMessage error={params.error} />
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

function ErrorMessage({ error }: { error: string | undefined }) {
  const message = normalizeLoginError(error)
  if (!message) return null
  return (
    <p className="text-sm text-red-600 rounded-ios-md bg-red-50 border border-red-200 px-4 py-3 text-center mt-4">
      {message}
    </p>
  )
}
