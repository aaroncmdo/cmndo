// P4b (Aufgaben-Hub-Konsolidierung): kanonische Alle-Tasks-Impl. War vorher ein
// Re-Export von /admin/tasks — diese Standalone-Route ist jetzt ein 308-Redirect
// hierher (next.config), ihre page.tsx wurde hierher gemoved. KanbanBoard bleibt
// unter admin/tasks/ (nur die page.tsx ist gewandert).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import { isExecutorEnabled } from '@/lib/task-executor/policy'
import KanbanBoard from '@/app/admin/tasks/KanbanBoard'

// AAR-154: Zusätzlich zu fall_id laden wir jetzt Leads + SVs für Task-
// Objekt-Verlinkung (entity_type='lead' / 'gutachter' / 'fall').
// Tasks ohne referenziertes Objekt (weder fall_id noch entity_id) werden
// clientseitig gefiltert — die sind typisch Alt-System-Einträge ohne Bezug.
// `auto_erstellt` wird im Board gebraucht: System-Aufgaben ohne Objekt-Bezug bleiben
// sichtbar, manuelle nicht (s. KanbanBoard, Filter `linked`).
// ⚠ Der Typ allein reicht nicht — fehlt ein Feld hier im select, ist es zur Laufzeit
// `undefined` und ein Filter darauf greift still ins Leere.
const TASK_FELDER =
  'id, fall_id, lead_id, typ, task_typ, titel, beschreibung, status, faellig_am, erledigt_am, zugewiesen_an, created_at, entity_type, entity_id, auto_erstellt, auto_resolved_am, auto_resolved_grund, claim_id'

// PostgREST deckelt JEDE Antwort bei 1000 Zeilen — ohne Fehler, ohne Hinweis. Vorher lud
// diese Seite ALLE Status in EINEM Aufruf, absteigend nach created_at. Gemessen 20.08.:
// 1815 Aufgaben in der DB, 1000 geladen — und weil 1245 davon `erledigt` sind, frass die
// Historie das Fenster. Sichtbar waren 339 von 569 OFFENEN Aufgaben; nach dem
// Objekt-Bezug-Filter zeigte das Board 291. Also waren 278 offene Aufgaben (49 %)
// unerreichbar — Arbeit, die niemand sieht.
//
// Getrennt laden statt hoeher deckeln: offene Aufgaben sind operativ, erledigte sind
// Historie. Ein Cap auf die Historie kostet nichts, ein Cap auf die offenen kostet Arbeit.
const NICHT_ERLEDIGT_CAP = 2000
const ERLEDIGT_CAP = 300

export default async function TasksPage() {
  const supabase = await createClient()

  const [
    { data: offeneTasks },
    { data: erledigteTasks },
    faelleRaw,
    { data: admins },
    { data: leads },
    { data: svs },
    { data: reassignProfiles },
  ] =
    await Promise.all([
      // Alles Nicht-Erledigte: vollstaendig. Der Cap ist eine Reissleine, keine Auswahl —
      // greift er, fehlen wieder Aufgaben, und das wird unten sichtbar gemeldet.
      supabase
        .from('tasks')
        .select(TASK_FELDER)
        .neq('status', 'erledigt')
        .order('created_at', { ascending: false })
        .limit(NICHT_ERLEDIGT_CAP),
      // Erledigte: bewusst nur ein Ausschnitt (Historie).
      supabase
        .from('tasks')
        .select(TASK_FELDER)
        .eq('status', 'erledigt')
        .order('created_at', { ascending: false })
        .limit(ERLEDIGT_CAP),
      // CMM-49: faelle-frei — fall_id->claim_nummer via Bridge+claims (shared helper).
      // Liefert das Array direkt (kein { data }); faelleNormalized unten formt es.
      claimNummernForFaelle(supabase),
      supabase.from('profiles').select('id, vorname, nachname').in('rolle', ['admin', 'kanzlei']),
      supabase.from('leads').select('id, vorname, nachname, telefon'),
      supabase
        .from('sachverstaendige')
        .select('id, profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)'),
      // AAR-723: Alle aktiven Mitarbeiter-Profile als Reassign-Kandidaten
      // (alle Rollen außer Kunde/Makler/SV — das sind Portal-User, Tasks
      // werden intern umverteilt).
      supabase
        .from('profiles')
        .select('id, vorname, nachname, rolle')
        .not('aktiv', 'is', false)
        .in('rolle', ['admin', 'kundenbetreuer', 'dispatch', 'kanzlei']),
    ])

  // ⭐ Aufgaben zu TESTFAELLEN ausblenden (Mig 20260831222740). Gemessen 01.09. nach der
  // Testdaten-Bereinigung: 111 der offenen Aufgaben haengen an Claims, die als Testdaten
  // markiert sind — Phantomarbeit, die echte Meldungen zudeckt.
  //
  // ⚠ Bewusst AUSBLENDEN statt schliessen: ein Massen-Statuswechsel verfaelscht die
  // Erledigungs-Statistik. Genau das hat die Aufraeumaktion vom 13.08. getan (1213
  // Aufgaben eines Typs an EINEM Tag) — seither sieht die Historie nach reger
  // Abarbeitung aus, obwohl an normalen Tagen 1-6 Aufgaben geschlossen werden, die
  // meisten davon automatisch. Ein Filter aendert keine Daten und ist umkehrbar.
  //
  // Zwei Schritte statt Embed-Join: ein `claims!inner(...)` wuerde alle Aufgaben OHNE
  // Claim-Bezug mit ausblenden — davon gibt es 330.
  // ⚠ createAdminClient, NICHT der RLS-Client oben. `claims` traegt SPALTENWEISE Grants, und
  // `ist_testfall` ist fuer `authenticated` bewusst NICHT gegrantet — Migration 20260901182708
  // haelt Aarons Entscheidung fest: auswertung_unverbindlich = kundensichtbar, ist_testfall /
  // source_channel / source_domain = intern.
  //
  // Ueber den RLS-Client gemessen (prod, echte authenticated-Session):
  //   claims?select=id&ist_testfall=eq.true  ->  HTTP 403, 42501 permission denied
  //
  // Und das bleibt STILL: `const { data } = ...` verwirft das error, `data` ist null, `?? []`
  // macht ein leeres Set daraus -> NULL Aufgaben ausgeblendet, der Hinweis-Kasten ist
  // `> 0`-gated und erscheint gar nicht. Die Seite haette exakt so ausgesehen wie vorher.
  // service_role umgeht Spalten-Grants; dieselbe Loesung nutzt der PR in
  // HaengendeFaelleWidget.tsx und cron/haenger-detektor/route.ts bereits.
  const { data: testClaims, error: testClaimsErr } = await createAdminClient()
    .from('claims')
    .select('id')
    .eq('ist_testfall', true)
  if (testClaimsErr) {
    console.error('[admin/aufgaben] Testdaten-Marker nicht lesbar:', testClaimsErr.message)
  }
  const testClaimIds = new Set((testClaims ?? []).map((c) => c.id as string))
  const istTestAufgabe = (t: { claim_id?: string | null }) =>
    !!t.claim_id && testClaimIds.has(t.claim_id)

  const offeneSichtbar = (offeneTasks ?? []).filter((t) => !istTestAufgabe(t))
  const erledigteSichtbar = (erledigteTasks ?? []).filter((t) => !istTestAufgabe(t))
  // Kein stilles Filtern: wie viele Zeilen die Testdaten-Regel entfernt hat, wird gezeigt.
  const testAufgabenAusgeblendet =
    (offeneTasks?.length ?? 0) - offeneSichtbar.length

  // Beide Teilmengen wieder zu EINER Liste — das Board gruppiert selbst nach Status.
  const tasks = [...offeneSichtbar, ...erledigteSichtbar]
  // Reissleine gerissen? Dann fehlen offene Aufgaben, und das darf nicht still passieren.
  // Am ROHwert gemessen — der Cap greift beim Laden, nicht nach dem Testdaten-Filter.
  const offeneAbgeschnitten = (offeneTasks?.length ?? 0) >= NICHT_ERLEDIGT_CAP

  // CMM-49: faelleNormalized aus dem Bridge+claims-Resultat (id == fall_id).
  const faelleNormalized = faelleRaw.map((r) => ({ id: r.fall_id, claim_nummer: r.claim_nummer }))
  const fallMap = Object.fromEntries(
    faelleNormalized.map((f) => [f.id, f.claim_nummer ?? f.id.slice(0, 8)]),
  )
  const adminMap = Object.fromEntries(
    (admins ?? []).map((a) => [
      a.id,
      `${a.vorname ?? ''} ${a.nachname ?? ''}`.trim() || a.id.slice(0, 8),
    ]),
  )
  const leadMap = Object.fromEntries(
    (leads ?? []).map((l) => [
      l.id,
      `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || l.telefon || l.id.slice(0, 8),
    ]),
  )
  const svMap = Object.fromEntries(
    (svs ?? []).map((sv) => {
      const pRel = sv.profiles as unknown
      const p = (Array.isArray(pRel) ? pRel[0] : pRel) as
        | { vorname: string | null; nachname: string | null }
        | null
      return [
        sv.id,
        `${p?.vorname ?? ''} ${p?.nachname ?? ''}`.trim() || sv.id.slice(0, 8),
      ]
    }),
  )

  const reassignCandidates = (reassignProfiles ?? []).map(p => ({
    id: p.id as string,
    name: [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Unbekannt',
    rolle: p.rolle as string,
  }))

  const executorEnabled = isExecutorEnabled()

  return (
    <>
      {offeneAbgeschnitten && (
        // Sichtbar statt still: greift der Cap, fehlen offene Aufgaben im Board.
        <div className="mb-4 rounded-ios-lg border border-warning bg-warning-soft px-4 py-3 text-body-sm text-warning-strong">
          Es sind mehr als {NICHT_ERLEDIGT_CAP} offene Aufgaben vorhanden — das Board zeigt
          nicht alle. Bitte Aufgaben abarbeiten oder die Ansicht filtern.
        </div>
      )}
      {testAufgabenAusgeblendet > 0 && (
        // Kein stilles Filtern: die Zahl gehört sichtbar, sonst wirkt die Liste
        // kürzer, als sie ist, und niemand kann die Regel überprüfen.
        <div className="mb-4 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-4 py-3 text-body-sm text-claimondo-ondo">
          {testAufgabenAusgeblendet}{' '}
          {testAufgabenAusgeblendet === 1 ? 'Aufgabe gehört' : 'Aufgaben gehören'} zu
          Testfällen und {testAufgabenAusgeblendet === 1 ? 'wird' : 'werden'} hier nicht
          angezeigt.
        </div>
      )}
      <KanbanBoard
        tasks={tasks}
        faelle={faelleNormalized}
        fallMap={fallMap}
        adminMap={adminMap}
        leadMap={leadMap}
        svMap={svMap}
        admins={admins ?? []}
        reassignCandidates={reassignCandidates}
        executorEnabled={executorEnabled}
        historieGekuerzt={(erledigteTasks?.length ?? 0) >= ERLEDIGT_CAP}
      />
    </>
  )
}
