// Abnahme-Inbox — der Mail-Nachweis fuer Prod-Smokes (Regel 4/5, Aaron 05.09.2026).
//
// PROBLEM: Die Send-Isolation (src/lib/testdaten/interne-identitaet.ts) unterdrueckt jede Mail an
// interne/Test-Adressen VOR dem email_log-Insert. Fuer Test-Leads existierte deshalb KEINE beobachtbare
// Spur einer Kunden-Mail — weder Posteingang noch Log. Die Abnahme der Kasko-Werkstattbindung (05.09.)
// musste die E6-Mail als „verdrahtet, nicht gelaufen" ausweisen.
//
// LOESUNG: Genau EIN Postfach ist zustellbar, obwohl es intern ist: abnahme@claimondo.de (Google
// Workspace). Specs adressieren Test-Leads mit abnahme+<lauf>@claimondo.de (Plus-Adressierung landet im
// selben Postfach) und holen die Mail hier per IMAP ab. Die Lead-IDENTITAET bleibt intern (kein echter
// Sachverstaendiger erreichbar) — nur die ZUSTELLUNG ist erlaubt (istAbnahmeInbox).
//
// ENV (nur .env.local + GitHub-Secrets, NIE im Repo — das Repo ist oeffentlich):
//   ABNAHME_INBOX_USER = abnahme@claimondo.de
//   ABNAHME_INBOX_PASS = <Google-App-Passwort, 16 Zeichen>
//   ABNAHME_INBOX_HOST = imap.gmail.com (Default)
// Fehlt die Konfiguration, skippen Specs sauber ueber abnahmeInboxKonfiguriert() — sie duerfen nie crashen.
//
// Betrieb + Einrichtung: docs/abnahme-inbox.md

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const ABNAHME_INBOX_DOMAIN = 'claimondo.de'
/**
 * Welches Postfach die Specs adressieren: 'abnahme' (eigenes Konto) oder 'noreply' (die Absenderadresse,
 * Aarons Alternative ohne neues Konto). Kommt aus ABNAHME_INBOX_USER — der lokale Teil VOR dem Plus.
 * Fehlt die Variable, bleibt 'abnahme' (nur fuer Fehlermeldungen relevant, ohne Zugangsdaten skippen Specs).
 */
function inboxLocal(): string {
  const user = (process.env.ABNAHME_INBOX_USER ?? '').trim().toLowerCase()
  const at = user.lastIndexOf('@')
  const local = at > 0 ? user.slice(0, at) : ''
  return local === 'noreply' ? 'noreply' : 'abnahme'
}

export type AbnahmeMail = {
  uid: number
  subject: string
  to: string[]
  from: string
  date: Date | null
  messageId: string | null
  text: string
  html: string
}

export type MailSuche = {
  /** Vollstaendige Empfaengeradresse, z.B. aus abnahmeAdresse(tag). */
  an: string
  /** Betreff-Filter (Teilstring, case-insensitiv) oder RegExp. */
  betreffEnthaelt?: string | RegExp
  /** Nur Mails ab diesem Zeitpunkt (IMAP SINCE ist tagesgenau; der Feinfilter laeuft ueber das Date-Header). */
  seit?: Date
}

/**
 * <postfach>+<tag>@claimondo.de — der Tag markiert den Lauf (nur a-z, 0-9, Bindestrich; max. 40 Zeichen).
 * Das Postfach folgt ABNAHME_INBOX_USER, damit dieselbe Spec mit abnahme@ und mit noreply@ laeuft.
 */
export function abnahmeAdresse(tag: string): string {
  const sauber = tag
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (!sauber) throw new Error('abnahmeAdresse: leerer Tag')
  return `${inboxLocal()}+${sauber}@${ABNAHME_INBOX_DOMAIN}`
}

export function abnahmeInboxKonfiguriert(): boolean {
  return Boolean(process.env.ABNAHME_INBOX_USER && process.env.ABNAHME_INBOX_PASS)
}

/**
 * Oeffnet EINE Verbindung, haelt den Mailbox-Lock und uebergibt eine Suchfunktion. Bewusst so:
 * Gmail begrenzt Logins pro Zeit — ein Poll-Zyklus mit eigener Verbindung je Runde (12-18 Logins je
 * Wartevorgang) laeuft in „Too many simultaneous connections". Alle Poll-Runden teilen sich daher
 * diese eine Sitzung.
 */
async function mitInbox<T>(fn: (suche: (s: MailSuche) => Promise<AbnahmeMail[]>) => Promise<T>): Promise<T> {
  const user = process.env.ABNAHME_INBOX_USER
  const pass = process.env.ABNAHME_INBOX_PASS
  if (!user || !pass) throw new Error('Abnahme-Inbox nicht konfiguriert (ABNAHME_INBOX_USER/ABNAHME_INBOX_PASS)')
  const client = new ImapFlow({
    host: process.env.ABNAHME_INBOX_HOST || 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  })
  await client.connect()
  try {
    // Ordner konfigurierbar: bleibt die INBOX leer (Filter, „an mich selbst"), auf
    // ABNAHME_INBOX_MAILBOX='[Gmail]/Alle Nachrichten' umstellen, ohne die Specs anzufassen.
    const lock = await client.getMailboxLock(process.env.ABNAHME_INBOX_MAILBOX || 'INBOX')
    try {
      return await fn((s) => sucheInVerbindung(client, s))
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
}

function betreffPasst(subject: string, filter: string | RegExp | undefined): boolean {
  if (!filter) return true
  if (filter instanceof RegExp) return filter.test(subject)
  return subject.toLowerCase().includes(filter.toLowerCase())
}

async function sucheInVerbindung(client: ImapFlow, suche: MailSuche): Promise<AbnahmeMail[]> {
  const seit = suche.seit ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
  const uids = await client.search({ to: suche.an, since: seit }, { uid: true })
  if (!uids || uids.length === 0) return []
  const treffer: AbnahmeMail[] = []
  for await (const msg of client.fetch(uids, { uid: true, envelope: true, source: true }, { uid: true })) {
    const subject = msg.envelope?.subject ?? ''
    if (!betreffPasst(subject, suche.betreffEnthaelt)) continue
    const datum = msg.envelope?.date ?? null
    // IMAP SINCE ist tagesgenau -> Feinfilter ueber das Date-Header (60 s Toleranz fuer Uhr-Drift).
    if (datum && datum.getTime() < seit.getTime() - 60_000) continue
    const parsed = msg.source ? await simpleParser(msg.source) : null
    treffer.push({
      uid: msg.uid,
      subject,
      to: (msg.envelope?.to ?? []).map((a) => a.address ?? '').filter(Boolean),
      from: msg.envelope?.from?.[0]?.address ?? '',
      date: datum,
      messageId: msg.envelope?.messageId ?? null,
      text: parsed?.text ?? '',
      html: typeof parsed?.html === 'string' ? parsed.html : '',
    })
  }
  treffer.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
  return treffer
}

/** Alle Mails an `an` (optional mit Betreff-Filter), neueste zuerst. Eine Verbindung pro Aufruf. */
export async function findeMails(suche: MailSuche): Promise<AbnahmeMail[]> {
  return mitInbox((such) => such(suche))
}

/**
 * Pollt in EINER Verbindung, bis mindestens eine passende Mail da ist; liefert die neueste. Wirft nach
 * `timeoutMs` mit einer Meldung, die Adresse und Filter nennt — eine fehlende Mail ist ein BEFUND, kein Skip.
 */
export async function warteAufMail(
  suche: MailSuche & { timeoutMs?: number; intervallMs?: number },
): Promise<AbnahmeMail> {
  const timeoutMs = suche.timeoutMs ?? 120_000
  const intervallMs = suche.intervallMs ?? 10_000
  const start = Date.now()
  const gefunden = await mitInbox(async (such) => {
    let letzterFehler: unknown = null
    while (Date.now() - start < timeoutMs) {
      try {
        const mails = await such(suche)
        if (mails.length > 0) return mails[0]
      } catch (err) {
        // IMAP-Wackler nicht als Befund werten — erst nach Ablauf des Budgets.
        letzterFehler = err
      }
      await new Promise((r) => setTimeout(r, intervallMs))
    }
    if (letzterFehler) console.warn('[abnahme-inbox] letzter IMAP-Fehler:', (letzterFehler as Error).message)
    return null
  })
  if (gefunden) return gefunden
  const filter = suche.betreffEnthaelt ? ` mit Betreff „${String(suche.betreffEnthaelt)}“` : ''
  throw new Error(`Keine Mail an ${suche.an}${filter} binnen ${Math.round(timeoutMs / 1000)} s`)
}

/** Anzahl passender Mails — fuer Dedup-Nachweise („genau eine Mail", „keine zweite nach X"). */
export async function zaehleMails(suche: MailSuche): Promise<number> {
  return (await findeMails(suche)).length
}
