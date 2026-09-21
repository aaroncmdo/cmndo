# J8 — Onboarding je Rolle (SV, Werkstatt, Kanzlei)

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> **Soll = das Netzwerk-Ökosystem-Modell** (Lane 332d22f1, [[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]] —
> Design komplett, Epic paused). Verfassung §10: die Journey beschreibt das **Ziel-Modell**, nicht den Alt-Bestand.
> Abgestimmt mit a6c863e2 (DECISIONS.md): Org/Verwalter/Pool-Lead retired — die kanonische SV-Struktur ist der Netzwerk-Graph.

**Rollen:** SV · Werkstatt · Kanzlei (je selbst) · KB/Admin (verifiziert, schaltet frei) · System (Stripe, Entitlement).
**Vorbedingungen:** ein Account (Self-Signup oder Cold-Mail-Einladung).
**Startpunkt(e):** SV-Registrierung · Werkstatt (Nachfrage-Seite, frei) · Kanzlei-Einladung (KB).

## Ablauf (Soll)

Gemeinsames Muster: **Registrieren → Stammdaten/Nachweise → Verifikation (48h Admin) → Freischaltung → sichtbar/arbeitsfähig.**
Jede Selbstanlage läuft durch **createCase/C2** (§5 „ein Intake" — kein neuer wilder Entry-Point).

**Team-Echtzeit-Sichtbarkeit** (Soll-Delta 05.08.): Jede Partner-Selbstregistrierung aus dem
Marketing-Funnel (Werkstatt-, Makler-, Flotten-Self-Signup, SV-Registrierung App +
LP-embedded) löst zusätzlich zur Admin-In-App-Notification/-Task eine **Team-WhatsApp**
aus (`notifyTeamPartnerSignup` → `notifyTeamWhatsApp`, feste Team-Nummern via Baileys —
dieselbe Empfänger-Quelle wie der Lead-Notify). Interne/Test-Identitäten sind unterdrückt
(`interne-identitaet.ts`) — der Schritt ist deshalb nicht CI-smokebar; Beweis = Regel-4-
Prod-Smoke mit externer Wegwerf-Identität.

### A · Sachverständiger (SV) — Freemium
1. **Registrieren** — **kostenlos für alle** (kein DAT-Gating mehr). Büro-Daten, SV-Typ, Einzugsgebiet/Geo, optional Whitelabel-Branding.
2. **Automatische Freischaltung** (Soll-Delta 19.09.2026, Aaron: „ich möchte nicht mehr verifizieren und ich möchte auch nicht mehr nachhalten müssen, ob die Dokumente fehlen oder nicht … Damit soll er wirklich verifiziert und buchbar sein"): Mit dem Wizard-Abschluss (Basic: Unterschrift Partnervertrag; bezahlt: Zahlungseingang/Gutschein/Büro) setzt **ein** Freischaltungs-Patch an **jedem** Eingang `portal_zugang_freigeschaltet`, `ist_aktiv` **und `verifiziert`** — ohne Admin-Klick. Danach sofort im Dispatch-Pool, im Gutachter-Finder, im MCP und mit Siegel in der Kunden-Fallakte (Gate: Portal + aktiv + nicht gesperrt + Geo). Einzige Ausnahme: **Geo-Guard** — ohne verortbare Adresse kein Kartenpunkt → der SV erfährt den Grund, der Admin bekommt genau eine Nachhol-Aufgabe („Profil freischalten" = Nachhol-Weg, nicht Regelweg). **Dokumente sind Zubehör, kein Tor:** Berufshaftpflicht, Gewerbeanmeldung, Sicherungsabtretung/Honorarvereinbarung, Datenschutzerklärung und Widerrufsbelehrung lädt der SV im Wizard (eigener optionaler Schritt, Basic **und** bezahlt) oder jederzeit unter „Nachweise" hoch; ein Upload wirkt sofort im Kundenflow (J3: Mit-Signatur + FlowLink-Links), ohne Prüf-Task, ohne Frist. *(Ersetzt: „Verifikation — Admin prüft (48h) → `verifiziert=true`"; die Tier-2-Frist vom 08.08. — siehe Variante unten — ist zurückgenommen.)*
3. **Netzwerkpartner werden** (Haupt-Preismodell, optional) — **Monats-Flatrate + einmalige Einrichtungsgebühr, beide via Stripe** (Single Subscription-Checkout mit Setup-Fee-Item). Entitlement **derive-at-read** aus `sv_netzwerk_abonnements`. Ergebnis: **Netzwerkpartner-Badge + Ranking-Boost** (J10).
4. **Rechtsform** — Nudge bei NULL (#4798) bleibt.

### B · Werkstatt — frei (Nachfrage-Seite)
5. **Zugang frei** — die Werkstatt zahlt nichts (sie ist die Nachfrage-Seite: bringt Reparaturaufträge). Sie erhält **Provision + einen konkreten Gutachter** aus dem Matching (Onboarding-Mailsequenz-Versprechen).
6. **Stammdaten** — Adresse/Geo, freie Werkstattwahl, Marken/Gewerke. Sichtbar im Werkstatt-Finder nach Verifikation.

### C · Kanzlei
7. **Einladung** — KB legt die Kanzlei an (KB-Kanzlei-Lifecycle #4630, kb-Whitelist) → `/kanzlei`-Portal, `kanzlei_faelle`-Scope (RLS). Bekommt Fall-Pakete (J6).

### Soll-Delta 20.09.2026 — Partnervertrag für Basic wird nachgeholt

Aaron am 20.09.2026, auf die Frage, ob die Basic-Gutachter ohne Partnervertrag beim nächsten Login
einmalig, nicht blockierend zur Unterschrift geführt werden: **„3 ja."**

Gemessen am selben Tag auf prod: **16 von 22** freigeschalteten Basic-Konten hatten keinen
unterschriebenen Partnervertrag, **0** von ihnen eine Zeile in `vertraege_unterzeichnet`. Ursache:
die Auto-Freischaltung vom 19.09. schaltet frei, ohne den Wizard-Abschluss zu verlangen, der den
Vertrag sonst erzeugt hätte.

**Soll:**

1. Ein Basic-Gutachter ohne unterschriebenen Vertrag wird beim nächsten Aufruf des Portals **einmal**
   auf `/gutachter/vertrag?nachholen=1` geleitet. Der Marker `sachverstaendige.partnervertrag_hinweis_am`
   wird **vor** der Umleitung gesetzt, deshalb greift sie höchstens einmal je Konto.
2. Die Seite zeigt die echte Vorlage `sv_basic_partnervertrag` — nicht mehr die Kooperations­vereinbarung
   mit Paket-Staffel und Anzahlung, die für ein Basic-Konto inhaltlich falsch war.
3. Unterschreibt er, läuft dieselbe Pipeline wie im Basic-Wizard: PDF im Bucket `vertraege` plus Zeile
   in `vertraege_unterzeichnet`, `vertrag_unterschrieben=true`.
4. Klickt er „Später erledigen", passiert **nichts Negatives**: Zugang, Sichtbarkeit, Buchbarkeit und
   laufende Fälle bleiben unverändert. Ein stilles Hinweisband im Portal führt weiterhin zur
   Unterschrift, bis sie vorliegt.

**Messbar erreicht,** wenn die Zahl der Basic-Konten mit `vertrag_unterschrieben=false` sinkt und je
Unterschrift eine Zeile in `vertraege_unterzeichnet` mit `vorlage_typ='sv_basic_partnervertrag'` und
gefülltem `pdf_storage_path` entsteht.

## Varianten / Abzweige

- **Bestands-SV mit `paket`** — Per-Fall-Pakete werden **nicht mehr verkauft** (retired); Bestand behält Fulfillment und wird als Netzwerkpartner **comped** (`paket` = Legacy-Fulfillment, **nie überschreiben** — 5 Consumer).
- **Cold-Mail-Einstieg** (SV/Werkstatt) — CTA aus der Kampagne → vorbefüllter Signup.
- **Netzwerk-Kalt-Einladung** (alle drei Partner-Rollen — Soll-Delta 04.08., Followup-a): Ein
  bestehender Partner lädt per E-Mail ein (`?einladung=<token>` auf dem jeweiligen
  Registrier-Pfad). Nach erfolgreicher Registrierung wird die Einladung eingelöst und die
  **Freund-Kante automatisch `angenommen`** (die Einladung ist die Anfrage, die Registrierung
  die Annahme). Redemption ist best-effort — ein Token-Fehler bricht die Registrierung nie.
  (Vorher nur Werkstatt; SV `/sv/registrieren` + Makler `/makler/registrieren` nachgezogen;
  **Flotte `/flotte/registrieren` = NEUER Self-Signup-Flow** — Soll-Delta 05.08., Aaron
  „Firmen als Partner hinzufügen": public Formular → `ensureFirma` find-or-create +
  Flottenmanager-Konto (Reuse Admin-Kern, `aktiviertVon=null`) + Welcome-Mail + Team-WA +
  Redemption. Vorher war die Flotte ausschliesslich admin-provisioniert.
  Marketing-Einstieg: flotte.claimondo.de (Subdomain-LP, CTA -> Self-Signup) —
  analog werkstatt.claimondo.de fuer Werkstaetten.)
- ~~**Tier-2-Dokumente-Frist nach Freischaltung**~~ — **ZURÜCKGENOMMEN 19.09.2026** (Aaron: „nicht mehr
  nachhalten, ob die Dokumente fehlen … trotzdem angezeigt und sogar auch buchbar"). Keine Frist, kein
  `frist_ueberschritten`-Dispatch-Stopp, kein Reminder-Cron, kein Prüf-Task je Upload; Bestand per Migration
  bereinigt (3 gesperrte SVs wieder buchbar, 19 Fristen gelöscht, 14 Siegel nachgezogen). Der Absatz bleibt als
  Geschichte stehen: (Soll-Delta 08.08., Aaron „Option B"): Jeder
  freigeschaltete SV ohne geprüfte **Berufshaftpflicht + Gewerbeanmeldung** erhält 14 Tage Frist
  ab Freischaltung (`verifizierung_status='ausstehend'` + `verifizierung_frist_bis`). Nach Ablauf →
  `frist_ueberschritten` → **Fall-Empfang pausiert** (bestehendes FG3-Gate `svDarfFaelleEmpfangen`),
  KEIN Zugangsverlust; Reaktivierung nach Doc-Prüfung (`tier2Freigeben`) oder Admin-Frist-Verlängerung
  (`tier2FristVerlaengern`). Für Paid + Basic. Die Freischaltung setzt `verifizierung_status` NICHT mehr
  blind auf `geprueft` (das war der Bypass, der 9 SVs ohne Docs dispatchbar machte, prod 08.08.).
  Spec: `docs/superpowers/specs/2026-08-08-tier2-dokumente-enforcement-design.md`.
- **Werkstatt-Interesse-Formular retired** (Soll-Delta 05.08., Aaron „Anfrage = sofort
  Partner"): `/werkstatt-partner-werden` (erzeugte nur einen `partner_leads`-Prospect ohne
  Account) ist zugunsten des Self-Signups `/werkstatt/registrieren` retired — 308-Redirect
  via `next.config.ts`, Cold-Mail-`Registrierungslink` zeigt direkt auf den Self-Signup.
  Es gibt EINEN Werkstatt-Funnel; `partner_leads` wird nur noch durch Scrape/CSV/CRM-Spiegel
  befüllt, nicht mehr durch ein öffentliches Formular.
- **Whitelabel-SV** — verifizierter SV mit `use_custom_branding` brandet Portal + Kunden-Sicht.

## Fehlerfälle und ihr Soll-Verhalten

- **Abo-Checkout scheitert** (Stripe) → SV bleibt verifiziert + kostenlos gelistet, nur ohne Netzwerkpartner-Boost; kein Zugangsverlust.
- **Entitlement-Guard-Lücke** → die Privilegien-Prüfung (`guard_sachverstaendige_privilegien`) muss derive-at-read sein, sonst hängt ein gekündigtes Abo als Zombie-Boost nach.
- **Unvollständige Stammdaten** → Onboarding-Slot bleibt offen sichtbar; keine Freischaltung, kein toter Zustand.

## ⚠ IST weicht ab (mit Fundort)

1. ~~Netzwerkpartner-Abo noch nicht gebaut~~ **ERLEDIGT (P5, live seit R219 03.08. + Ask-Fix 04.08.):** Abo end-to-end (Checkout+Webhook+Dunning), Ranking-Primärsignal = Abo (`istNetzwerkpartner`, seit P2), Ask im Onboarding-Abschluss beider SV-Flows erreichbar (Basic: auf dem PendingReview-Screen — der Wizard-Completed-Screen wird nach finalize serverseitig ersetzt) + Einstellungen-CTA. Whitelabel ist seit 04.08. Paid-Perk (Abo/Paid-Paket-gebunden).
2. **DAT-Gating noch aktiv:** die Registrierung ist im Bestand teils DAT-/paket-gegatet — Soll: offen für alle. (Basic-SV-Freischaltung #4302 ist der Näherungs-Vorläufer.)
3. **Werkstatt-Self-Onboarding fragmentiert:** Anlage-Pfade setzen `ist_freie_werkstatt`+Gewerke (#4787) und es gibt `werkstatt.claimondo.de`, aber **kein kohärenter Self-Anlege-Produkt-Flow** (offene Produkt-Entscheidung der Netzwerk-Lane). `ist_freie_werkstatt=null` macht die Werkstatt zudem still unsichtbar.
4. **Redirect-Stub-Historie:** `/gutachter/onboarding` war ein reiner Redirect-Stub (leere Shell, 06.–07.07.) → per `next.config.ts`-Redirect gefixt.

## Offene Fragen an Aaron (max. 5)

1. **Setup-Fee-Höhe + Abo-Preis:** Konkrete Zahlen für die Netzwerkpartner-Einrichtungsgebühr + Monats-Flat?
2. **Comp-Politik Bestand:** Werden **alle** Bestands-`paket`-SV als Netzwerkpartner comped, oder nur aktive?
3. ~~**Werkstatt-Onboarding:** Bekommt die Werkstatt einen echten Self-Anlege-Flow, oder bleibt sie admin-/mailsequenz-getrieben?~~ **Beantwortet 05.08. (Aaron):** Self-Signup `/werkstatt/registrieren` ist der kanonische Weg; das Interesse-Formular ist retired.
4. **DAT-Gating-Abbau:** Soll die Registrierung sofort für alle offen sein, oder gestaffelt?
