'use client'

import { useActionState } from 'react'
import { anmelden, type AnmeldeAntwort } from './actions'

export function AnmeldenClient() {
  const [zustand, absenden, laeuft] = useActionState<AnmeldeAntwort | null, FormData>(
    anmelden,
    null,
  )

  const mfaNoetig = zustand !== null && 'mfaNoetig' in zustand && zustand.mfaNoetig === true

  return (
    <form action={absenden} className="mt-8 max-w-[26rem]">
      <label htmlFor="email" className="block text-sm text-white/70">
        E-Mail
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        className="mt-2 w-full rounded-[12px] border border-white/20 bg-nacht px-4 py-3 text-white placeholder:text-white/30 focus:border-signal focus:outline-none"
      />

      <label htmlFor="passwort" className="mt-5 block text-sm text-white/70">
        Passwort
      </label>
      <input
        id="passwort"
        name="passwort"
        type="password"
        autoComplete="current-password"
        required
        className="mt-2 w-full rounded-[12px] border border-white/20 bg-nacht px-4 py-3 text-white focus:border-signal focus:outline-none"
      />

      {/* Erscheint erst, wenn das Konto einen zweiten Faktor verlangt. */}
      {mfaNoetig && (
        <div className="mt-5">
          <label htmlFor="code" className="block text-sm text-white/70">
            Code aus Ihrer Authenticator-App
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            className="mt-2 w-full rounded-[12px] border border-signal bg-nacht px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
          />
          <p className="mt-2 text-xs text-white/45">
            Für dieses Konto ist eine Zwei-Faktor-Anmeldung eingerichtet.
          </p>
        </div>
      )}

      {zustand && 'error' in zustand && zustand.error && (
        <p role="alert" className="mt-5 rounded-[12px] bg-critical/15 px-4 py-3 text-sm text-white">
          {zustand.error}
        </p>
      )}

      <button
        type="submit"
        disabled={laeuft}
        className="display mt-7 w-full rounded-[12px] bg-signal px-6 py-3.5 text-white transition hover:bg-signal-tief disabled:opacity-60"
      >
        {laeuft ? 'Einen Moment …' : mfaNoetig ? 'Code bestätigen' : 'Anmelden'}
      </button>
    </form>
  )
}
