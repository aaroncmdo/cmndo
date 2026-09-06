'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Download, Phone } from 'lucide-react'
import { fordereUnfallguideAn } from './actions'
import type { GuideLeadErgebnis } from './constants'

// Vier Ereignisse, nicht eins. Ohne die Einblendung gibt es keinen Nenner:
// man sieht spaeter die Leads, aber nie, ob daraus 5 % oder 0,4 % wurden.
// Bewusst NICHT der Helfer aus kfzgutachter-lp/track.ts — der setzt fest
// source: 'kfzgutachter-ads-lp' und wuerde diese Ereignisse falsch etikettieren.
function track(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, { source: 'unfallguide-lp', ...params })
}

const UTM_FELDER = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export function GuideFormClient({
  quelle = 'unfallguide',
}: {
  /**
   * Woher wird abgeschickt? Die Landeseite laesst die Vorgabe stehen, der
   * Abschnitt auf der Startseite setzt seinen eigenen Wert — sonst waeren die
   * beiden Eingaenge in der Auswertung nicht mehr zu trennen. Die Server-Action
   * prueft den Wert gegen eine Whitelist, das Feld ist also kein Einfallstor.
   */
  quelle?: 'unfallguide' | 'unfallguide-startseite'
} = {}) {
  const t = useTranslations('unfallguide_formular')
  // Die Sprache faehrt als verstecktes Feld mit. Die Server-Action kann sie
  // NICHT selbst ermitteln: sie laeuft nicht unter der Seiten-URL, dort ist
  // `requestLocale` leer und next-intl faellt still auf 'de' zurueck.
  const locale = useLocale()
  const [ergebnis, setErgebnis] = useState<GuideLeadErgebnis | null>(null)
  const [laeuft, starte] = useTransition()
  const ersteEingabe = useRef(false)
  const erfolgRef = useRef<HTMLDivElement>(null)
  const [utm, setUtm] = useState<Record<string, string>>({})
  // Lebendpruefung der Telefonnummer. `null` = noch nichts zu sagen.
  const [waKonto, setWaKonto] = useState<null | 'ja' | 'nein'>(null)
  const [telefon, setTelefon] = useState('')

  useEffect(() => {
    track('guide_form_eingeblendet', { quelle })
    const p = new URLSearchParams(window.location.search)
    const gefunden: Record<string, string> = {}
    for (const f of UTM_FELDER) {
      const v = p.get(f)
      if (v) gefunden[f] = v
    }
    setUtm(gefunden)
    // `quelle` steht in der Abhaengigkeitsliste, weil das Ereignis sie traegt.
    // Sie aendert sich im Leben einer Instanz nie — der Effekt laeuft trotzdem
    // genau einmal, und die Liste bleibt vollstaendig statt unterdrueckt.
  }, [quelle])

  // Prueft beim Tippen, ob die Nummer bei WhatsApp erreichbar ist.
  //
  // ⭐ Diese Pruefung darf das Formular NIE aufhalten (Regel der Referenz, und
  // richtig so): sie laeuft verzoegert, ihr Ergebnis ist nur ein Hinweis, und
  // jeder Fehler endet als „nichts zu sagen". Der Guide oeffnet sich ohnehin
  // sofort auf der Seite — die Nummer entscheidet nur ueber den ZUSATZweg.
  useEffect(() => {
    const ziffern = telefon.replace(/\D/g, '')
    if (ziffern.length < 8) {
      setWaKonto(null)
      return
    }
    const abbruch = new AbortController()
    // 700 ms: lang genug, dass niemand bei jeder Ziffer eine Anfrage ausloest,
    // kurz genug, dass die Antwort noch zum Tippen gehoert.
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch('/api/wa-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: telefon }),
          signal: abbruch.signal,
        })
        const d = (await r.json()) as { status?: string }
        setWaKonto(d.status === 'ja' ? 'ja' : d.status === 'nein' ? 'nein' : null)
      } catch {
        setWaKonto(null)
      }
    }, 700)
    return () => {
      window.clearTimeout(timer)
      abbruch.abort()
    }
  }, [telefon])

  // Nach dem Absenden gehoert der Fokus dorthin, wo die Antwort steht.
  // Sonst steht ein Screenreader-Nutzer weiter im abgeschickten Formular.
  useEffect(() => {
    if (ergebnis) erfolgRef.current?.focus()
  }, [ergebnis])

  const geliefert = ergebnis?.ok === true || (ergebnis?.ok === false && ergebnis.guidePfad)
  const guidePfad = ergebnis?.ok ? ergebnis.guidePfad : (ergebnis?.guidePfad ?? null)

  if (geliefert && guidePfad) {
    return (
      <div
        ref={erfolgRef}
        tabIndex={-1}
        className="rounded-2xl border border-claimondo-border bg-white p-6 sm:p-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-navy"
      >
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy">
          <Check className="h-6 w-6 text-white" aria-hidden />
        </span>
        <h2 className="font-heading text-xl font-bold text-claimondo-navy sm:text-2xl">
          {t('erfolg_h2')}
        </h2>
        <p className="mt-2 max-w-prose text-base leading-relaxed text-slate-600">
          {ergebnis?.ok
            ? t('erfolg_text')
            : ergebnis?.error}
        </p>

        <a
          href={guidePfad}
          download
          onClick={() => track('guide_heruntergeladen')}
          className="mt-6 inline-flex min-h-[52px] items-center gap-3 rounded-xl bg-claimondo-navy px-6 text-base font-semibold text-white transition-colors hover:bg-claimondo-navy/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-navy"
        >
          <Download className="h-5 w-5" aria-hidden />
          {t('erfolg_knopf')}
        </a>

        <p className="mt-5 border-t border-claimondo-border pt-4 text-sm text-slate-500">
          {t('erfolg_sprechen')}{' '}
          <a
            href="tel:+4915153608515"
            onClick={() => track('guide_anruf_nach_abschluss')}
            className="font-semibold text-claimondo-navy underline underline-offset-2"
          >
            0151 5360 8515
          </a>
        </p>
      </div>
    )
  }

  const fehlerFeld = ergebnis?.ok === false ? ergebnis.feld : undefined
  const fehlerText = ergebnis?.ok === false ? ergebnis.error : null

  return (
    <form
      action={(fd) => {
        track('guide_abgeschickt', { quelle })
        starte(async () => {
          const r = await fordereUnfallguideAn(fd)
          if (!r.ok) track('guide_fehler', { grund: r.feld ?? 'server' })
          setErgebnis(r)
        })
      }}
      onFocus={() => {
        if (ersteEingabe.current) return
        ersteEingabe.current = true
        track('guide_form_begonnen')
      }}
      className="rounded-2xl border border-claimondo-border bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="font-heading text-xl font-bold text-claimondo-navy sm:text-2xl">
        {t('h2')}
      </h2>
      <p className="mt-2 text-base leading-relaxed text-slate-600">
        {t('intro')}
      </p>

      {Object.entries(utm).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {/* Sprache der Seite. Verstecktes Feld, also kein zusaetzliches
          sichtbares Feld und keine Frage mehr, die der Nutzer beantworten muss
          — die Zahl der Felder entscheidet ueber die Abschlussquote. */}
      <input type="hidden" name="sprache" value={locale} />
      <input type="hidden" name="quelle" value={quelle} />

      <div className="mt-6 space-y-4">
        <Feld
          id="guide-name"
          name="name"
          label={t('name_label')}
          autoComplete="name"
          fehler={fehlerFeld === 'name' ? fehlerText : null}
          required
        />
        <Feld
          id="guide-telefon"
          name="telefon"
          label={t('telefon_label')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hinweis={t('telefon_hinweis')}
          fehler={fehlerFeld === 'telefon' ? fehlerText : null}
          onChange={setTelefon}
          required
        />
        {/* Kein Fehler-Rot: der Nutzer hat nichts falsch gemacht, und das
            Absenden bleibt jederzeit moeglich. */}
        {waKonto === 'nein' && (
          <p className="-mt-2 text-sm text-slate-500">{t('wa_kein_konto')}</p>
        )}
        <Feld
          id="guide-email"
          name="email"
          label={t('email_label')}
          type="email"
          inputMode="email"
          autoComplete="email"
          optional
          optionalLabel={t('optional')}
          hinweis={t('email_hinweis')}
          fehler={fehlerFeld === 'email' ? fehlerText : null}
        />
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm leading-relaxed text-slate-600">
        <input
          type="checkbox"
          name="einwilligung"
          value="ja"
          required
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-claimondo-border text-claimondo-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-navy"
        />
        <span>{t('einwilligung')}</span>
      </label>
      {fehlerFeld === 'einwilligung' && fehlerText && (
        <p className="mt-2 text-sm font-medium text-red-700">{fehlerText}</p>
      )}

      {fehlerText && !fehlerFeld && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          {fehlerText}
        </p>
      )}

      <button
        type="submit"
        disabled={laeuft}
        className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-claimondo-navy px-6 text-base font-semibold text-white transition-colors hover:bg-claimondo-navy/90 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-navy"
      >
        <Download className="h-5 w-5" aria-hidden />
        {laeuft ? t('knopf_laeuft') : t('knopf')}
      </button>

      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Phone className="h-4 w-4" aria-hidden />
        {t('anrufen')}{' '}
        <a
          href="tel:+4915153608515"
          onClick={() => track('guide_anruf_statt_formular')}
          className="font-semibold text-claimondo-navy underline underline-offset-2"
        >
          0151 5360 8515
        </a>
      </p>
    </form>
  )
}

type FeldProps = {
  id: string
  name: string
  label: string
  type?: string
  inputMode?: 'tel' | 'email' | 'text'
  autoComplete?: string
  hinweis?: string
  optional?: boolean
  /** Wird beim Tippen gerufen. Nur dort gesetzt, wo der Wert live gebraucht wird. */
  onChange?: (wert: string) => void
  /** Beschriftung fuer den optional-Zusatz. Kommt von aussen, damit `Feld`
      rein darstellend bleibt und keine eigene Uebersetzung zieht. */
  optionalLabel?: string
  required?: boolean
  fehler?: string | null
}

// Sichtbares Label, fest mit dem Feld verbunden. Kein Platzhalter als Label:
// der verschwindet beim Tippen, und ein Screenreader findet ihn gar nicht.
// Genau diese Luecke stand im Audit vom 30.08.2026 an 19 Adressfeldern.
function Feld({
  id,
  name,
  label,
  type = 'text',
  inputMode,
  autoComplete,
  hinweis,
  optional,
  optionalLabel,
  onChange,
  required,
  fehler,
}: FeldProps) {
  const hinweisId = hinweis ? `${id}-hinweis` : undefined
  const fehlerId = fehler ? `${id}-fehler` : undefined
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-claimondo-navy">
        {label}
        {optional && optionalLabel && (
          <span className="ml-2 font-normal text-slate-400">{optionalLabel}</span>
        )}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required={required}
        aria-describedby={[hinweisId, fehlerId].filter(Boolean).join(' ') || undefined}
        aria-invalid={fehler ? true : undefined}
        className={`mt-1.5 block min-h-[48px] w-full rounded-xl border bg-white px-4 text-base text-claimondo-navy placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-navy ${
          fehler ? 'border-red-500' : 'border-claimondo-border'
        }`}
      />
      {hinweis && (
        <p id={hinweisId} className="mt-1.5 text-sm text-slate-500">
          {hinweis}
        </p>
      )}
      {fehler && (
        <p id={fehlerId} role="alert" className="mt-1.5 text-sm font-medium text-red-700">
          {fehler}
        </p>
      )}
    </div>
  )
}
