import { MODULE, type Modul, type ModulId, type Modus, modulNachId } from './registry'

export type Kontext = {
  modus: Modus
  hatUrl: boolean
  hatPlacesZugang: boolean
  hatAdsKonto: boolean
  hatMetaKonto: boolean
  hatGscFreigabe: boolean
}

/**
 * Liefert den Sperrgrund im Klartext oder null, wenn das Modul messbar ist.
 * Die Gruende erscheinen woertlich auf der Modulkachel — ein Modul wird nie
 * nur ausgegraut (GESAMTSPEC §2).
 */
export function sperrgrund(modul: Modul, ctx: Kontext): string | null {
  if (!modul.modi.includes(ctx.modus)) return 'für diesen Weg nicht vorgesehen'

  switch (modul.braucht) {
    case 'url':        return ctx.hatUrl ? null : 'braucht eine Website-Adresse'
    case 'profil':     return ctx.hatPlacesZugang ? null : 'Zugang zur Kartensuche fehlt'
    case 'places':     return ctx.hatPlacesZugang ? null : 'Zugang zur Kartensuche fehlt'
    case 'ads_konto':  return ctx.hatAdsKonto ? null : 'braucht ein Google-Ads-Konto'
    case 'meta_konto': return ctx.hatMetaKonto ? null : 'braucht ein Meta-Business-Konto'
    case 'gsc':        return ctx.hatGscFreigabe ? null : 'braucht Ihre Freigabe für die Search Console'
    case 'browser':    return null // wird vom Menschen ausgeloest (R-F2), nie automatisch gesperrt
    case null:         return null
  }
}

/**
 * Serverseitige Bereinigung. F-02 ruft das auf — der Client ist nicht
 * vertrauenswuerdig (T-06).
 *
 * Der Wunsch des Nutzers wird getrennt gespeichert (levelup_checks.
 * module_gewuenscht), damit ein nachgetragenes Feld die Module zurueckbringt
 * (T-02). Diese Funktion loescht nichts dauerhaft — sie filtert nur, was
 * JETZT messbar ist.
 */
export function bereinigeAuswahl(
  gewuenscht: ModulId[],
  ctx: Kontext,
): { akzeptiert: ModulId[]; verworfen: { id: ModulId; grund: string }[]; punkteErhebbar: number } {
  const akzeptiert: ModulId[] = []
  const verworfen: { id: ModulId; grund: string }[] = []

  for (const id of gewuenscht) {
    const modul = modulNachId(id)
    if (!modul) {
      verworfen.push({ id, grund: 'unbekanntes Modul' })
      continue
    }
    const grund = sperrgrund(modul, ctx)
    if (grund) verworfen.push({ id, grund })
    else akzeptiert.push(id)
  }

  const punkteErhebbar = akzeptiert.reduce((s, id) => s + (modulNachId(id)?.punkte ?? 0), 0)
  return { akzeptiert, verworfen, punkteErhebbar }
}

/**
 * Voreinstellung je Weg — alles, was in diesem Modus messbar ist.
 * gsc bleibt bewusst draussen: es verlangt eine ausdrueckliche Freigabe des
 * Sachverstaendigen und ist damit opt-in (Design-Spec §3.6).
 */
export function vorauswahl(ctx: Kontext): ModulId[] {
  return MODULE
    .filter((m) => sperrgrund(m, ctx) === null)
    .filter((m) => m.id !== 'gsc')
    .map((m) => m.id)
}
