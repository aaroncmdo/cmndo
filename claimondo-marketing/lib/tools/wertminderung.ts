export type Vorschaden = 'keine' | 'repariert' | 'erheblich'

export interface WmInput {
  reparaturkosten: number
  alterJahre: number
  km?: number
  wbw?: number
  vorschaden?: Vorschaden
}

export type WmResult =
  | { kind: 'unvollstaendig'; hinweise: string[] }
  | { kind: 'einzelfall'; hinweise: string[] }
  | { kind: 'schaetzung'; betrag: number; pct: number; hinweise: string[] }

// SSoT — MUSS die de.json-Faustregel-Tabelle (kfz_gutachter_wertminderung.faustregel) spiegeln.
// Ein Paritaets-Test in wertminderung.test.ts erzwingt das.
export const WM_FAKTOREN: { maxJahr: number; pct: number }[] = [
  { maxJahr: 1, pct: 0.25 },
  { maxJahr: 2, pct: 0.2 },
  { maxJahr: 3, pct: 0.15 },
  { maxJahr: 4, pct: 0.1 },
]

const round50 = (n: number) => Math.round(n / 50) * 50

export function computeWertminderung(input: WmInput): WmResult {
  const rep = Number(input.reparaturkosten)
  const alter = Number(input.alterJahre)
  const km = input.km != null ? Number(input.km) : undefined
  const wbw = input.wbw != null ? Number(input.wbw) : undefined
  const vorschaden: Vorschaden = input.vorschaden ?? 'keine'

  if (!Number.isFinite(rep) || rep <= 0 || !Number.isFinite(alter) || alter < 0) {
    return { kind: 'unvollstaendig', hinweise: [] }
  }
  // Reihenfolge wichtig: erheblicher Vorschaden dominiert das Alter.
  if (vorschaden === 'erheblich') {
    return { kind: 'einzelfall', hinweise: ['einzelfall_vorschaden'] }
  }
  if (alter >= 5) {
    return { kind: 'einzelfall', hinweise: ['einzelfall_alter'] }
  }
  const stufe = WM_FAKTOREN.find((f) => alter <= f.maxJahr) ?? WM_FAKTOREN[0]
  const betrag = round50(stufe.pct * rep)
  const hinweise: string[] = []
  if (vorschaden === 'repariert') hinweise.push('vorschaden_repariert')
  if (km != null && Number.isFinite(km) && km > 100000) hinweise.push('hohe_km')
  if (wbw != null && Number.isFinite(wbw) && wbw > 0 && rep < 0.1 * wbw) hinweise.push('kleiner_schaden')
  return { kind: 'schaetzung', betrag, pct: stufe.pct, hinweise }
}
