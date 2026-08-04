# Admin-Server-Actions-Audit (04.08.2026)

Auftrag Aaron 03.08.: "server action audit von den admin pages, damit wir funktionen saubermachen koennen".
Scope: alle 55 'use server'-Files unter `src/app/admin/**` (~125 exportierte Funktionen, staging-Stand
`9a25f4038`), 4 parallele Audit-Agenten. Pruefraster je Funktion: (1) Auth-Guard (2) Result-Shape
(3) revalidatePath (4) Consumer (5) AAR-664-Exporte (6) Duplikate.

## Executive Summary

- **3 echte Auth-Luecken gefunden — alle im begleitenden PR GEFIXT:**
  1. 🔴 `tasks/actions.ts` createTask/updateTaskStatus/deleteTask: `await requireRole(['admin'])` als
     No-op (requireRole liefert GuardResult, WIRFT NICHT — Rueckgabe wurde nie geprueft; ein frueheres
     Audit hatte den Aufruf ergaenzt, aber die Pruefung vergessen). Einziger Schutz war RLS.
  2. 🔴 `sv-leads/actions.ts` getSvLeads: einziger Export des Files ohne Guard — service-role-Read auf
     sv_leads-PII (Name/Firma/Telefon/Email) fuer jeden eingeloggten User als POST-Endpoint erreichbar.
  3. 🟠 `sachverstaendige/[id]/actions.ts` updateSvProfile: presence-only-Check (kein Rollen-Check,
     anders als alle Nachbar-Actions) — Profil-/Paket-Writes nur RLS-gefangen.
- **1 HOCH-Fund (Money, Produkt-Entscheid noetig — NICHT gefixt):** Zwei divergierende Storno-Pfade;
  der im Finance-Hub verdrahtete storniert ohne Stripe-Refund/Storno-Rechnung/Mail (Details unten).
- Sonst KEIN fehlender Guard in ~125 Funktionen. Hauptschulden: **Duplikate** (Storno 2x,
  bezahlt-markieren 3x, Staffel-Actions 2x, Flotten-Loader 2x, requireAdmin-Helfer 7-13x,
  randomPassword 3x, blockUser 2x), **tote Actions** (~5), **Legacy-`{success}`** in 2 Clustern,
  vereinzelte **Silent-Fail-Risiken**.

## Priorisierte Aufraeumliste

| Prio | Fund | Ort | Status/Fix |
|---|---|---|---|
| 🔴 | Guard-No-op createTask/updateTaskStatus/deleteTask | admin/tasks/actions.ts | ✅ GEFIXT (guard.success-Muster wie reassignTask) |
| 🔴 | getSvLeads ohne Guard (PII, service-role) | admin/sv-leads/actions.ts | ✅ GEFIXT (requireAdmin, unauthorized -> []) |
| 🟠 | updateSvProfile ohne Rollen-Check | admin/sachverstaendige/[id]/actions.ts | ✅ GEFIXT (admin-Check wie Nachbarn) |
| 🔴 | **Storno ohne Stripe-Refund live**: `storniereAbrechnung` (Finance-Hub, AbrechnungenSection:66) setzt nur status='storniert' — kein Refund/Storno-Rechnung/Mail; `stornoAbrechnung` (abrechnungen/, ListClient+partner-billing) macht das volle Programm. Caller prueft Result nicht. | finance/abrechnungen-actions.ts vs abrechnungen/actions.ts | ⏳ **AARON-ENTSCHEID:** konsolidieren auf vollen Pfad ODER Thin-Version dokumentiert auf nie-SEPA-gecharged begrenzen |
| 🟠 | bezahlt-markieren 3-fach (markBezahlt / markiereAlsBezahlt / lib-Wrapper) | abrechnungen/ + finance/ + lib/finance/partner-billing-actions | ⏳ auf EINE Impl konsolidieren |
| 🟠 | versicherungen: 3 RLS-Writes ohne .select()-Row-Check -> Silent-{ok:true}-Risiko (#4625-Klasse) | versicherungen/actions.ts | ⏳ Admin-Client ODER Row-Check (Vorbild embed-sites) |
| 🟠 | aktualisiereWerkstattEmail: profiles.email-Update-Error ungeprueft -> 3-Schichten-Drift | werkstaetten/[id]/actions.ts:130 | ⏳ Error pruefen |
| 🟠 | getSvLeads: Query-Error -> [] (UI zeigt "keine Leads" statt Fehler) | sv-leads/actions.ts | ⏳ Shape-Umbau {ok}-Union (Consumer anpassen) |
| 🟡 | Tote Actions: anlegeSubSv (~155 LOC) + listBueroOrganisationen · werkstattQrSvg (ganzes File) · getWerkstattStaffel · linkedInTrennen (Disconnect nirgends verdrahtet) | sachverstaendige/anlegen · werkstaetten/qr-action.ts · werkstaetten/staffel-actions · marketing/linkedin | ⏳ loeschen bzw. UI nachziehen (linkedin) + knip-Baseline senken |
| 🟡 | Staffel-Duplikat werkstatt<->makler (~76 LOC byte-nah, selbst-dokumentiert) | werkstaetten/staffel-actions vs makler/staffel-actions | ⏳ parametrisierter Shared-Helper |
| 🟡 | Flotten-Loader-Duplikat + N+1 (Vorbild-Batch: get-vertrieb-lead-detail) | vertrieb/_actions/firmen-flotten-daten vs firmen-flotte/page | ⏳ Loader nach _lib/, .in()-Batch |
| 🟡 | Admin-Guard-Zoo: 6 lokale Varianten in C (requireAdminUserId 3x identisch) + 7 in B mit uneinheitlichem Return | cluster-weit | ⏳ auf shared requireRole/requireAdmin heben |
| 🟡 | randomPassword 3 Varianten · blockUser 2x identisch | sachverstaendige + team · community + kommentare | ⏳ shared util |
| 🟡 | Legacy-{success}-Shape: abrechnungen, einstellungen/vertraege, faelle/anlegen, sachverstaendige/*, team | Cluster C+D | ⏳ Boy-Scout auf {ok} |
| 🟡 | Dual-Writer sachverstaendige.verifiziert (manueller Toggle vs Doc-Flow — manuelles true kann still kippen) | [id]/actions vs verifizierung-actions | ⏳ dokumentieren oder funneln |
| 🔵 | provisionTwilio/releaseTwilio ohne revalidatePath · werkstaetten/actions revalidiert nur Liste statt Detail · manuellVersenden-Send ohne try/catch · AAR-664-Type-Exporte (9 Files, type-only=harmlos) · Mail-Fehler-Konvention throw vs Result gemischt | div. | ⏳ Boy-Scout |
| ℹ️ | vertraege/ vs einstellungen/vertraege/ sind KEINE Duplikate (PDF-Upload vs Vorlagen-CRUD) | — | Namens-Verwechslungsgefahr, ggf. Kommentar |

## Cluster-Details

### A — vertrieb/_actions (17 Files, 30 Fn): SAUBER
30/30 rollen-gegatet (requireRole admin+dispatch; update-vertrieb-feld mit Spalten-Whitelist), alle
Mutationen revalidieren, 0 tote Exporte, 0 stille Fehler. Nur: Flotten-Loader-Duplikat+N+1, 3
Type-Exporte entgegen dem lokal etablierten _lib/-Muster, 2 legitime Shape-Abweichungen (Batch-Array).

### B — werkstaetten/makler/flotte/partner-leads/sv-leads (11 Files, 41 Fn)
1 Auth-Luecke (getSvLeads, gefixt), 2 stille Fehler (getSvLeads-[], werkstatt-Email-Drift), 2 tote
Exporte, Staffel-Duplikat, requireAdmin 7x lokal. Positiv: kein throw, kein {success}, non-kritische
Sends/Geocode durchgaengig try/catch.

### C — sachverstaendige/team/tasks/community/ki (12 Files)
2 Auth-Luecken (tasks-Trio + updateSvProfile, beide gefixt). Kritische Account-Files (test-account,
smoke/lifecycle, anlegen/*) korrekt gegatet. Toter Sub-SV-Anlage-Flow, Guard-Zoo (6 Varianten),
randomPassword 3x, blockUser 2x, verifiziert-Dual-Writer, {success}/{ok}-Mix, Twilio-Actions ohne reval.

### D — finance/content (15 Files, ~40 Fn)
Kein Missing-Auth; der Money-HOCH-Fund (Storno-Divergenz) + bezahlt-markieren-Triplikat +
versicherungen-Silent-Fail + linkedInTrennen 0-Consumer. Vorbilder: embed-sites (Row-Check),
wissen-artikel + content-studio (durchgaengig konsistent).

## Empfohlene Reihenfolge fuers Saubermachen
1. ✅ Auth-Fixes (dieser PR)
2. Aaron-Entscheid Storno-Pfad -> Money-Konsolidierung (eigener PR, mit Test)
3. Tote Actions loeschen (schneller Gewinn, knip-Baseline senken)
4. Guard-/Util-Konsolidierung (requireAdmin/randomPassword/blockUser/Staffel) — mechanisch, ein PR
5. Silent-Fail-Haertung (versicherungen, werkstatt-Email, getSvLeads-Shape)
6. {success}->{ok} als Boy-Scout bei künftigen Anfassungen (kein Big-Bang)
