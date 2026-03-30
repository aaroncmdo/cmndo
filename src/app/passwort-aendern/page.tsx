'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyIcon, CheckCircle2Icon } from 'lucide-react'

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
      setError('Passwoerter stimmen nicht ueberein')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
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

      const dest = profile?.rolle === 'sachverstaendiger'
        ? '/gutachter'
        : profile?.rolle === 'kunde'
          ? '/kunde'
          : '/admin'

      window.location.href = dest
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aendern des Passworts')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Claimondo</h1>
          <p className="mt-1 text-sm text-zinc-500">Bitte aendern Sie Ihr Passwort</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-950 flex items-center justify-center">
              <KeyIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">Neues Passwort setzen</p>
              <p className="text-zinc-500 text-xs">Ihr Einmalpasswort muss geaendert werden</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                Neues Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-zinc-300">
                Passwort bestaetigen
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Passwort wiederholen"
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 rounded-xl bg-red-950/50 border border-red-900 px-4 py-3 text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-semibold text-sm active:scale-[0.98] transition-all mt-1"
            >
              {loading ? 'Wird gespeichert...' : 'Passwort aendern'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
