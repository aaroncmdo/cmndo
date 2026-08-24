'use client'

import { useActionState, useState } from 'react'
import { starteCheck, type EinstiegAntwort } from './actions'

type Modus = 'aufbau' | 'bestand' | null

const WEGE = [
  {
    id: 'aufbau' as const,
    titel: 'Ich baue gerade auf',
    zeile: 'Neu am Markt oder kurz davor',
    text: 'Sie sehen das Feld, in das Sie eintreten: wie viele Büros im Umkreis sichtbar sind, wo die Latte hängt und was es braucht, um mitzuspielen.',
  },
  {
    id: 'bestand' as const,
    titel: 'Ich bin schon länger dabei',
    zeile: 'Etabliert, mit Website und Profil',
    text: 'Sie sehen, wo Sie im Feld stehen: Ihre Position im Umkreis, der Zustand Ihrer Website und was Sie von den sichtbarsten Büros trennt.',
  },
]

export function EinstiegClient() {
  const [modus, setModus] = useState<Modus>(null)
  const [zustand, absenden, laeuft] = useActionState<EinstiegAntwort | null, FormData>(
    starteCheck,
    null,
  )

  return (
    <form action={absenden} className="auf-dunkel mt-12">
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="sr-only">Welcher Weg trifft auf Sie zu?</legend>

        {WEGE.map((w) => {
          const gewaehlt = modus === w.id
          return (
            <label
              key={w.id}
              className={[
                'group cursor-pointer rounded-[var(--r-gross)] border-2 p-6 transition',
                gewaehlt
                  ? 'border-signal bg-white/[0.08]'
                  : 'border-white/15 bg-white/[0.03] hover:border-white/35',
              ].join(' ')}
            >
              <input
                type="radio"
                name="modus"
                value={w.id}
                checked={gewaehlt}
                onChange={() => setModus(w.id)}
                className="sr-only"
              />
              <span
                className={[
                  'display block text-xs tracking-[0.16em]',
                  gewaehlt ? 'text-signal' : 'text-white/40',
                ].join(' ')}
              >
                {w.zeile}
              </span>
              <span className="display mt-2 block text-[1.6rem] text-white">{w.titel}</span>
              <span className="mt-3 block text-[0.98rem] leading-relaxed text-white/70">
                {w.text}
              </span>
            </label>
          )
        })}
      </fieldset>

      {/* Erst nach der Wahl — so steht es in Zustand 1 des Mockups. */}
      {modus && (
        <div className="mt-8 rounded-[20px] border border-white/15 bg-white/[0.03] p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="plz" className="block text-sm text-white/70">
                Postleitzahl oder Ort <span className="text-signal">*</span>
              </label>
              <input
                id="plz"
                name="plz"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="48143"
                className="feld-dunkel mt-2"
              />
              <input
                name="ort"
                placeholder="oder: Münster"
                autoComplete="address-level2"
                className="feld-dunkel mt-2"
              />
              <p className="mt-2 text-xs text-white/45">
                Bestimmt den Umkreis, in dem gemessen wird.
              </p>
            </div>

            <div>
              <label htmlFor="firmenname" className="block text-sm text-white/70">
                Name Ihres Büros <span className="text-white/40">(empfohlen)</span>
              </label>
              <input
                id="firmenname"
                name="firmenname"
                autoComplete="organization"
                placeholder="Sachverständigenbüro Meyer"
                className="feld-dunkel mt-2"
              />
              <p className="mt-2 text-xs text-white/45">
                Damit finden wir Ihren Eintrag in der Kartensuche — ohne ihn bleibt Ihre
                Position im Wettbewerb ungemessen.
              </p>
            </div>

            <div>
              <label htmlFor="website" className="block text-sm text-white/70">
                Ihre Website{' '}
                <span className="text-white/40">
                  {modus === 'aufbau' ? '(falls vorhanden)' : '(empfohlen)'}
                </span>
              </label>
              <input
                id="website"
                name="website"
                inputMode="url"
                placeholder="mein-sachverstaendigenbuero.de"
                className="feld-dunkel mt-2"
              />
              <p className="mt-2 text-xs text-white/45">
                Ohne Website entfallen die Module, die eine Seite prüfen — sie erscheinen
                trotzdem, mit dem Grund dahinter.
              </p>
            </div>
          </div>

          {zustand && !zustand.ok && (
            <p role="alert" className="mt-5 rounded-[12px] bg-critical/15 px-4 py-3 text-sm text-white">
              {zustand.error}
            </p>
          )}

          <button
            type="submit"
            disabled={laeuft}
            className="btn-haupt display mt-7 w-full rounded-[12px] px-8 py-4 text-[1.05rem] uppercase tracking-[0.01em] disabled:opacity-60 md:w-auto"
          >
            {laeuft ? 'Einen Moment …' : 'Prüfumfang wählen'}
          </button>
        </div>
      )}
    </form>
  )
}
