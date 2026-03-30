import { login } from './actions'
import LoginClient from './LoginClient'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #09090b 0%, #0c1220 50%, #09090b 100%)' }}>
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">Claimondo</h1>
          <p className="mt-2 text-sm text-zinc-400">Melde dich mit deinem Konto an</p>
        </div>

        {/* Glassmorphism Card */}
        <div className="backdrop-blur-xl bg-white/[0.05] border border-white/[0.08] rounded-3xl p-8 shadow-2xl shadow-black/20">
          <LoginClient loginAction={login} />
          <ErrorMessage searchParams={searchParams} />
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}

async function ErrorMessage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  if (!params.error) return null
  return (
    <p className="text-sm text-red-400 rounded-xl bg-red-950/50 border border-red-900 px-4 py-3 text-center mt-4">
      {decodeURIComponent(params.error)}
    </p>
  )
}
