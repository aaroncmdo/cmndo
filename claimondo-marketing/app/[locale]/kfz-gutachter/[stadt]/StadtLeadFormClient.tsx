'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'

// Ziel des Submits: der zentrale Anfrage-Eingang der App — derselbe, den die
// Cluster-LPs seit AAR-939 nutzen. Vorher lief das ueber eine eigene
// Server-Action gegen LEAD_WEBHOOK_URL; die Variable steht in KEINEM
// Deploy-Workflow, also bekam jeder Absender auf allen 173 Stadtseiten
// "Konfigurationsfehler" und der Lead landete nirgends (21.08.2026 live belegt).
//
// ⚠ BEWUSST fest, NICHT process.env.NEXT_PUBLIC_APP_URL: der Marketing-Deploy
// setzt diese Variable auf https://claimondo.de (die Marketing-Domain selbst).
// Ein Fallback darauf wuerde an claimondo.de/api/anfrage-from-lp posten — dort
// gibt es die Route nicht (404). Muster wie in components/check/*.
const ANFRAGE_ENDPOINT = 'https://app.claimondo.de/api/anfrage-from-lp'

type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void
function trackGtag(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  w.gtag?.('event', eventName, params)
}

/** Attribution aus der aktuellen URL. Datensparsam und laengen-sicher:
 *  page_url nur origin+pathname (das Zod-Schema deckelt bei 500 Zeichen, und alle
 *  uebrigen Query-Parameter koennen Suchbegriffe oder fremde Daten tragen), die
 *  fuenf Standard-UTM + gclid einzeln. Deckungsgleich mit dem serverseitigen
 *  Fallback in src/lib/analytics/herkunft.ts. */
function attributionAusUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const out: Record<string, string> = { page_url: `${window.location.origin}${window.location.pathname}`.slice(0, 500) }
  const q = new URLSearchParams(window.location.search)
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid']) {
    const v = q.get(k)?.trim()
    if (v) out[k] = v.slice(0, 150)
  }
  return out
}

type Props = {
  stadtName: string
  stadtSlug: string
}

export function StadtLeadFormClient({ stadtName, stadtSlug }: Props) {
  const t = useTranslations('kfz_gutachter_stadt')
  const [pending, setPending] = useState(false)
  // P4 Ortseingaben: Ort-Autocomplete controlled (AC rendert kein name) -> Wert per hidden input in FormData.
  // Stadt-LP: das Ort-Feld ist mit dem Stadtnamen der Seite vorbelegt.
  const [city, setCity] = useState(stadtName ?? '')
  // Koordinaten der Autocomplete-Auswahl. Sie mitzuschicken erspart ein spaeteres
  // Geocoding aus dem blossen Ortsnamen — genau das lag bei den SV-Koordinaten
  // schon einmal 563 km daneben, weil ohne Ortsbezug geocodiert wurde.
  // Nur gesetzt, wenn der Nutzer einen Vorschlag WAEHLT (Freitext -> null).
  const [ortKoordinaten, setOrtKoordinaten] = useState<{ lat: number; lng: number } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
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
          // Dieselbe Quelle wie die Cluster-LPs: gleiche Gattung Seite, gleicher
          // Dispatch-Weg (Email an Dispatch + Sichtbarkeit unter Gutachter-Finder-
          // Anfragen). claimondo.de steht dafuer in clusterAllowlist().
          source: 'kfz_gutachter_lp',
          stadt_slug: stadtSlug,
          // Was der Nutzer im Ort-Feld stehen hat (kann von der Seiten-Stadt
          // abweichen) — landet 1:1 in gutachter_finder_anfragen.besichtigungsort_adresse.
          besichtigungsort_adresse: city.trim() || undefined,
          ...(ortKoordinaten
            ? { besichtigungsort_lat: ortKoordinaten.lat, besichtigungsort_lng: ortKoordinaten.lng }
            : {}),
          ...attributionAusUrl(),
          honeypot: String(fd.get('honeypot') ?? ''),
        }),
        keepalive: true,
      })

      if (!res.ok) {
        // 429 = Rate-Limit (eigene Meldung, "erneut versuchen" ist hier der
        // richtige Rat); alles andere faellt auf den generischen Fehlertext.
        toast.error(res.status === 429 ? t('form_toast_rate_limit') : t('form_toast_error'))
        return
      }

      toast.success(t('form_toast_success'))
      // Conversion laeuft ueber GA4: generate_lead -> in GA4 als
      // Schluesselereignis markieren (optional in Google Ads importieren).
      // Kein direkter Ads-Conversion-Tag (war ungenutzter AW-Platzhalter).
      // source bleibt das bisherige kfz-gutachter-<slug>, damit die GA4-Historie
      // nicht bricht — die DB-seitige Quelle ist davon unabhaengig.
      const data = (await res.json().catch(() => ({}))) as { anfrage_id?: string | null }
      trackGtag('generate_lead', {
        source: `kfz-gutachter-${stadtSlug}`,
        ...(data.anfrage_id ? { lead_id: data.anfrage_id } : {}),
      })
      form.reset()
      setCity(stadtName ?? '')
      setOrtKoordinaten(null)
    } catch {
      toast.error(t('form_toast_error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      id="lead-form"
      onSubmit={handleSubmit}
      className="rounded-ios-lg border border-white/60 bg-white/85 p-6 backdrop-blur-xl shadow-claimondo-lg sm:p-8"
      data-tracking="lead-form-hero"
      noValidate
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          {t('form_badge')}
        </span>
      </div>
      <h2 className="text-2xl font-bold text-claimondo-navy">
        {t('form_h2')}
      </h2>
      <p className="mt-1 text-sm text-claimondo-shield/80">
        {t('form_sub')}
      </p>
      <div className="mt-5 space-y-3">
        <Field name="name" label={t('form_name_label')} type="text" placeholder={t('form_name_placeholder')} autoComplete="name" required disabled={pending} />
        <Field name="phone" label={t('form_phone_label')} type="tel" placeholder={t('form_phone_placeholder')} autoComplete="tel" inputMode="tel" required disabled={pending} />
        <div>
          <label htmlFor="stadt-lead-city" className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
            {t('form_city_label')}
          </label>
          {/* P4 Ortseingaben: Google-Places-Autocomplete füllt Stadt/PLZ; Wert -> verstecktes name="city".
              place_id wird nicht mehr mitgeschickt (der Anfrage-Endpunkt kennt kein solches Feld) —
              stattdessen gehen die Koordinaten der Auswahl als besichtigungsort_lat/lng mit. */}
          <GooglePlaceAutocomplete
            className="w-full rounded-ios-md border border-claimondo-border bg-white/85 px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:cursor-not-allowed disabled:opacity-70"
            placeholder={t('form_city_placeholder', { stadt: stadtName })}
            defaultValue={city}
            onSelect={(r) => {
              setCity(r.stadt || r.plz || r.adresse)
              // lat/lng sind 0, wenn der Place keine geometry trug — dann lieber
              // gar keine Koordinate als eine auf dem Nullmeridian.
              setOrtKoordinaten(r.lat && r.lng ? { lat: r.lat, lng: r.lng } : null)
            }}
            onChange={(v) => { setCity(v); setOrtKoordinaten(null) }}
          />
          <input type="hidden" name="city" value={city} />
        </div>
      </div>
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
        className="mt-5 w-full rounded-full bg-claimondo-navy px-6 py-4 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? t('form_submit_pending') : t('form_submit_idle')}
      </button>
      <p className="mt-3 text-[11px] text-claimondo-shield/70">
        {t.rich('form_consent', {
          link: (chunks) => (
            <Link href="/datenschutz" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </form>
  )
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }
function Field({ label, name, ...rest }: FieldProps) {
  const id = `stadt-lead-${name}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={id}
        name={name}
        {...rest}
        className="w-full rounded-ios-md border border-claimondo-border bg-white/85 px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  )
}
