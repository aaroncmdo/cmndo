// Inbox-Thread-Zeitstempel-Formatter (Chat-Inbox-Konsolidierung).
// Geteilt von ChatInboxLayout (Sidebar-Thread-Liste) ueber alle Portale.
// Pure Lib -> per Vitest testbar (AAR-289-Pattern).

export function formatInboxTime(iso: string): string {
  // Leere Threads (noch ohne Nachricht) tragen lastAt='' -> nicht "Invalid Date" rendern.
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
