import { USER_AGENT, type Antwort, type Holer } from './lauf'

/** Mindestabstand zwischen zwei Abrufen desselben Hosts (F-16: hoechstens 1 Abruf/2s). */
export const DROSSEL_MS = 2000
export const TIMEOUT_MS = 10_000
/** Ueber 2 MB liegt kein Impressum — das ist ein Download, den wir nicht wollen. */
export const MAX_BYTES = 2_000_000

/**
 * Fehlercodes, bei denen ein zweiter Versuch sinnlos ist: die Domain existiert
 * nicht, verweigert die Verbindung oder hat ein kaputtes Zertifikat. Ein Retry
 * kostet nur Zeit und belastet fremde Infrastruktur ohne Aussicht auf Erfolg.
 */
const ENDGUELTIG = [
  'ENOTFOUND', 'ECONNREFUSED', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]

function hostVon(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function fehlerCode(err: unknown): string {
  const cause = (err as { cause?: { code?: string } })?.cause
  return cause?.code ?? (err as { code?: string })?.code ?? ''
}

export type HolerOpts = {
  fetchImpl?: typeof fetch
  /** Injizierbar, damit die Drossel mit gefaelschter Uhr geprueft werden kann. */
  jetzt?: () => number
  warte?: (ms: number) => Promise<void>
  drosselMs?: number
  protokoll?: (zeile: string) => void
  /**
   * Merkt sich abgerufene Seiten fuer die Dauer des Laufs. Der Bestand enthaelt
   * Filialen derselben Firma (Lütz 4x, Urbach 3x) — ohne Cache wird dieselbe
   * Startseite mehrfach geholt.
   */
  cachen?: boolean
  cacheMax?: number
}

/**
 * Baut einen Holer, der die Zusagen aus F-16 einhaelt: eigener User-Agent,
 * hoechstens ein Abruf je Host und 2 Sekunden, Timeout, ein Wiederholversuch
 * nur bei transienten Fehlern.
 *
 * Die Drossel sitzt bewusst HIER und nicht im Lauf: so kann keine Aufrufstelle
 * sie vergessen.
 */
export function erzeugeHoler(opts: HolerOpts = {}): Holer {
  const f = opts.fetchImpl ?? fetch
  const jetzt = opts.jetzt ?? (() => Date.now())
  const warte = opts.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const drossel = opts.drosselMs ?? DROSSEL_MS
  const letzter = new Map<string, number>()

  async function einVersuch(url: string): Promise<Antwort & { endgueltig?: boolean }> {
    try {
      const res = await f(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      // Ein PDF oder Bild interessiert uns nicht — Header lesen genuegt.
      const typ = res.headers.get('content-type') ?? ''
      if (typ && !/text\/|xml|json/i.test(typ)) return { status: res.status, text: '' }

      const roh = await res.text()
      return { status: res.status, text: roh.slice(0, MAX_BYTES) }
    } catch (err) {
      const code = fehlerCode(err)
      return { status: 0, text: '', endgueltig: ENDGUELTIG.includes(code) }
    }
  }

  const cacheMax = opts.cacheMax ?? 200
  const cache = new Map<string, Antwort>()

  return async function hole(url: string): Promise<Antwort> {
    if (opts.cachen) {
      const gemerkt = cache.get(url)
      if (gemerkt) return gemerkt   // kein Abruf, keine Drosselzeit
    }

    const host = hostVon(url)
    const zuletzt = letzter.get(host)
    if (zuletzt !== undefined) {
      const rest = drossel - (jetzt() - zuletzt)
      if (rest > 0) await warte(rest)
    }
    letzter.set(host, jetzt())

    let antwort = await einVersuch(url)

    // Ein Wiederholversuch, nur wenn er Aussicht hat.
    if ((antwort.status === 0 && !antwort.endgueltig) || antwort.status >= 500) {
      await warte(drossel)
      letzter.set(host, jetzt())
      antwort = await einVersuch(url)
    }

    opts.protokoll?.(`${antwort.status} ${url}`)
    const ergebnis = { status: antwort.status, text: antwort.text }

    if (opts.cachen) {
      // Aeltesten Eintrag verdraengen — Map haelt die Einfuegereihenfolge.
      if (cache.size >= cacheMax) {
        const aeltester = cache.keys().next().value
        if (aeltester !== undefined) cache.delete(aeltester)
      }
      cache.set(url, ergebnis)
    }
    return ergebnis
  }
}
