# A4 · Entry-Point-Register — FlowLink-Tranche

> **Paket A4** aus `FUNDAMENT.md` §3, Tranche **FlowLink**. Das Meldewege-Kern-Register liegt in
> `docs/fundament/entry-points.md` (#4816); diese Datei registriert die FlowLink-Eingänge
> (Issuance + Delivery von `flow_links`). ✗-Zellen = priorisierter Input für **C2 (`createCase`)**.

## Diese Datei = FlowLink-Tranche (A4/1)

Diese erste Tranche deckt die **FlowLink-Eingänge** ab: alle Wege, die einen kanonischen
`flow_links`-Eintrag erzeugen/wiederverwenden (Issuance) und/oder den `/flow/[token]`-Link
zustellen (Delivery), plus deren garantierte Nachwirkungen. Quelle: das FlowLink-Voll-Audit
vom 27.07.2026 (Memory `coordination-flowlink-account-portal-whatsapp-redirect`) und der
Entry-Point-/Abrechnungsweg-Audit vom 24.07.2026 (Memory `coordination-flow-entry-points-abrechnungsweg-audit`,
Volldoc `docs/2026-07-24-flow-entry-points-abrechnungsweg-audit.md`).

**Verifiziert** gegen den frischen Worktree auf `origin/staging` (HEAD `5539287d4`, 2026-07-28) —
alle `file:line`-Angaben stammen aus diesem Stand, nicht aus dem Memory (Memory-Zitate sind als
solche gekennzeichnet).

**NOCH NICHT in diesem Register (TODO — eigene A4-Tranche nötig, damit A4 vollständig ist):**
- **Wizard-Detail** — der native `/flow`-`FlowWizardKfz`-Motor selbst (Steps, `flow_szenarien`,
  Quali-Weiche Haftpflicht/Kasko/Selbstzahler). Hier nur als Ziel des Links behandelt, nicht seine
  interne Erhebungs-Mechanik.
- **`POST /api/v1/melde-schaden` im Detail** — hier nur die FlowLink-Nachwirkungen; die
  Reservierungs-/Consent-/Dedup-Mechanik der öffentlichen API braucht eine eigene Vertiefung.
- **Schadenkarte QR/NFC** (`schuldfrage='gegner'` by design) — eigener Meldeweg ohne FlowLink-Issuance
  im hier erfassten Pfad.
- **Cold-Mail-CTAs / Marketing-Haustür** (Mini-Wizard `/schaden-melden`, Gutachter-Finden, Makler-Hub
  `/m/<code>`, Anspruch-Check, Cluster-LPs) — als Trigger teils schon erfasst (sie münden in `gfa` →
  `issueCanonicalFlowLinkForAnfrage`), aber die vorgelagerten Marketing-Funnels sind nicht vollständig
  gemappt.
- **Telefon/Manuell** (Dispatcher legt Lead per Hand an) — Delivery via `sendFlowLinkMultiChannelCore`
  ist erfasst; die manuelle Lead-Anlage selbst nicht.

---

## Architektur (verifiziert)

**Ein kanonischer `flow_links`-INSERT.** Alle Wege gehen durch **eine** idempotente, lead-gekeyte
Funktion — „ein Lead = ein Link":

- **`ensureCanonicalFlowLinkForLead(leadId, opts)`** — `src/lib/start-link/ensure-flowlink-for-lead.ts:20`.
  Der EINZIGE `flow_links`-Insert (service-role, `createAdminClient`; `flow_links` ist default-deny für
  `authenticated`). Idempotent: reused den jüngsten noch gültigen Link (TTL 72 h, `expires_at`), sonst
  neu (Token = DB-Default). Reihenfolge über `erstellt_am` (nicht `created_at` — CMM-Drift-Fix 16.07.).
- **`issueCanonicalFlowLinkForAnfrage(anfrageId, {send})`** — `src/lib/start-link/issue-canonical-flowlink.ts:123`.
  Der anon-/Self-Service-Wrapper: `gutachter_finder_anfragen` (gfa) → Lead (idempotent via
  `gfa.konvertiert_zu_lead_id`, `createLead`, Round-Robin-Dispatcher) → `ensureCanonicalFlowLinkForLead`
  → optional Versand. `send:false` skippt den Versand (Client redirectet direkt nach `/flow/[token]`).

**Zwei-Flow-Architektur (Ziel des Links):**
- **Flow A** = `/flow` `FlowWizardKfz` — PRE-Konversion, `leads.*`, anon/Magic-Link.
- **Flow B** = `/kunde/onboarding-details` — POST-Konversion, `claims.*`, eingeloggt.
- **Kanonisch für Eingeloggte = Flow B** (Entscheidung Bug3, siehe `DECISIONS.md` 2026-07-28). Der
  Logged-in-Redirect in `src/app/flow/[token]/page.tsx` schickt eingeloggte Kunden von A nach B; er lag
  bis PR #4810 tot im try/catch (NEXT_REDIRECT verschluckt). Dedup der „zwei Feststellungen":
  `convertLeadToClaim` kopiert `leads.unfallhergang` → `claims.hergang_kunde_text`.

**Drei Delivery-Pfade (Zustellung des `/flow`-Links):**
| Pfad | Datei | Kanäle | Nutzung |
|---|---|---|---|
| `sendeInitialLink` (lokal) | `issue-canonical-flowlink.ts:68` | WA → SMS → Email | Self-Service (aus `issueCanonicalFlowLinkForAnfrage`, wenn `send:true`) |
| `sendFlowLinkMultiChannelCore` | `src/lib/start-link/send-flowlink-multichannel.ts:20` | expliziter Kanal (WA/SMS/Email) | Dispatch · KB/Konsultation · Werkstatt · Makler (reused `ensureCanonicalFlowLinkForLead`) |
| `sendFlowLink` (**verwaist**) | `src/lib/actions/dispatch-fall-actions.ts:380` | WA-only | **0 Caller** (präzise-Grep bestätigt) → **Lösch-Kandidat** |

`sendeInitialLink`-Härtung (Aaron 27.07., `issue-canonical-flowlink.ts:85`): WA wird auch bei
UNBEKANNTER Verfügbarkeit (`verfuegbar !== false`, z. B. Baileys-Timeout) versucht — nur bei explizitem
`false` übersprungen. Sonst degradierte der Link still auf SMS/Email (Bug1 des Audits).

---

## Register (Pflicht-Nachwirkungen je Eingang)

**Legende:** ✓ erfüllt · ✗ fehlt (→ C2-Input) · ⚠ bedingt/teilweise (Details unten) · — n/a für diesen Eingang.

**Spalten:**
- **Fall** = Fall/Lead angelegt (FlowLink-Ebene erzeugt einen **Lead**, keinen Claim; Claim entsteht erst bei `convertLeadToClaim`).
- **Slots** = Pflichtdok-Slots angelegt.
- **Link** = kanonischer `flow_links`-Eintrag (Issuance).
- **Notif** = Erst-/Link-Versand an den Melder (Kanal).
- **Dedup** = Dedup gegen Doppelmeldung.
- **Reserv** = Reservierungs-Verhalten (harter Termin-Hold vs. weiche gfa-Back-Reference).

### Gruppe 1 — Self-Service gfa → Lead → FlowLink (`issueCanonicalFlowLinkForAnfrage`)

| # | Eingang / Trigger | Issuance (file:line) | Fall | Slots | Link | Notif | Dedup | Reserv |
|---|---|---|---|---|---|---|---|---|
| 1 | **/start/[anfrageId]** (HMAC-verifizierter Self-Service-Startlink) | `start/[anfrageId]/route.ts:33` | ✓ Lead | ✗ | ✓ | ✓ WA→SMS→Email (default send) | ⚠ | weich |
| 2 | **POST /api/v1/melde-schaden** (MCP/öffentliche API) | `api/v1/melde-schaden/route.ts:219` (`send:true`) | ✓ Lead | ✗ | ✓ | ✓ WA→SMS→Email | ✓ (entry-lokal) | ⚠ hart+weich |
| 3 | **POST /api/v1/rueckruf** (MCP Rückruf) | `api/v1/rueckruf/route.ts:188` (`send:false`) | ✓ Lead | ✗ | ✓ | ✗ (kein Versand; Callback → Dispatch) | ⚠ | weich |
| 4 | **Gutachter-Finder-Embed (nativ)** | `embed/gutachter-finder/actions.ts:103` (`send:true`) | ✓ Lead | ✗ | ✓ | ✓ WA→SMS→Email | ⚠ | weich |
| 5 | **Werkstatt-KVA-Upload** | `werkstatt/(shell)/kva/actions.ts:57` (`send` bedingt) | ✓ Lead | ✗ | ✓ | ⚠ nur wenn Telefon & `perWhatsApp` | ⚠ | weich |
| 6a | **anfrage-from-lp · aktion=`direkt`** | `api/anfrage-from-lp/route.ts:166` (`send:false`) | ✓ Lead | ✗ | ✓ | ✗ (Client redirectet → /flow) | ⚠ | weich |
| 6b | **anfrage-from-lp · aktion=`senden`** | `api/anfrage-from-lp/route.ts:166` (`send:true`) | ✓ Lead | ✗ | ✓ | ✓ WA→SMS→Email | ⚠ | weich |
| 6c | **anfrage-from-lp · `funnel_modus='flowlink'`** (SV-Embed Variante B) | `api/anfrage-from-lp/route.ts:190` | ✓ Lead | ✗ | ✓ | ✓ WA→SMS→Email (kein SV-Notify) | ⚠ | weich |
| 6d | **anfrage-from-lp · Cluster-LP** (env `SELF_SERVICE_AUTO_ISSUE`, default AUS) | `api/anfrage-from-lp/route.ts:215` | ✓ Lead | ✗ | ✓ | ✓ (wenn Env an) | ⚠ | weich |

### Gruppe 2 — Lead-gekeyt, nur Link/Ensure (`ensureCanonicalFlowLinkForLead` direkt, kein Versand)

| # | Eingang / Trigger | Issuance (file:line) | Fall | Slots | Link | Notif | Dedup | Reserv |
|---|---|---|---|---|---|---|---|---|
| 7 | **Werkstatt-Finder-Embed** (Client redirectet → /flow) | `embed/werkstatt-finder/actions.ts:318` | — (Lead upstream in derselben Action) | ✗ | ✓ | ✗ (Redirect statt Send) | ✓ idempotent | — |
| 8 | **/schaden-melden/fortsetzen/[token]** (Resume-Route) | `schaden-melden/fortsetzen/[token]/route.ts:52` | — (bestehender Lead) | ✗ | ✓ (re-mint bei 72 h-Expiry) | — (Resume, keine Erstmeldung) | ✓ idempotent | — |
| 9 | **/kunde/faelle/[id]/unterschrift** (K6 SA/Vollmacht-Nachsignier-Resolver, eingeloggt) | `kunde/faelle/[id]/unterschrift/route.ts:26` | — (bestehender Claim → `lead_id`) | — | ✓ | — (Redirect → /flow) | ✓ idempotent | — |

### Gruppe 3 — Expliziter Multi-Channel-Resend (`sendFlowLinkMultiChannelCore`, reused Ensure)

| # | Eingang / Trigger | Delivery (file:line) | Fall | Slots | Link | Notif | Dedup | Reserv |
|---|---|---|---|---|---|---|---|---|
| 10 | **Dispatch** (`DispatchFlowlinkPanel` + Kalender-Spontan) | `dispatch/leads/[id]/_actions/flowlink.ts:21`, `dispatch/kalender/_actions/spontan.ts:91` | — (bestehender Lead) | ✗ | ✓ (reuse) | ✓ expliziter Kanal | ✓ idempotent | weich |
| 11 | **KB / Konsultation** (Abbrecher-Leads, service-role) | `mitarbeiter/konsultation/[terminId]/actions.ts:42` | — | ✗ | ✓ (reuse) | ✓ expliziter Kanal | ✓ idempotent | weich |
| 12 | **Werkstatt-Anfragen** | `werkstatt/(shell)/anfragen/actions.ts:119` (ensure) + `:150/:153` (send) | — | ✗ | ✓ | ✓ WA→SMS-Fallback | ✓ idempotent | weich |
| 13 | **Makler-Vermittlung** | `lib/makler/erstelle-anfrage.ts:233–235` | ✓/— (je Anfrage) | ✗ | ✓ | ✓ WA→SMS→Email (+ introText) | ✓ idempotent | weich |

### Gruppe 4 — Verwaist (Dead-Code)

| # | Eingang | Datei | Status |
|---|---|---|---|
| 14 | **`sendFlowLink(leadId)`** | `dispatch-fall-actions.ts:380` | **0 Caller** (präzise-Grep `[^a-zA-Z]sendFlowLink\(` → nur die Definition). WA-only. Nutzt intern `ensureCanonicalFlowLinkForLead:398`. **Lösch-Kandidat** (Cleanup-Batch aus dem 27.07.-Audit). |

---

## Details & Belege (die ⚠-/✗-Nuancen)

- **Slots (durchgängig ✗):** Kein Eingang legt auf FlowLink-Ebene Pflichtdok-Slots an — Leads haben
  keine Slots, die entstehen erst bei der Claim-Konversion. Und selbst dort ist es eine bekannte Lücke:
  `convertLeadToClaim` legt **keine** Pflichtdok-Slots an (Memory `coordination-an-aar-956-embed-pflichtdok-slots`
  — „im Embed ergänzen, idempotent"). → **Kern-✗ für C2:** `createCase` muss Slots garantiert + idempotent
  anlegen.
- **Notif = Link-Versand an den Melder, nicht Staff/SV.** Der FlowLink-Layer benachrichtigt **nicht**
  automatisch SV/Staff. Für die Self-Service-Embeds ist das Absicht: `funnel_modus='flowlink'` schickt
  bewusst **keine** `notifyAnfrage`/SV-WhatsApp (`api/anfrage-from-lp/route.ts:186–188`) — SV-Awareness
  läuft über den Lead + die Dispatch-Queue (Safety-Net). Bei Versand-Fehlschlag/kein Kanal fällt der
  Flow auf „Callback"-Wording zurück und der Lead hängt in der Dispatch-Queue.
- **Dedup zweigeteilt.**
  - **Link-/Lead-Idempotenz (✓ überall):** `ensureCanonicalFlowLinkForLead` reused gültige Links;
    `issueCanonicalFlowLinkForAnfrage` reused via `gfa.konvertiert_zu_lead_id` (kein zweiter Lead/Token je gfa).
  - **Cross-Report-Dedup (⚠, sonst ✗):** Nur `POST /api/v1/melde-schaden` hat eine entry-lokale
    Doppelmeldungs-Bremse (`src/lib/api-v1/recent-lead-dedup.ts`, referenziert `melde-schaden/route.ts:122`).
    Die anderen Eingänge deduplizieren **nicht** gegen eine zweite gfa/Lead-Anlage derselben realen Meldung
    (gleiche Person über zwei Kanäle). → **C2-Input:** cross-channel-Dedup als garantierte Nachwirkung zentralisieren.
- **Reservierung „weich" vs „hart".**
  - **weich (Regelfall):** Leads tragen **keine** `zugeordneter_sv_id`; der gepickte SV bleibt als
    Back-Reference auf der gfa (`gfa.konvertiert_zu_lead_id ↔ lead`), das datengetriebene `/flow` liest
    ihn darüber (`issue-canonical-flowlink.ts:21–23`). Also **keine harte Termin-Reservierung** durch die
    FlowLink-Issuance.
  - **hart+weich (`melde-schaden`):** kurzer **harter** Hold via `bucheTerminFlow` (token-basiert,
    race-safe über Engine-EXCLUSION-Constraint) **nur** wenn konkreter SV + Slot gewählt — NON-FATAL: bei
    `belegt`/Fehler bleibt der **weiche** Hold (`gfa.wunschtermin` + `zugeordneter_sv_id`) → `/flow`
    `terminPending` (`melde-schaden/route.ts:234–255`). Fehlerklassifikation via `klassifiziereReservierungsGrund`
    (macht z. B. `test_sv_guard` für Smokes sichtbar). Der frühere **Hard-Reservierungs-Bug** (Memory
    `coordination-an-aar-956-melde-schaden-hard-reservierung-bug`, Owner Test-Guard) erscheint in diesem
    Stand **mitigiert** (harter Hold non-fatal + weicher Fallback) — im melde-schaden-Detail-TODO final verifizieren.
- **Bug1 (Notif-Regression, gefixt 27.07.):** `embed/gutachter-finder/actions.ts:103` stand auf
  `send:false` (am 14.06. bewusst geflippt) → nativer Finder schickte den Link nicht mehr per WhatsApp.
  Im Audit auf `send:true` zurück (Eingang #4). Beleg: Memory `coordination-flowlink-...redirect`.

---

## ✗-Matrix — priorisierter Input für C2 (`createCase`)

Nach A4-DoD ist die ✗-Matrix der Arbeitsvorrat für C2. Kern-Befunde:

1. **Pflichtdok-Slots (✗ bei ALLEN Eingängen)** — höchste Priorität. `createCase` muss die Slots als
   garantierte, idempotente Nachwirkung anlegen (die Claim-Konversion tut es heute nicht).
2. **Cross-Report-Dedup (✗ außer `melde-schaden`)** — die Doppelmeldungs-Bremse ist entry-lokal statt
   zentral; `createCase` sollte sie für alle Eingänge garantieren.
3. **Notif bei `send:false`-Pfaden (✗: #3 rueckruf, #6a direkt; ⚠ #5 kva)** — hier ist der ausbleibende
   Versand teils Absicht (Direkt-Redirect / Callback), aber C2 muss die Erstnotification als **explizite,
   nachvollziehbare** Entscheidung führen (nicht als stillen Seiteneffekt) und den Dispatch-Queue-Fallback
   garantieren.
4. **Reservierungs-Verhalten uneinheitlich** — nur `melde-schaden` reserviert hart; die Regel ist „weich".
   C2 sollte das Reservierungs-Verhalten je Eingang explizit parametrisieren statt es pro Route neu zu
   erfinden.
5. **Dead-Code `sendFlowLink` (#14)** — im C2-/Cleanup-Zug löschen (0 Caller).

**Nicht-Ziel (A4):** Keine dieser Lücken wird hier gefixt — nur registriert (FUNDAMENT.md §3 A4
„Nicht-Ziele: Keine Löcher fixen").
