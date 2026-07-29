# Zugriffs-Doktrin — Lese-/Schreib-/RLS-Schichten (Fundament C5)

> Fundament Phase C, Paket **C5** (FUNDAMENT §5, Verfassung §7 „Server-first-Zugriff"). Die **verbindlichen
> Regeln**, wie Code auf Daten zugreift — plus der Ist-Befund + die Abweichler-Achsen. Erhebung gegen
> `origin/main` (file:line), Stand 29.07.
>
> **Status:** Doktrin (dieser Text) = ungate-t + jetzt. **Follow-on-Tranchen** (Code, später): AGENTS.md-Verweis-
> absatz + „neue Tabelle"-Checkliste im PR-Prozess verankern + etwaige Server-Achsen-Abweichler migrieren.

## 1 · Ist-Befund — Server-first ist auf der Client-Achse bereits Realität

**Kern-Fund (verifiziert):** **Kein Browser-Client-File macht direkten `.from('<basetable>')`-Datenzugriff.**
`git grep --all-match` über die ~25 Consumer von `@/lib/supabase/client` gegen `.from('`/`.from("` = **0 Treffer**.
Der Browser-Client (`src/lib/supabase/client.ts`, `createBrowserClient` aus `@supabase/ssr`) wird **ausschließlich**
für **Realtime** (`.channel()`/`postgres_changes`) + **Auth** genutzt. **Alle Daten-Reads/Writes laufen server-seitig**
(Server-Components, Server-Actions, Views/RPCs). Die „Client liest nur über Views/RPCs"-Regel ist damit auf dieser
Achse **schon gelebt** — C5 macht sie zur expliziten Doktrin und hält sie per Ratchet zu.

**Die anderen Achsen sind bereits per Ratchet erzwungen** (AGENTS.md): RLS-`TO <rolle>` (`check:rls-policies`),
anon-Grants (`check:anon-sensitive-grants`), anon-/auth-Reachability (`check:anon-reachability`/`check:auth-write-reachability`),
Default-Privileges default-closed (#4555), Status-Writes nur über die Engine (`check:operative-status-writes`).
**Die Doktrin ist die Prosa; die Ratchets sind die Durchsetzung.**

## 2 · Die Doktrin (verbindlich für neuen Code)

**R1 — Client liest nur über definierte Views/RPCs, nie direkt Basistabellen.**
Ein `'use client'`-Component holt Daten über Server-Components (Props/RSC) oder über eine **View/RPC je Rolle**
(`v_claim_base`/`v_claim_full`-Muster) — **nie** `browserClient.from('<basetable>').select()`. (Ist bereits 0 Verstöße.)

**R2 — Writes nur über Server-Actions mit Guard + Row-Rückprüfung.**
Jeder Write läuft über eine `'use server'`-Action mit (a) Rollen-Guard (`requireRole`/`requireAdmin`), (b) dem
Result-Object-Pattern (`{ ok }`, kein throw), (c) bei RLS-Writes **`.select()`-Row-Rückprüfung** — ein RLS-verworfener
Write liefert 0 Rows **ohne Error** (die #4625-Lehre: DSGVO-Storno schlug still fehl, weil die fehlende RLS-UPDATE-Policy
0 Rows lieferte + niemand die Row-Anzahl prüfte). **Nie** Browser-Client-Writes auf Basistabellen.

**R3 — RLS ist das Netz, nicht die Feinsteuerung.**
RLS gibt Zeilen frei / hält sie zu — sie ist **kein** Ersatz für eine definierte Lese-Schicht. Jede PERMISSIVE
Policy hat **explizit `TO <rolle>`** (nie `TO public`, nie weglassen — Postgres-Default `TO public` verwässert den
Advisor + öffnet für `authenticator`/`dashboard_user`; B2a-Lehre). Neue Tabellen sind per **Default-Privileg
default-closed** (anon/authenticated bekommen ohne expliziten Grant nichts — #4555-Wurzel).

**R4 — Realtime ist die dokumentierte Browser-Client-Ausnahme.**
Der Browser-Client darf `.channel()`/`postgres_changes` auf RLS-Tabellen abonnieren (Realtime **kann** nicht
server-seitig laufen). ⚠ Er **MUSS** vor `.subscribe()` **`whenRealtimeAuthReady()` awaiten** (aus
`@/lib/supabase/client`) — sonst joint der Channel als `anon`, bevor `realtime.setAuth(token)` durch ist, und walrus
wirft `permission denied for table <t>` beim ersten WAL-Poll (häufigster Prod-Error 15.–17.07.). **Realtime-Themen
nie unilateral „fixen"** ([[coordination-realtime-claims-permission-denied-regression]]: die column-cap-vs-`SELECT *`-Kollision).

**R5 — Die Lese-Schicht sind Views/RPCs, konsolidiert auf das `v_claim_base`-Muster.**
Server-seitige Reads gegen die Fall-/Claim-Domäne gehen über `v_claim_full`/`v_claim_base` (+ die role-gescopten
Views), nicht über ad-hoc `claims`-Selects mit RLS-Feinsteuerung. Neue Lese-Anforderungen erweitern die View, nicht
den Basistabellen-Zugriff.

## 3 · Checkliste „neue Tabelle"

1. **Grants default-closed** — nach `CREATE TABLE` **nichts** an anon/authenticated granten, bis bewusst nötig.
2. **Spalten-Grants statt Table-Grants** für sensible Tabellen (nur benigne Spalten an anon; `iban`/`token`/PII nie).
3. **RLS aktiv + jede Policy `TO <rolle>`** (nie `TO public` außer `AS RESTRICTIVE`).
4. **Client-Reads → View/RPC**, nicht Basistabelle. **Writes → Server-Action** mit Guard + `.select()`-Row-Check.
5. **PII-Spalten** (Kontakt/Kennzeichen/Finanz) → kein anon-Grant + keine anon-reachable Policy (uid/`is_*()`-gated).
6. **Migration nur via Supabase-MCP** (`apply_migration`, Regel 2) + Types regenerieren + committen.

## 4 · Durchsetzung (die Ratchets, die die Doktrin halten)

| Regel | Ratchet (CI) |
|---|---|
| R2 Write-Guard/Scoping | `check:auth-write-reachability` (Baseline 2) |
| R3 `TO <rolle>` | `check:rls-policies` |
| R3 anon-Grants | `check:anon-sensitive-grants` (0) + `check:anon-reachability` (0) |
| R3 Default-Privileges | Wurzel #4555 (default-closed) |
| (Status) Writes nur über Engine | `check:operative-status-writes` → C1 |

**Follow-on (Code-Tranche):** ein kurzer Verweis-Absatz in AGENTS.md („Zugriffs-Doktrin: siehe `docs/fundament/zugriffs-doktrin.md`") + die „neue Tabelle"-Checkliste ins Review/PR-Template — bewusst separat (AGENTS.md nicht aufblähen, Kollisionsgefahr).

## 5 · Abweichler-Status

- **Client-Direkt-Selects auf Basistabellen: 0** (verifiziert) → **keine Migration auf dieser Achse** (die
  DoD-„Top-3-Abweichler migrieren" ist hier gegenstandslos; server-first ist gelebt).
- **Browser-Client-Nutzung: Realtime + Auth** (~25 Files, alle legit; R4-Gate `whenRealtimeAuthReady` ist verdrahtet).
- **Server-Achse — erhoben (29.07.):** `from('claims')` = **371 Vorkommen / 209 Files** vs. `v_claim_full` = **138**
  (`v_claim_base` = 0 direkte Consumer; es liegt unter `v_claim_full`). Der große Base-Table-Footprint ist ein **Mix**:
  - **30 API/Cron/Webhook** (service-role-intern) — meist **legit** (lesen spezifische Spalten; service-role bypasst RLS ohnehin, die View bringt dort wenig).
  - **46 Server-Actions** (`actions.ts`/`_actions/`) — **Read+Write-Mix**; Writes sind **Base-Table-Pflicht** (man schreibt nicht durch eine View), nur der Read-Teil ist Kandidat.
  - **17 rollen-gescopte Read-Surfaces** (`page`/`View`/`Widget`.tsx) = **die echten Abweichler** → auf `v_claim_full`/Rollen-View konsolidieren. Das Muster ist etabliert (138 Consumer), diese 17 sind nur noch nicht migriert:
    `admin/{page,faelle/(hub)/page,nachrichten/page}.tsx` · `admin/_components/{KritischeUpdates,WichtigeUpdates,LeadPreiseVerteilung}Widget.tsx` · `admin/finance/(hub)/_views/{OffeneFaelle,Uebersicht}View.tsx` · `faelle/{page,[id]/page}.tsx` · `gutachter/{abrechnung,fall/[id],posteingang,profil}/page.tsx` · `kunde/{faelle/[id]/kalender,onboarding}/page.tsx` (`admin/smoke/lifecycle/page.tsx` = Test-Surface, kein echter Abweichler).

  **Tranchen-Status:** eigene **C5-Code-Tranche** (Read-Surface-Migration auf `v_claim_full`), **NICHT** diese Prep-Tranche.
  Pro File verifizieren, ob `v_claim_full` die gelesenen Spalten trägt (sonst View **additiv** erweitern, Regel 2). Writes +
  service-role-interne Reads bleiben Base-Table (legit). ⚠ `KritischeUpdatesWidget`/`OffeneFaelleView` etc. tragen bereits
  `CMM-49/CMM-74`-SSoT-Cutover-Kommentare (repointet auf `claims.operative_status`) — die Migration ist die Fortsetzung
  dieses Cutovers auf die View-Schicht, kein Neubau.

## 6 · Incident-Anker (warum die Doktrin)

Die RLS-Incident-Familie ist **eine Klasse — Feinsteuerung in RLS statt definierter Zugriffsschicht:** #4625 (DSGVO-Storno
stiller Fehlschlag, fehlende RLS-UPDATE → 0 Rows ohne Error → R2 `.select()`-Row-Check), #4555 (Default-Privileges-Wurzel
→ R3 default-closed), #4789 (Claim-View-RLS-Underexposure → R5 View-Schicht + [[coordination-an-a6c863e2-4789-claim-view-rls-underexposure]]),
Realtime `permission denied` (→ R4 `whenRealtimeAuthReady`), Kanzlei-Cross-Tenant-Read ([[audit-kanzlei-cross-tenant-scoping-2026-07-19]] → R3/R5).
