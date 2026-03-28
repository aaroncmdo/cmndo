import { login } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Claimondo</h1>
          <p className="mt-1 text-sm text-zinc-500">Melde dich mit deinem Konto an</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <form action={login} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@beispiel.de"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            <ErrorMessage searchParams={searchParams} />

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-sm active:scale-[0.98] transition-all mt-1"
            >
              Einloggen
            </button>
          </form>
        </div>
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
    <p className="text-sm text-red-400 rounded-xl bg-red-950/50 border border-red-900 px-4 py-3 text-center">
      {decodeURIComponent(params.error)}
    </p>
  )
}
