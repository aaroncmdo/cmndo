// DB-Watcher — Supabase-Realtime + Match-Engine
// Pro Step: abonniert die in `expectedDbEvents` genannten Tabellen, sammelt eingehende
// Events ins JSONL und resolved `runStep` erst wenn ALLE non-optional erwarteten
// Events gematcht sind. Unerwartete Events werden geloggt (nicht-blockierend).

import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export class DbWatcher {
  constructor({ supabaseUrl, serviceRoleKey, outDir }) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey, { realtime: { params: { eventsPerSecond: 50 } } })
    this.outDir = outDir
    this.channel = null
    this.events = []  // Live-Buffer für aktuellen Step
    this.activeStep = null
  }

  async start(tablesOfInterest) {
    // Ein Channel für alle observed Tables — auch wenn aktueller Step nur eine prüft,
    // andere Tables loggen wir trotzdem für post-mortem.
    this.channel = this.supabase.channel('cj-smoke')
    for (const tbl of tablesOfInterest) {
      this.channel.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, (payload) => {
        const evt = { ts: Date.now(), table: tbl, kind: payload.eventType.toLowerCase(), new: payload.new, old: payload.old }
        this.events.push(evt)
        if (this.activeStep) {
          mkdirSync(path.join(this.outDir, this.activeStep.id), { recursive: true })
          appendFileSync(path.join(this.outDir, this.activeStep.id, 'db-events.jsonl'), JSON.stringify(evt) + '\n')
        }
      })
    }
    await new Promise((resolve, reject) => {
      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`realtime-${status}`))
      })
    })
  }

  async runStep(step) {
    this.activeStep = step
    this.events = []
    const required = (step.expectedDbEvents ?? []).filter((e) => !e.optional)
    if (required.length === 0) {
      // Nichts zu erwarten — sofort done
      this.activeStep = null
      return { matched: 0 }
    }

    return new Promise((resolve, reject) => {
      const tick = setInterval(() => {
        const matched = required.every((expected) => this._matches(expected))
        if (matched) {
          clearInterval(tick)
          this.activeStep = null
          resolve({ matched: required.length, total: required.length })
        }
      }, 100)

      // Wird durch Orchestrator-Barrier per cancel() abgebrochen
      this._cancelFn = () => {
        clearInterval(tick)
        reject(new Error('cancelled'))
      }
    })
  }

  _matches(expected) {
    return this.events.some((evt) => {
      if (evt.table !== expected.table) return false
      if (evt.kind !== expected.kind) return false
      if (!expected.match) return true
      for (const [k, v] of Object.entries(expected.match)) {
        const actual = evt.new?.[k]
        if (v === 'NOT NULL') {
          if (actual == null) return false
        } else if (actual !== v) {
          return false
        }
      }
      return true
    })
  }

  async cancel() {
    this._cancelFn?.()
    if (this.channel) await this.supabase.removeChannel(this.channel)
    this.channel = null
  }
}
