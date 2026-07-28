# A4 · Entry-Point-Register

> Fundament-Paket **A4** (`docs/fundament/FUNDAMENT.md` §3). Register aller Schaden-Meldewege mit ✓/✗-Checkliste
> der 6 Pflicht-Nachwirkungen je Eingang. Die ✗-Matrix (§4) ist der priorisierte Arbeitsvorrat für
> **C2 (`createCase` — Ein Intake mit garantierten Nachwirkungen)**.
>
> **Erhebung:** 28.07.2026, Session 8c6de199, gegen `origin/staging` im frischen Worktree (4 parallele Code-Leser).
> Belege = `file:line` relativ zu `src/`. **Scope-Zaun (§0.2):** nur registrieren, **keine Löcher fixen** — Funde sind ✗ + Notiz, Fix ist C2.
>
> **Tranche:** Die FlowLink-Eingänge (Issuance/Delivery von `flow_links`, 14 Einträge) sind separat
> registriert in `docs/fundament/entry-points-flowlink.md` (#4818).

## Die 6 Pflicht-Nachwirkungen (Soll je Meldeweg)

1. **FALL ANGELEGT** — Lead und/oder Claim entsteht (Anker der Akte).
2. **PFLICHTDOK-SLOTS** — Pflicht-Upload-Platzhalter (`pflichtdokumente`) angelegt, sonst weiß niemand, was fehlt.
3. **FLOWLINK** — kanonischer Magic-Link (`flow_links` / `ensureCanonicalFlowLinkForLead`), Kunde macht ohne Account weiter.
4. **ERSTNOTIFICATION** — erste Benachrichtigung (WA/Email/In-App) an die betroffene Rolle.
5. **DEDUP** — Schutz gegen Doppel*meldung* (nicht nur Idempotenz auf denselben Lead, sondern gegen einen zweiten Submit desselben Schadens).
6. **RESERVIERUNG** — falls Termin/Slot reserviert wird: definiertes Verhalten (kein Hard-Block, der die Meldung sprengt).

Legende: ✓ vorhanden · ✗ fehlt · ~ teilweise/Ersatzmechanismus · n/a nicht zutreffend.

---

## 1 · WO die Nachwirkungen leben — und die zwei Meldemuster (zentrale Erkenntnis)

Die 6 Nachwirkungen sind **nicht an einem Ort garantiert**, sondern auf mehrere Bausteine verteilt:

| Baustein | file | leistet | leistet NICHT |
|---|---|---|---|
| `createLead` | `lib/leads/create-lead.ts` | nackter Lead-Insert (erzwingt nur `source_channel`+`status`) | alle 6 Nachwirkungen |
| `convertLeadToClaim` (**Kern**) | `lib/leads/convert-lead-to-claim.ts` | Claim + Parties + Vehicle + Bridge (`:947`) + Dedup=Idempotenz auf denselben Lead (`:98`) + Makler-Notif (`:1005`) | ✗ Pflichtdok · ✗ FlowLink · ✗ Kunde-Erstnotif |
| `convertLeadToFall` (**Wrapper**) | `lib/leads/convert-lead-to-fall.ts` | ruft den Kern **plus**: Pflichtdok (`:172`) + Kunde-WA `fall_eroeffnet` (`:234`) + KB-InApp (`:214`) | ✗ FlowLink |
| `create-pflicht.ts` | `lib/dokumente/create-pflicht.ts` | Pflichtdok-Slot-Kern — **muss vom Caller gerufen werden** | — |
| `ensureCanonicalFlowLinkForLead` | `lib/start-link/…` | der kanonische FlowLink — **caller-getrieben, nie im Convert-Kern** | — |

**Daraus ergeben sich zwei Meldemuster:**

- **Muster L — lead-first (die Mehrheit):** Eingang legt nur **Lead + FlowLink** an. Claim, Pflichtdok, Hard-Confirm und die Kunde-Erstkommunikation entstehen **erst bei der /flow-Konversion** (Eingang C-1). Der FlowLink-Portal `/flow/[token]` ist der **gemeinsame Konvergenzpunkt** und funktioniert de facto schon wie ein `createCase` — dort werden Pflichtdok + Voll-Notif + Confirm zentral erzeugt. → Bei diesen Eingängen ist „Claim ✗ / Pflichtdok ✗" **kein Bug**, sondern by-design; solange sie den FlowLink erzeugen, erreichen sie /flow.
- **Muster D — Direkt-Claim (die Ausnahmen):** Eingang konvertiert **sofort** zu Claim. Entweder über den **Wrapper** `convertLeadToFall` (erbt Pflichtdok + Kunde-WA) **oder** über den **Kern** `convertLeadToClaim` direkt (muss Pflichtdok + FlowLink + Notif selbst nachbauen — und **vergisst dabei meist welche**).

**C2-These:** `createCase` konsolidiert beide Muster auf einen Pfad mit **garantierten** Nachwirkungen — und hebt die Direkt-Claim-Ausnahmen (die den Wrapper umgehen) auf denselben Stand.

---

## 2 · Register je Eingang

### Cluster A — Kunde-Web / Gegner

**A-1 · Kunde-Wizard** — `/kunde/schaden-melden` (Kunde-Auth) → `meldeNeuenSchaden` (`app/kunde/schaden-melden/actions.ts:17`). **Muster D (Wrapper).** Kette: `createLead` (`:40`) → `convertLeadToFall` (`:50`).
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ Lead+Claim (`:40/:50`) | ✓ erbt Wrapper (`convert-lead-to-fall.ts:172`) | ✗ | ✓ Kunde-WA (`…:234`)+KB-InApp (`:214`) | ~ schwach: nur Kern-Idempotenz (`convert-lead-to-claim.ts:98`), **kein existierender-Lead-Check** → Doppel-Submit=2 Claims; nur Client-Guard (`SchadenMeldenWizard.tsx:43`) | ✗ |

**A-2 · `lib/kunde/schaden-melden.ts`** — reine Mapping-Lib (`buildSchadenLeadInput:89`), von A-1 importiert, DB-/seiteneffektfrei → alle 6 **n/a**. Kein eigener Meldeweg.

**A-3 · Gegner-Flow / Schadenkarte NFC** — public `/schaden/[token]` (Token=Autorisierung, kein Login) → `submitSchadenGegner` (`app/schaden/[token]/actions.ts:50`). **Muster D (Kern DIREKT).** `createLead` (`:120`) → `convertLeadToClaim` (`:179`, fail-soft). _(= der „Schadenkarte QR/NFC"-Eingang; QR/NFC-Tag führt hierher.)_
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ Lead+Claim (`:120/:179`) | ✗ **GAP** — Kern-Aufruf ohne Wrapper, `createPflichtdokumenteFromKatalog` läuft nie | ~ Ersatz: Gegner-Airdrop-Magic-Link (`gegner-invite.ts:110`), nicht `flow_links` | ✓ Gegner WA→SMS→Email (`gegner-invite.ts:49`)+FM-WA (`actions.ts:252`) — **kein Notify an Kunde/Geschädigten** | ✓ stark: `findRecentGegnerLead`<10min (`actions.ts:105`)+Cap 3/24h (`:86`)+Circuit-Breaker (`:92`) | ✗ |

### Cluster B — Embed + Public-API

**B-1 · Embed Gutachter-Finder** — `/embed/gutachter-finder` → `reserviereEmbedTermin` (`app/embed/gutachter-finder/actions.ts:76`). **Muster L** (gfa+Lead+FlowLink+Termin).
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ gfa+Lead, ✗ Claim (`:76/:103`) | ✗ (kommt bei /flow) | ✓ (`:103`) | ✓ mehrkanalig Kunde+Team (`issue-canonical-flowlink.ts:68`, `gutachter-finder-actions.ts:452`) | ? kein Cross-Submit-Dedup → Doppelabsenden=2 gfa/2 Leads (`gutachter-finder-actions.ts:288`) | ✓ hybrid: Partner hart via Exclusion, ohne Wunschtermin hart / mit soft (`actions.ts:391/407`) |

**B-2 · Embed Werkstatt-Finder** — `/embed/werkstatt-finder` → `erstelleWerkstattFinderLead` (`…/actions.ts:246`). **Muster L** (Lead+FlowLink).
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ Lead, ✗ Claim (`:246`) | ✗ | ✓ (`:318`) | ✗ **einziger Eingang ganz ohne** — Kunde bekommt Token nur client-seitig via Redirect | ~ nur Re-Entry via flowToken→UPDATE (`:219`); ohne Token neuer Lead | ✗ (nur Reparateur-Zuweisung, kein Slot) |

**B-3 · Public-API `POST /api/v1/melde-schaden`** — `app/api/v1/melde-schaden/route.ts` (MCP-Tool). **Muster L** (gfa+Lead+FlowLink+Termin).
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ gfa+Lead, ✗ Claim (`:185/:219`) | ✗ | ✓ (`:219`) | ✓ Kunde-Kanal, **kein Team** (mcp-Ausschluss `anfrage.ts:200`) | ✓ stark: `findRecentMcpLead`10min (`:123`)+Cap (`:143`)+Circuit-Breaker (`:154`)+IP-RL (`:96`) | ✓ soft — **⚠ Hard-Reservierungs-Bug BEHOBEN** (`:234-258` konditional+Soft-Fallback) |

**B-4 · Public-Rückruf** — `erstelleOeffentlichenRueckruf` (`lib/actions/public-rueckruf.ts`), Marketing-Formulare. **Muster L-Variante** (Lead+admin_termine, telefonisch).
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ Lead+admin_termine (`:74/:112`) | ✗ | ✗ (bewusst telefonisch) | ✓ Team Email+WA (`:149`)+Dispatch-InApp (`:136`)+Kunde-WA (`:166`) | ✗ kein Idempotenz-/Telefon-Check → Doppel-Rückrufe | ~ soft: admin_termine-Task, kein Slot-Hold (`:104`) |

### Cluster C — FlowLink / Makler / Flotte

**C-1 · FlowLink-Portal** — `GET /flow/[token]` + Server-Actions. **Der Konvergenzpunkt / de-facto-`createCase`.** Fall existiert schon als Lead (Token aus L-Eingängen); Claim entsteht am Flow-Ende.
| Fall | Pflichtdok | FlowLink | Erstnotif | Dedup | Reservierung |
|---|---|---|---|---|---|
| ✓ Claim bei Abschluss (`actions.ts:711`, self-service:233) | ✓ (`actions.ts:1095`, self-service:247) | ✓ konsumiert+schließt (`page.tsx:66`, `actions.ts:1233`) | ✓ **massiv** Kunde/Team/SV/Admin (`actions.ts:750/766/1306/1421/1433`) | ✓ Kern-Idempotenz+Re-Entry-Guard `saWasAlreadySigned` (`:689`) | ✓ soft (Booking Exclusion) + **hard** (SA-Confirm `:781/835/1391`) |

**C-2 · FlowLink-Ausgabe** `issue-canonical-flowlink.ts` — `/start` nach HMAC (anon, service_role). **Muster L** (der Issuer). Fall=nur Lead (`:176`), FlowLink erzeugt (`:236`), Kunde-Erstnotif (`:68`), Dedup doppelt (Lead+Link idempotent, `:142`/`ensure-flowlink-for-lead.ts:42`), Pflichtdok/Reservierung ✗ (delegiert an /flow).

**C-3 · Makler-Anfrage** `erstelle-anfrage.ts` — eingeloggter Makler (`:87`), 2 Zweige. **Muster L.** Zweig Rückruf → `erstelleOeffentlichenRueckruf` (= B-4); Zweig FlowLink → `createLead`+`ensureCanonicalFlowLinkForLead` (`:206/:233`). Beide: Dedup ✓ `findeOffenenDuplikat` (Telefon+Promo, `:65`), Team-Notif ✓ (`:239`), Claim/Pflichtdok ✗ (erst /flow), Provision-Attribution promotion_code_id (Trigger bei Claim).

**C-4 · Flotte-Schaden** `schaden-fortsetzung.ts` — FM-Auth. **Muster L (reinste Form).** `erstelleFlottenSchadenLead`: Lead (`:100`)+FlowLink (`:120`), Dedup ✓ `findRecentFlottenLead`10min (`:44`), **Erstnotif ✗ — sendet nichts, nur Redirect**, Claim/Pflichtdok/Reservierung ✗. (`flowLinkFuer*Fortsetzung` = FlowLink-Reuse für bestehenden Fall; `storniereFlottenSchadenLead` = Lead→disqualifiziert + Link-Expiry.)

### Cluster D — Intern / Telefon

**D-1 · Dispatch manuell** `createManualLead` (`app/dispatch/leads/actions.ts`) — Quick-Create-Stub. Fall=Lead-only (`:95`), **alle anderen 5 ✗** (bewusst auf spätere Konversion verschoben; nur Zod `:66`).

**D-2 · Admin manuell** `anlegeFall` (`app/admin/faelle/anlegen/actions.ts`) — „telefonisch → sofort Fall". **Muster D (Kern DIREKT + Pflichtdok selbst).** `createLead` (`:58`)→`convertLeadToClaim` (`:97`), Pflichtdok ✓ **selbst ergänzt** (`:137`, Kommentar `:123`), FlowLink ✗, **Erstnotif ✗** (nur Makler-Event), Dedup ✗ (nur Rollen-Gate `:46`), Reservierung ✗.

**D-3 · Spontan-Termin** `createSpontanTermin` (`app/dispatch/kalender/_actions/spontan.ts`) — Direktdisposition. Fall=Lead-only+Termin (`:57`), Pflichtdok ✗ (kein Convert), FlowLink ✓ optional (`:91`), Erstnotif ✓ SV (`sv-termin.ts:286/348`)+Kunde optional, Dedup ✗ (Lead), **Reservierung ✓ HARD** (`reserveSvTerminForLead:82`, `pruefeBelegungStrict` fail-closed + Exclusion 23P01, `sv-termin.ts:200/265`).

**D-4a · Telefon Matelso** `app/api/webhooks/matelso/inbound/route.ts` — Call-Webhook. Fall=Lead bedingt (`:118`, nur wenn `!leadId&&!fallId`), Erstnotif ✓ dispatch+admin InApp (`:140`), **Dedup ✓ stark** (`external_call_id`+Idempotenz `:70/:74`+Telefon-Match `:108`), Rest ✗.

**D-4b · Telefon Aircall** `app/api/webhooks/aircall/inbound/route.ts`. Fall=Lead bedingt (`:72`, `call.created`-Gate `:69`), Erstnotif ✓ dispatch+admin (`:98`), **Dedup ✓ schwächer — ⚠ kein `external_call_id`-Vorabgate wie Matelso, `isNewLead=true` auch bei createLead-Fail (`:89`)** → Doppel-Lead-Vektor bei Event-Redelivery/TOCTOU, Rest ✗.

---

## 3 · Register-Vollständigkeit

**15 operative Meldewege** erhoben (A-1, A-3, B-1..B-4, C-1..C-4, D-1..D-4b) + 1 Mapping-Lib (n/a). Deduplizierung:
„Schadenkarte QR/NFC" = A-3 (`/schaden/[token]`). Cold-Mail-CTAs sind Router auf bestehende Eingänge (Mini-Wizard/Gutachter-Finder,
s. `coordination-flow-entry-points-abrechnungsweg-audit`), kein eigener Anlage-Pfad. Marketing-Mini-Wizard (`/schaden-melden`)
lebt im Marketing-Build (`claimondo-marketing/`), außerhalb dieses `src/`-Scopes — als eigener A4-Nachtrag zu erheben (offene Frage §4).

## 4 · Konsolidierte ✗-Matrix — priorisierter C2-Input

**Nur echte Lücken** (Muster-L-„Claim/Pflichtdok ✗" ist by-design und NICHT gelistet, solange der FlowLink zu /flow führt):

**P1 — Datenverlust / stiller Deadlock:**
1. **Pflichtdok-Slot-Lücke im Direkt-Claim-Pfad ohne Wrapper** — A-3 Gegner-Flow/Schadenkarte konvertiert zu Claim, ruft aber `createPflichtdokumenteFromKatalog` nie → Claim ohne Pflichtdok-Slots. Admin-manuell (D-2) macht es richtig (`:137`), der Gegner-Flow nicht. → `createCase` muss Pflichtdok **im Kern** garantieren, nicht dem Caller überlassen.
2. **Aircall Doppel-Lead-Vektor (D-4b)** — schwächerer Dedup als Matelso; Event-Redelivery erzeugt Doppel-Leads.
3. **Kunde-Wizard Doppel-Submit (A-1)** — kein Server-Dedup, nur Client-Guard → Doppelklick = 2 Claims.
4. **Embed Gutachter-Finder Doppelabsenden (B-1)** — kein Personen-/Telefon-Cross-Submit-Dedup → 2 gfa/2 Leads.

**P2 — Kunde-Erstnotification fehlt (Melder erfährt aktiv nichts; verlässt sich allein auf Client-Redirect):**
5. **Werkstatt-Finder (B-2)** — keinerlei Erstnotif.
6. **Flotte-Schaden (C-4)** — sendet nichts, nur Redirect.
7. **Admin-manuell (D-2)** — nur Staff/Makler-Event, kein Kunde-Kanal.

**P2 — Dedup fehlt (Doppelmeldung erzeugt Doppel-Vorgänge):** Dispatch-manuell (D-1), Admin-manuell (D-2), Spontan (D-3), Public-Rückruf (B-4).

**✓ Positiv-Befund (belegt behoben):** der historische **melde-schaden Hard-Reservierungs-Bug** ist geschlossen (`route.ts:234-258`, konditional + Soft-Fallback) — der als offener ✗ im FUNDAMENT-Text (§A4) genannte Fall ist bereits gefixt.

## 5 · Offene Fragen an Aaron (max. 5)
1. **Marketing-Mini-Wizard** (`/schaden-melden` im `claimondo-marketing/`-Build) — als A4-Eingang nacherheben (eigener Build außerhalb dieses `src/`-Scopes)?
2. **Kunde-Erstnotif bei Muster-L-Eingängen** (Werkstatt-Finder, Flotte): ist der reine Client-Redirect gewollt, oder soll jeder Meldeweg garantiert einen aktiven Kanal (WA/Email) auslösen (→ C2/C3-Scope)?
3. **A-3 Gegner-Flow ohne Pflichtdok** — bewusst (Gegner meldet, nicht der Geschädigte) oder echter Bug für C2?

## 6 · Nicht-Ziele (A4)
Keine Löcher fixen (das ist C2). Kein neuer Meldekanal. Keine Änderung an Kernen/Eingängen — reine Ist-Aufnahme.
