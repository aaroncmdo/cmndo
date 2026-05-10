import { login } from './actions'
import LoginClient from './LoginClient'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12"
      style={{ background: '#f2f3f7' }}
    >
      {/* Ambient-Gradient-Spotlights — drei radiale Lichtquellen */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.22), transparent 65%)',
              'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.14), transparent 70%)',
              'radial-gradient(45% 45% at 50% 50%, rgba(13,27,62,.04), transparent 70%)',
            ].join(', '),
          }}
        />
        {/* Grain-Overlay */}
        <div
          className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Shield + Wortmarke */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px]"
            style={{
              background: 'rgba(255,255,255,0.85)',
              boxShadow: '0 8px 28px rgba(13,27,62,0.14), 0 1px 0 rgba(255,255,255,0.9) inset',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/claimondo-shield.svg" alt="" width={38} height={38} className="h-[38px] w-[38px]" />
          </div>
          <h1
            className="text-3xl font-bold tracking-[-0.03em]"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            <span style={{ color: '#0D1B3E' }}>Claim</span><span style={{ color: '#4573A2' }}>ondo</span>
          </h1>
          <p className="mt-1.5 text-sm font-medium" style={{ color: '#4573A2' }}>
            Mit deinem Konto anmelden
          </p>
        </div>

        {/* Glass Card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.82)',
            border: '1px solid rgba(255,255,255,0.65)',
            boxShadow: '0 20px 60px rgba(13,27,62,0.10), 0 4px 16px rgba(13,27,62,0.06), 0 1px 0 rgba(255,255,255,0.9) inset',
            backdropFilter: 'saturate(180%) blur(24px)',
            WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          }}
        >
          <LoginClient loginAction={login} />
          <ErrorMessage searchParams={searchParams} />
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: '#7BA3CC' }}>
          &copy; 2026 Claimondo GmbH
        </p>
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
