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
**Review:** offen — ad-hoc via PR #4810 gemerged UND bereits auf origin/main (PROD) deployed, bevor die Grounding-Bremse griff. Grounding daher retroaktiv. OFFEN: (a) Regel-4-Prod-Smoke eingeloggter Kunde + Fall (offene vs erledigte Feststellung -> onboarding-details vs Fallakte); (b) greift C2 (createCase) / C4 (eine Akte) vor — bei deren Bau berücksichtigen; (c) narrative-dedupe-Edge (claim mit leerem hergang_kunde_text fragt in Flow B erneut) noch offen.
