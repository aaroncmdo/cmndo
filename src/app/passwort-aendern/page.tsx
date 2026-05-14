'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyIcon } from 'lucide-react'
import { LoadingButton } from '@/components/ui/loading-button'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { roleToPath } from '@/lib/auth/role-redirect'

export default function PasswortAendernPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein')
      return
    }
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // Get current user
      const user = (await supabase.auth.getUser())?.data?.user ?? null
      if (user) {
        // Set force_password_change to false
        await supabase
          .from('profiles')
          .update({ force_password_change: false })
          .eq('id', user.id)
      }

      // Redirect based on role
      const { data: profile } = await supabase
        .from('profiles')
        .select('rolle')
        .eq('id', user!.id)
        .single()

      window.location.href = roleToPath(profile?.rolle as string | null | undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ändern des Passworts')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-claimondo-bg px-5 relative overflow-hidden">
      {/* Ambient-Gradient Spotlights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.2), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.12), transparent 70%)',
          ].join(', '),
        }}
      />
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <span className="text-3xl font-bold tracking-tight"><span className="text-claimondo-navy">Claim</span><span className="text-claimondo-ondo">ondo</span></span>
          <p className="mt-1 text-sm text-claimondo-ondo">Bitte ändern Sie Ihr Passwort</p>
        </div>

        <div className="bg-white rounded-ios-lg p-8 shadow-sheet">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-ios-md bg-amber-50 flex items-center justify-center">
              <KeyIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-claimondo-navy font-medium text-sm">Neues Passwort setzen</p>
              <p className="text-claimondo-ondo text-xs">Ihr Einmalpasswort muss geändert werden</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-claimondo-navy">
                Neues Passwort
              </label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 rounded-ios-md border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy placeholder:text-claimondo-ondo/60 text-base tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-claimondo-navy">
                Passwort bestätigen
              </label>
              <PasswordInput
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Passwort wiederholen"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 rounded-ios-md border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy placeholder:text-claimondo-ondo/60 text-base tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 rounded-ios-md bg-red-50 border border-red-200 px-4 py-3 text-center">
                {error}
              </p>
            )}

            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Wird gespeichert..."
              className="w-full py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white disabled:opacity-40 font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 active:scale-[0.98] transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] mt-1"
            >
              Passwort ändern
            </LoadingButton>
          </form>
        </div>
      </div>
    </div>
  )
}
