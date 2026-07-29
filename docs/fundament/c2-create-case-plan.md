# C2-Prep — `createCase`: Ist-Erhebung + C2a-Tranchenplan

> Fundament **C2** (`docs/fundament/FUNDAMENT.md` §5): *Ein Intake — jede Fallanlage durch ein Modul mit garantierten,
> idempotenten Nachwirkungen.* Dieses Doc ist die **Prep** (Ist-Erhebung + Implementierungsplan), analog zum C1-Prep
> (`c1-transition-claim-plan.md`, #4845). **Ungated** (gründet auf A4 = done, `entry-points.md`); der **C2-Code** ist
> per §2-Deps auf **B1** (Journey-Smokes) gegated. Docs-only → Regel-4-exempt. **Braucht Aaron-Review (§8)** bevor C2a-Code startet.
>
> Grundlage: das A4-Entry-Point-Register (`docs/fundament/entry-points.md`, 15 Meldewege, file:line-belegt, 28.07.).

## 1 · Ist-Erhebung — die Nachwirkungen sind verteilt, nichts garantiert sie zusammen

Die **6 Pflicht-Nachwirkungen** (Fall · Pflichtdok-Slots · FlowLink · Erstnotif · Dedup · Reservierung) liegen auf
mehreren Bausteinen, **keiner** garantiert alle:

| Baustein | file | leistet | Lücke |
|---|---|---|---|
| `createLead` | `lib/leads/create-lead.ts` | nackter Lead-Insert | alle 6 |
| `convertLeadToClaim` (**Kern**) | `lib/leads/convert-lead-to-claim.ts` | Claim+Parties+Vehicle+Bridge + Lead-Idempotenz (`:98`) + Makler-Notif | ✗ Pflichtdok · ✗ FlowLink · ✗ Kunde-Notif |
| `convertLeadToFall` (**Wrapper**) | `lib/leads/convert-lead-to-fall.ts` | Kern **+** Pflichtdok (`:172`) + Kunde-WA `fall_eroeffnet` (`:234`) + KB-InApp | ✗ FlowLink |
| `create-pflicht.ts` | `lib/dokumente/create-pflicht.ts` | Pflichtdok-Slot-Kern — **caller-getrieben** | — |
| `ensureCanonicalFlowLinkForLead` | `lib/start-link/…` | kanonischer FlowLink — **nie im Convert-Kern** | — |

**Zwei Muster (A4 §1):**
- **Muster L (Mehrheit):** Eingang legt Lead + FlowLink an; Claim/Pflichtdok/Voll-Notif entstehen erst bei der
  `/flow`-Konversion. **`/flow/[token]` (A4 C-1) ist der de-facto-`createCase`** — dort werden Pflichtdok + Voll-Notif +
  Confirm zentral erzeugt (`actions.ts:711/1095/1233`). „Claim ✗" ist hier **by-design**, solange der FlowLink zu /flow führt.
- **Muster D (Ausnahmen):** Eingang konvertiert sofort — über den Wrapper (erbt Pflichtdok+Notif) **oder** den Kern
  direkt (muss selbst nachbauen, **vergisst meist welche**).

**Die C2-These:** `createCase` konsolidiert beide Muster auf **einen** Pfad mit garantierten Nachwirkungen und hebt
die Kern-direkt-Ausnahmen auf denselben Stand. `/flow` (C-1) ist das lebende Vorbild — C2 extrahiert dessen Garantien
in ein wiederverwendbares Modul.

## 2 · `createCase`-Modul-Design (Zielpfad `src/lib/intake/create-case.ts`)

Eine Funktion, die **die Meldung** kapselt (nicht die Konversion — die bleibt bei `/flow` bzw. dem Convert-Kern), mit
einem **Modus**-Parameter, der die beiden Muster abbildet:

```
createCase(input: CreateCaseInput): Promise<CreateCaseResult>
  input.mode = 'lead-first'  → Lead + FlowLink + Erstnotif + Dedup   (Muster L)
             | 'direct-claim' → + Claim (Kern) + Pflichtdok           (Muster D)
  input.dedupKey            → Person+Schaden+Zeitfenster (s. §5)
```

**Garantie (idempotent, in dieser Reihenfolge, non-fatal je Sub-Effekt wie im Wrapper):**
1. **Dedup-Check** (§5) — existierender offener Lead/Claim zum selben `dedupKey`? → denselben zurückgeben, kein Zweit-Insert.
2. **Lead** (`createLead`, `source_channel` aus dem Adapter).
3. **FlowLink** (`ensureCanonicalFlowLinkForLead`) — **immer** (schließt die B-2/C-4-Lücke „kein Kunde-Kanal").
4. **direct-claim:** Claim (`convertLeadToClaim`-Kern) **+ Pflichtdok im Kern** (`createPflichtdokumenteFromKatalog`) — schließt die A-3-Pflichtdok-Lücke (P1 #1).
5. **Erstnotif** — garantierter Kunde-Kanal (WA/Email) über C3-Outbox (bis dahin: der Wrapper-Send). Schließt P2 #5–#7.
6. **Reservierung** — falls Slot: definiertes Soft/Hard-Verhalten durchreichen (kein meldungssprengender Hard-Block; melde-schaden-Fix `route.ts:234-258` als Muster).

## 3 · Adapter-Strategie (A4-Eingänge → dünne Adapter)

Jeder der 15 A4-Eingänge wird ein **dünner Adapter**: Payload mappen (die vorhandenen Mapping-Libs wie
`lib/kunde/schaden-melden.ts` A-2, `buildSchadenLeadInput` bleiben) → `createCase(input)` rufen → das Ergebnis
(FlowLink/Claim-Id) an die UI/Response zurück. **Kein Eingang macht mehr Lead-/Claim-Anlage selbst** (DoD-Grep: 0
Fall-/Lead-Anlage außerhalb des Moduls). Muster-L-Adapter setzen `mode='lead-first'`, Muster-D-Adapter `'direct-claim'`.

## 4 · Tranchen

- **C2a** = Modul `create-case.ts` + Umstellung des **Haupt-Wizards A-1** (`meldeNeuenSchaden`, schon Muster-D-Wrapper → sauberster Erst-Adapter) + `/flow`-C-1-Garantien als Referenz extrahiert. Beweis: A-1 läuft über das Modul; Idempotenz-Test (Doppel-Submit → 1 Claim, schließt P1 #3).
- **C2b** = die **P1-✗-Zellen zuerst**: A-3 Gegner-Flow (Pflichtdok-Gap #1), D-4b Aircall (Doppel-Lead #2), B-1 Embed-Finder (Doppel-Submit #4).
- **C2c+** = restliche Eingänge (B-2/B-3/B-4/C-*/D-*) nach A4-Priorität; Register-Zellen nach jeder Tranche auf ✓ ziehen.

## 5 · Idempotenz-/Dedup-Design (schließt die P1-Doppel-Lücken)

Heute ist Dedup **uneinheitlich**: stark bei A-3/B-3/D-4a (`findRecent*`+Cap+Circuit-Breaker), schwach/fehlend bei
A-1 (nur Client-Guard), B-1, D-4b (Aircall), B-4/D-1/D-2/D-3. `createCase` vereinheitlicht das über einen **Dedup-Key**:
- Kanonisch = **Person (Telefon/Email) + Schadenkennung (Kennzeichen/Schadendatum) + Zeitfenster** (≈10 min, wie `findRecentGegnerLead`/`findRecentMcpLead`).
- Ein Treffer → **derselbe** Lead/Claim zurück (kein Zweit-Insert), nicht ein harter Fehler.
- Der bestehende starke Mechanismus (A-3/B-3) wird die Referenz-Implementierung; die schwachen Eingänge erben ihn automatisch, sobald sie Adapter sind.

## 6 · Berührungspunkte mit anderen C-Paketen

- **C1 (`transitionClaim`):** der `direct-claim`-Modus legt einen Claim an → der initiale `operative_status`-Cursor. C2 ruft **nicht** direkt `.update` — die Anlage nutzt den Kern; der Cursor-Fortschritt bleibt C1. (Kein WILD-Write aus C2.)
- **C3 (Outbox):** die Erstnotif (Schritt 5) ist ein `enqueue()`-Kandidat — bis C3 steht, der Wrapper-Send; danach über die Outbox mit Dedup-Key. C2 erzeugt genau **einen** Erstnotif-Auslöser je Meldung (P1.1-linientreu: ein Willkommens-Set).
- **`/flow` (A4 C-1):** bleibt der Konversions-Konvergenzpunkt; C2 speist es (Lead+FlowLink), ersetzt es nicht. Reconcile-Frage: extrahiert C2 die /flow-Pflichtdok-/Notif-Garantien in `create-case.ts`, das /flow **selbst** dann ruft?

## 7 · DECISIONS-Kandidaten (§8, für Aaron)

1. **Muster-L-Erstnotif** (A4-Frage 2): garantiert `createCase` bei **jedem** Meldeweg einen aktiven Kunde-Kanal (WA/Email), oder bleibt reiner Client-Redirect bei B-2/C-4 zulässig? (Empfehlung: garantierter Kanal — deckt P2 #5–#7.)
2. **Gegner-Flow-Pflichtdok** (A4-Frage 3): bekommt der A-3-Claim Pflichtdok-Slots (Geschädigten-Sicht) oder bewusst nicht (Gegner meldet)? (Empfehlung: ja, im Kern — der Geschädigte erbt den Fall.)
3. **Marketing-Mini-Wizard** (A4-Frage 1): `/schaden-melden` im `claimondo-marketing/`-Build als 16. Eingang aufnehmen (eigener Adapter über eine API-Grenze)?

## 8 · FG-Überschneidung (Andocken ans Flag-Programm)

`createCase` setzt Intake-**Flags** (`source_channel`, Reservierungs-Soft/Hard, `service_typ`). Das FG-Programm
(interaction-flags → DB-driven) besitzt die Flag-Semantik. **Überschneidung:** C2 zentralisiert das **Setzen** dieser
Flags an der Anlage; FG definiert ihre **Werte/Gültigkeit**. Vor C2a-Code die FG1–FG8-Pläne auf Intake-Flags prüfen
(analog c1-plan-Andockvorgabe) — C2 darf keine Flag-Werte hart setzen, die FG DB-driven macht.

## 9 · Offene Fragen an Aaron (max. 5)
1. §7 #1–#3 (Muster-L-Notif / Gegner-Pflichtdok / Marketing-Wizard).
2. Soll `create-case.ts` die **/flow-Garantien extrahieren** (dann ruft /flow es selbst), oder bleibt /flow ein eigenständiger zweiter Kanon neben `createCase`?

## 10 · Nächstes für C2a-Code (wenn B1 steht + Review)
Voller `writing-plans`-Plan; die Kern-Bausteine (`convert-lead-to-*`, `create-pflicht`, `ensure-flowlink`) gegen den
**dann-aktuellen** Code frisch verifizieren (die Intake-Lanes aar-956-embed/werkstatt sind aktiv → A4-file:line kann driften); FG1–FG8-Intake-Flag-Check.
