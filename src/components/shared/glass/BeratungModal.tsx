'use client'

// Beratungs-Rückruftermin-Modal. Wird vom BeratungVereinbarenButton geöffnet.
// Schreibt via erstelleOeffentlichenRueckruf in leads + admin_termine + mitteilungen
// → erscheint sofort auf /dispatch/rueckrufe.

import { useState, useTransition } from 'react'
import { X, Phone, CheckCircle2 } from 'lucide-react'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'

interface Props {
  open: boolean
  onClose: () => void
  quelle?: string  // z.B. '/gutachter-finden'
}

const ZEIT_OPTIONEN = [
  { value: 'jetzt', label: 'So schnell wie möglich' },
  { value: 'vormittags', label: 'Heute Vormittag' },
  { value: 'nachmittags', label: 'Heute Nachmittag' },
  { value: 'abends', label: 'Heute Abend' },
  { value: 'morgen', label: 'Morgen' },
]

export function BeratungModal({ open, onClose, quelle = 'beratung-modal' }: Props) {
  const [name, setName] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [zeitfenster, setZeitfenster] = useState<string>('jetzt')
  const [nachricht, setNachricht] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    setErrorMsg(null)
    startTransition(async () => {
      const result = await erstelleOeffentlichenRueckruf({
        name,
        telefon,
        email: email || null,
        zeitfenster: ZEIT_OPTIONEN.find((z) => z.value === zeitfenster)?.label ?? null,
        nachricht: nachricht || null,
        quelle,
      })
      if (result.ok) {
        setStatus('sent')
      } else {
        setStatus('error')
        setErrorMsg(result.error)
      }
    })
  }

  function handleClose() {
    setName(''); setTelefon(''); setEmail(''); setZeitfenster('jetzt'); setNachricht('')
    setStatus('idle'); setErrorMsg(null)
    onClose()
  }

  return (
    <div
      data-testid="beratung-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="beratung-modal-titel"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483646,
        background: 'rgba(13,27,62,.55)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl"
        style={{ maxWidth: 480, width: '100%', maxHeight: '92dvh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-claimondo-border">
          <h2 id="beratung-modal-titel" className="text-lg font-bold text-claimondo-navy tracking-[-.018em] flex items-center gap-2">
            <Phone className="w-5 h-5 text-claimondo-ondo" />
            Rückruf vereinbaren
          </h2>
          <button
            data-testid="beratung-modal-close"
            type="button"
            onClick={handleClose}
            className="p-1 rounded-ios-md hover:bg-claimondo-bg transition-colors"
            aria-label="Schließen"
          >
            <X className="w-5 h-5 text-claimondo-shield" />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <h3 className="text-xl font-bold text-claimondo-navy">Wir rufen Sie an</h3>
            <p className="text-claimondo-shield text-sm leading-relaxed max-w-[320px]">
              Unser Team meldet sich beim nächsten freien Slot. Sie brauchen nichts weiter zu tun.
            </p>
            <button
              data-testid="beratung-modal-dismiss"
              type="button"
              onClick={handleClose}
              className="mt-3 px-6 py-2.5 rounded-full bg-claimondo-navy text-white font-semibold text-sm"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-claimondo-shield uppercase tracking-[0.06em] block mb-1.5">Name *</label>
              <input
                data-testid="beratung-name"
                name="name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-ios-lg border border-claimondo-border focus:border-claimondo-ondo focus:outline-none text-sm"
                placeholder="Vor- und Nachname"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-claimondo-shield uppercase tracking-[0.06em] block mb-1.5">Telefon *</label>
              <input
                data-testid="beratung-telefon"
                name="telefon"
                type="tel"
                required
                minLength={5}
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                className="w-full px-4 py-2.5 rounded-ios-lg border border-claimondo-border focus:border-claimondo-ondo focus:outline-none text-sm"
                placeholder="+49 ..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-claimondo-shield uppercase tracking-[0.06em] block mb-1.5">E-Mail (optional)</label>
              <input
                data-testid="beratung-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-ios-lg border border-claimondo-border focus:border-claimondo-ondo focus:outline-none text-sm"
                placeholder="name@beispiel.de"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-claimondo-shield uppercase tracking-[0.06em] block mb-1.5">Wann passt es Ihnen?</label>
              <div className="grid grid-cols-2 gap-2">
                {ZEIT_OPTIONEN.map((opt) => {
                  const active = zeitfenster === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={`beratung-zeit-${opt.value}`}
                      data-active={active}
                      onClick={() => setZeitfenster(opt.value)}
                      className={`px-3 py-2 rounded-ios-lg border text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-claimondo-navy text-white border-claimondo-navy'
                          : 'bg-white text-claimondo-navy border-claimondo-border hover:border-claimondo-ondo'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-claimondo-shield uppercase tracking-[0.06em] block mb-1.5">Nachricht (optional)</label>
              <textarea
                data-testid="beratung-nachricht"
                name="nachricht"
                rows={3}
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                className="w-full px-4 py-2.5 rounded-ios-lg border border-claimondo-border focus:border-claimondo-ondo focus:outline-none text-sm resize-none"
                placeholder="Worum geht es? (optional)"
              />
            </div>

            {status === 'error' && errorMsg && (
              <div className="px-3 py-2 rounded-ios-lg bg-red-50 text-red-700 text-xs">{errorMsg}</div>
            )}

            <button
              data-testid="beratung-submit"
              type="submit"
              disabled={pending}
              className="w-full mt-1 px-5 py-3 rounded-full bg-claimondo-navy text-white font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {pending ? 'Wird gesendet…' : 'Rückruf anfordern'}
            </button>

            <p className="text-[11px] text-claimondo-shield leading-relaxed text-center">
              Mit dem Absenden willigen Sie ein, dass Claimondo Sie unter der angegebenen Nummer kontaktiert.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
