/** @jsxImportSource preact */
// AAR-939 · Monika-A-Flow · Chat-Widget (Skript-getrieben, Message-Player).
// FAB (Siegel) + Panel (Monika-Header + Bubbles + Chips/Actions/Kontakt), Shadow-DOM.
// Flow kommt aus flow-script.ts (PURE); dieser Renderer spielt messages mit Typing.

import { useSignal, useComputed } from '@preact/signals'
import { useRef } from 'preact/hooks'
import type { MonikaConfig } from './types'
import { SCRIPT, START_STEP, type StepId, type Answers, type ChoiceOption, type ActionDef, type Bubble } from './flow-script'
import { typingDurationMs } from './typing'
import { buildPayloadFromAnswers } from './payload'
import { submitAnfrage } from './api'
import { captureAttribution } from './attribution'
import { track } from './tracking'
import { fireSiteConversion } from './conversion'
import { SIEGEL_SVG, monikaPhotoUrl } from './assets'

export function MonikaApp({ cfg }: { cfg: MonikaConfig }) {
  const open = useSignal(false)
  const stepId = useSignal<StepId>(START_STEP)
  const log = useSignal<Bubble[]>([])
  const typing = useSignal(false)
  const awaiting = useSignal(false) // true = Chunks fertig, then-UI zeigen
  const answers = useSignal<Answers>({})
  const sending = useSignal(false)
  const done = useSignal(false)
  const error = useSignal('')
  const vorname = useSignal('')
  const nachname = useSignal('')
  const telefon = useSignal('')
  const consent = useSignal(false)
  const honeypot = useSignal('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const step = useComputed(() => SCRIPT[stepId.value])
  const photo = monikaPhotoUrl(cfg.base)

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  // Spielt die messages des Steps sequentiell mit Typing-Beats; dann awaiting=true.
  function playStep(id: StepId) {
    const s = SCRIPT[id]
    awaiting.value = false
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let i = 0
    const playNext = () => {
      if (i >= s.messages.length) {
        awaiting.value = true
        scrollDown()
        return
      }
      const text = s.messages[i++]
      if (reduce) {
        log.value = [...log.value, { role: 'monika', text }]
        scrollDown()
        playNext()
        return
      }
      typing.value = true
      scrollDown()
      setTimeout(() => {
        typing.value = false
        log.value = [...log.value, { role: 'monika', text }]
        scrollDown()
        setTimeout(playNext, 250)
      }, typingDurationMs(text))
    }
    playNext()
  }

  function openWidget() {
    if (open.value) return
    open.value = true
    track(cfg, 'monika_open')
    if (log.value.length === 0) playStep(START_STEP)
  }

  function choose(opt: ChoiceOption) {
    const s = step.value
    if (s.then.kind !== 'choices') return
    answers.value = { ...answers.value, [s.then.key]: opt.value } as Answers
    log.value = [...log.value, { role: 'user', text: opt.label }]
    stepId.value = opt.next
    playStep(opt.next)
  }

  function doAction(a: ActionDef) {
    if (a.kind === 'call' && cfg.telefon) {
      window.location.href = `tel:${cfg.telefon}`
      return
    }
    if (a.kind === 'whatsapp' && cfg.whatsapp) {
      const txt = encodeURIComponent('Hallo, ich hatte einen Kfz-Schaden und brauche einen Gutachter-Termin.')
      window.open(`https://wa.me/${cfg.whatsapp}?text=${txt}`, '_blank', 'noopener')
      return
    }
    if (a.kind === 'callback' && a.next) {
      log.value = [...log.value, { role: 'user', text: a.label }]
      stepId.value = a.next
      playStep(a.next)
    }
  }

  const canSubmit = useComputed(
    () => vorname.value.trim().length >= 2 && telefon.value.trim().length >= 8 && consent.value && !sending.value,
  )

  async function submitContact() {
    if (!canSubmit.value) return
    sending.value = true
    error.value = ''
    const merged: Answers = { ...answers.value, vorname: vorname.value, nachname: nachname.value, telefon: telefon.value }
    const payload = buildPayloadFromAnswers(merged, cfg, {
      page_url: window.location.href,
      consent_ts: new Date().toISOString(),
      honeypot: honeypot.value,
      attribution: captureAttribution(),
    })
    const result = await submitAnfrage(cfg.base, payload)
    sending.value = false
    if (result.ok) {
      track(cfg, 'monika_anfrage_submit')
      fireSiteConversion(cfg)
      done.value = true
      awaiting.value = false
      log.value = [
        ...log.value,
        { role: 'user', text: `${vorname.value} ${nachname.value}`.trim() },
        { role: 'monika', text: 'Perfekt, vielen Dank! 😊' },
        { role: 'monika', text: 'Wir melden uns schnellstmöglich bei Ihnen.' },
      ]
      scrollDown()
    } else {
      error.value = result.error
    }
  }

  const showGutschein = useComputed(() => done.value && !!answers.value.wunsch_tag)

  // ── FAB (geschlossen) ──
  if (!open.value) {
    return (
      <button class="mk-fab" type="button" aria-label="Hilfe bei Kfz-Schaden — Monika" onClick={openWidget}>
        {cfg.isClaimondoBranded ? (
          <span class="mk-seal" dangerouslySetInnerHTML={{ __html: SIEGEL_SVG }} />
        ) : (
          <img src={cfg.theme.logoUrl} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
        )}
      </button>
    )
  }

  const s = step.value

  // ── Panel (offen) ──
  return (
    <div class="mk-panel" role="dialog" aria-label="Chat mit Monika" aria-live="polite">
      <div class="mk-head">
        {cfg.isClaimondoBranded ? (
          <img class="mk-avatar" src={photo} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')} />
        ) : (
          <img class="mk-avatar" src={cfg.theme.logoUrl} alt="" />
        )}
        <div class="mk-head-meta">
          <span class="mk-name">{cfg.isClaimondoBranded ? 'Monika' : 'Schaden-Hilfe'}</span>
          <span class="mk-role">{cfg.isClaimondoBranded ? 'Schadenberaterin · ● online' : '● online'}</span>
        </div>
        <button class="mk-close" type="button" aria-label="Schließen" onClick={() => (open.value = false)}>
          ×
        </button>
      </div>

      <div class="mk-chat" ref={scrollRef}>
        {log.value.map((b, i) => (
          <div key={i} class={`mk-row mk-row-${b.role}`}>
            {b.role === 'monika' && cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <div class={`mk-bubble mk-bubble-${b.role}`}>{b.text}</div>
          </div>
        ))}
        {typing.value && (
          <div class="mk-row mk-row-monika">
            {cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <div class="mk-bubble mk-bubble-monika mk-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {awaiting.value && !done.value && s.then.kind === 'choices' && (
          <div class="mk-choices">
            {s.then.options.map((o) => (
              <button key={o.value} class="mk-chip" type="button" onClick={() => choose(o)}>
                {o.label}
              </button>
            ))}
          </div>
        )}

        {awaiting.value && !done.value && s.then.kind === 'actions' && (
          <div class="mk-actions">
            {s.then.actions.map((a, i) => (
              <button
                key={i}
                class={`mk-act mk-act-${a.kind === 'callback' ? 'secondary' : 'primary'}`}
                type="button"
                onClick={() => doAction(a)}
              >
                {a.kind === 'call' ? '📞 ' : a.kind === 'whatsapp' ? '💬 ' : ''}
                {a.label}
              </button>
            ))}
          </div>
        )}

        {awaiting.value && !done.value && s.then.kind === 'contact' && (
          <div class="mk-form">
            <input
              class="mk-inp"
              type="text"
              autocomplete="given-name"
              placeholder="Vorname"
              value={vorname.value}
              onInput={(e) => (vorname.value = (e.target as HTMLInputElement).value)}
            />
            <input
              class="mk-inp"
              type="text"
              autocomplete="family-name"
              placeholder="Nachname"
              value={nachname.value}
              onInput={(e) => (nachname.value = (e.target as HTMLInputElement).value)}
            />
            <input
              class="mk-inp"
              type="tel"
              autocomplete="tel"
              placeholder="Telefon, z.B. 0151 23456789"
              value={telefon.value}
              onInput={(e) => (telefon.value = (e.target as HTMLInputElement).value)}
            />
            {/* Honeypot — Bots fuellen es, Menschen nicht */}
            <input
              class="mk-hp"
              type="text"
              tabIndex={-1}
              autocomplete="off"
              aria-hidden="true"
              name="company"
              value={honeypot.value}
              onInput={(e) => (honeypot.value = (e.target as HTMLInputElement).value)}
            />
            <label class="mk-consent">
              <input
                type="checkbox"
                checked={consent.value}
                onChange={(e) => (consent.value = (e.target as HTMLInputElement).checked)}
              />
              <span>
                Ich akzeptiere die{' '}
                <a href={`${cfg.base}/datenschutz`} target="_blank" rel="noopener">
                  Datenschutzerklärung
                </a>
                .
              </span>
            </label>
            <button class="mk-act mk-act-primary" type="button" disabled={!canSubmit.value} onClick={() => void submitContact()}>
              {sending.value ? 'Wird gesendet…' : 'Absenden'}
            </button>
            {error.value && <p class="mk-err">{error.value}</p>}
          </div>
        )}

        {showGutschein.value && (
          <div class="mk-gutschein">
            <span class="mk-gutschein-badge">25 €</span>
            <span class="mk-gutschein-txt">Tankgutschein zum Termin — als Dankeschön. ⛽</span>
          </div>
        )}
      </div>

      {cfg.theme.brandedByClaimondo && (
        <div class="mk-powered">
          <a href={`${cfg.base}/sv-netzwerk`} target="_blank" rel="noopener">
            powered by Claimondo
          </a>
        </div>
      )}
    </div>
  )
}
