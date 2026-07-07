// Reine Anzeige-Helfer fuer die Chat-UI (ClaimThreadChat). Kein DB-I/O -> testbar.
// Erwartet nach created_at aufsteigend sortierte Nachrichten (so liefert ladeThreadNachrichten).

export interface ChatNachrichtMin {
  id: string
  created_at: string
}

export interface ChatTagGruppe<T> {
  tagLabel: string
  nachrichten: T[]
}

function tagKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD (UTC-Tag)
}

function ddmmyyyy(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}.${m}.${y}`
}

/** Gruppiert (bereits sortierte) Nachrichten in Tages-Bloecke mit Label Heute/Gestern/DD.MM.YYYY. */
export function gruppiereNachrichtenNachTag<T extends ChatNachrichtMin>(
  nachrichten: T[],
  jetztISO: string,
): ChatTagGruppe<T>[] {
  const heute = tagKey(jetztISO)
  const gestern = tagKey(new Date(new Date(jetztISO).getTime() - 86_400_000).toISOString())

  const gruppen: ChatTagGruppe<T>[] = []
  let aktuellerKey: string | null = null
  for (const n of nachrichten) {
    const key = tagKey(n.created_at)
    if (key !== aktuellerKey) {
      const label = key === heute ? 'Heute' : key === gestern ? 'Gestern' : ddmmyyyy(key)
      gruppen.push({ tagLabel: label, nachrichten: [] })
      aktuellerKey = key
    }
    gruppen[gruppen.length - 1].nachrichten.push(n)
  }
  return gruppen
}
