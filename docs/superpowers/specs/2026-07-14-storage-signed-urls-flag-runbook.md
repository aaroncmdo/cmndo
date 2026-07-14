# Storage-URLs: Prod-Befund + Runbook für den `STORAGE_USE_SIGNED_URLS`-Flip

**Datum:** 2026-07-14 · **Session:** f48be874
**Status:** ✅ **Flip ist erfolgt und aktiv** (per SSH verifiziert 15.07.). Klasse-B-Fixes geliefert (#4332/#4336).

> ## ⚠️ KORREKTUR (15.07.) — dieses Dokument entstand auf einer falschen Prämisse
> Der ursprüngliche Befund („Flag ist AUS") **war ein Fehlschluss** und ist hiermit richtiggestellt.
> **Das Flag `STORAGE_USE_SIGNED_URLS` ist auf prod `true` und aktiv** — dreifach verifiziert:
> (a) direkt auf dem VPS (`/etc/claimondo/.env.local` = `true`; die App liest es über den Symlink
> `.env.local`; `@next/env`-Ladung ergibt `"true"`; der App-Prozess startete nachweislich **nach** der
> env-Änderung); (b) **Goldstandard-HTTP-Test gegen die laufende App**: `GET` der Gutachten-Magic-Route
> (ruft intern `getStorageUrl` für den privaten Bucket `fall-dokumente` auf **und fetcht die URL selbst**)
> lieferte **HTTP 200 + PDF** — auf einem privaten Bucket nur mit einer signierten URL möglich, eine
> public-URL hätte 400/410 ergeben.
>
> Der „Beweis ohne SSH" unten (Abschnitt 1) stützte sich auf `profiles.avatar_url` (public-Form) als
> Flag-Indikator. **Das ist ungültig:** der Avatar-Upload ruft `getPublicUrl` **direkt** auf
> (`src/lib/profile/avatar.ts:39`), nicht `getStorageUrl` → die URL sagt nichts über das Flag. Eine
> gespeicherte URL belegt den Flag-Zustand **nur**, wenn sie nachweislich über `getStorageUrl` entstand.
>
> **Was gültig bleibt:** die Consumer-Klassifikation (Abschnitt 3) und die Klasse-B-Fixes — aus dem
> **TTL-Grund**, nicht dem Breaker-Grund: bei aktivem Flag speichert `getStorageUrl` eine signierte URL
> mit TTL, deren spätere Wiederverwendung `resignStorageUrl` braucht. Belegt durch den BKat-Prod-Smoke.
> Abschnitt 4 (Runbook-Schritte) ist damit **erledigt** — der Flip ist nicht mehr durchzuführen.

## 1 · Der (überholte) Befund — siehe Korrektur oben

**Ursprünglich behauptet: `STORAGE_USE_SIGNED_URLS` ist auf prod AUS.** — Widerlegt, siehe Korrektur.

Beweis ohne SSH-Zugang: `getStorageUrl` prüft **nur** das Flag, **nicht** den Bucket-Status. Wäre das
Flag an, wäre **jede** erzeugte URL signiert — auch für *public* Buckets. Die zuletzt gespeicherten
Storage-URLs sind aber public-Form:

```
profiles.avatar_url  2026-07-14  →  …/object/public/avatare/…    (heute erzeugt!)
profiles.avatar_url  2026-06-28  →  …/object/public/avatare/…
```

**Gleichzeitig sind 10 von 15 Buckets PRIVAT:**

```
🔒 fall-dokumente · schadensfotos · gutachten · unterschriften · kanzlei
🔒 abrechnungen · abrechnungen-pdf · gutachten-pdfs · vertraege · db-backups
🌐 profile · gutachter-logos · avatare · email-hero · marketing-content
```

→ `getStorageUrl` liefert für **private** Buckets eine `getPublicUrl` — und die ist **HTTP 400**
(live gemessen). **Jede so erzeugte URL ist tot.**

### Warum es niemand merkt

Auf prod existieren derzeit **keine hochgeladenen Dokumente**: `fall_dokumente` **0 Rows**,
`gutachten` **0 Rows**, `auftraege.gutachten_url` **0**, die 14 `pflichtdokumente` sind alle nur
*angefordert* (ohne Datei). Der Go-Live-Cleanup hat den Bestand geleert.

**Der Bug ist latent — er schlägt beim ersten echten Kunden-Upload zu.**

### Der Drift, der dazu führte

`src/lib/storage/url.ts` beschreibt den geplanten Rollout: Bucket-Migration (`public=false`) und
Flag-Flip sollten **atomar** passieren. Die **DB-Seite ist umgestellt, die App-Seite nicht** — genau
die Hälfte, die weh tut. Das Team kannte die TTL-Falle übrigens (Kommentar in `lib/ai/gutachten-ocr.ts`,
02.07.: PDF wird bewusst als base64 geladen, *„sobald STORAGE_USE_SIGNED_URLS aktiv ist"*), nur die
private-Bucket-Hälfte war nicht auf dem Schirm.

## 2 · Warum der Flip allein nicht reicht

Ein `STORAGE_USE_SIGNED_URLS=true` heilt alle **frisch erzeugten** URLs (signed, gültig) — macht aber
**jede in der DB gespeicherte URL ablaufend** (TTL: `ui`=1h, `download`=5min, `email`=7d). Wer eine
gespeicherte URL später wiederverwendet, hätte dann eine abgelaufene statt einer toten. Bug getauscht,
nicht behoben.

Darum: **erst die Consumer sortieren, dann flippen.**

## 3 · Consumer-Klassifikation (vollständig)

| Klasse | Muster | Beispiele | Nach dem Flip |
|---|---|---|---|
| **A — frisch erzeugt** | ruft `getStorageUrl(…, storage_path)` **beim Lesen** | `claims/kunde-claim-view.ts:304`, `faelle/[id]/page.tsx:339` (`getStorageUrlBulk`), `claims/pflicht-for-fall.ts:149`, `vs-meldung/sende-unfallmeldung.ts`, `flow/[token]/page.tsx:46`, Download-Links (`werkstatt/auftraege`, `kunde/gutachten-actions`) | ✅ **OK** — signiert + sofort benutzt |
| **B — gespeicherte URL wird gerendert/gefetcht** | liest eine `*_url`-Spalte und gibt sie an Browser/Fremddienst | `claims/pflicht-for-fall.ts:104` (→ `DokumenteTab:371 href`), `dispatch/…/bkat-inference.ts` (→ Anthropic-Vision) | 🔴 **braucht `resignStorageUrl`** |
| **C — nur Präsenz-Check** | fragt nur „ist etwas hochgeladen?" | `qc/auto-checks.ts`, `fall/subphase-resolver.ts`, `claims/lifecycle.ts`, `claims/data-requirements.ts` | ✅ unkritisch |
| **gelöst** | lädt die Bytes selbst | `ai/gutachten-ocr.ts` (base64, 02.07.) | ✅ TTL-unabhängig |

**Nicht kritisch:** `components/gutachter/AuftragDokumenteBanner.tsx` lädt `dokument_url`, **rendert sie
aber nie** (nur Typ + Loader — ein duplizierter Loader von `pflicht-for-fall`, Boy-Scout-Kandidat).

### Warum Klasse B nicht „einfach frisch erzeugen" kann

**`pflichtdokumente` hat KEINEN `storage_path`** — die gespeicherte `dokument_url` ist die **einzige**
Referenz auf die Datei. Der Pfad muss deshalb **aus der URL zurückgewonnen** werden. Genau das tut
`parseStorageUrl` / `resignStorageUrl` (`src/lib/storage/url.ts`, unit-getestet):

```ts
const fetchbar = (await resignStorageUrl(admin, gespeicherteUrl)) ?? gespeicherteUrl
```

Es heilt **beide** Formen — die tote public-URL (heute) **und** die abgelaufene signed-URL (nach dem
Flip). Nicht-Storage-URLs (z.B. Twilio-Media) parsen nicht und fallen unverändert durch.

## 4 · Runbook für den Flip

1. **Klasse-B-Fixes deployen** (dieser PR + #4332). Sie wirken **vor und nach** dem Flip — ohne Flip
   heilen sie die toten public-URLs, mit Flip die Ablauf-Problematik.
2. **Flag auf dem VPS setzen:** `STORAGE_USE_SIGNED_URLS=true` in `/etc/claimondo/.env.local`,
   App neu starten (PM2). *(Infrastruktur — VPS-Claude/Aaron; der lokale Claude hat bewusst keinen
   SSH-Zugang.)*
3. **Prod-Smoke nach dem Flip** (Regel 4): Dokument hochladen → in Fallakte + Kunden-Portal öffnen →
   Link muss laden (HTTP 200, nicht 400). Kontrolle: die erzeugte URL enthält jetzt `/object/sign/`.
4. **Alt-Bestand:** Bereits gespeicherte public-URLs bleiben in der DB — sie werden durch
   `resignStorageUrl` beim Lesen geheilt, **kein Backfill nötig**. (Und aktuell gibt es ohnehin
   praktisch keinen Bestand.)

## 5 · Warum das jetzt wichtig ist

Ohne Flip trifft der erste echte Upload auf tote URLs — betroffen wären genau die Außen-Pfade:
Schadensfotos und Dokumente in Fallakte/Kunden-Portal, E-Mail-Links, und die **Unfallmeldung an die
Versicherung** (`sende-unfallmeldung.ts` hängt Fotos an). Letztere ist Klasse A und damit nach dem
Flip sauber — **ohne** Flip liefert sie der Versicherung jedoch nicht abrufbare Bilder.
