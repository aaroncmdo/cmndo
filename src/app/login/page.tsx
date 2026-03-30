import { login } from './actions'
import LoginClient from './LoginClient'

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
          <LoginClient loginAction={login} />
          <ErrorMessage searchParams={searchParams} />
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
    <p className="text-sm text-red-400 rounded-xl bg-red-950/50 border border-red-900 px-4 py-3 text-center mt-4">
      {decodeURIComponent(params.error)}
    </p>
  )
}
