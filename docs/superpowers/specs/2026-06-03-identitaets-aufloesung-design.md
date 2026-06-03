# Identitäts-Auflösung — Design (CMM Entity-Model)

**Stand 2026-06-03. Autor: Entity-Model-Session (Brainstorm mit Aaron). Status: Design / Review.**

Capstone-Baustein des CMM-Entity-Models (`docs/03.06.2026/HANDOFF-cmm-entity-model.md`, Memory `project_cmm_entity_model`). Baut auf **PR #2353** (personen-Registry + Foundation) + **PR #2355** (person_id-Write-Wiring: convert-lead-to-claim / flow / airdrop).

---

## Einordnung in den Master-Plan (Ursprungsplan)

Diese Identitäts-Spec ist **ein Strang** des CMM-Entity-Master-Plans. Der **Ursprungsplan** mit allen Phasen liegt im Handoff: **`docs/03.06.2026/HANDOFF-cmm-entity-model.md`** (Phasen 0–5). Stand + verbleibende Arbeit:

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Dedup-Decision + Bridge + CMM-63 | ✅ (#2343 / #2344 / #2346) |
| 1 + 2a | Additive Foundation + personen-Backfill | ✅ (#2353, in staging) |
| 2b | Entity-Backfills (Fahrzeug/Gegner/Werkstatt) | ✅ **No-Op** — Quelldaten leer, live verifiziert |
| 3 | **Writer-Rewiring** — person_id schreibzeitig | ✅ **person_id** (#2355). Offen: Gegner-Fahrzeug (FIN-NOT-NULL-blockiert), Halter-als-eigene-Person (Modell-Entscheid) |
| 4 | **Reader-Repoint** auf Entitäten/Views | 🔴 **offen — muss zu Ende** |
| 5 | **Flat-Drop** (claim_parties-Personfelder, `parteien`, faelle-Spalten) | 🔴 **offen — muss zu Ende** (Pre-Drop-Verify Pflicht, Incident-Lehre §7 im Handoff) |
| — | **Identitäts-Auflösung** (diese Spec) | 📋 designt, Bau scoped/später |

> **Wichtig:** Diese Spec ersetzt **nicht** die offenen Phasen 4 + 5 des Ursprungsplans — die müssen **unabhängig zu Ende** geführt werden (Reader auf `person_id`/Entitäten umstellen, **dann** die flachen Felder droppen). Identitäts-Auflösung läuft parallel/danach. Beides gehört zum selben Master-Plan.

---

## 1. Ziel & North Star

Ein realer Mensch = genau **eine** `personen`-Zeile, claim-übergreifend wiederverwendbar. Der Schädiger von heute kann der Kunde von morgen sein → Entitäten global eindeutig, der Claim ordnet nur die **Rolle** zu.

Diese Spec klärt das schwierigste Teilproblem: **wann sind zwei Auftritte derselbe Mensch — ohne zu leaken und ohne zu mismatchen.** Zwei Fehlerklassen, beide zu vermeiden:

- **Mismatch (False Merge):** zwei Menschen → eine Zeile. Gift (DSGVO, Datenleak, Historie korrumpiert).
- **False Split:** ein Mensch → zwei Zeilen. Verfehlt den Reuse (Schädiger→Kunde), fragmentiert Historie.

## 2. Grundprinzip: Leak ≠ Dedup (zwei getrennte Ebenen)

- **Zugriff / Leak-Schutz** hängt an **RLS auf `user_id` + Claim-Party-Mitgliedschaft** — *nie* an `person_id`.
- **Dedup** (`personen`-Eindeutigkeit) ist reine Stammdaten-Hygiene.

**Konsequenz:** Ein Dedup-Fehler (zu vorsichtig → zwei Zeilen für denselben Menschen) **leakt nichts**. Das nimmt den Druck vom Mergen und erlaubt aggressives, aber sicheres Vorgehen.

> **Invariante (nicht brechen):** Keine RLS-Policy / kein Access-Check darf jemals auf `person_id` gaten. Zugriff immer über `user_id` / Party-Membership.

## 3. Zwei Merge-Ebenen

### Soft-Link (Identitäts-Assertion)
„Diese zwei sind derselbe Mensch." → ermöglicht **Dedup, Reuse, Prefill**. **Kein** Auth-Eingriff, **kein** Cross-Access-Grant. Trivial reversibel (Pointer/Flag lösen). → **Hier dürfen wir aggressiv sein.**
Mechanik: kanonischer Pointer (`personen.canonical_person_id`, nullable self-FK). Reads folgen dem Canonical; die verlinkte Zeile bleibt physisch erhalten → Split = Pointer lösen.

### Hard-Merge (Account-Consolidation)
Einen Login stilllegen + **alle** `user_id`-FKs auf den Survivor umhängen (`claims.geschaedigter_user_id`, `claim_parties.user_id`, `profiles`, `gutachter_termine`, `nachrichten`, Dokumente, Audit, KB-Zuweisungen, …). **Gewährt Cross-Access** (echtes Leak-Fenster) und ist nur mit Provenance-Log sauber trennbar. → **Der gefährliche Teil.**

## 4. Signal-Tiers & Konfidenz

| Tier | Signale | Wirkung |
|---|---|---|
| **Hart (beweisbar)** | eigenes Login / `user_id` (Selbstauskunft), **verifizierte** Email, **verifiziertes** Telefon | stärkste Auto-Trigger |
| **Stark (amtlich)** | Halter-Name **+ Geburtsdatum** (ZB1), Führerscheinnummer | hohe Konfidenz — amtlich ≠ getippt |
| **Weich (getippt/unverifiziert)** | freier Name/Email/Telefon/Adresse (Dispatcher-Eingabe) | nur Vorschlag, nie allein Auto |

**„Verifiziert"** = nachgewiesene Kontrolle: OTP eingegeben / Magic-Link geklickt / `auth.users.email_confirmed_at`/`phone_confirmed_at`. Bloß *gesendet* ≠ verifiziert.

**Konfidenz-Score** = Kombination aus **Name + Geburtsdatum + Telefon + Email** (multi-signal). Einzelnes schwaches Feld → **kein** Vorschlag (Rausch vermeiden). Amtlich/verifiziert gewichtet höher als getippt.

## 5. Der Login als Tor — Entscheidungs-Matrix

Der **Login beweist *wer* da ist** (Account); die **Match-Stärke beweist, *ob* der Orphan ihm gehört**. **Auto nur, wenn beides stark.**

| | **Login da** (authentifiziert) | **kein Login** |
|---|---|---|
| **Starker Match** | **Auto-zuordnen / -mergen** | Auto wenn Verlierer Gast/Shell; sonst Vorschlag |
| **Mittlerer Match** | **1-Klick-Selbstbestätigung** beim Login | Vorschlag |
| **Schwacher Match** | nichts | nichts |

Damit wird einem eingeloggten User **nie** ein fremder Fall untergeschoben (Auto braucht starken Match), und zwei fremde Accounts werden **nie** silent fusioniert (Hard-Merge zweier echter Logins braucht Login + Confirm des Eigentümers). Der Login = der Confirm.

## 6. Reversibilität

- **Soft-Link:** Pointer/Flag lösen → fertig.
- **Hard-Merge:** sauber trennbar nur mit **Merge-Audit/Provenance-Log** (welche Zeile kam von welcher Seite, Zeitpunkt, Trigger, by). → `mergeAccounts(survivor, loser)` schreibt das Log; `splitAccounts(mergeId)` stellt wieder her.
- Aggressives Mergen ist akzeptabel, **weil** trennbar.

## 7. Flow-Kontinuität (Consumer-Anforderung)

Identitäts-Auflösung passiert **inline** — Auth ist ein Schritt *im* Flow, kein Kontext-Wechsel.
- Anonymer Flow erkennt starken Match → bietet inline „einloggen & nahtlos weiter".
- Nach Auth: **gleiche Wizard-Stelle, gleiche Daten**, jetzt authentifiziert; Fall hängt transparent an den Account.
- **Prefill** aus dem gematchten Account/Person für die Restschritte.
- Touchpoints: `/flow/[token]`, `/gegner/[token]`, Onboarding.

Diese Spec *fordert* die Kontinuität, baut aber **keinen** Wizard-Umbau — sie nennt Prinzip + Touchpoints. Die Daten-Anhängung selbst (`relinkPartyPersonOnAccount` + Fall-Zuordnung) steht bereits aus PR #2355.

## 8. Datenmodell-Implikationen

- **Verified-Contact-Store:** Email/Telefon mit Proven-Control-Marker (Quelle, Zeitpunkt). Quellen u.a. `auth.users`-confirmed-Felder + Airdrop-Klick.
- **Soft-Link-Pointer:** `personen.canonical_person_id` (nullable self-FK). Reads folgen dem Canonical.
- **Merge-Provenance:** `person_merge_audit` (survivor, loser, betroffene Tabellen/Zeilen, trigger, by, at) für Hard-Merge-Reversibilität.
- **Konfidenz-Inputs** liegen großteils vor (`personen`/`claim_parties`: name, geburtsdatum, email, telefon; ZB1-Halter auf `leads.halter_*`).

## 9. Was schon steht vs. neu

**Steht (PR #2353/#2355):** `personen`-Registry, `claim_parties.person_id`, `ensurePersonForData` (find-or-create, Account-Dedup), `relinkPartyPersonOnAccount` (anonym→Account beim user_id-Nachzug).

**Neu (diese Spec):** Konfidenz-/Match-Engine, Verified-Contact-Store, Soft-Link-Pointer + Canonical-Reads, Hard-Merge + Provenance + Split, Login-als-Tor-Mechanik + Flow-Inline-Auth + Prefill, Vorschlags-Queue.

## 10. Offene Entscheidungen (Aaron)

1. **Vorschlags-Destination:** primär **User beim nächsten Login** (Selbst-Confirm) — *Empfehlung* — oder **Admin-Queue**? (Vorschlag: User-first, Admin-Fallback.)
2. **Auth-Angebot im Flow:** **proaktiv** (System bietet bei starkem Match an) — *Empfehlung* — oder **passiv** (User startet Login selbst)?

## 11. Scope / Non-Goals

- **Kein** kompletter Wizard-Umbau in dieser Strecke (nur Prinzip + Touchpoints).
- **Kein** Admin-Merge-Tool-Bau jetzt (Daten-Capture vorbereiten, Tool „später").
- **YAGNI:** erst Soft-Link + Login-Tor + Verified-Contact (deckt Gegner→Kunde + Reuse ab); Hard-Merge-Engine + Split erst, wenn echte Account-Dubletten real auftreten.
- Invariante aus §2 (RLS nie auf `person_id`) ist hart.

## 12. Empfohlene Bau-Reihenfolge (wenn freigegeben)

1. Verified-Contact-Store + Marker (Foundation, additiv).
2. Konfidenz-/Match-Funktion (read-only, liefert Score + Kandidaten).
3. Soft-Link-Pointer + Canonical-Reads (Reuse/Prefill).
4. Login-als-Tor: Match-Check bei Login/Signup → Auto-Assign (stark) / Selbst-Confirm (mittel).
5. Flow-Inline-Auth + Prefill (Consumer).
6. (später) Hard-Merge + Provenance + Split + Vorschlags-Queue.

---

## 13. Review-Schärfungen (Berater-Review 2026-06-03)

Spec freigegeben — der Kern (§2 Leak≠Dedup, §5 Login-als-Tor, §3 Soft/Hard-Merge, YAGNI) ist stark und trifft den North Star. Vier Pflicht-Ergänzungen vor dem Bau:

**A) §2 „Soft-Link leakt nichts" hat eine Ausnahme: Prefill.** Ein falscher Soft-Link gewährt keinen *Zugriff*, aber **Prefill** (§7) der gematchten Person-PII in einen Flow, den nicht diese Person kontrolliert, ist ein Leak über die Hintertür. → **Regel:** PII-Prefill über einen Soft-Link nur bei **verifiziertem/starkem** Signal **oder nach Self-Login** — nie auf weichem Match im anonymen Flow. Internes Dedup darf aggressiv sein; PII-Prefill an einen Unauthentifizierten nicht. (Die §5-Matrix deckt das *nach* Auth ab; der anonyme Vor-Auth-Prefill in §7 ist die Lücke.)

**B) Gegner→Kunde an harten Brücken festmachen, nicht an Namen.** Fuzzy Name+GebDat ist beim Gegner (Dispatcher-getippt) oft schwach → False-Split, der genau den Reuse verfehlt. Die zuverlässigen Brücken existieren schon: der **`airdrop_token`** (Invite→Accept = beweisbare Kette) und die **`vehicles.fin`** des Gegner-Fahrzeugs. → `airdrop_token` als **harte Gegner-Identitäts-Brücke** behandeln (nicht nur Verified-Contact-Quelle), Fuzzy nur Fallback.

**C) Fahrzeug als Identitäts-Signal ergänzen (§4).** Menschen sind unscharf, **FINs exakt.** Gleiche `vehicles.fin` über Claims → sehr wahrscheinlich derselbe Halter. Als eigenes Tier „stark (amtlich)" aufnehmen — koppelt sauber an vehicles + claim_vehicle_involvements.

**D) Sequencing gegen Phase 5 (Flat-Drop).** Die Match-Engine liest Konfidenz-Inputs (name/gebdat/email/telefon), die heute noch auf `claim_parties` liegen. **Phase 5 darf diese Felder NICHT droppen, bevor `personen` die bestätigte Lese-Quelle der Engine ist** — sonst verliert die Engine ihre Inputs. Reihenfolge festschreiben: erst `personen` = Engine-Quelle, dann claim_parties-Personfelder droppen.

**Zu §10:** beide Empfehlungen bestätigt — **User-first Self-Confirm (Admin-Fallback)** + **proaktives Auth-Angebot bei starkem Match**. Das Tor (§5) macht beides sicher.

**Harte Gates (Wiederholung):** §2-Invariante (RLS nie auf `person_id`) bleibt unverhandelbar; und diese Spec ersetzt **nicht** die offenen Ursprungsplan-Phasen 4 (Reader-Repoint) + 5 (Flat-Drop) — die müssen unabhängig zu Ende.
