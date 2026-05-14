# Pre-Tracking Migrations-Archiv

Dieser Ordner enthält **142 echte DDL-SQL-Files** aus dem Zeitraum **2026-04-11 bis 2026-05-10**, bevor das lokale `supabase migration`-Tracking konsequent genutzt wurde.

## Hintergrund

Im April/Anfang Mai 2026 wurden Schema-Änderungen für die AAR-Tickets 69, 84, 85, 92, 94, 95, 96, 97, 100, 102, 104, 114, 129, 135, 161, 168, 176, 181, 182, 183, 208, 218, 220, 227 … bis 576 ausschließlich via Supabase-Management-API auf die Prod-DB angewendet. Die zugehörigen SQL-Files lebten nur in einer parallelen Session-Schattenkopie (`.claude/worktrees/parallel-wondering-hoare/`) und sind nie ins Repo committet worden.

Nach AAR-600 (Drift-Bereinigung) wurde die Konvention eingeführt, dass jede DB-Änderung über `npx supabase migration new …` + `supabase db push` läuft. Für die bereits live applizierten 142 Migrations wurden im Repo `*_placeholder.sql`-Stubs angelegt — siehe `supabase/migrations/20260411231056_placeholder.sql` und Geschwister. Diese Placeholders enthalten nur einen Kommentar:

> *"Migration … wurde vor Einführung des lokalen Migration-Trackings direkt auf die DB angewendet. Inhalt ist in der DB — diese Datei dient nur als lokaler Marker damit supabase CLI nicht abbricht."*

## Was dieses Archiv ist

- **Recovery-Quelle** für `supabase db reset` und ähnliche reproducibility-Operationen. Ohne diese Files erzeugt ein Reset eine leere DB, weil die Placeholders kein DDL enthalten.
- **DDL-Historie** für Code-Archäologie — wenn jemand nachschlagen will, wie z. B. `sla_tracking` ursprünglich angelegt wurde.

## Was dieses Archiv NICHT ist

- **Keine Quelle für neue Migrations.** Jede neue Schema-Änderung läuft über das normale CLI-Flow gemäß `AGENTS.md` Regel 2.
- **Kein Backup-Pfad für lokale Re-Application.** Die Files sind teils inkonsistent miteinander (Spaltennamen wurden zwischenzeitlich umbenannt, z. B. `sv_treffpunkt` → `besichtigungsort_*` in AAR-599), reine sequenzielle Ausführung würde scheitern. Wer wirklich resetten muss: erst Drift-Analyse, dann konsolidieren.

## Pfad-Konvention

Bewusst **außerhalb** von `supabase/migrations/` (nämlich unter `supabase/_archive/`), damit `supabase db push` / `supabase db reset` die Files **nicht** scannt. Der Underscore-Prefix `_archive` macht den nicht-produktiven Charakter zusätzlich klar.

## Vollständige Datei-Liste

142 SQL-Files mit Timestamps zwischen `20260411231056` und `20260510155624` — siehe einfach `ls` des Ordners. Jede Datei entspricht 1:1 dem gleichnamigen Timestamp in `supabase/migrations/<ts>_placeholder.sql`.
