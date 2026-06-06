/** @jsxImportSource preact */
// AAR-939 · Monika-A-Flow · Chat-Widget (Skript-getrieben, Message-Player).
// Phase 1: FAB (Siegel) + Panel + 4-Pfad-Flow. Phase 2: proaktiver Teaser-Peek +
// uebergreifender Resume (sessionStorage, pro Besuch).

import { useSignal, useComputed, effect } from '@preact/signals'
import { useRef, useEffect } from 'preact/hooks'
import type { MonikaConfig } from './types'
import { SCRIPT, START_STEP, type StepId, type Answers, type ChoiceOption, type ActionDef, type Bubble } from './flow-script'
import { typingDurationMs } from './typing'
import { buildPayloadFromAnswers } from './payload'
import { submitAnfrage } from './api'
import { captureAttribution } from './attribution'
import { track } from './tracking'
import { fireSiteConversion } from './conversion'
import { SIEGEL_SVG, monikaPhotoUrl } from './assets'
import {
  loadState, saveState, markDismissed, getDismissedAt, getBeatsShown, setBeatsShown,
  isWithinQuietWindow, type PersistedState,
} from './store'
import { scrollDepthRatio, isScrollable, nextBeat, BEAT_TEXT, type TeaserSession } from './teaser'

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
  // Phase 2: Teaser-Peek (0 = unsichtbar; 1/2 = Beat bzw. Resume-Peek) + Session-Beat-Zaehler.
  const teaserBeat = useSignal<0 | 1 | 2>(0)
  const beatsShown = useSignal(0)
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

  // ── Phase 2: Teaser ──
  function isDismissed(): boolean {
    return isWithinQuietWindow(getDismissedAt(cfg), Date.now())
  }
  function teaserSession(): TeaserSession {
    return { beatsShown: beatsShown.value, dismissed: isDismissed(), engaged: log.value.length > 0, completed: done.value }
  }
  function fireBeat() {
    const b = nextBeat(teaserSession())
    if (!b) return
    teaserBeat.value = b
    beatsShown.value = b
    setBeatsShown(cfg, b)
  }
  function initTeaser(): () => void {
    if (isDismissed()) return () => {}
    const startedWithBeat1 = beatsShown.value === 1 // Beat 1 lief auf einer frueheren Seite (Cross-Page)
    let beat1FiredHere = false
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const ratio = scrollDepthRatio(window.scrollY, document.documentElement.scrollHeight, window.innerHeight)
        if (beatsShown.value === 0 && ratio >= 0.3) {
          beat1FiredHere = true
          fireBeat()
        } else if (beatsShown.value === 1 && ((startedWithBeat1 && ratio >= 0.3) || (beat1FiredHere && ratio >= 0.7))) {
          fireBeat()
        }
      })
    }
    let dwell = 0
    let fallback = 0
    if (!isScrollable(document.documentElement.scrollHeight, window.innerHeight)) {
      fallback = window.setTimeout(() => fireBeat(), 8000) // nicht scrollbar → Zeit-Fallback
    } else {
      dwell = window.setTimeout(() => window.addEventListener('scroll', onScroll, { passive: true }), 3000) // Min-Dwell
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      clearTimeout(dwell)
      clearTimeout(fallback)
    }
  }
  function dismissTeaser() {
    teaserBeat.value = 0
    markDismissed(cfg, Date.now())
  }

  function openWidget() {
    if (open.value) return
    open.value = true
    teaserBeat.value = 0
    track(cfg, 'monika_open')
    if (log.value.length === 0) playStep(START_STEP) // nur Cold-Start tippt; Resume hat History
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

  // ── Phase 2: Boot (einmalig) — Resume-Rehydrierung ODER Teaser-Init + Persistenz-Effekt ──
  useEffect(() => {
    let teaserCleanup: (() => void) | undefined
    const persisted = loadState(cfg)
    if (persisted && persisted.history.length > 0) {
      // ENGAGED/COMPLETED — Resume: History instant + stumm; aktueller Schritt live.
      stepId.value = persisted.stepId
      answers.value = persisted.answers
      log.value = persisted.history
      done.value = persisted.done
      if (persisted.done) {
        open.value = false // completed → FAB zu; Oeffnen zeigt den Danke-Log
      } else {
        awaiting.value = true
        const isMobile = typeof matchMedia === 'function' && matchMedia('(max-width: 480px)').matches
        if (isMobile) {
          teaserBeat.value = 1 // Mobile: Resume-Peek statt Vollbild-Takeover
          open.value = false
        } else {
          open.value = true // Desktop: Panel auto-open
        }
      }
    } else {
      // COLD — Teaser-Scroll-Listener (Cross-Page-Beat-Stand aus sessionStorage).
      beatsShown.value = getBeatsShown(cfg)
      teaserCleanup = initTeaser()
    }
    // Persistenz: NACH dem Boot erzeugt (kein spurious save waehrend Rehydrierung).
    const disposeEffect = effect(() => {
      const state: PersistedState = {
        v: 1,
        open: open.value,
        stepId: stepId.value,
        answers: answers.value,
        history: log.value,
        done: done.value,
      }
      if (state.history.length > 0) saveState(cfg, state)
    })
    return () => {
      disposeEffect()
      teaserCleanup?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── FAB + Teaser-Peek (geschlossen) ──
  if (!open.value) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const lastMonika = log.value.filter((b) => b.role === 'monika').slice(-1)[0]?.text
    const peekText = log.value.length > 0 ? `${lastMonika ?? BEAT_TEXT[1]} — weiter ↑` : BEAT_TEXT[teaserBeat.value === 2 ? 2 : 1]
    return (
      <div class="mk-launch">
        {teaserBeat.value > 0 && (
          <div
            class={`mk-teaser${reduce ? '' : ' mk-teaser-in'}`}
            role="button"
            tabIndex={0}
            onClick={openWidget}
            onKeyDown={(e) => e.key === 'Enter' && openWidget()}
          >
            {cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <span class="mk-teaser-txt">{peekText}</span>
            <button
              class="mk-teaser-x"
              type="button"
              aria-label="Schließen"
              onClick={(e) => {
                e.stopPropagation()
                dismissTeaser()
              }}
            >
              ×
            </button>
          </div>
        )}
        <button class="mk-fab" type="button" aria-label="Hilfe bei Kfz-Schaden — Monika" onClick={openWidget}>
          {cfg.isClaimondoBranded ? (
            <span class="mk-seal" dangerouslySetInnerHTML={{ __html: SIEGEL_SVG }} />
          ) : (
            <img src={cfg.theme.logoUrl} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
          )}
        </button>
      </div>
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
