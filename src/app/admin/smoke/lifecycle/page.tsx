// Smoke-Test-Tool für die Claim-Lifecycle-Phasen.
// Erzeugt einen vollständigen Satz Test-Fälle in unterschiedlichen
// Phasen am gleichen Test-Kunden + Test-KB + Test-SV. Reset-Button
// löscht alle vorher per Seed angelegten Fälle.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SCENARIOS } from '@/lib/smoke/lifecycle-seed'
import { seedAction, resetAction } from './actions'
import { RefreshCcwIcon, PlayIcon, ExternalLinkIcon } from 'lucide-react'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

export default async function SmokeLifecyclePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  if (!profile || profile.rolle !== 'admin') redirect('/login')

  // Aktuell aktive Smoke-Claims laden (gefiltert via fall_typ='SMOKE-LC').
  // Defensiv: jeder Loader-Fehler wird inline gezeigt statt die Page
  // crashen zu lassen — dann sieht der Admin den echten Fehler statt
  // eines anonymisierten Digest.
  type SmokeClaim = {
    id: string
    phase: string | null
    status: string | null
    faelle: Array<{ id: string; fall_nummer: string | null; status: string | null }> | null
  }
  let claims: SmokeClaim[] = []
  let loadError: string | null = null
  try {
    const admin = createAdminClient()
    const { data: smokeClaims, error } = await admin
      .from('claims')
      .select('id, phase, status, faelle:faelle(id, fall_nummer, status)')
      .eq('fall_typ', 'SMOKE-LC')
      .order('id')
    if (error) {
      loadError = error.message
    } else {
      claims = (smokeClaims ?? []) as SmokeClaim[]
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
    console.error('[smoke/lifecycle] Loader-Fehler:', err)
  }

  // Fall_nummer-Format: SMOKE-LC-{idx}-{ts}, also können wir per Prefix matchen.
  const fallByScenario = new Map<string, { id: string; fall_nummer: string | null }>()
  for (let i = 0; i < SCENARIOS.length; i++) {
    const idx = String(i + 1).padStart(2, '0')
    for (const c of claims) {
      const f = (c.faelle ?? [])[0]
      if (f?.fall_nummer?.startsWith(`SMOKE-LC-${idx}-`)) {
        fallByScenario.set(SCENARIOS[i].key, { id: f.id, fall_nummer: f.fall_nummer })
      }
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Lifecycle Smoke-Tests</h1>
        <p className="text-xs text-claimondo-ondo mt-1 max-w-2xl">
          Seedet je einen Fall pro Lifecycle-Phase am gleichen Test-Kunden
          (Aaron Sprafke · kunde15), Test-KB (Anna Weber) und Test-SV
          (Test-Aaron). Reset löscht alle Smoke-Fälle (Marker
          <code className="font-mono mx-1">claims.fall_typ=&apos;SMOKE-LC&apos;</code>) — Cascade
          räumt faelle, auftraege, gutachter_termine, kanzlei_faelle auf.
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <p className="font-semibold">Loader-Fehler:</p>
          <code className="font-mono break-all">{loadError}</code>
        </div>
      )}

      <div className="flex gap-3">
        <form action={seedAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2"
          >
            <PlayIcon className="w-4 h-4" /> Seed alle Szenarien
          </button>
        </form>
        <form action={resetAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2"
          >
            <RefreshCcwIcon className="w-4 h-4" /> Reset alle Smoke-Fälle
          </button>
        </form>
        <span className="text-xs text-claimondo-ondo self-center">
          {claims.length === 0
            ? 'Aktuell kein Smoke-Datenbestand.'
            : `${claims.length} Smoke-Claim(s) aktiv.`}
        </span>
      </div>

      <DataTableContainer variant="plain" className="rounded-xl border border-claimondo-border bg-white overflow-hidden">
        <Table>
          <Thead className="normal-case! tracking-normal! border-b border-claimondo-border">
            <Tr>
              <Th className="text-left py-2!">Szenario</Th>
              <Th className="text-left py-2!">Erwartung</Th>
              <Th className="text-left py-2!">Fall-Nummer</Th>
              <Th className="text-left py-2!">Schnellzugriff</Th>
            </Tr>
          </Thead>
          <Tbody className="divide-y-0!">
            {SCENARIOS.map((s) => {
              const f = fallByScenario.get(s.key)
              return (
                <Tr key={s.key} className="border-b border-claimondo-border/50">
                  <Td>
                    <p className="font-medium text-claimondo-navy">{s.label}</p>
                    <p className="text-[11px] text-claimondo-ondo/70 font-mono">{s.key}</p>
                  </Td>
                  <Td className="text-xs text-claimondo-ondo! max-w-md">{s.expected}</Td>
                  <Td className="text-xs font-mono">
                    {f?.fall_nummer ?? '—'}
                  </Td>
                  <Td>
                    {f ? (
                      <div className="flex flex-col gap-1 text-xs">
                        <Link href={`/faelle/${f.id}`} className="inline-flex items-center gap-1 text-[var(--brand-accent)] hover:underline">
                          Admin <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                        <Link href={`/gutachter/fall/${f.id}`} className="inline-flex items-center gap-1 text-[var(--brand-accent)] hover:underline">
                          SV <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                        <Link href={`/kunde/faelle/${f.id}`} className="inline-flex items-center gap-1 text-[var(--brand-accent)] hover:underline">
                          Kunde <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs text-claimondo-ondo/60">noch nicht geseedet</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </DataTableContainer>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 max-w-3xl">
        <p className="font-semibold mb-1">Test-Identitäten</p>
        <ul className="space-y-0.5">
          <li>· Kunde: Aaron Sprafke · <code className="font-mono">aaron.sprafke+kunde15@claimondo.de</code></li>
          <li>· KB: Anna Weber · <code className="font-mono">kb@claimondo.de</code></li>
          <li>· SV: Test-Aaron Test-Sprafke · <code className="font-mono">aaron.sprafke@claimondo.de</code></li>
        </ul>
        <p className="mt-2 text-[11px] text-amber-800/80">
          Reset rekonstruiert die Daten in einem klaren Zustand —
          empfohlen vor jeder Smoke-Runde.
        </p>
      </div>
    </div>
  )
}
