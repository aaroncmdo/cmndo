// Reporter — schreibt iter-summary.json, PASS.md / FAIL.md
// Lebt parallel zu den Tracks, sammelt nur Orchestrator-Events.

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export class Reporter {
  constructor({ outDir, iterName }) {
    this.outDir = outDir
    this.iterName = iterName
    this.events = []
    this.steps = []
    this.iters = []
    this.currentIter = null
    mkdirSync(outDir, { recursive: true })
  }

  onIterStart({ attempt }) {
    this.currentIter = { attempt, startedAt: Date.now(), steps: [], desync: null }
    this.iters.push(this.currentIter)
  }

  onStep({ step, phase, durationMs, results }) {
    const entry = { id: step.id, phase, durationMs, ts: Date.now() }
    this.events.push(entry)
    if (phase === 'done' && this.currentIter) {
      this.currentIter.steps.push({ id: step.id, ok: true, durationMs })
    }
  }

  onDesync(desync) {
    this.events.push({ kind: 'desync', ...desync, ts: Date.now() })
    if (this.currentIter) this.currentIter.desync = desync
  }

  onIterEnd({ ok, attempt, desync, err }) {
    if (this.currentIter) {
      this.currentIter.ok = ok
      this.currentIter.endedAt = Date.now()
      this.currentIter.totalMs = this.currentIter.endedAt - this.currentIter.startedAt
      if (err) this.currentIter.error = err.message
    }
  }

  finalize({ ok, reason }) {
    const summary = {
      iterName: this.iterName,
      ok,
      reason: reason ?? null,
      attempts: this.iters.length,
      iters: this.iters,
    }
    writeFileSync(path.join(this.outDir, 'iter-summary.json'), JSON.stringify(summary, null, 2))

    const mdPath = path.join(this.outDir, ok ? 'PASS.md' : 'FAIL.md')
    writeFileSync(mdPath, this._renderMd(summary))
  }

  _renderMd(s) {
    const lines = [
      `# CJ-Smoke ${s.ok ? 'PASS' : 'FAIL'} — ${s.iterName}`,
      ``,
      `**Versuche:** ${s.attempts} | **Endergebnis:** ${s.ok ? 'grün' : `rot (${s.reason})`}`,
      ``,
    ]
    for (const [i, iter] of s.iters.entries()) {
      lines.push(`## Versuch ${i + 1} — ${iter.ok ? '✅' : '❌'} (${iter.totalMs} ms)`)
      for (const step of iter.steps) {
        lines.push(`- ✓ ${step.id} (${step.durationMs} ms)`)
      }
      if (iter.desync) {
        lines.push(``)
        lines.push(`**Desync:** Step \`${iter.desync.step}\`, Track \`${iter.desync.track}\`, Reason: ${iter.desync.reason}`)
      }
      lines.push(``)
    }
    return lines.join('\n')
  }
}
