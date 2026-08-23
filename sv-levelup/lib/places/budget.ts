import type { PlacesAdapter } from './adapter'

/**
 * Die harte Kostenbremse vor Google Places.
 *
 * ⚠ WARUM ES DIESE DATEI GIBT — 21.08.2026, 2.798 EUR an einem Tag.
 *
 * Ein Deutschland-Lauf der Lead-Discovery multiplizierte sich in vier Stufen,
 * von denen jede einzelne harmlos aussah:
 *
 *   1.876 Kacheln  ×2 Begriffe  ×bis 16 (Verfeinerung Tiefe 2)
 *                  ×bis 3 Seiten (Paging)  ×3 (Wiederholung bei Netzfehlern)
 *
 * Aus „1.876 Abrufe" wurden rund 87.000. Am Ende standen 10.019 Datensaetze in
 * der Datenbank — ein nutzbarer Datensatz je NEUN bezahlter Abrufe.
 *
 * ⭐ Der teuerste Anteil lieferte GAR KEINE Daten: die Wiederholung. Die eigene
 * Messung im Lauf ergab 1.119 Netzfehler auf 1.392 Versuche — 80 %. Jeder davon
 * wurde dreimal gefeuert. Google berechnet den Abruf, sobald er ankommt; ob die
 * Antwort bei uns eintrifft, ist Googles Rechnung gleichgueltig.
 *
 * ⭐⭐ Die eigentliche Lehre: Der Code WUSSTE um die Kosten. In `legacy.ts` steht
 * seit jeher der Kommentar „die Preisstufe richtet sich nach dem, was man
 * anfragt", und `discovery.ts` warnt „KOSTEN FALLEN AUCH IM TROCKENLAUF AN".
 * Beides war richtig und beides half nichts, weil niemand eine ZAHL vor Augen
 * hatte, bevor der Lauf startete. Eine Warnung ohne Betrag ist eine Warnung,
 * die man wegliest.
 *
 * Deshalb zaehlt diese Bremse JEDEN HTTP-Abruf — auch jeden Wiederholversuch,
 * auch jeden fehlgeschlagenen. Sie zaehlt, was Google zaehlt, nicht was
 * ankommt.
 */

/**
 * Der Vorgabewert liegt bewusst UNTER Googles monatlichem Gratis-Kontingent
 * (5.000 Abrufe je SKU). Ein Lauf im Vorgabewert kann damit nichts kosten.
 *
 * Wer mehr braucht, setzt es bewusst — und bekommt vorher den Betrag zu sehen.
 */
export const VORGABE_BUDGET = 1_000

/** Was ein Abruf kostet, in US-Dollar je 1.000 (Legacy-Preisliste, Stand 08/2026). */
export const PREIS_JE_1000 = {
  nearby: 32,
  details: 17,
} as const

/** Googles monatliches Gratis-Kontingent je SKU. */
export const GRATIS_JE_MONAT = 5_000

export class BudgetErschoepft extends Error {
  constructor(public budget: number) {
    super(
      `Abruf-Budget erschoepft: ${budget} Abrufe verbraucht. Lauf abgebrochen.\n` +
        `  Das ist die Bremse, nicht ein Fehler — sie verhindert eine Rechnung, ` +
        `die niemand entschieden hat.\n` +
        `  Mehr zulassen: --budget <n> (der Lauf zeigt vorher, was es kostet).`,
    )
    this.name = 'BudgetErschoepft'
  }
}

export type Zaehler = {
  /** Meldet einen Abruf an. Wirft, wenn das Budget erschoepft ist. */
  melde(): void
  verbraucht(): number
  uebrig(): number
}

export function erzeugeZaehler(budget: number = VORGABE_BUDGET): Zaehler {
  let n = 0
  return {
    melde() {
      // ⚠ ZUERST erhoehen, DANN pruefen. Andersherum liesse der Aufruf, der das
      // Budget sprengt, noch durch — und genau der ist der teure.
      n++
      if (n > budget) throw new BudgetErschoepft(budget)
    },
    verbraucht: () => n,
    uebrig: () => Math.max(0, budget - n),
  }
}

/**
 * Schaetzt die Kosten eines Laufs in Euro.
 *
 * ⚠ Eine Schaetzung, keine Rechnung: Google staffelt nach SKU und rechnet das
 * Gratis-Kontingent monatsweise gegen. Der Wert taugt, um eine Groessenordnung
 * VOR dem Start zu sehen — genau das fehlte am 21.08.
 */
export function schaetzeKosten(
  abrufe: number,
  art: keyof typeof PREIS_JE_1000 = 'nearby',
  schonVerbraucht = 0,
): { dollar: number; euro: number; gratis: number; berechnet: number } {
  const gratisUebrig = Math.max(0, GRATIS_JE_MONAT - schonVerbraucht)
  const gratis = Math.min(abrufe, gratisUebrig)
  const berechnet = abrufe - gratis
  const dollar = (berechnet * PREIS_JE_1000[art]) / 1000
  return { dollar, euro: dollar * 0.92, gratis, berechnet }
}

/**
 * Legt die Bremse um einen Adapter.
 *
 * Jede der fuenf Methoden zaehlt EINEN Abruf. Das ist bewusst die Untergrenze:
 * `suchText`/`suchUmkreis` koennen intern bis zu drei Seiten holen. Der Zaehler
 * im Adapter selbst (siehe `legacy.ts`) zaehlt die echten HTTP-Abrufe; dieser
 * hier ist die zweite Schranke auf Methodenebene, damit auch ein kuenftiger
 * Adapter ohne eigenen Zaehler nicht unbegrenzt feuern kann.
 */
export function mitBudget(adapter: PlacesAdapter, zaehler: Zaehler): PlacesAdapter {
  return {
    async suchText(frage, umkreis) {
      zaehler.melde()
      return adapter.suchText(frage, umkreis)
    },
    async suchUmkreis(stichwort, umkreis) {
      zaehler.melde()
      return adapter.suchUmkreis(stichwort, umkreis)
    },
    async details(placeId) {
      zaehler.melde()
      return adapter.details(placeId)
    },
    async profil(placeId) {
      zaehler.melde()
      return adapter.profil(placeId)
    },
    async websiteVon(placeId) {
      zaehler.melde()
      return adapter.websiteVon(placeId)
    },
  }
}
