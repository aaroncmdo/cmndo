// Assertion-Track — kreuzt das tatsächliche Status-Delta gegen `expectedStatusTransition`.
// Liest aktuellen Status direkt aus der DB (nicht aus Realtime, weil State-Transition
// auch ohne UPDATE-Event wahrnehmbar sein muss bei Inserts).

export class AssertionTrack {
  constructor({ supabase }) {
    this.supabase = supabase
    this._cancelFn = null
  }

  async runStep(step) {
    if (!step.expectedStatusTransition) return { ok: true, checked: 'none' }
    const { from, to } = step.expectedStatusTransition

    return new Promise((resolve, reject) => {
      const start = Date.now()
      const tick = setInterval(async () => {
        try {
          // Vereinfacht: smoke-Test-Mandant hat genau einen aktiven Fall
          const { data } = await this.supabase
            .from('faelle')
            .select('status')
            .eq('kunde_email', process.env.SMOKE_TEST_KUNDE_EMAIL)
            .order('erstellt_am', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (data?.status === to) {
            clearInterval(tick)
            resolve({ ok: true, transitioned: { from, to }, durationMs: Date.now() - start })
          }
        } catch (err) {
          clearInterval(tick)
          reject(err)
        }
      }, 200)
      this._cancelFn = () => { clearInterval(tick); reject(new Error('cancelled')) }
    })
  }

  async cancel() { this._cancelFn?.() }
  async start() {}
}
