// Inbox-Thread-Zeitstempel-Formatter (Chat-Inbox-Konsolidierung).
// Geteilt von ChatInboxLayout (Sidebar-Thread-Liste) ueber alle Portale.
// Pure Lib -> per Vitest testbar (AAR-289-Pattern).
//
// TZ-deterministisch (Europe/Berlin): dieser Formatter laeuft sowohl im SSR
// (Server-Runtime = UTC) als auch bei der Client-Hydration (Browser = Berlin).
// OHNE feste timeZone rendert der Server UTC ("16:30"), der Client Berlin
// ("18:30") -> Text-Mismatch -> React #418 (Hydration-Fehler, Live-Smoke
// 03.07. /admin/nachrichten). MIT festem Berlin-Bezug liefern beide Seiten
// identischen Text -> kein Mismatch UND die angezeigte Zeit ist korrekt lokal.

const BERLIN = 'Europe/Berlin'

// Berlin-lokaler Kalendertag als 'YYYY-MM-DD' (en-CA -> ISO-Reihenfolge),
// damit der "heute?"-Vergleich nicht von der Runtime-TZ abhaengt.
function berlinDay(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: BERLIN })
}

export function formatInboxTime(iso: string): string {
  // Leere Threads (noch ohne Nachricht) tragen lastAt='' -> nicht "Invalid Date" rendern.
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const today = new Date()
  if (berlinDay(d) === berlinDay(today)) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: BERLIN })
  }
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 7) return d.toLocaleDateString('de-DE', { weekday: 'short', timeZone: BERLIN })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: BERLIN })
}
