import { readFile } from 'node:fs/promises'

/**
 * RAM-Gate fuer den Marketing-Render.
 *
 * Der Render (rspack-`bundle()` + headless-Chromium) ist RAM-schwer (~500-800MB Spitze)
 * und laeuft fire-and-forget im shared Web-Prozess. Auf einer knappen Box (VPS: 1.8GB total,
 * 13 PM2-Apps) kann ein ungegateter Render einen Nachbar-Prozess OOM-killen. Dieses Gate
 * laesst einen Render nur starten, wenn genug freier RAM da ist — sonst wartet es auf ein
 * sicheres Fenster und bricht mit klarer Meldung ab, statt einen OOM-Kill zu riskieren.
 *
 * Server-only (liest /proc/meminfo). Nicht-Linux (dev/test) -> Gate inaktiv (kein Blocker).
 */

/** Parst `MemAvailable` (kB) aus /proc/meminfo-Text nach MB. null wenn die Zeile fehlt. */
export function parseMemAvailableMb(meminfo: string): number | null {
  const m = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m)
  if (!m) return null
  return Math.floor(Number(m[1]) / 1024)
}

/**
 * Verfuegbarer RAM in MB (Linux `/proc/meminfo` MemAvailable — beruecksichtigt reclaimable
 * Cache, anders als os.freemem()). `null` = nicht ermittelbar (nicht-Linux) -> Gate skippt.
 */
export async function readAvailableRamMb(): Promise<number | null> {
  try {
    return parseMemAvailableMb(await readFile('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
}

export interface RamGateOptions {
  /** benoetigter freier RAM in MB, ab dem gerendert werden darf */
  minMb?: number
  /** max. Wartezeit auf ein RAM-Fenster in ms, danach Abbruch */
  maxWaitMs?: number
  /** Poll-Intervall in ms */
  pollMs?: number
  /** Callback pro Warteschleife (fuer Logging) */
  onWait?: (availableMb: number, waitedMs: number) => void
  /** injizierbar fuer Tests */
  read?: () => Promise<number | null>
  /** injizierbar fuer Tests */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Wartet auf ein sicheres RAM-Fenster, bevor ein RAM-schwerer Render startet.
 * - genug RAM sofort -> return.
 * - zu wenig -> pollt bis `maxWaitMs`; oeffnet sich ein Fenster -> return.
 * - kein Fenster bis Timeout -> wirft (Caller setzt status=fehler mit der Meldung).
 * - kein /proc/meminfo (nicht-Linux) -> return sofort (Gate inaktiv).
 */
export async function waitForRam(opts: RamGateOptions = {}): Promise<void> {
  const minMb = opts.minMb ?? 650
  const maxWaitMs = opts.maxWaitMs ?? 8 * 60_000
  const pollMs = opts.pollMs ?? 12_000
  const read = opts.read ?? readAvailableRamMb
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  let avail = await read()
  if (avail === null || avail >= minMb) return // genug, oder Gate inaktiv (nicht-Linux)

  let waited = 0
  while (waited < maxWaitMs) {
    opts.onWait?.(avail ?? 0, waited)
    await sleep(pollMs)
    waited += pollMs
    avail = await read()
    if (avail === null || avail >= minMb) return
  }
  throw new Error(
    `Zu wenig RAM fuer Render: nur ${avail ?? '?'}MB frei (${minMb}MB noetig) nach ${Math.round(maxWaitMs / 60_000)}min Warten. Spaeter erneut versuchen.`,
  )
}
