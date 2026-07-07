import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function makeClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY erforderlich')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export class Reporter {
  failures = 0
  private lines: string[] = []
  ok(msg: string) {
    this.lines.push(`  [ok]   ${msg}`)
  }
  skip(msg: string) {
    this.lines.push(`  [skip] ${msg}`)
  }
  fail(msg: string, err: unknown) {
    this.failures++
    this.lines.push(`  [FAIL] ${msg}: ${err instanceof Error ? err.message : String(err)}`)
  }
  print() {
    console.log(this.lines.join('\n'))
  }
  exitCode() {
    return this.failures > 0 ? 1 : 0
  }
}

type Opts = { reporter: Reporter; dryRun?: boolean }

/** Idempotenter upsert auf row.id. Dry-run: nur SELECT (kein Write), meldet exists/missing. */
export async function upsertById(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  opts: Opts,
): Promise<void> {
  const id = row.id as string
  if (opts.dryRun) {
    const { data } = await db.from(table).select('id').eq('id', id)
    opts.reporter.skip(`${table} ${id} — ${(data ?? []).length ? 'vorhanden' : 'FEHLT (würde angelegt)'}`)
    return
  }
  const { error } = await db.from(table).upsert(row)
  if (error) opts.reporter.fail(`${table} ${id}`, error)
  else opts.reporter.ok(`${table} ${id}`)
}

/** Idempotentes UPDATE per id (für Zustands-Fixes wie SV-Entsperren). */
export async function updateById(
  db: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  opts: Opts,
): Promise<void> {
  if (opts.dryRun) {
    opts.reporter.skip(`${table} ${id} — würde patchen`)
    return
  }
  const { error } = await db.from(table).update(patch).eq('id', id)
  if (error) opts.reporter.fail(`${table} ${id} update`, error)
  else opts.reporter.ok(`${table} ${id} gepatcht`)
}
