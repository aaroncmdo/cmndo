# FUNDAMENT — Decision-Log

Append-only. Protokoll aller Entscheidungen, die während der Fundament-Rückführung getroffen
wurden, wenn weder `FUNDAMENT.md` noch die Journeys sie vorgaben (siehe `FUNDAMENT.md` §0.2
„Spec-Lücke" und §8 „DECISIONS.md-Protokoll"). Format je Eintrag:

```
## <YYYY-MM-DD> · <Paket> · <Kurztitel>
**Lücke:** <welche Entscheidung fehlte>
**Entscheidung:** <was gewählt wurde>
**Begründung:** <nach Verfassungs-Prinzip Nr. X / Journey JN>
**Review:** offen | bestätigt (Aaron, <datum>) | revidiert → <Folge-Ticket>
```

Neue Einträge werden **unten** angehängt. Bestehende Einträge werden nicht umgeschrieben — eine
Revision ist ein neuer Eintrag bzw. eine aktualisierte `Review:`-Zeile mit Datum.

---

## 2026-07-28 · Bug3 (C2/C4-Vorgriff) · Logged-in-Redirect -> onboarding-details kanonisch
**Lücke:** Welche Erhebungs-Strecke ist kanonisch für eingeloggte Kunden — /flow FlowWizardKfz (Flow A, leads.*) oder /kunde/onboarding-details (Flow B, claims.*)? Beide erheben Unfall-Hergang/Service/Kanzlei/SA in teils anderen Spalten (leads.unfallhergang vs claims.hergang_kunde_text) = die "zwei Feststellungen".
**Entscheidung:** onboarding-details (Flow B) ist kanonisch für eingeloggte Kunden; FlowWizardKfz bleibt anon/Magic-Link-Fallback. Der Logged-in-Redirect (src/app/flow/[token]/page.tsx) lag tot im try/catch (NEXT_REDIRECT wurde ohne isRedirectError-Re-throw verschluckt) und wurde reaktiviert (redirect ausserhalb des try).
**Begründung:** Verfassung §4 (eine Akte) + §5 (ein Intake); folgt dem Funnel-v2-Plan (docs/plans/funnel-vereinfachung-2026-05-11.md — "/kunde/onboarding ersetzt FlowWizardKfz"). Dedup: convertLeadToClaim kopiert leads.unfallhergang -> claims.hergang_kunde_text.
**Review:** offen (Aaron) — Regel-4-Prod-Smoke 28.07. GELAUFEN (Session 264a7df6, 4 geseedete Sub-Faelle, echte UI, Seeds aufgeraeumt): (a) ERLEDIGT. Kernpfade GRUEN wie entschieden: offene Feststellung -> Redirect /kunde/onboarding-details mit hergang-Phase; SA-offen (haftpflicht) -> FokusSignatur direkt auf /flow/<token>. VERFEHLT: "erledigte Feststellung -> Fallakte" — die felderlose sa-Phase (onboarding_phasen kunde-onboarding, ord 40, 0 Felder) ist fuer den Server-Skip (`pflichtFelder.length > 0`-Guard in ladeNoetigePhasen) nie skippbar -> `phases.length === 0` unerreichbar -> der Fallakte-Redirect in onboarding-details/page.tsx ist toter Code; ein Kunde mit laengst signierter SA sieht stattdessen Schritt 1/1 "Schaden-Abtretung unterschreiben" (irrefuehrende Aufforderung, kein Bruch/500/Sackgasse -> kein Revert, fix-forward). (c) BESTAETIGT: hergang-Skip+Prefill sehen nur claims.hergang_kunde_text — leads.unfallhergang wird weder geskippt noch vorbefuellt (textarea leer, per eval verifiziert) = Doppel-Erhebung; Bestand quantifiziert 0/6 echten Kunde-Claims in dieser Konstellation -> dormant, fix-forward statt Revert. (b) unveraendert offen. NEU (Nebenbefund): Wizard-localStorage-Key `claimondo-wizard-state:<flowKey>` traegt keine fallId -> Restore-Banner uebernimmt Zustand aus dem ZULETZT bearbeiteten Fall desselben Kunden (Cross-Fall-Contamination bei Mehrfall-Kunden).
