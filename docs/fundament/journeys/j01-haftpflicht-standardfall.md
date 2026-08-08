# J1 — Haftpflicht-Standardfall (end-to-end)

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Der unverschuldete Haftpflicht-Fall mit **Komplettservice** (SV + Kanzlei) ist die Kern-Wertschöpfung.
> Status-Achse = `claims.operative_status` (Werte verifiziert per DB-CHECK 28.07.); Events = A3-EVENT_MATRIX (#4823);
> die exakte Übergangs-Matrix (Zustand×Event→Folgezustand) liegt bei **A2 (State-Machine)** — hier das Journey-Rückgrat.

**Rollen:** Kunde (Geschädigter) · Dispatch · Sachverständiger (SV) · Kundenbetreuer (KB) · Kanzlei · Versicherung (VS, extern) · Makler (optional, Vermittler).
**Vorbedingungen:** unverschuldeter Kfz-Haftpflichtschaden (Schuldfrage = Gegner); `service_typ='komplett'`.
**Startpunkt(e):** jeder Meldeweg aus **J2** → Lead + FlowLink. J1 beginnt, wenn der Kunde den FlowLink öffnet.

## Ablauf (Soll)

1. **Kunde öffnet FlowLink** (`/flow/[token]`) → Feststellung/Schaden erfassen, Qualifizierung (Schuldfrage bestätigt Gegner → Haftpflicht-Weg). **Screen:** account-loser Flow-Wizard.
2. **Kunde wählt Gutachter-Termin** (Slot eines passenden SV) → System reserviert den Slot **soft** (`sv-termin`); **Notif:** SV `termin.sv_bestaetigt` (web_push/in_app), Kunde WA-Bestätigung. **Wunschtermin-Zweig (kein passender/echter SV, z. B. Dead-Pin):** der gewählte Slot wird als Terminwunsch festgehalten (Termin-Status `dispatch_pending`/`sv_gesucht`), der Kunde sieht ihn durchgängig als „Wunschtermin · wird bestätigt" (Akte-Terminsektion + Termine-Hub), und der Wunsch landet in der Dispatch-Terminwunsch-Queue mit SLA — nie ownerlos (Spec 2026-08-05 §2/§4.3/§4.4).
3. **Kunde unterschreibt SA (Abtretung) + Vollmacht** → **Konversion: Lead → Claim** (`convertLeadToClaim`, SSoT). Die Konversion **übernimmt offene Lead-Termine auf den Fall** (bezug `'fall'`, T1 — der gewählte Termin bleibt in der Akte sichtbar). Status-Cursor 3-stufig ehrlich: echter SV am Termin → `sv-termin`; nur Terminwunsch → `sv-gesucht`; sonst `ersterfassung` (T2). `sa_unterschrieben=true`, `abtretung_pdf` gesetzt. **Events:** `fall.created` + `sa.signed`. **Slots:** Pflichtdok-Katalog Haftpflicht (Vollmacht/Gutachten/Versicherer). **FlowLink:** verbraucht + geschlossen. **Notif (Soll):** EIN Willkommens-Set an den Kunden (WA/Email), SV-Auftrag verbindlich, KB/Admin in_app, Makler (bei Consent) in_app. **Screen:** Kunde landet im Portal (`/kunde/faelle/[id]`) bzw. bekommt Login-Daten; Dispatch/KB sehen den neuen Claim.
4. **SV-Zuweisung fixiert** (`sv-zugewiesen` → `sv-termin`) → `fall.sv_assigned`; KB per `fall.sv_assigned` informiert (P1.3-Rückport).
5. **SV führt die Besichtigung durch** (`besichtigung`/`termin_durchgefuehrt`) → SV erstellt das Gutachten (`begutachtung-laeuft` → `gutachten-eingegangen`). **Event:** `gutachten.fertig` → Kunde WA/Email + PDF, Makler in_app.
6. **Interne Qualitätssicherung** (`filmcheck` → `qc-pruefung`) → Claimondo prüft das Gutachten (Foto-/Plausibilitäts-Check); bei Mangel `gutachten.nachbesserung` an den SV.
7. **Kanzlei-Übergabe** (`kanzlei-uebergeben`) → Komplettservice = LexDrive-Partnerkanzlei automatisch (`kanzlei_wunsch='partnerkanzlei'`). **Events:** `kanzlei.uebergabe`, `claim.kanzlei_paket_versendet`; Kanzlei-Portal-Glocke (P1.2). **✅ C3b (05.08.):** der redundante System-2-`sendFallCommunication('kanzlei_uebergabe')` in `filmcheck.ts:168` ist entfernt — der System-1-`kanzlei.uebergabe`-Event (kunde-WA) deckt den Kunden ab; der 2. Site (`dispatch-fall-actions.ts`) folgt post-#5011-Merge. **Screen:** Kunde sieht „an Kanzlei übergeben".
8. **Anspruchsschreiben an die VS** (`anschlussschreiben`) → Kanzlei sendet die Forderung an die gegnerische Haftpflicht. **Event:** `kanzlei.as_gesendet` (Kunde WA). **Frist:** 14 Tage; Eskalations-Cron (`eskalation.vs_frist`, Stufen 14/21/28).
9. **VS reguliert** (`regulierung` → `regulierung-laeuft`) → **Event** `regulierung.ergebnis` (voll/teilweise/Kürzung). Bei Kürzung: Rüge (`regulierung.ruege_gesendet`) / ggf. technische SV-Stellungnahme / Nachbesichtigung (`nachbesichtigung-laeuft`).
10. **Zahlung eingegangen** (`zahlung-eingegangen`) → **Event** `auszahlung.veranlasst` (Kunde WA/Email/Push). → **Abschluss** `reguliert_vollstaendig` / `abgeschlossen`; `claim.reguliert` an Kunde/KB/Admin/Makler/Flotte/Kanzlei.

## Varianten / Abzweige

- **`nur_gutachter`** (Kunde reguliert selbst): kein KB, keine Kanzlei; endet nach Schritt 6 mit Gutachten-Übergabe an den Kunden.
- **Kasko / Selbstzahler** (nicht unverschuldet): eigener Abrechnungsweg → **J5**; Reparatur-Strecke → **J4** (Status `reparatur-*`).
- **Makler-vermittelt:** Attribution via `promotion_code_id` → `claims.makler_id`; Provision + `makler.lead_eingegangen`/`makler.provision_status` (→ **J9**).
- **VS-Kürzung / Ablehnung:** `vs-kuerzt`/`vs-abgelehnt`/`abgelehnt` → Rüge → ggf. `klage`/`klage_rechtsstreit` (→ Kanzlei-Eskalation).

## Fehlerfälle und ihr Soll-Verhalten

- **Kein passender SV** → weicher Hold + Dispatch-Task; Claim bleibt bestehen (Reservierung nie Hard-Fail). → **J10**.
- **SA nachzusignieren** (Kunde bricht ab / Nachforderung) → Portal-Resurface „Unterschrift ausstehend" mit funktionierendem Link zurück in den Flow. → **J3**.
- **VS antwortet nicht** → Fristen-Eskalation (14/21/28 Tage), Kunde + Kanzlei informiert; kein stiller Stillstand.
- **Storno / DSGVO-Löschung** → `storniert`; Status-Übergang über die Engine (Timeline!), nicht direkt. → **J7**.

## ⚠ IST weicht ab (mit Fundort)

1. **Notification-Redundanz am Konversionsmoment (Schritt 3):** statt EINES Willkommens-Sets feuern **bis zu 6 Kunden-WhatsApp ohne gemeinsamen Dedup** (`flow/[token]/actions.ts:750/1306/1312/1421` direkt + kanonische `fall.created`/`sa.signed` `:1554-1555`). Belegt in A3 (#4823 §5.3). SV-seitig 3 Direkt-Sends statt `termin.sv_bestaetigt` über emit.
2. **Zwei Sende-Systeme + zwei In-App-Bells** — viele Übergänge senden über `sendFallCommunication` (Kunde-only, kein Dedup) statt über emit+fan-out; die Multi-Rollen-Matrix (Flotte/Kanzlei/KB) läuft dort ins Leere (A3 §1/§5). **✅ C3a-Delta (05.08.):** die `updateFallStatus`-Statuswechsel-Sends (`dispatch-fall-actions.ts`, 9 Trigger — `sv_losgefahren`/`termin_bestaetigt`/`regulierung_angekuendigt`/`fall_abgeschlossen`/`kanzlei_uebergabe`/`as_gesendet`/`zahlung_eingegangen`/`termin_storniert`/`chat_fallback_kunde`) laufen jetzt über die **Notification-Outbox** (`enqueue` → `dedup_key` UNIQUE = idempotent/kein Doppel-Send bei Doppel-Submit, Retry-Backoff, **endgültiger Fehlschlag → sichtbarer Dispatch-Task** statt stillem `.catch(()=>{})`). Rest von System 2 (SA-Moment IST #1, `gutachten_fertig` IST #7) + die Multi-Rollen-Matrix bleiben **C3b**. Nachweis: Regel-4-SQL-Smoke (Dedup/Versand/Fehler→Task) — Backend-Durability, kein UI-Journey-Step.
3. **Status-Umgehungen** — der Reparatur-Abschluss war ein Direkt-Write auf `operative_status` (Werkstatt-Bypass, Operativ-Audit 17.07.), umging die Engine → kein Event/keine Timeline. Das Operative-Status-Write-Gate (Ratchet) schließt neue Fälle; Bestand per Boy-Scout.
4. **Redundante/duplizierte Status-Achse** — `operative_status` hat 33 Werte inkl. offensichtlicher Dubletten (`abgelehnt`/`abgelehnt_final`, `regulierung`/`regulierung-laeuft`, `besichtigung`/`termin_durchgefuehrt`) → A2 (State-Machine) klärt tote/redundante Werte.
5. **KVA-ohne-Betrag-Deadlock** (Reparatur-nah, J4): ein KVA ohne Betrag war speicherbar → Kunde bekam keine Freigabe (stiller Deadlock, #4804). Zeigt die Klasse „Soll-Erwartung nicht erzwungen".

6. **SV-Zuweisung umgeht die Engine (WILD-Writer, Schritt 3):** die Dispatch-API `sv-zuweisung/route.ts:284` schreibt `operative_status` per Type-Cast (`(claimsUpd as Record<…>).operative_status = …`) direkt → **kein `fall.status_changed`-Event, keine Timeline/`phase_transitions`**; der Cast macht den Write zusätzlich für den Operative-Status-Write-Ratchet unsichtbar (A2-Fund #6). Bei der SV-Findung läuft der Event-Fan-out an Makler/Flotte/Kanzlei leer. Soll: über die Engine (→ C1).
7. **`gutachten_fertig` Doppel-WhatsApp (Schritt 5):** `gutachter/fall/[id]/actions.ts` feuert in derselben Action `sendFallCommunication('gutachten_fertig')` (:225) **und** `emitEvent('gutachten.fertig')` (:231) → **zwei** WhatsApp an den Kunden. **✅ C3b-Fix (05.08.):** der redundante System-2-Send (`sendFallCommunication('gutachten_fertig')`) ist entfernt — System 1 `emitEvent('gutachten.fertig')` deckt den Kunden voll ab (EVENT_MATRIX `kunde: whatsapp+email+web_push`) + Fan-out an SV/Makler/Admin. (Outbox-Dedup hätte NICHT geholfen — eigenes Pipeline, kein gemeinsamer Dedup mit System 1; die Auflösung ist Entfernen des redundanten Sends.) Kunde bekommt jetzt EINE `gutachten.fertig`-Nachricht.
8. **Abschluss-Pfad fragmentiert + toter Grace-Cron (Schritt 10, verifiziert 28.07.):** Der lebende Auto-Close ist die Engine-Cascade `regulierung/in_kommunikation_vs/abgelehnt → abgeschlossen` — **sofort**, getriggert von `claim_payments.vs.zahlungseingang_am` (via `erfasseZahlungseingang → checkFallAutoPhase`, `autophase-decision.ts:72`). Der 48h-Grace-Cron `cron/fall-abschluss` (KFZ-205) ist dagegen **tot**: sein Gate `schlussabrechnung_am` wird **nirgends** geschrieben (0/23 Prod-Claims, kein Code-Writer — nur gelesen). Die gewollte 48h-Karenz existiert faktisch nicht. `zahlung-eingegangen` ist ein **Orphan-Knoten**: der lebende Close überspringt ihn; nur das **unverdrahtete** `recordZahlung` (`kanzlei-paket.ts:239`, nur Barrel-Export, kein UI-Caller) landet dort → dann Trap (kein `case 'zahlung-eingegangen'` in der Cascade, Cron tot). Dazu der zweite Terminal: Endzustand-Direkt `markClaimAsReguliert → reguliert_vollstaendig` (`endzustand-actions.ts`, umgeht die Engine → kein Event/SLA/Billing-Hook). **Latent** (0 Prod jenseits `kanzlei-uebergeben`). Soll: EIN Abschluss-Pfad, EIN Terminal, definierte (oder keine) Karenz (→ C1).
9. **Template-Mislabeling (Schritt 3):** Dispatch `updateFallStatus('sv-zugewiesen')` feuert das Template `sv_losgefahren` (`dispatch-fall-actions.ts:85`), obwohl der SV noch nicht losgefahren ist.

## Offene Fragen an Aaron (max. 5)

1. **Status-Dubletten:** sind `abgelehnt` vs. `abgelehnt_final`, `regulierung` vs. `regulierung-laeuft`, `besichtigung` vs. `termin_durchgefuehrt` bewusst getrennte Zustände oder Retire-Kandidaten? (Input für A2.)
2. **Willkommens-Set (Schritt 3):** was ist das Soll — welche EINE WhatsApp bekommt der Kunde direkt nach SA (statt der 6)?
3. **QC-Phase (Schritt 6):** ist `filmcheck` + `qc-pruefung` immer beides, oder szenario-abhängig?
4. **Kanzlei-Zwang:** ist `komplett` = LexDrive-Partnerkanzlei **immer** (kein Kunde-Opt-out mehr), oder bleibt der Wechsel auf eigene Kanzlei ein Journey-Schritt?
5. **Kanonischer Abschluss-Pfad:** der 48h-Grace-Cron ist tot (`schlussabrechnung_am` nie gesetzt) — soll die **48h-Karenz** (KFZ-205) wiederhergestellt werden (dann: was setzt `schlussabrechnung_am`?) oder ist der **sofortige** Cascade-Close das Soll (Cron retiren)? Und welches EINE Terminal — `abgeschlossen` (Cascade) vs. `reguliert_vollstaendig` (Endzustand)?
