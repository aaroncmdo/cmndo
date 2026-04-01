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
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb] px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl font-bold tracking-tight"><span className="text-[#0D1B3E]">Claim</span><span className="text-[#4573A2]">ondo</span></span>
          <p className="mt-1 text-sm text-gray-500">Bitte aendern Sie Ihr Passwort</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <KeyIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-gray-900 font-medium text-sm">Neues Passwort setzen</p>
              <p className="text-gray-500 text-xs">Ihr Einmalpasswort muss geaendert werden</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
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
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-gray-700">
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
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 rounded-xl bg-red-50/50 border border-red-900 px-4 py-3 text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-gray-500 text-zinc-950 font-semibold text-sm active:scale-[0.98] transition-all mt-1"
            >
              {loading ? 'Wird gespeichert...' : 'Passwort aendern'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
