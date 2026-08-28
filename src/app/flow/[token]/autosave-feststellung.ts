import { enqueueOp } from '@/lib/offline/enqueue'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'

/**
 * Hintergrund-Autosave der Feststellungs-Felder — nicht blockierend, aber auch nicht still.
 *
 * ANLASS (Aaron 28.08.2026): *„Ich habe die Felder im Flowlink veraendert und die wurden nicht
 * uebernommen."* An drei Stellen stand:
 *
 * ```ts
 * void speichereFeststellungFlow(token, values).catch(() => {})
 * ```
 *
 * ⭐⭐ Das `.catch()` faengt dort **nichts**: `speichereFeststellungFlow` liefert
 * `Promise<{ ok: boolean; error?: string }>` und **wirft nie**. Der Fehlschlag steht im
 * Rueckgabewert, der verworfen wird. Dieselbe Klasse wie „ein try/catch um einen
 * Supabase-Call ist reine Dekoration" (AGENTS.md §Stille-Writes) — nur eine Ebene hoeher:
 * **ein `.catch()` um eine Result-Object-Funktion ist ebenso Dekoration.**
 *
 * Fuer den Nutzer sah es aus, als sei der Wert uebernommen: Er steht sofort im lokalen
 * React-State. Ob er ankam, sagte niemand.
 *
 * ⭐ Die Loesung nutzt, was fuer offline schon da war: **die Outbox**. Bisher fuehrte nur der
 * Offline-Zweig dorthin; der Online-Zweig feuerte und vergass. Jetzt gehen BEIDE Wege ueber
 * dieselbe Warteschlange, sobald der direkte Save nicht gelingt — ein fehlgeschlagener Save
 * ist damit ein wiederholbarer Auftrag statt eines verlorenen Klicks.
 *
 * Bewusst weiterhin **nicht blockierend**: der Kunde soll weiterklicken koennen. Der letzte
 * Schritt (`handleWeiter` am Ende) prueft dagegen synchron und zeigt einen Fehler — dort ist
 * Warten richtig, weil danach abgeschickt wird.
 */
export function autosaveFeststellung(token: string, values: Record<string, unknown>): void {
  const inDieOutbox = () => {
    // Letzte Rettung: schlaegt sogar das Einreihen fehl (Speicher voll, IndexedDB blockiert),
    // ist der Wert wirklich verloren — dann wenigstens sichtbar im Log statt spurlos.
    void enqueueOp({
      kind: 'flow_feststellung',
      replay_class: 'B',
      payload: { token, values },
    }).catch((err) => {
      console.error('[autosave-feststellung] Outbox-Enqueue fehlgeschlagen:', err)
    })
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    inDieOutbox()
    return
  }

  void speichereFeststellungFlow(token, values)
    .then((res) => {
      // ⭐ Der Punkt der ganzen Uebung: den Rueckgabewert LESEN.
      if (!res.ok) {
        console.warn('[autosave-feststellung] Save abgelehnt, gehe in die Outbox:', res.error)
        inDieOutbox()
      }
    })
    .catch((err) => {
      // Netzabbruch mitten im Request — die Action selbst wirft nicht, der fetch schon.
      console.warn('[autosave-feststellung] Save-Aufruf fehlgeschlagen, gehe in die Outbox:', err)
      inDieOutbox()
    })
}
