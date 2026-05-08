/**
 * scripts/e2e-full-smoke.mjs — Master-Orchestrator für den E2E-Smoke-Run
 *
 * Startet alle konfigurierten Phasen sequenziell, sammelt Ergebnisse
 * und schreibt einen Bericht als Markdown-Datei.
 *
 * Verwendung:
 *   node scripts/e2e-full-smoke.mjs
 *   node scripts/e2e-full-smoke.mjs --phases=1,2
 *   node scripts/e2e-full-smoke.mjs --from=1 --to=2
 *   node scripts/e2e-full-smoke.mjs --phases=1,2 --headed
 *
 * Voraussetzungen:
 *   1. Dev-Server läuft auf http://localhost:3000 (oder BASE_URL)
 *   2. node scripts/e2e-reset.mjs wurde ausgeführt
 *   3. node scripts/e2e-seed-fixtures.mjs wurde ausgeführt
 *
 * Bei HARD-Blocker: Run stoppt, schreibt Status-File, exit 1
 * Bei SOFT-Blocker: notiert + macht weiter
 *
 * Screenshots: docs/portals-review/screenshots/full-smoke/<timestamp>/
 * Bericht:     docs/portals-review/SMOKE-REPORT-<timestamp>.md
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// --- ENV laden aus .env.local -------------------------------------------
function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}
ladeEnv()

// --- CLI-Argumente parsen -----------------------------------------------

function parseCLI() {
  const args = process.argv.slice(2)
  let phasen = null
  let from = null
  let to = null
  let headed = false

  for (const arg of args) {
    if (arg.startsWith('--phases=')) {
      phasen = arg.slice('--phases='.length).split(',').map(Number).filter(Boolean)
    } else if (arg.startsWith('--from=')) {
      from = Number(arg.slice('--from='.length))
    } else if (arg.startsWith('--to=')) {
      to = Number(arg.slice('--to='.length))
    } else if (arg === '--headed') {
      headed = true
    }
  }

  if (!phasen && from !== null && to !== null) {
    phasen = []
    for (let i = from; i <= to; i++) phasen.push(i)
  }

  return { phasen: phasen ?? null, headed }
}

// --- Hilfsfunktionen -----------------------------------------------------

function zeitstempel() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function statusEmoji(result) {
  if (result === 'pass') return '✅'
  if (result === 'soft') return '⚠️'
  if (result === 'hard') return '❌'
  return '⏭️'
}

// --- Verfügbarkeits-Check des Dev-Servers --------------------------------

async function pruefeDevServer(baseUrl) {
  try {
    const { default: http } = await import('http')
    const { default: https } = await import('https')
    const lib = baseUrl.startsWith('https') ? https : http
    return await new Promise((resolve) => {
      const req = lib.get(baseUrl, { timeout: 5000 }, (res) => {
        resolve(res.statusCode < 500)
        res.resume()
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  } catch {
    return false
  }
}

// --- Bericht schreiben ---------------------------------------------------

function schreibeBericht(outDir, ts, phasenResults, gesamtDauer) {
  const lines = [
    `# E2E-Smoke-Bericht — ${ts}`,
    '',
    `**Gesamt-Dauer:** ${(gesamtDauer / 1000).toFixed(1)}s`,
    '',
    '## Phasen-Übersicht',
    '',
    '| Phase | Ergebnis | Hard-Blocker | Soft-Findings |',
    '|---|---|---|---|',
  ]

  for (const r of phasenResults) {
    const hardCount = (r.notes ?? []).filter((n) => n.startsWith('HARD:')).length
    const softCount = (r.notes ?? []).filter((n) => n.startsWith('SOFT:')).length
    lines.push(`| ${r.phase} | ${statusEmoji(r.result)} ${r.result.toUpperCase()} | ${hardCount} | ${softCount} |`)
  }

  lines.push('')
  lines.push('## Details je Phase')
  lines.push('')

  for (const r of phasenResults) {
    lines.push(`### Phase ${r.phase} — ${statusEmoji(r.result)} ${r.result.toUpperCase()}`)
    lines.push('')
    if (r.notes && r.notes.length > 0) {
      for (const note of r.notes) {
        const prefix = note.startsWith('HARD:') ? '**❌ HARD:**' : note.startsWith('SOFT:') ? '**⚠️ SOFT:**' : '-'
        lines.push(`- ${prefix} ${note.replace(/^(HARD:|SOFT:)\s*/, '')}`)
      }
    } else {
      lines.push('- Keine Findings.')
    }
    if (r.leadId) lines.push(`- Lead-ID: \`${r.leadId}\``)
    if (r.auftragId) lines.push(`- Auftrag-ID: \`${r.auftragId}\``)
    lines.push('')
  }

  // Re-Smoke-Range
  const hardPhasen = phasenResults.filter((r) => r.result === 'hard')
  if (hardPhasen.length > 0) {
    lines.push('## Re-Smoke nach Fix')
    lines.push('')
    lines.push(`> **Hard-Blocker in Phase ${hardPhasen[0].phase}** — nach Fix von vorne starten (Hard-Blocker können DB-State zerschossen haben):`)
    lines.push(`> \`node scripts/e2e-reset.mjs && node scripts/e2e-seed-fixtures.mjs && node scripts/e2e-full-smoke.mjs --from=1 --to=${phasenResults[phasenResults.length - 1].phase}\``)
  }

  const softOnlyPhasen = phasenResults.filter((r) => r.result === 'soft')
  if (softOnlyPhasen.length > 0 && hardPhasen.length === 0) {
    lines.push('## Re-Smoke für Soft-Findings')
    lines.push('')
    for (const r of softOnlyPhasen) {
      const from = Math.max(1, r.phase - 1)
      lines.push(`- Phase ${r.phase}: \`node scripts/e2e-full-smoke.mjs --from=${from} --to=${r.phase}\``)
    }
  }

  lines.push('')
  lines.push(`*Screenshots: \`${outDir}\`*`)

  const berichtPath = join(projectRoot, 'docs', 'portals-review', `SMOKE-REPORT-${ts}.md`)
  writeFileSync(berichtPath, lines.join('\n'), 'utf-8')
  return berichtPath
}

// --- Phase-Importer ------------------------------------------------------

async function importierePhase(nummer) {
  const phaseDateien = {
    1: '../scripts/smoke/phases/phase-1-lead-capture.mjs',
    2: '../scripts/smoke/phases/phase-2-dispatch.mjs',
  }

  const pfad = phaseDateien[nummer]
  if (!pfad) {
    throw new Error(`Phase ${nummer} noch nicht implementiert`)
  }

  const mod = await import(join(projectRoot, 'scripts', 'smoke', 'phases', `phase-${nummer}-${phaseNameMap[nummer]}.mjs`))
  return mod
}

const phaseNameMap = {
  1: 'lead-capture',
  2: 'dispatch',
  3: 'sv-akzept',
  4: 'termin',
  5: 'heute',
  6: 'feldmodus',
  7: 'besichtigung',
  8: 'bericht',
  9: 'admin-review',
  10: 'vs-regulierung',
  11: 'abrechnung',
  12: 'multi-channel',      // noch nicht implementiert
  13: 'settings',           // noch nicht implementiert
}

// --- Haupt-Orchestrator --------------------------------------------------

async function main() {
  const { phasen: requestedPhasen, headed } = parseCLI()
  const ts = zeitstempel()
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'

  console.log('======================================================')
  console.log('  Claimondo E2E-Smoke-Run')
  console.log(`  Zeitstempel: ${ts}`)
  console.log(`  Base-URL:    ${baseUrl}`)
  console.log(`  Phasen:      ${requestedPhasen ? requestedPhasen.join(', ') : 'alle verfügbaren'}`)
  console.log('======================================================')
  console.log()

  // --- Voraussetzungs-Warnung: Fixture-IDs --------------------------------
  const fixtureIdsPath = join(projectRoot, 'tmp', 'e2e-fixture-ids.json')
  if (!existsSync(fixtureIdsPath)) {
    console.warn('[WARNUNG] tmp/e2e-fixture-ids.json nicht gefunden.')
    console.warn('  Bitte vor dem Run ausführen:')
    console.warn('    node scripts/e2e-reset.mjs && node scripts/e2e-seed-fixtures.mjs')
    console.warn('  Der Run wird fortgesetzt — DB-Asserts werden teilweise fehlschlagen.')
    console.warn()
  }

  // --- Dev-Server prüfen -------------------------------------------------
  const serverOk = await pruefeDevServer(baseUrl)
  if (!serverOk) {
    console.error(`[FEHLER] Dev-Server nicht erreichbar unter ${baseUrl}`)
    console.error('  Bitte zuerst starten: npm run dev')
    console.error('  Der Smoke-Run benötigt einen laufenden Next.js-Server.')
    process.exit(1)
  }
  console.log(`[OK] Dev-Server erreichbar: ${baseUrl}`)
  console.log()

  // --- Output-Verzeichnis anlegen ----------------------------------------
  const screenshotDir = join(projectRoot, 'docs', 'portals-review', 'screenshots', 'full-smoke', ts)
  mkdirSync(screenshotDir, { recursive: true })
  console.log(`[OK] Screenshot-Verzeichnis: ${screenshotDir}`)

  // Smoke-Helpers mit outDir initialisieren
  process.env._SMOKE_OUT_DIR = screenshotDir
  const helpers = await import('./smoke/helpers.mjs')
  helpers.setOutDir(screenshotDir)

  // --- Playwright Browser starten ----------------------------------------
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  console.log(`[OK] Playwright Chromium gestartet (headless=${!headed})`)
  console.log()

  // Browser-Contexts pro Rolle — lazy erstellt
  const contexts = {}

  async function getContext(rolle) {
    if (!contexts[rolle]) {
      contexts[rolle] = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin',
        recordVideo: undefined, // kein Video — Screenshots reichen
        // Cookie-Banner vorab akzeptieren — sonst blockiert er Klicks auf Formulare
        storageState: {
          cookies: [
            {
              name: 'claimondo-cookie-consent',
              value: 'true',
              domain: 'localhost',
              path: '/',
              expires: Math.floor(Date.now() / 1000) + 31536000,
              httpOnly: false,
              secure: false,
              sameSite: 'Lax',
            },
          ],
          origins: [],
        },
      })
    }
    return contexts[rolle]
  }

  // --- Phasen-Liste festlegen --------------------------------------------
  const verfuegbarePhasen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] // Implementierte Phasen
  const zielPhasen = requestedPhasen
    ? requestedPhasen.filter((n) => verfuegbarePhasen.includes(n))
    : verfuegbarePhasen

  const nichtImplementiert = requestedPhasen
    ? requestedPhasen.filter((n) => !verfuegbarePhasen.includes(n))
    : []

  if (nichtImplementiert.length > 0) {
    console.warn(`[WARN] Folgende Phasen sind noch nicht implementiert und werden übersprungen: ${nichtImplementiert.join(', ')}`)
    console.warn()
  }

  // --- Run durchführen ---------------------------------------------------
  const phasenResults = []
  let phase1Result = { leadId: null, notes: [] }
  let phase2Result = { auftragId: null, notes: [] }
  let phase3Result = { auftragId: null, notes: [] }
  let phase4Result = { auftragId: null, notes: [] }
  let phase5Result = { auftragId: null, terminId: null, notes: [] }
  let phase6Result = { auftragId: null, terminId: null, notes: [] }
  let phase7Result = { auftragId: null, notes: [] }
  let phase8Result = { auftragId: null, fallId: null, notes: [] }
  let phase9Result = { fallId: null, notes: [] }
  let phase10Result = { fallId: null, notes: [] }
  const gesamtStart = Date.now()
  let hardBlockerGefunden = false

  for (const phaseNr of zielPhasen) {
    if (hardBlockerGefunden) {
      console.log(`[Phase ${phaseNr}] Übersprungen wegen vorherigem Hard-Blocker`)
      phasenResults.push({ phase: phaseNr, result: 'skip', notes: ['Übersprungen wegen Hard-Blocker in vorheriger Phase'] })
      continue
    }

    console.log()
    console.log(`━━━ Starte Phase ${phaseNr} ━━━`)
    const phaseStart = Date.now()

    try {
      let phaseResult

      if (phaseNr === 1) {
        const { runPhase1 } = await import('./smoke/phases/phase-1-lead-capture.mjs')
        const anonCtx = await getContext('anonym')
        phaseResult = await runPhase1(anonCtx, { notes: [] })
        phase1Result = phaseResult
      } else if (phaseNr === 2) {
        const { runPhase2 } = await import('./smoke/phases/phase-2-dispatch.mjs')
        const dispatchCtx = await getContext('dispatch')
        phaseResult = await runPhase2(dispatchCtx, phase1Result)
        phase2Result = phaseResult

        // --- Workaround-Patch nach Phase 2 (F-02, F-05, F-06) ---------------
        // Sicherstellen dass Downstream-Phasen echte Daten vorfinden.
        const leadId = phase1Result?.leadId ?? null
        if (leadId) {
          const { forceAuftragVorhanden, advanceLeadStatus, emitLeadCreatedMitteilung, saveFixtureIds } = helpers

          // F-06: lead.status auf flow-gesendet setzen
          await advanceLeadStatus(leadId, 'flow-gesendet')

          // F-02: lead.created Mitteilung emittieren
          await emitLeadCreatedMitteilung(leadId)

          // Fixture-IDs erweitern mit Phase-2-Daten
          const db2 = helpers.getServiceDb()
          const fixtures = helpers.loadFixtureIds() ?? {}

          // Claim = SSoT: erst faelle by lead_id, dann claims by lead_id, sonst Workaround anlegen
          const { data: fallRow } = await db2.from('faelle').select('id').eq('lead_id', leadId).maybeSingle()
          let resolvedFallId = fallRow?.id ?? null

          if (!resolvedFallId) {
            // Prüfe ob claim bereits existiert
            let { data: claimRow } = await db2.from('claims').select('id').eq('lead_id', leadId).maybeSingle()

            if (!claimRow) {
              // Claim = SSoT: minimalen Claim aus Lead-Daten anlegen (Smoke-Workaround)
              const { data: leadData } = await db2
                .from('leads')
                .select('unfalldatum, schadentyp')
                .eq('id', leadId)
                .maybeSingle()
              const { data: newClaim, error: claimErr } = await db2
                .from('claims')
                .insert({
                  lead_id: leadId,
                  schadentag: leadData?.unfalldatum ?? new Date().toISOString().slice(0, 10),
                  schadenart: 'haftpflicht',
                  status: 'dispatch_done',
                  created_via: 'lead_konvertierung',
                })
                .select('id')
                .single()
              if (claimErr) {
                console.log(`[Orchestrator] Claim-Insert fehlgeschlagen: ${claimErr.message}`)
              } else {
                claimRow = newClaim
                console.log(`[Orchestrator] Claim angelegt (SSoT-Workaround): ${claimRow.id}`)
              }
            }

            if (claimRow?.id) {
              // Fallakte mit claim_id anlegen
              const { data: newFall, error: fallErr } = await db2
                .from('faelle')
                .insert({ lead_id: leadId, claim_id: claimRow.id, status: 'sv-termin' })
                .select('id')
                .single()
              if (fallErr) {
                console.log(`[Orchestrator] Fall-Insert fehlgeschlagen: ${fallErr.message}`)
                // Fallback: faelle by claim_id suchen (Trigger hat ggf. bereits angelegt)
                const { data: fallByClaimRow } = await db2.from('faelle').select('id').eq('claim_id', claimRow.id).maybeSingle()
                resolvedFallId = fallByClaimRow?.id ?? null
              } else {
                resolvedFallId = newFall.id
                // gutachter_termine.fall_id aktualisieren
                const { data: termin } = await db2.from('gutachter_termine').select('id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle()
                if (termin) {
                  await db2.from('gutachter_termine').update({ fall_id: resolvedFallId }).eq('id', termin.id)
                }
              }
              console.log(`[Orchestrator] Claim SSoT: claim_id=${claimRow.id} → fall_id=${resolvedFallId}`)
            }
          }

          const { data: svProfileRow } = await db2.from('profiles').select('id').eq('email', 'test-sv@claimondo.de').maybeSingle()
          const { data: svSacRow } = svProfileRow
            ? await db2.from('sachverstaendige').select('id').eq('profile_id', svProfileRow.id).maybeSingle()
            : { data: null }

          // F-05: auftraege-Row NACH fall_id-Lookup sicherstellen
          const terminRow = await db2.from('gutachter_termine').select('id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle()
          const auftragResult = await forceAuftragVorhanden({
            leadId,
            terminId: terminRow?.data?.id ?? fixtures.termin_id ?? null,
            svProfileId: svProfileRow?.id ?? fixtures.sv_profile_id ?? null,
            fallId: resolvedFallId ?? fixtures.fall_id ?? null,
          })
          if (auftragResult.ok && auftragResult.auftragId && !phase2Result.auftragId) {
            phase2Result.auftragId = auftragResult.auftragId
            console.log(`[Orchestrator] F-05-Workaround: auftragId=${auftragResult.auftragId}`)
          }

          saveFixtureIds({
            fall_id: resolvedFallId ?? fixtures.fall_id ?? null,
            sv_profile_id: svProfileRow?.id ?? fixtures.sv_profile_id ?? null,
            sv_sachverstaendige_id: svSacRow?.id ?? fixtures.sv_sachverstaendige_id ?? null,
            auftrag_id: phase2Result.auftragId ?? auftragResult?.auftragId ?? fixtures.auftrag_id ?? null,
          })
        }

      } else if (phaseNr === 3) {
        const { runPhase3 } = await import('./smoke/phases/phase-3-sv-akzept.mjs')
        const svCtx = await getContext('sv')
        phaseResult = await runPhase3(svCtx, phase2Result)
        phase3Result = phaseResult
      } else if (phaseNr === 4) {
        const { runPhase4 } = await import('./smoke/phases/phase-4-termin.mjs')
        const anonCtx4 = await getContext('anonym-phase4')
        phaseResult = await runPhase4(anonCtx4, phase3Result)
        phase4Result = phaseResult

        // Termin-ID in Fixture-IDs speichern für Phase 5-7
        // Phase 4 gibt terminId als auftragId zurück (Rückgabe-Konvention)
        if (phase4Result?.auftragId) {
          helpers.saveFixtureIds({ termin_id: phase4Result.auftragId })
        }

      } else if (phaseNr === 5) {
        const { runPhase5 } = await import('./smoke/phases/phase-5-heute.mjs')
        const svCtx5 = await getContext('sv-phase5')
        const fixtureIds = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase5(svCtx5, {
          auftragId: phase4Result?.auftragId ?? phase3Result?.auftragId ?? phase2Result?.auftragId ?? fixtureIds.auftrag_id ?? null,
          terminId: phase4Result?.auftragId ?? fixtureIds.termin_id ?? null,
          notes: [],
        })
        phase5Result = phaseResult

      } else if (phaseNr === 6) {
        const { runPhase6 } = await import('./smoke/phases/phase-6-feldmodus.mjs')
        const svCtx6 = await getContext('sv-phase6')
        const fixtureIds6 = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase6(svCtx6, {
          auftragId: phase5Result?.auftragId ?? phase2Result?.auftragId ?? fixtureIds6.auftrag_id ?? null,
          terminId: phase5Result?.terminId ?? fixtureIds6.termin_id ?? null,
          notes: [],
        })
        phase6Result = phaseResult

      } else if (phaseNr === 7) {
        const { runPhase7 } = await import('./smoke/phases/phase-7-besichtigung.mjs')
        const svCtx7 = await getContext('sv-phase7')
        const fixtureIds7 = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase7(svCtx7, {
          auftragId: phase6Result?.auftragId ?? phase2Result?.auftragId ?? fixtureIds7.auftrag_id ?? null,
          terminId: phase6Result?.terminId ?? fixtureIds7.termin_id ?? null,
          notes: [],
        })
        phase7Result = phaseResult

      } else if (phaseNr === 8) {
        const { runPhase8 } = await import('./smoke/phases/phase-8-bericht.mjs')
        const svCtx8 = await getContext('sv-phase8')
        const fixtureIds8 = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase8(svCtx8, {
          auftragId: phase7Result?.auftragId ?? phase2Result?.auftragId ?? fixtureIds8.auftrag_id ?? null,
          terminId: fixtureIds8.termin_id ?? null,
          fallId: fixtureIds8.fall_id ?? null,
          notes: [],
        })
        phase8Result = phaseResult

      } else if (phaseNr === 9) {
        const { runPhase9 } = await import('./smoke/phases/phase-9-admin-review.mjs')
        const adminCtx = await getContext('admin')
        const fixtureIds9 = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase9(adminCtx, {
          auftragId: phase8Result?.auftragId ?? fixtureIds9.auftrag_id ?? null,
          fallId: phase8Result?.fallId ?? fixtureIds9.fall_id ?? null,
          notes: [],
        })
        phase9Result = phaseResult

      } else if (phaseNr === 10) {
        const { runPhase10 } = await import('./smoke/phases/phase-10-vs-regulierung.mjs')
        const adminCtx10 = await getContext('admin-phase10')
        const fixtureIds10 = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase10(adminCtx10, {
          fallId: phase9Result?.fallId ?? fixtureIds10.fall_id ?? null,
          notes: [],
        })
        phase10Result = phaseResult

      } else if (phaseNr === 11) {
        const { runPhase11 } = await import('./smoke/phases/phase-11-abrechnung.mjs')
        const adminCtx11 = await getContext('admin-phase11')
        const fixtureIds11 = helpers.loadFixtureIds() ?? {}
        phaseResult = await runPhase11(adminCtx11, {
          fallId: phase10Result?.fallId ?? fixtureIds11.fall_id ?? null,
          auftragId: phase8Result?.auftragId ?? fixtureIds11.auftrag_id ?? null,
          leadId: phase1Result?.leadId ?? fixtureIds11.lead_direkt_id ?? null,
          notes: [],
        })

      } else {
        throw new Error(`Phase ${phaseNr} Import nicht konfiguriert`)
      }

      const dauer = ((Date.now() - phaseStart) / 1000).toFixed(1)
      console.log(`━━━ Phase ${phaseNr} FERTIG: ${phaseResult.result.toUpperCase()} (${dauer}s) ━━━`)

      phasenResults.push(phaseResult)

      if (phaseResult.result === 'hard') {
        hardBlockerGefunden = true
        console.error()
        console.error(`[HARD-BLOCKER] Phase ${phaseNr} hat einen Hard-Blocker gemeldet — Run stoppt.`)
        console.error('Findings:')
        for (const note of phaseResult.notes.filter((n) => n.startsWith('HARD:'))) {
          console.error(`  → ${note}`)
        }
        console.error()
        console.error('Nach dem Fix:')
        console.error(`  node scripts/e2e-reset.mjs && node scripts/e2e-seed-fixtures.mjs && node scripts/e2e-full-smoke.mjs --from=1 --to=${phaseNr}`)
        console.error()

        // Status-File schreiben
        const statusPath = join(screenshotDir, 'HARD-BLOCKER-STATUS.json')
        writeFileSync(statusPath, JSON.stringify({
          phase: phaseNr,
          result: 'hard',
          notes: phaseResult.notes,
          zeitstempel: ts,
        }, null, 2), 'utf-8')
      }

    } catch (err) {
      const dauer = ((Date.now() - phaseStart) / 1000).toFixed(1)
      console.error(`━━━ Phase ${phaseNr} CRASH: ${err.message} (${dauer}s) ━━━`)
      phasenResults.push({
        phase: phaseNr,
        result: 'hard',
        notes: [`HARD: Unerwarteter Crash in Phase ${phaseNr}: ${err.message}\n${err.stack}`],
      })
      hardBlockerGefunden = true
    }
  }

  const gesamtDauer = Date.now() - gesamtStart

  // --- Browser aufräumen -------------------------------------------------
  for (const ctx of Object.values(contexts)) {
    await ctx.close().catch(() => {})
  }
  await browser.close().catch(() => {})

  // --- Bericht schreiben -------------------------------------------------
  const berichtPfad = schreibeBericht(screenshotDir, ts, phasenResults, gesamtDauer)
  console.log()
  console.log('======================================================')
  console.log('  E2E-Smoke-Run abgeschlossen')
  console.log(`  Gesamt-Dauer: ${(gesamtDauer / 1000).toFixed(1)}s`)
  console.log('======================================================')
  console.log()
  console.log('Phasen-Zusammenfassung:')
  for (const r of phasenResults) {
    const emoji = statusEmoji(r.result)
    const hardCount = (r.notes ?? []).filter((n) => n.startsWith('HARD:')).length
    const softCount = (r.notes ?? []).filter((n) => n.startsWith('SOFT:')).length
    console.log(`  ${emoji} Phase ${r.phase}: ${r.result.toUpperCase()} (Hard: ${hardCount}, Soft: ${softCount})`)
  }
  console.log()
  console.log(`Bericht:      ${berichtPfad}`)
  console.log(`Screenshots:  ${screenshotDir}`)
  console.log()

  if (hardBlockerGefunden) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[KRITISCH] Unerwarteter Fehler im Orchestrator:', err?.message ?? err)
  console.error(err?.stack)
  process.exit(1)
})
