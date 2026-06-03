/** @jsxImportSource preact */
// AAR-939 · Monika-Embed · Stream 4 — Preact-Widget (State-Machine UI)
//
// FAB + Panel, gerendert in den Shadow-DOM (siehe index.tsx). State via
// @preact/signals. State-Machine: idle → qualify → day → time → form →
// success | fallback.

import { useSignal, useComputed } from '@preact/signals'
import type { MonikaConfig, MonikaState, DaySlot, TimeSlot, AnfragePayload } from './types'
import { submitAnfrage } from './api'
import { captureAttribution } from './attribution'
import { track } from './tracking'

const DAY_LABEL: Record<DaySlot, string> = {
  asap: 'So schnell wie möglich',
  morgen: 'Morgen',
  uebermorgen: 'Übermorgen',
}
const TIME_LABEL: Record<TimeSlot, string> = {
  vormittag: 'Vormittag (8–12 Uhr)',
  nachmittag: 'Nachmittag (12–17 Uhr)',
  abend: 'Abend (17–20 Uhr)',
}

export function MonikaApp({ cfg }: { cfg: MonikaConfig }) {
  const state = useSignal<MonikaState>('idle')
  const slot = useSignal<DaySlot | null>(null)
  const timeSlot = useSignal<TimeSlot | null>(null)
  const name = useSignal('')
  const telefon = useSignal('')
  const consent = useSignal(false)
  const honeypot = useSignal('')
  const sending = useSignal(false)
  const error = useSignal('')

  const canSubmit = useComputed(
    () => name.value.trim().length >= 2 && telefon.value.trim().length >= 8 && consent.value && !sending.value,
  )

  function go(next: MonikaState) {
    state.value = next
    error.value = ''
    if (next === 'qualify') track(cfg, 'monika_open')
    if (next === 'form') track(cfg, 'monika_form_shown')
  }

  function slotText(): string {
    return [slot.value ? DAY_LABEL[slot.value] : '', timeSlot.value ? TIME_LABEL[timeSlot.value] : '']
      .filter(Boolean)
      .join(', ')
  }

  async function submit() {
    if (!canSubmit.value) return
    sending.value = true
    const attr = captureAttribution()
    const payload: AnfragePayload = {
      name: name.value.trim(),
      telefon: telefon.value.trim(),
      slot: slot.value ?? undefined,
      time_slot: timeSlot.value ?? undefined,
      slot_text: slotText(),
      source: cfg.source,
      cluster: cfg.cluster ?? undefined,
      stadt_slug: cfg.stadtSlug ?? undefined,
      embed_site_slug: cfg.embedSiteSlug ?? undefined,
      page_url: window.location.href,
      consent_ts: new Date().toISOString(),
      site_token: cfg.siteToken ?? undefined,
      honeypot: honeypot.value,
      ...attr,
    }
    track(cfg, 'monika_anfrage_submit')
    const result = await submitAnfrage(cfg.base, payload)
    sending.value = false
    if (result.ok) go('success')
    else error.value = result.error
  }

  // ── FAB (idle) ──
  if (state.value === 'idle') {
    return (
      <button class="fab" type="button" aria-label="Hilfe bei Kfz-Schaden" onClick={() => go('qualify')}>
        <img src={cfg.theme.logoUrl} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
      </button>
    )
  }

  // ── Panel ──
  return (
    <div class="panel" role="dialog" aria-label="Schaden-Anfrage" aria-live="polite">
      <div class="head">
        <img src={cfg.theme.logoUrl} alt="" />
        <span class="title">Schnelle Hilfe</span>
        <button class="close" type="button" aria-label="Schließen" onClick={() => go('idle')}>
          ×
        </button>
      </div>

      <div class="body">
        {state.value === 'qualify' && (
          <>
            <p class="q">Hatten Sie einen Kfz-Unfall?</p>
            <p class="sub">Wir vermitteln Ihnen schnell einen Kfz-Sachverständigen.</p>
            <button class="opt" type="button" onClick={() => { track(cfg, 'monika_qualify_yes'); go('day') }}>
              Ja, ich hatte einen Unfall
            </button>
            <button class="opt" type="button" onClick={() => { track(cfg, 'monika_qualify_no'); go('fallback') }}>
              Nein, andere Frage
            </button>
          </>
        )}

        {state.value === 'day' && (
          <>
            <p class="q">Wann passt Ihnen ein Termin?</p>
            {(['asap', 'morgen', 'uebermorgen'] as DaySlot[]).map((d) => (
              <button key={d} class="opt" type="button" onClick={() => { slot.value = d; go('time') }}>
                {DAY_LABEL[d]}
              </button>
            ))}
          </>
        )}

        {state.value === 'time' && (
          <>
            <p class="q">Welche Tageszeit?</p>
            {(['vormittag', 'nachmittag', 'abend'] as TimeSlot[]).map((t) => (
              <button key={t} class="opt" type="button" onClick={() => { timeSlot.value = t; go('form') }}>
                {TIME_LABEL[t]}
              </button>
            ))}
          </>
        )}

        {state.value === 'form' && (
          <>
            <p class="q">Ihre Kontaktdaten</p>
            <p class="sub">Wir rufen Sie schnellstmöglich zurück.</p>
            <label class="fld" for="monika-name">Name</label>
            <input
              class="inp" id="monika-name" type="text" autocomplete="name" placeholder="Vor- und Nachname"
              value={name.value} onInput={(e) => (name.value = (e.target as HTMLInputElement).value)}
            />
            <label class="fld" for="monika-tel">Telefon</label>
            <input
              class="inp" id="monika-tel" type="tel" autocomplete="tel" placeholder="z.B. 0151 23456789"
              value={telefon.value} onInput={(e) => (telefon.value = (e.target as HTMLInputElement).value)}
            />
            {/* Honeypot — Bots fuellen es, Menschen nicht */}
            <input
              class="hp" type="text" tabIndex={-1} autocomplete="off" aria-hidden="true" name="company"
              value={honeypot.value} onInput={(e) => (honeypot.value = (e.target as HTMLInputElement).value)}
            />
            <label class="consent">
              <input type="checkbox" checked={consent.value} onChange={(e) => (consent.value = (e.target as HTMLInputElement).checked)} />
              <span>
                Ich akzeptiere die{' '}
                <a href={`${cfg.base}/datenschutz`} target="_blank" rel="noopener">Datenschutzerklärung</a> und{' '}
                <a href={`${cfg.base}/agb`} target="_blank" rel="noopener">AGB</a>.
              </span>
            </label>
            <button class="cta" type="button" disabled={!canSubmit.value} onClick={() => void submit()}>
              {sending.value ? 'Wird gesendet…' : 'Anfrage senden'}
            </button>
            {error.value && <p class="err">{error.value}</p>}
          </>
        )}

        {state.value === 'success' && (
          <>
            <div class="success-ico">✓</div>
            <p class="q">Vielen Dank!</p>
            <p class="sub">Wir melden uns schnellstmöglich bei Ihnen.</p>
            {cfg.whatsapp && (
              <a
                class="wa" target="_blank" rel="noopener"
                href={`https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent('Hallo, ich hatte einen Kfz-Unfall und möchte einen Gutachter-Termin.')}`}
              >
                Direkt per WhatsApp schreiben
              </a>
            )}
          </>
        )}

        {state.value === 'fallback' && (
          <>
            <p class="q">Wie können wir helfen?</p>
            {cfg.telefon && <a class="opt" href={`tel:${cfg.telefon}`}>📞 Jetzt anrufen: {cfg.telefon}</a>}
            <button class="opt" type="button" onClick={() => go('qualify')}>← Zurück</button>
          </>
        )}
      </div>

      {cfg.theme.brandedByClaimondo && (
        <div class="powered">
          <a href={`${cfg.base}/sv-netzwerk`} target="_blank" rel="noopener">powered by Claimondo</a>
        </div>
      )}
    </div>
  )
}
