// CJ-Smoke-Orchestrator — Three-Track-Sync-Barrier
// Garantiert: alle 3 Tracks (UI, DB, Assertion) melden pro Step `done` innerhalb
// Barrier-Window — sonst sofort kill all + Iter-Restart von Step 0.

import { EventEmitter } from 'node:events'

export const TRACKS = ['ui', 'db', 'assert']
export const DEFAULT_BARRIER_MS = 3000
export const MAX_RETRIES = 3

export class Orchestrator extends EventEmitter {
  constructor({ steps, tracks, seedReset, reporter }) {
    super()
    this.steps = steps              // Array<{ id, ui, expectedDbEvents, expectedStatusTransition, barrierMs }>
    this.tracks = tracks            // { ui, db, assert } — alle haben .runStep(step) + .cancel()
    this.seedReset = seedReset      // async () => void
    this.reporter = reporter        // { onStep, onDesync, onIterStart, onIterEnd }
    this.retries = 0
  }

  async run() {
    while (this.retries <= MAX_RETRIES) {
      this.reporter.onIterStart({ attempt: this.retries + 1 })
      try {
        await this.seedReset()
        await this._runIteration()
        this.reporter.onIterEnd({ ok: true, attempt: this.retries + 1 })
        return { ok: true }
      } catch (err) {
        const desync = err.desync ?? null
        this.reporter.onIterEnd({ ok: false, attempt: this.retries + 1, desync, err })
        await this._cancelAll()
        this.retries += 1
        if (this.retries > MAX_RETRIES) {
          return { ok: false, reason: 'max-retries', lastDesync: desync }
        }
        // Restart von Step 0 nach Re-Seed
      }
    }
  }

  async _runIteration() {
    for (const step of this.steps) {
      await this._runStepWithBarrier(step)
    }
  }

  async _runStepWithBarrier(step) {
    const barrierMs = step.barrierMs ?? DEFAULT_BARRIER_MS
    const acks = new Set()
    const start = Date.now()

    this.reporter.onStep({ step, phase: 'start' })

    // Jeder Track läuft parallel und resolved mit { track, ok, reason? }
    const trackPromises = TRACKS.map((name) =>
      this.tracks[name].runStep(step)
        .then((res) => ({ track: name, ok: true, ...res }))
        .catch((err) => ({ track: name, ok: false, reason: err.message ?? String(err) })),
    )

    // Race gegen Barrier-Timeout
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`barrier-timeout-${barrierMs}ms`)), barrierMs),
    )

    let results
    try {
      results = await Promise.race([
        Promise.all(trackPromises),
        timeout,
      ])
    } catch (err) {
      // Timeout: prüfen welcher Track noch nicht resolved hat
      const settled = await Promise.allSettled(trackPromises)
      const stuck = settled
        .map((s, i) => ({ track: TRACKS[i], status: s.status }))
        .filter((s) => s.status === 'pending')
      const desync = {
        step: step.id,
        track: stuck[0]?.track ?? 'unknown',
        reason: err.message,
        durationMs: Date.now() - start,
      }
      this.reporter.onDesync(desync)
      const e = new Error(`desync:${desync.track}:${desync.reason}`)
      e.desync = desync
      throw e
    }

    // Alle 3 fertig — aber alle ok?
    const failed = results.find((r) => !r.ok)
    if (failed) {
      const desync = { step: step.id, track: failed.track, reason: failed.reason, durationMs: Date.now() - start }
      this.reporter.onDesync(desync)
      const e = new Error(`desync:${failed.track}:${failed.reason}`)
      e.desync = desync
      throw e
    }

    this.reporter.onStep({ step, phase: 'done', durationMs: Date.now() - start, results })
  }

  async _cancelAll() {
    await Promise.allSettled(TRACKS.map((t) => this.tracks[t].cancel?.()))
  }
}
