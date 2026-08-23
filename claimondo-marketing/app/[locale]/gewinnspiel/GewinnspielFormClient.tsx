'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

// Ziel des Submits: der zentrale Anfrage-Eingang der App.
//
// ⚠ BEWUSST fest, NICHT process.env.NEXT_PUBLIC_APP_URL: der Marketing-Deploy
// setzt diese Variable auf https://claimondo.de (die Marketing-Domain selbst).
// Ein Fallback darauf wuerde an claimondo.de/api/anfrage-from-lp posten — dort
// gibt es die Route nicht (404, nachgemessen 21.08.2026). NGINX leitet zwar
// Seiten-Pfade an die App weiter, /api/* aber NICHT.
// Muster: app/[locale]/kfz-gutachter/[stadt]/StadtLeadFormClient.tsx
const ANFRAGE_ENDPOINT = 'https://app.claimondo.de/api/anfrage-from-lp'

// source='generic_lp' (nicht 'kfz_gutachter_lp'): die Gewinnspiel-LP ist eine
// eigenstaendige Kampagnenseite, keine Stadt-/Cluster-LP. Der Route-Handler
// prueft generic_lp gegen clusterAllowlist()+anonAllowlist(); 'claimondo.de'
// steht in der HARDCODIERTEN base der clusterAllowlist -> kein 403, keine
// Env-Abhaengigkeit. Die Trennung haelt zugleich die kfz_gutachter_lp-
// Attribution sauber (sonst waeren Stadtseiten- und Kampagnen-Leads eine Menge).
const SOURCE = 'generic_lp'

// Fallback-Kennzeichnung, wenn der Besucher ohne UTM kommt (z.B. ueber die
// site-weite Topbar). Ohne das waeren Topbar-Leads von organischen nicht zu
// unterscheiden — und genau diese Frage ("was bringt die Topbar?") wird als
// erste gestellt werden.
const CAMPAIGN_FALLBACK = 'gewinnspiel'

type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void
function trackGtag(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  w.gtag?.('event', eventName, params)
}

/** Attribution aus der aktuellen URL. Datensparsam und laengen-sicher:
 *  page_url nur origin+pathname (das Zod-Schema deckelt bei 500 Zeichen, und alle
 *  uebrigen Query-Parameter koennen Suchbegriffe oder fremde Daten tragen), die
 *  fuenf Standard-UTM + gclid einzeln. */
function attributionAusUrl(): Record<string, string> {
  if (typeof window === 'undefined') return { utm_campaign: CAMPAIGN_FALLBACK }
  const out: Record<string, string> = {
    page_url: `${window.location.origin}${window.location.pathname}`.slice(0, 500),
  }
  const q = new URLSearchParams(window.location.search)
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid']) {
    const v = q.get(k)?.trim()
    if (v) out[k] = v.slice(0, 150)
  }
  if (!out.utm_campaign) out.utm_campaign = CAMPAIGN_FALLBACK
  return out
}

type Schuld = 'unverschuldet' | 'nicht_sicher'

export type PraemienOption = { id: string; name: string; beschreibung: string | null }

export function GewinnspielFormClient({ praemien }: { praemien: PraemienOption[] }) {
  const [pending, setPending] = useState(false)
  const [fertig, setFertig] = useState(false)
  const [schuld, setSchuld] = useState<Schuld | null>(null)
  const [anrufOk, setAnrufOk] = useState(false)
  // Vorbelegt mit der ersten Prämie: Der Nutzer soll wählen können, aber nicht
  // müssen. Ein Pflichtfeld mehr kostet Abschlüsse, und "keine Wahl" wäre für
  // ihn die schlechtere Voreinstellung als die erste Option.
  const [praemieId, setPraemieId] = useState<string | null>(praemien[0]?.id ?? null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    // Clientseitige Vorpruefung nur fuer die beiden Felder, die der Endpunkt
    // nicht kennt. Name/Telefon validiert das Zod-Schema serverseitig.
    if (!schuld) {
      toast.error('Bitte geben Sie an, ob der Unfall unverschuldet war.')
      return
    }
    if (!anrufOk) {
      toast.error('Ohne Ihre Einwilligung zum Rückruf können wir nicht teilnehmen lassen.')
      return
    }

    const form = event.currentTarget
    const fd = new FormData(form)
    setPending(true)

    try {
      const res = await fetch(ANFRAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(fd.get('name') ?? '').trim(),
          telefon: String(fd.get('phone') ?? '').trim(),
          source: SOURCE,
          // Das Laien-Feld, nicht das fachliche `schuldfrage`. Werte laut
          // CHECK auf gutachter_finder_anfragen: 'unverschuldet' | 'nicht_sicher'.
          schuld_einschaetzung: schuld,
          // Nachweis der Einwilligung (Art. 7 DSGVO). Die Route legt daraus
          // dsgvo_zustimmung_am an.
          consent_ts: new Date().toISOString(),
          // Gewaehlter Gutschein. Serverseitig gegen die Praemien der aktiven
          // Kampagne geprueft; eine fremde ID wird verworfen, nicht uebernommen.
          ...(praemieId ? { gewinnspiel_praemie_id: praemieId } : {}),
          ...attributionAusUrl(),
          honeypot: String(fd.get('honeypot') ?? ''),
        }),
        keepalive: true,
      })

      if (!res.ok) {
        toast.error(
          res.status === 429
            ? 'Zu viele Anfragen. Bitte versuchen Sie es in ein paar Minuten erneut.'
            : 'Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.',
        )
        return
      }

      const data = (await res.json().catch(() => ({}))) as { anfrage_id?: string | null }
      trackGtag('generate_lead', {
        source: 'gewinnspiel',
        ...(data.anfrage_id ? { lead_id: data.anfrage_id } : {}),
      })
      setFertig(true)
    } catch {
      toast.error('Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.')
    } finally {
      setPending(false)
    }
  }

  if (fertig) {
    return (
      <div
        className="rounded-ios-lg border border-white/15 bg-white/10 p-7 text-center backdrop-blur-xl sm:p-9"
        role="status"
      >
        <p className="text-2xl font-bold text-[var(--gs-cream)]">Sie sind dabei.</p>
        <p className="mt-3 text-[15px] leading-relaxed text-white/75">
          Wir schicken Ihnen gleich eine WhatsApp zur Bestätigung. Die Ziehung läuft täglich,
          Gewinner benachrichtigen wir direkt.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-white/55">
          Unabhängig vom Gewinnspiel meldet sich ein Berater zu Ihrem Schaden.
        </p>
      </div>
    )
  }

  return (
    <form
      id="teilnahme"
      onSubmit={handleSubmit}
      className="rounded-ios-lg border border-white/15 bg-white/10 p-5 backdrop-blur-xl sm:p-7"
      noValidate
    >
      <h2 className="text-xl font-bold text-[var(--gs-cream)] sm:text-2xl">Jetzt teilnehmen</h2>
      <p className="mt-1 text-[13px] text-white/60">Dauert keine 30 Sekunden.</p>

      <div className="mt-5 space-y-3.5">
        <Field
          name="name"
          label="Ihr Name"
          type="text"
          placeholder="Vor- und Nachname"
          autoComplete="name"
          required
          disabled={pending}
        />
        <Field
          name="phone"
          label="Mobilnummer"
          type="tel"
          placeholder="0170 1234567"
          autoComplete="tel"
          inputMode="tel"
          required
          disabled={pending}
          hint="Über diese Nummer bestätigen wir Ihre Teilnahme per WhatsApp."
        />

        {/* Gutschein-Wahl. Bewusst KEIN Pflichtfeld: vorbelegt mit der ersten
            Option, damit sie Verkaufsargument bleibt und keine Hürde wird. */}
        {praemien.length > 0 ? (
          <fieldset className="pt-1">
            <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/70">
              Welchen Gutschein möchten Sie?
            </legend>
            <div className="space-y-2">
              {praemien.map((p) => {
                const aktiv = praemieId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPraemieId(p.id)}
                    disabled={pending}
                    aria-pressed={aktiv}
                    className={[
                      'flex w-full items-start gap-3 rounded-ios-md border px-3 py-2.5 text-left transition-all',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      aktiv
                        ? 'border-[var(--gs-cream)] bg-white/15'
                        : 'border-white/20 bg-white/5 hover:border-white/40',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className={[
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-ios-sm border text-[11px] font-bold',
                        aktiv
                          ? 'border-[var(--gs-cream)] bg-[var(--gs-cream)] text-claimondo-navy'
                          : 'border-white/40 text-transparent',
                      ].join(' ')}
                    >
                      ✓
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold text-white">{p.name}</span>
                      {p.beschreibung ? (
                        <span className="block text-[11px] leading-snug text-white/55">
                          {p.beschreibung}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="pt-1">
          <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/70">
            War der Unfall unverschuldet?
          </legend>
          <div className="grid grid-cols-2 gap-2.5">
            <SchuldButton
              aktiv={schuld === 'unverschuldet'}
              onClick={() => setSchuld('unverschuldet')}
              disabled={pending}
            >
              Ja, unverschuldet
            </SchuldButton>
            <SchuldButton
              aktiv={schuld === 'nicht_sicher'}
              onClick={() => setSchuld('nicht_sicher')}
              disabled={pending}
            >
              Bin nicht sicher
            </SchuldButton>
          </div>
        </fieldset>
      </div>

      {/* Getrennte Einwilligung fuer den Rueckruf (§ 7 Abs. 2 Nr. 1 UWG).
          BEWUSST nicht vorangekreuzt und sprachlich von der Teilnahme getrennt:
          ein Werbeanruf ohne ausdrueckliche Einwilligung ist abmahnfaehig. */}
      <label className="mt-5 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={anrufOk}
          onChange={(e) => setAnrufOk(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-ios-sm border-white/30 bg-white/10 accent-[var(--gs-cream)]"
        />
        <span className="text-[13px] leading-relaxed text-white/70">
          Claimondo darf mich zu meinem Unfallschaden telefonisch und per WhatsApp beraten.
          Ich kann das jederzeit widerrufen.
        </span>
      </label>

      {/* Bot-Falle: das Zod-Schema des Endpunkts verlangt honeypot.max(0). Ein
          Treffer wird serverseitig wie ein Erfolg beantwortet, damit Bots nichts
          lernen. Fuer Menschen unsichtbar und aus dem Tab-Fluss genommen. */}
      <input
        type="text"
        name="honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-[var(--gs-cream)] px-6 py-4 text-base font-bold text-claimondo-navy transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Wird gesendet …' : 'Teilnehmen und Gutschein sichern'}
      </button>

      <p className="mt-3.5 text-[11px] leading-relaxed text-white/60">
        Teilnahme ab 18 Jahren. Es gelten die{' '}
        <Link href="/gewinnspiel/teilnahmebedingungen" className="underline hover:text-white/70">
          Teilnahmebedingungen
        </Link>
        . Ihre Daten verarbeiten wir nach unserer{' '}
        <Link href="/datenschutz" className="underline hover:text-white/70">
          Datenschutzerklärung
        </Link>
        .
      </p>
    </form>
  )
}

function SchuldButton({
  aktiv,
  onClick,
  disabled,
  children,
}: {
  aktiv: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={aktiv}
      className={[
        'rounded-ios-md border px-3 py-3 text-[13px] font-semibold transition-all',
        'disabled:cursor-not-allowed disabled:opacity-60',
        aktiv
          ? 'border-[var(--gs-cream)] bg-[var(--gs-cream)] text-claimondo-navy'
          : 'border-white/20 bg-white/5 text-white/80 hover:border-white/40',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  name: string
  hint?: string
}
function Field({ label, name, hint, ...rest }: FieldProps) {
  const id = `gs-${name}`
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/70"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        {...rest}
        className="w-full rounded-ios-md border border-white/20 bg-white/10 px-4 py-3.5 text-base text-white placeholder:text-white/50 transition-all focus:border-[var(--gs-cream)] focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {hint ? <p className="mt-1.5 text-[11px] text-white/60">{hint}</p> : null}
    </div>
  )
}
