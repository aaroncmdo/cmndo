import Image from 'next/image'
import { login } from './actions'
import LoginClient from './LoginClient'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-[#f8f9fb]">
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <Image src="/claimondo-logo.svg" alt="Claimondo" width={250} height={70} className="mx-auto mb-4" unoptimized priority />
          <p className="mt-2 text-sm text-gray-500">Melde dich mit deinem Konto an</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-lg">
          <LoginClient loginAction={login} />
          <ErrorMessage searchParams={searchParams} />
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
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
    <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-center mt-4">
      {decodeURIComponent(params.error)}
    </p>
  )
}
