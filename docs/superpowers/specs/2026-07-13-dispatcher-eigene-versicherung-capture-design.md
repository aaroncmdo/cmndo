# Dispatcher-Capture: `eigene_versicherung` + Q1 kasko-aware (abrechnungsweg Teil 2a)

- **Datum:** 2026-07-13
- **Status:** Design approved (Brainstorming), pre-plan. **Ausführung in FRISCHER Session** (Aaron-Wahl — diese Design-Session war sehr lang).
- **Branch:** `kitta/abrechnungsweg-lead-capture` (off `staging`), Worktree `.claude/worktrees/abrechnungsweg-lead-capture`.
- **Lane:** 3c0b2713 (convert/capture). Teil des 6f60c510-Programms „abrechnungsweg pure-derived".

---

## 1 · Kontext & Problem

6f60c510 macht `abrechnungsweg` **pure-derived**: `abrechnungsweg = COALESCE(claims.abrechnungsweg /*override*/, derive_abrechnungsweg(service_typ, schuldfrage, eigene_versicherung, schadenart))`. `derive_abrechnungsweg` liest die Determinanten `schuldfrage` + `eigene_versicherung` **von `leads`** (via Lead-Join in den Views).

**Die Lücke (15 Claims):** `schuldfrage` + `eigene_versicherung` werden in der **Dispatcher-Qualifizierung nie zuverlässig erfasst**. Konkret:
- `leads.schuldfrage` (∈ `{gegner, eigenverantwortung, unklar}`) ist **bereits** ein Feld in der Dispatcher-v2-Form (`dispatch/leads/[id]`) + im Kunden-Self-Service (`QualiOptionen.tsx`). Wird aber nicht immer gefüllt.
- `leads.eigene_versicherung` (∈ `{ja, nein}`) ist **gar nicht erfassbar** — kommt in `dispatch/leads/**` nirgends vor (verifiziert). Das ist die eigentliche Neuerung.

`eigene_versicherung` entscheidet bei `schuldfrage='eigenverantwortung'`: `+ja → kasko` (gültiger Anspruch!), `+nein → selbstzahler`. Ohne die Erfassung kann `derive` diese Fälle nicht auflösen.

**Koordination (6f60c510, 13.07. bestätigt):**
- **Teil 1** (Convert-`resolveAbrechnungsweg`-Write entfernen) = **6f60c510s Lane**, NICHT hier. Sie sequenzieren es nach ihrer Layer-B-Reader-Migration + Column-Drop. (Der Write ist bis dahin harmlos.) → **hier nicht anfassen.**
- **Teil 2b** (claims-DDL `schuldfrage`/`eigene_versicherung`) = **deferred, lead-only**. Ihre Views leiten aus `leads.*` ab. → **kein DDL hier.**
- **Interface bestätigt:** `leads.schuldfrage ∈ {gegner, eigenverantwortung, unklar}`, `leads.eigene_versicherung ∈ {ja, nein}`.
- **Teil 2a (dieser Spec)** = grünes Licht, lead-seitig, unabhängig von ihrer claims-Read-Layer-B.

## 2 · Ziel

Der Dispatcher kann in der Lead-Qualifizierung `eigene_versicherung` (ja/nein) erfassen — konditional wenn `schuldfrage='eigenverantwortung'` —, geschrieben auf `leads.eigene_versicherung`. Die veraltete „Eigenverschulden = kein Anspruch"-Warnung wird `eigene_versicherung`-aware. Und die Qualifizierungs-Engine (Q1) zählt **eigenverantwortung + eigene_versicherung=ja (Kasko)** als qualifiziert.

## 3 · Entscheidungen (aus dem Brainstorming)

1. **Feld `eigene_versicherung`** = ja/nein-Control im Dispatcher-Lead-Form, **konditional** sichtbar nur bei `schuldfrage='eigenverantwortung'`. Persist → `leads.eigene_versicherung`.
2. **Warnung nuancieren** (`DispatchGatesPanel`): `eigenverantwortung` → nicht mehr blanko „kein Anspruch", sondern `eigene_versicherung`-aware (unset → „eigene Versicherung? Kasko/Selbstzahler prüfen"; ja → „Kasko-Anspruch"; nein → „Selbstzahler").
3. **Q1 kasko-aware** (Aaron-Wahl): `computeQualificationStatus` Q1 zählt `eigenverantwortung + eigene_versicherung='ja'` als erfüllt (Kasko-Claims flowlink-fähig). Engine-Tests aktualisieren.
4. **Kein DDL** (`leads.eigene_versicherung` existiert schon), **kein** Touch an convert-lead-to-claim.ts / v_claim_* / derive_abrechnungsweg (6f60c510s Lane).

## 4 · Nicht-Ziele

- Teil 1 (Convert-Write-Removal) + Teil 2b (claims-DDL) — 6f60c510.
- Self-Service-Flow (`QualiOptionen`/`flow/[token]`) — erfasst `schuldfrage` schon; `eigene_versicherung` dort ist ein möglicher Follow-up, NICHT hier (Dispatcher-Fokus).
- Kein View-/derive-/convert-Touch.

## 5 · Design

### 5.1 Betroffene Files (fresh session: gegen aktuellen Code RE-VERIFY)
- `src/app/dispatch/leads/[id]/page.tsx` — die v2-Lead-Form (hält `schuldfrage` als Live-Form-Wert; hier das neue `eigene_versicherung`-Control konditional einhängen).
- Der **Persist-Pfad** der Form — die `_actions/`-Server-Action, die die Quali-/Stammdaten-Felder auf `leads` schreibt (Kandidat: `src/app/dispatch/leads/[id]/_actions/stammdaten.ts` oder der Form-Save; verifizieren wo `schuldfrage` persistiert wird, `eigene_versicherung` **daneben** ergänzen).
- `src/app/dispatch/leads/[id]/DispatchGatesPanel.tsx` — Warnung nuancieren (`toLeadLike` + `warnings`).
- `src/app/dispatch/leads/[id]/_lib/qualification-engine.ts` — `LeadLike` um `eigene_versicherung?: 'ja'|'nein'|string|null` erweitern; Q1 kasko-aware; `+ qualification-engine.test.ts` Cases.
- Ggf. `src/app/dispatch/leads/[id]/_components/LeadQualProgress.tsx` (nur wenn es Q1-Label/Anzeige betrifft).

### 5.2 Feld-Verhalten
- Control: segmented ja/nein (Form nutzt `'true'/'false'`-Strings bzw. hier `'ja'/'nein'` — an das **bestehende Form-Value-Muster** anpassen; DB-Wert muss `'ja'|'nein'` sein, s. §3 Interface).
- Sichtbarkeit: nur wenn `schuldfrage === 'eigenverantwortung'`. Bei Wechsel weg von eigenverantwortung: Feld ausblenden (Wert-Reset optional — mit Persist-Semantik abstimmen; sauber = auf null/leer setzen, damit derive nicht auf stale eigene_versicherung greift).
- Persist: mit dem restlichen Form-Save auf `leads.eigene_versicherung`.

### 5.3 Q1 kasko-aware (qualification-engine)
Heute:
```ts
const q1_schuldfrage =
  !!lead.unfallhergang && !!lead.schuldfrage &&
  lead.schuldfrage !== 'eigenverantwortung' &&
  (lead.schuldfrage !== 'unklar' || lead.aufklaerung_teilschuld_bestaetigt === true)
```
Neu (kasko-aware): eigenverantwortung ist qualifiziert **wenn** `eigene_versicherung === 'ja'` (Kasko). D.h.:
```ts
const q1_schuldfrage =
  !!lead.unfallhergang && !!lead.schuldfrage &&
  (lead.schuldfrage === 'gegner' ||
   (lead.schuldfrage === 'unklar' && lead.aufklaerung_teilschuld_bestaetigt === true) ||
   (lead.schuldfrage === 'eigenverantwortung' && lead.eigene_versicherung === 'ja'))
```
(eigenverantwortung + nein/unset = Selbstzahler/offen → Q1 nicht erfüllt, wie bisher „nicht flowlink-fähig ohne Kasko". Mit 6f60c510 abstimmen ob Selbstzahler einen eigenen Track hat — für Q1 hier: nur Kasko qualifiziert den eigenverantwortung-Zweig.)

### 5.4 Warnung nuancieren (DispatchGatesPanel)
`toLeadLike` um `eigene_versicherung: str(values.eigene_versicherung)` erweitern. Die `warnings`-Logik für `schuldfrage==='eigenverantwortung'`:
- `eigene_versicherung` unset → „Eigenverschulden — eigene Versicherung (Kasko) klären: Kasko-Anspruch oder Selbstzahler?"
- `='ja'` → (Info/kein Warn) „Kasko-Anspruch über eigene Versicherung."
- `='nein'` → „Selbstzahler — kein Haftpflicht-/Kasko-Anspruch."

## 6 · Testing
- `qualification-engine.test.ts`: neue Q1-Cases (eigenverantwortung+ja=qualifiziert, +nein/unset=nicht, gegner/unklar unverändert).
- Form-Persist: eigene_versicherung landet auf `leads` (falls Action-Test existiert).
- Build + 4 Ratchets grün.
- **Prod-Playwright-Smoke (Mandat):** Dispatcher-Lead öffnen, schuldfrage=eigenverantwortung → eigene_versicherung-Control erscheint → ja/nein setzen → speichern → Wert auf leads (DB) + Q1/Warnung korrekt. `tests/e2e/flows/`-Spec mit `// Run:`-Header; post-merge-CI gegen app.claimondo.de.

## 7 · Rollout
- Branch `kitta/abrechnungsweg-lead-capture` → PR gegen **staging** → Merge-Session zieht auf prod. Kein DDL.
- **Koordination:** wenn gemergt, 6f60c510 informieren (die Determinanten fließen jetzt → ihr derive greift). Ihr Teil 1 (Convert-Write-Removal) bleibt ihre Sequenz.

## 8 · Offene Punkte (fresh session verifiziert)
- Exakter Form-Persist-Pfad für `schuldfrage` (welche `_actions/`-Action / Form-Save) → `eigene_versicherung` daneben.
- `leads.eigene_versicherung` Spalten-Typ/CHECK (Interface sagt `{ja,nein}` — via DB/types bestätigen; Control-Werte müssen passen).
- Form-Value-Konvention (`'true'/'false'` vs. `'ja'/'nein'`) — an bestehende Form + DB-Constraint anpassen.
