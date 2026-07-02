// Prod-Smoke-Sicherheit: erlaubt, Write-/Notify-Pfade gefahrlos GEGEN PROD zu testen,
// indem externe Sends (WhatsApp/Email) unterdrueckt oder an eine Test-Adresse umgeleitet
// werden — gesteuert per SIDE_EFFECT_MODE.
//
// DEFAULT ist 'live' -> im normalen Prod-Betrieb aendert sich NICHTS. Die Env-Var wird
// AUSSCHLIESSLICH in Test-/Smoke-Sessions gesetzt (nie im normalen Prod-/Preview-Deploy).
//
// Modi:
//   live            -> normal senden (recipient = echt).
//   dry-run         -> NICHT senden; Caller loggt + gibt synthetischen Erfolg zurueck.
//   test-recipient  -> an SIDE_EFFECT_TEST_PHONE / SIDE_EFFECT_TEST_EMAIL umleiten.
//                      Ist keine Test-Adresse gesetzt -> fail-safe suppress (NIE an echt).

export type SideEffectMode = 'live' | 'dry-run' | 'test-recipient'

export function getSideEffectMode(): SideEffectMode {
  const v = (process.env.SIDE_EFFECT_MODE ?? '').trim().toLowerCase()
  if (v === 'dry-run' || v === 'dry_run' || v === 'dryrun') return 'dry-run'
  if (v === 'test-recipient' || v === 'test_recipient' || v === 'test') return 'test-recipient'
  return 'live'
}

export type SideEffectDecision = {
  mode: SideEffectMode
  /** true -> NICHT senden (dry-run, oder test-recipient ohne konfigurierte Test-Adresse). */
  suppress: boolean
  /** der zu verwendende Empfaenger (bei test-recipient ggf. die Test-Adresse). */
  recipient: string
}

/**
 * Entscheidet fuer einen externen Send (whatsapp/email), was passieren soll.
 * Pure + env-getrieben — in JEDER Send-Funktion am Anfang aufrufbar.
 */
export function resolveSideEffectRecipient(
  kind: 'whatsapp' | 'email',
  realRecipient: string,
): SideEffectDecision {
  const mode = getSideEffectMode()
  if (mode === 'live') return { mode, suppress: false, recipient: realRecipient }
  if (mode === 'dry-run') return { mode, suppress: true, recipient: realRecipient }
  // test-recipient: an konfigurierte Test-Adresse umleiten; fehlt sie -> fail-safe suppress.
  const override = (kind === 'whatsapp'
    ? process.env.SIDE_EFFECT_TEST_PHONE
    : process.env.SIDE_EFFECT_TEST_EMAIL
  )?.trim()
  if (override) return { mode, suppress: false, recipient: override }
  return { mode, suppress: true, recipient: realRecipient }
}
