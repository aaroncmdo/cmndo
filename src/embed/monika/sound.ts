// AAR-939 · Monika-A-Flow · Sound. shouldThrottle = PURE (vitest). createSoundEngine =
// AudioContext-Wrapper (gesten-entsperrt, fetch+decode, Gain+Mute+Throttle). Wirft nie.

const MIN_GAP_MS = 1000

/** true = zu kurz seit letztem Play (Min-Gap), also unterdruecken. */
export function shouldThrottle(lastAt: number | null, now: number, minGapMs = MIN_GAP_MS): boolean {
  if (lastAt === null) return false
  return now - lastAt < minGapMs
}

type Win = Window & { webkitAudioContext?: typeof AudioContext }

export interface SoundEngine {
  unlock(): void
  playIncoming(): void
  playSent(): void
}

/** isMuted: Getter (liest das Mute-Signal des Widgets). base = claimondo-Origin fuer die MP3-URLs. */
export function createSoundEngine(base: string, isMuted: () => boolean): SoundEngine {
  let ctx: AudioContext | null = null
  let incoming: AudioBuffer | null = null
  let sent: AudioBuffer | null = null
  let lastIncomingAt: number | null = null
  let loading = false
  // P3-Fix (Teaser-Sound): feuert ein Teaser bevor Audio per erster Geste entsperrt ODER
  // der Buffer geladen ist, merken wir das hier -> beim naechsten unlock() nachholen. Sonst
  // sind die ERSTEN Teaser-Bubbles (Scroll/6s, vor jeder Geste) stumm (Browser-Autoplay).
  let pendingIncoming = false

  function ensureCtx(): AudioContext | null {
    if (ctx) return ctx
    try {
      const Ctor = window.AudioContext || (window as Win).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      return ctx
    } catch {
      return null
    }
  }

  async function loadBuffers(c: AudioContext): Promise<void> {
    if (loading || (incoming && sent)) return
    loading = true
    try {
      const [a, b] = await Promise.all([
        fetch(`${base}/embed/sounds/monika-incoming.mp3`).then((r) => r.arrayBuffer()),
        fetch(`${base}/embed/sounds/monika-sent.mp3`).then((r) => r.arrayBuffer()),
      ])
      incoming = await c.decodeAudioData(a)
      sent = await c.decodeAudioData(b)
    } catch {
      /* Asset/Decode-Fehler → Engine bleibt still */
    } finally {
      loading = false
    }
  }

  function play(buf: AudioBuffer | null): void {
    if (!ctx || !buf || isMuted()) return
    try {
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = 0.4
      src.connect(gain).connect(ctx.destination)
      src.start(0)
    } catch {
      /* nie werfen */
    }
  }

  // Holt einen vor dem Unlock gefeuerten Incoming-Sound nach, sobald Audio laeuft + Buffer da.
  function flushPending(): void {
    if (pendingIncoming && ctx && ctx.state === 'running' && incoming) {
      pendingIncoming = false
      play(incoming)
    }
  }

  return {
    // Bei der ERSTEN Page-Geste / im FAB-Click synchron aufrufen: entsperrt Autoplay, laedt
    // Buffer UND holt einen vor der Geste gefeuerten Teaser-Sound nach (sonst erster Teaser stumm).
    unlock() {
      const c = ensureCtx()
      if (!c) return
      const ready = () => {
        void loadBuffers(c).then(flushPending)
        flushPending()
      }
      if (c.state === 'suspended') void c.resume().then(ready)
      else ready()
    },
    playIncoming() {
      const now = Date.now()
      if (shouldThrottle(lastIncomingAt, now)) return
      lastIncomingAt = now
      // Audio noch nicht spielbereit (gesperrt / Buffer nicht geladen) -> merken, beim
      // naechsten unlock() (erste Geste) nachholen. Sonst stiller erster Teaser.
      if (!ctx || ctx.state !== 'running' || !incoming) {
        pendingIncoming = true
        return
      }
      play(incoming)
    },
    playSent() {
      play(sent)
    },
  }
}
