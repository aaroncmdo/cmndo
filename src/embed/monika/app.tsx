/** @jsxImportSource preact */
// AAR-939 · Monika-A-Flow · Chat-Widget (Skript-getrieben, Message-Player).
// P1: FAB (Siegel) + Panel + 4-Pfad-Flow. P2: proaktiver Teaser-Peek + uebergreifender
// Resume (sessionStorage). P3: Sound (gesten-entsperrt) + Mute.

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
import { buildConversionExtra } from './value-model'
import { SIEGEL_SVG, monikaPhotoUrl } from './assets'
import {
  loadState, saveState, markDismissed, getDismissedAt, getBeatsShown, setBeatsShown,
  getMuted, setMuted, isWithinQuietWindow, type PersistedState,
} from './store'
import { isScrollable, nextBeat, BEAT_TEXT, type TeaserSession } from './teaser'
import { createSoundEngine } from './sound'

// AAR-939: Inaktivitaets-Reaktivierung — reagiert der Kunde an einem Auswahl-/Form-Schritt
// ~25s nicht, schreibt Monika EINE freundliche Nachricht (einmal pro Flow). Der Schritt
// bleibt klickbar; bei geschlossenem Widget erscheint sie als Peek-Bubble auf der Seite.
const REACTIVATE_MS = 25000
const REACTIVATE_TEXT = 'Sind Sie noch da? 😊 Tippen Sie einfach auf eine Option, ich helfe Ihnen gern weiter.'

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
  // P2: Teaser-Peek (0 = unsichtbar; 1/2 = Beat bzw. Resume-Peek) + Session-Beat-Zaehler.
  const teaserBeat = useSignal<0 | 1 | 2>(0)
  const beatsShown = useSignal(0)
  // #5: Monika erscheint erst ab der Displayfalte (wie das WA-Icon der Cluster-LP).
  const pastFold = useSignal(false)
  // P3: Mute-State (localStorage-persistiert, default AN = nicht gemutet).
  const muted = useSignal(getMuted(cfg))
  const scrollRef = useRef<HTMLDivElement>(null)
  // AAR-939: System-Zurueck-Button schliesst den Chat (History-API). Ref ueberlebt Re-Renders.
  const historyPushedRef = useRef(false)
  // AAR-939: Inaktivitaets-Reaktivierung (einmal pro Flow) + Timer-Handle.
  const reactivatedRef = useRef(false)
  const inactivityRef = useRef<number>(0)

  const step = useComputed(() => SCRIPT[stepId.value])
  const photo = monikaPhotoUrl(cfg.base)
  // P3: Sound-Engine einmalig (stabil ueber Re-Renders); liest muted lazy.
  const soundRef = useRef<ReturnType<typeof createSoundEngine> | null>(null)
  if (!soundRef.current) soundRef.current = createSoundEngine(cfg.base, () => muted.value)

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  // Tippt eine Monika-Bubble-Sequenz mit realistischen Pausen ab; ruft onDone am Ende.
  // playIncoming bei JEDEM Chunk — jede Monika-Nachricht klingt (1000ms-Throttle bleibt als
  // Doppelfeuer-Schutz, stoert nicht: Chunks liegen >=1,5s auseinander). Nicolas-UX (N4):
  // laengere Tippzeit (typing.ts) + Denkpause vorm ersten Chunk + groessere Inter-Bubble-Pause.
  function typeSequence(texts: string[], onDone?: () => void) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let i = 0
    const next = () => {
      if (i >= texts.length) {
        onDone?.()
        return
      }
      const isFirst = i === 0
      const text = texts[i++]
      if (reduce) {
        soundRef.current?.playIncoming()
        log.value = [...log.value, { role: 'monika', text }]
        scrollDown()
        next()
        return
      }
      const startTyping = () => {
        typing.value = true
        scrollDown()
        setTimeout(() => {
          typing.value = false
          soundRef.current?.playIncoming()
          log.value = [...log.value, { role: 'monika', text }]
          scrollDown()
          setTimeout(next, 350)
        }, typingDurationMs(text))
      }
      // N4: kurze Denkpause vorm ersten Chunk (Monika "liest" die Auswahl).
      if (isFirst) setTimeout(startTyping, 450)
      else startTyping()
    }
    next()
  }

  function playStep(id: StepId) {
    awaiting.value = false
    typeSequence(SCRIPT[id].messages, () => {
      awaiting.value = true
      scrollDown()
      armInactivity() // AAR-939: Inaktivitaets-Timer starten — Nutzer ist jetzt dran
    })
  }

  // ── P2: Teaser ──
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
    // #2: Teaser-Bubble (ausserhalb des Chats) klingt — wenn Audio per erster Geste entsperrt ist.
    soundRef.current?.playIncoming()
  }
  function initTeaser(): () => void {
    if (isDismissed()) return () => {}
    const startedWithBeat1 = beatsShown.value === 1 // Beat 1 lief auf einer frueheren Seite (Cross-Page)
    let beat1FiredHere = false
    let raf = 0
    // #5: Schwelle = ~0.65 Viewport-Hoehe (Displayfalte), nicht Seiten-Prozent — so erscheint
    // Monika an derselben Stelle wie das WA-Icon (das ab Hero-out-of-view eingeblendet wird).
    const foldPx = () => window.innerHeight * 0.65
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const fold = foldPx()
        const y = window.scrollY
        pastFold.value = y >= fold // steuert Launcher-Sichtbarkeit (cold)
        if (beatsShown.value === 0 && y >= fold) {
          beat1FiredHere = true
          fireBeat()
        } else if (beatsShown.value === 1 && ((startedWithBeat1 && y >= fold) || (beat1FiredHere && y >= fold * 3))) {
          fireBeat()
        }
      })
    }
    let fallback = 0
    if (!isScrollable(document.documentElement.scrollHeight, window.innerHeight)) {
      // nicht scrollbar → keine Fold; nach Zeit zeigen + Beat
      fallback = window.setTimeout(() => { pastFold.value = true; fireBeat() }, 6000)
    } else {
      // #5: Listener SOFORT (kein 3s-Dwell), damit der Launcher genau wie das WA-Icon ab der Fold erscheint.
      window.addEventListener('scroll', onScroll, { passive: true })
      onScroll() // initialer Check (Seite evtl. schon gescrollt geladen)
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }
  function dismissTeaser() {
    teaserBeat.value = 0
    markDismissed(cfg, Date.now())
  }

  // ── AAR-939: Inaktivitaets-Reaktivierung ──
  function disarmInactivity() {
    if (inactivityRef.current) {
      clearTimeout(inactivityRef.current)
      inactivityRef.current = 0
    }
  }
  // Timer (neu) starten — nur wenn noch nicht reaktiviert + Flow nicht abgeschlossen.
  function armInactivity() {
    if (reactivatedRef.current || done.value) return
    disarmInactivity()
    inactivityRef.current = window.setTimeout(doReactivate, REACTIVATE_MS)
  }
  // EINE Reaktivierungs-Bubble; offen → im Chat (+ Ton), geschlossen → als Peek auf der Seite.
  // awaiting bleibt unangetastet → der aktuelle Schritt bleibt klickbar.
  function doReactivate() {
    if (reactivatedRef.current || done.value) return
    reactivatedRef.current = true
    log.value = [...log.value, { role: 'monika', text: REACTIVATE_TEXT }]
    if (open.value) {
      soundRef.current?.playIncoming()
      scrollDown()
    } else {
      teaserBeat.value = 1 // geschlossen → Peek zeigt die letzte Monika-Zeile
    }
  }

  // AAR-939: einen History-Eintrag pushen, damit der System-Zurueck-Button den Chat
  // schliesst (statt die Host-Seite zu verlassen). Idempotent via Ref.
  function pushHistoryOnce() {
    if (historyPushedRef.current) return
    try {
      history.pushState({ mkOpen: true }, '')
      historyPushedRef.current = true
    } catch {
      /* History-API blockiert → Back schliesst dann nicht; das X bleibt der Weg */
    }
  }
  // Schliessen (X / programmatisch): unseren History-Eintrag konsumieren (back).
  function closeWidget() {
    if (!open.value) return
    open.value = false
    if (historyPushedRef.current) {
      historyPushedRef.current = false
      try {
        history.back()
      } catch {
        /* noop */
      }
    }
  }

  function openWidget() {
    if (open.value) return
    soundRef.current?.unlock() // P3: Geste → Autoplay entsperren + Buffer laden
    open.value = true
    teaserBeat.value = 0
    track(cfg, 'monika_open')
    pushHistoryOnce() // System-Back schliesst den Chat
    if (log.value.length === 0) {
      if (beatsShown.value > 0) {
        // #3: Der Teaser hat die erste Begruessung schon "gesagt" → instant in den Log (kein
        // Neu-Tippen derselben Nachricht); nur die FOLGE-Chunks werden getippt, dann die Optionen.
        const msgs = SCRIPT[START_STEP].messages
        log.value = [{ role: 'monika', text: msgs[0] }]
        typeSequence(msgs.slice(1), () => {
          awaiting.value = true
          scrollDown()
          armInactivity()
        })
      } else {
        playStep(START_STEP) // direkter FAB-Klick ohne Teaser → normal tippen
      }
    }
  }

  function choose(opt: ChoiceOption) {
    const s = step.value
    if (s.then.kind !== 'choices') return
    disarmInactivity()
    answers.value = { ...answers.value, [s.then.key]: opt.value } as Answers
    log.value = [...log.value, { role: 'user', text: opt.label }]
    soundRef.current?.playSent()
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
      disarmInactivity()
      log.value = [...log.value, { role: 'user', text: a.label }]
      soundRef.current?.playSent()
      stepId.value = a.next
      playStep(a.next)
    }
  }

  const canSubmit = useComputed(
    () => vorname.value.trim().length >= 2 && telefon.value.trim().length >= 8 && consent.value && !sending.value,
  )

  async function submitContact() {
    if (!canSubmit.value) return
    disarmInactivity()
    sending.value = true
    error.value = ''
    const merged: Answers = { ...answers.value, vorname: vorname.value, nachname: nachname.value, telefon: telefon.value }
    const attribution = captureAttribution()
    const payload = buildPayloadFromAnswers(merged, cfg, {
      page_url: window.location.href,
      consent_ts: new Date().toISOString(),
      honeypot: honeypot.value,
      attribution,
    })
    const result = await submitAnfrage(cfg.base, payload)
    sending.value = false
    if (result.ok) {
      soundRef.current?.playSent()
      // Doc-11 value-based Conversion: Cluster-LP traegt schadenart/value/lead_id/phone/gclid
      // in den monika_anfrage_submit-Push (GTM -> GA4 + Google Ads Smart Bidding). sv_embed: undefined.
      track(
        cfg,
        'monika_anfrage_submit',
        buildConversionExtra(cfg, merged, {
          leadId: result.anfrageId,
          phone: telefon.value.trim(),
          gclid: attribution.gclid,
        }),
      )
      fireSiteConversion(cfg)
      done.value = true
      awaiting.value = false
      log.value = [...log.value, { role: 'user', text: `${vorname.value} ${nachname.value}`.trim() }]
      // N5/N6 (Nicolas-UX): getippte Abschluss-Sequenz — Zusammenfassung, naechster Schritt,
      // WhatsApp-Schadensfotos-Hinweis (wir haben gerade geschrieben) + Tankgutschein als
      // NACHRICHT (nicht als goldene Card). Tankgutschein nur im Termin-Pfad (wunsch_tag).
      const vn = vorname.value.trim()
      const closing = [
        `Perfekt, vielen Dank${vn ? ', ' + vn : ''}! 😊`,
        'Ich habe alles notiert — wir melden uns schnellstmöglich bei Ihnen.',
        'Ich habe Ihnen gerade auf WhatsApp geschrieben. Sie können uns dort direkt Ihre Schadensfotos schicken, dann geht es noch schneller. 📸',
      ]
      if (answers.value.wunsch_tag) {
        closing.push('Als Dankeschön für Ihren Termin gibt es übrigens einen 25 € Tankgutschein. ⛽')
      }
      typeSequence(closing)
    } else {
      error.value = result.error
    }
  }

  // ── P2: Boot (einmalig) — Resume-Rehydrierung ODER Teaser-Init + Persistenz-Effekt ──
  useEffect(() => {
    let teaserCleanup: (() => void) | undefined
    const persisted = loadState(cfg)
    if (persisted && persisted.history.length > 0) {
      // ENGAGED/COMPLETED — Resume: History instant + stumm (KEIN playStep → kein Sound); aktueller Schritt live.
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
          pushHistoryOnce() // System-Back schliesst auch den auto-geoeffneten Chat
        }
      }
    } else {
      // COLD — Teaser-Scroll-Listener (Cross-Page-Beat-Stand aus sessionStorage).
      beatsShown.value = getBeatsShown(cfg)
      teaserCleanup = initTeaser()
    }
    // AAR-939: System-Zurueck-Button schliesst den offenen Chat (popstate). Der beim
    // Oeffnen gepushte State wird konsumiert; die Host-Seite bleibt erhalten.
    const onPop = () => {
      historyPushedRef.current = false // unser State wurde durch Back konsumiert
      if (open.value) open.value = false
    }
    window.addEventListener('popstate', onPop)
    // #2: Audio bei der ERSTEN Page-Geste entsperren (touchstart/pointerdown/keydown) — damit
    // Teaser + erste Nachricht klingen koennen (Autoplay-Policy verlangt eine Nutzer-Geste).
    const unlockAudio = () => soundRef.current?.unlock()
    const unlockOpts: AddEventListenerOptions = { once: true, passive: true }
    window.addEventListener('pointerdown', unlockAudio, unlockOpts)
    window.addEventListener('touchstart', unlockAudio, unlockOpts)
    window.addEventListener('keydown', unlockAudio, unlockOpts)
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
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      disarmInactivity()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── FAB + Teaser-Peek (geschlossen) ──
  if (!open.value) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const lastMonika = log.value.filter((b) => b.role === 'monika').slice(-1)[0]?.text
    const peekText = log.value.length > 0 ? (lastMonika ?? BEAT_TEXT[1]) : BEAT_TEXT[teaserBeat.value === 2 ? 2 : 1]
    // #5: Cold (noch nie geoeffnet) erst ab der Displayfalte zeigen; Resume (history>0) sofort.
    const monikaVisible = log.value.length > 0 || pastFold.value
    return (
      <div class={`mk-launch${monikaVisible ? '' : ' mk-launch-off'}`}>
        {teaserBeat.value > 0 && (
          <div
            class={`mk-teaser${reduce ? '' : ' mk-teaser-in'}`}
            role="button"
            tabIndex={0}
            onClick={openWidget}
            onKeyDown={(e) => e.key === 'Enter' && openWidget()}
          >
            {cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <div class="mk-teaser-body">
              <span class="mk-teaser-label">Neue Nachricht</span>
              <span class="mk-teaser-txt">{peekText}</span>
              {/* #6: CTA-Pill in Claimondo-Blau statt "— weiter ↑" */}
              <span class="mk-teaser-cta">chat öffnen</span>
            </div>
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
        <div class="mk-fab-wrap">
          {/* N1: Hover-Pill (Desktop ausfahrend, Mobile sichtbar) — nur wenn kein Teaser laeuft. */}
          {cfg.isClaimondoBranded && teaserBeat.value === 0 && (
            <div class="mk-hoverpill" aria-hidden="true">
              <img class="mk-mini" src={photo} alt="" />
              <span class="mk-hoverpill-txt">
                <strong>Claimondo</strong>
                <span>Schadensberatung</span>
              </span>
            </div>
          )}
          <div class="mk-fab-holder">
            <button class="mk-fab" type="button" aria-label="Hilfe bei Kfz-Schaden — Monika" onClick={openWidget}>
              {cfg.isClaimondoBranded ? (
                <span class="mk-seal" dangerouslySetInnerHTML={{ __html: SIEGEL_SVG }} />
              ) : (
                <img src={cfg.theme.logoUrl} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
              )}
            </button>
            {/* N2: rote (1)-Badge bei neuer/ungelesener Nachricht (WhatsApp-Style). */}
            {teaserBeat.value > 0 && <span class="mk-badge" aria-hidden="true">1</span>}
          </div>
        </div>
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
          <span class="mk-role">
            {cfg.isClaimondoBranded ? 'Schadenberaterin · ' : ''}
            <span class="mk-online-dot" aria-hidden="true"></span> online
          </span>
        </div>
        <button
          class="mk-mute"
          type="button"
          aria-label={muted.value ? 'Ton einschalten' : 'Ton ausschalten'}
          onClick={() => {
            muted.value = !muted.value
            setMuted(cfg, muted.value)
          }}
        >
          {muted.value ? '🔇' : '🔊'}
        </button>
        <button class="mk-close" type="button" aria-label="Chat schließen" onClick={closeWidget}>
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
          <div class="mk-form" onInput={armInactivity}>
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
