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
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb] px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl font-bold tracking-tight"><span className="text-[#0D1B3E]">Claim</span><span className="text-[#4573A2]">ondo</span></span>
          <p className="mt-1 text-sm text-claimondo-ondo">Bitte ändern Sie Ihr Passwort</p>
        </div>

        <div className="bg-white border border-claimondo-border rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
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
                className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-[#f8f9fb] text-claimondo-navy placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
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
                className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-[#f8f9fb] text-claimondo-navy placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 rounded-xl bg-red-50/50 border border-red-900 px-4 py-3 text-center">
                {error}
              </p>
            )}

            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Wird gespeichert..."
              className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-claimondo-ondo text-zinc-950 font-semibold text-sm active:scale-[0.98] transition-all mt-1"
            >
              Passwort ändern
            </LoadingButton>
          </form>
        </div>
      </div>
    </div>
  )
}
