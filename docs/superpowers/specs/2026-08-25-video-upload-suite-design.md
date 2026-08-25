# Video- und Upload-Suite — Design-Spec

**Datum:** 2026-08-25
**Status:** Entwurf, wartet auf Aaron
**Ziel (Aaron):** Längere gedrehte Videos automatisch schneiden, mit Untertiteln
versehen, generierten Inhalt integrieren und automatisch hochladen. **Kostenlos.**

---

## 1 · Der Befund, der alles andere bestimmt

Die bestehende Video-Pipeline (`/admin/marketing/content-studio`) ist **nicht
ungenutzt — sie ist blockiert.**

Gemessen am 25.08.2026 auf prod:

| | |
|---|---|
| Jobs insgesamt | **4** |
| Erfolgreich | 3, alle am **14.07.2026** |
| Letzter Versuch | 15.07.2026, Status `fehler` |
| Fehlertext | **„Zu wenig RAM fuer Render: nur 192MB frei (<650MB)"** |
| Seither | **nichts** |

Und der VPS heute:

```
Mem:  1833 MB total · 1685 used · 147 verfügbar
Swap: 4095 MB total · 1582 bereits belegt
CPU:  2 Kerne
PM2:  13 Apps online (zusammen 1156 MB)
```

**147 MB frei — weniger als die 192 MB, an denen der Job im Juli scheiterte.**
Der Render verlangt 650 MB. Diese Schwelle ist auf der Box strukturell nicht
erreichbar, nicht gelegentlich.

⭐ Die Pipeline meldet das korrekt und bricht sauber ab, statt einen
Nachbarprozess per OOM zu killen. Das RAM-Gate funktioniert — es ist kein Bug,
es ist die Diagnose.

### Warum ein Ausbau auf dem VPS die Lage verschlimmert

| Baustein | Zusätzlicher Bedarf |
|---|---|
| Remotion-Render (bestehend) | 500–800 MB Spitze |
| whisper.cpp (small/medium) | 0,5–2 GB |
| auto-editor + ffmpeg-Transcoding | mehrere hundert MB |

Alles drei auf 147 MB freiem RAM ist ausgeschlossen. Swap hilft nicht: ein
headless-Chromium, der swappt, rendert nicht langsam — er rendert praktisch nicht.

---

## 2 · Konsequenz: die Verarbeitung gehört nicht auf den VPS

**Die schwere Arbeit läuft lokal, der Server verwaltet und veröffentlicht.**

Das ist nicht nur die billigste Lösung, sondern auch die naheliegende: Das
Rohmaterial liegt ohnehin auf dem Rechner, auf dem gedreht wurde. Es erst
hochzuladen, um es serverseitig zu schneiden, und dann wieder herunterzuladen,
wäre der Umweg.

```
LOKAL (Aarons Rechner, kostenlos)          SERVER (VPS, leichtgewichtig)
─────────────────────────────────          ────────────────────────────
langes Rohvideo                            Storage (fertige MP4)
  ↓ auto-editor (Stille/Bewegung)          Admin-UI: Vorschau
  ↓ whisper.cpp (Transkript + Timings)     Technisches Gate
  ↓ Schnittvorschläge → Auswahl            Freigabe durch einen Menschen
  ↓ Remotion (Untertitel, Branding)        Meta-Upload (API-Call, kein Rendern)
  ↓ fertiges MP4  ──────────────────────►  publish_status
```

Der VPS macht damit nur noch, was er kann: Dateien halten, eine Oberfläche
zeigen, HTTP-Aufrufe an Meta senden. Kein Chromium, kein ffmpeg, kein Modell.

---

## 3 · Was heute schon da ist

Das Content-Studio ist weiter, als die Kachel vermuten lässt:

| Baustein | Stand |
|---|---|
| Skript-Generierung (KI) + Review-Gate | ✅ läuft, Admin editiert vor dem Render |
| Voiceover | ✅ ElevenLabs **mit automatischem Fallback auf Piper** (lokal, gratis) |
| Wort-Timings für Untertitel | ✅ `WordTiming[]` aus dem TTS |
| Musik, Visuals, Branding | ✅ `music-resolver`, `visual-resolver`, `brand-library` |
| Remotion-Render → MP4 → Storage | ✅ gebaut, aber RAM-blockiert |
| Render-Worker mit CAS-Claim | ✅ verhindert Doppel-Render |
| Guardrails | ⚠️ Kill-Switch + Wochen-Cap — **Kosten/Menge, keine Qualität** |
| Video-**Input** (eigenes Material) | ❌ existiert nicht |
| Auto-Schnitt | ❌ existiert nicht |
| Transkription fremder Tonspur | ❌ existiert nicht (Timings kommen nur aus dem TTS) |
| Auto-Upload | ❌ nur Download + Link auf TikToks Trending-Sounds |
| Qualitätsentscheidung über das **Video** | ❌ **keine** — siehe §5 |

---

## 4 · Die Werkzeuge für die Lücken (recherchiert 24.08.)

| Lücke | Werkzeug | Lizenz/Kosten | Anmerkung |
|---|---|---|---|
| Auto-Schnitt | **auto-editor** | MIT, ffmpeg-basiert | schneidet Stille; alternativ nach Bewegung |
| Transkript + Untertitel | **whisper.cpp** | MIT, eine Binary, keine GPU nötig | schreibt SRT/VTT direkt, Wort-Timings, Deutsch |
| Alternative dazu | **faster-whisper** | MIT, CTranslate2 | schneller im Stapel, braucht Python |
| Transcoding | **ffmpeg** | LGPL | **auf dem VPS bereits installiert** |

Alle vier sind kostenlos und laufen lokal. `python3` und `ffmpeg` sind auf dem
VPS vorhanden — für den Fall, dass später doch eine leichte Aufgabe dort laufen soll.

---

## 5 · Qualität: die Lücke, die der Auto-Upload aufreißt

**Heute entscheidet niemand systematisch, ob ein Video brauchbar ist.**

* Die **Guardrails** prüfen Kill-Switch und Wochen-Cap — Kosten und Menge.
* Das **Review-Gate** prüft das **Skript** (Text), nicht das Video.
* Nach dem Render steht `video_fertig`. **Kein Prüfstatus, kein Freigabeschritt.**
* `publish_status` springt von `entwurf` auf `gepostet` — vom Admin **manuell**
  gesetzt, nachdem er selbst gepostet hat.

Der **manuelle Post ist der Qualitätsfilter.** Wer den Upload automatisiert,
entfernt ihn ersatzlos — dann veröffentlicht die Pipeline ungeprüfte Videos unter
Claimondos Namen. Bei automatisch erzeugten Inhalten ist genau das hier schon
einmal passiert (`substanz_score` meldete Qualität, wo keine war).

### Deshalb: zweistufig statt „Mensch oder Automat"

**Hartes technisches Gate** (blockierend, billig, zuverlässig messbar):
- Seitenverhältnis 9:16 und Dauer 5–90 s — sonst lehnt Meta den Upload ohnehin ab
- Tonspur vorhanden und nicht stumm, Pegel im Rahmen
- Untertitel decken die Tonspur ab (Wortzahl gegen Audiodauer)
- keine schwarzen Frames am Anfang, kein Standbild-Ende
- bei eigenem Material zusätzlich: Stille-Anteil nach dem Schnitt

**Weicher Verdacht** (erzeugt „bitte ansehen", blockiert nicht):
- Sprechtempo, Verhältnis Text zu Länge, LLM-Urteil über das Skript

**Nicht automatisierbar:** ob es überzeugt, ob der Ton stimmt, ob es peinlich ist.

**Neuer Status `freigegeben`** zwischen `video_fertig` und `gepostet`. Damit ist
die menschliche Entscheidung nicht mehr implizit im Posten versteckt, sondern
nachvollziehbar: wer hat wann freigegeben. Auto-Upload gilt **nur** für
freigegebene Clips.

---

## 6 · Upload: Meta ja, TikTok nein

**Instagram Reels über die Graph API — machbar:**
- Business-/Creator-Account mit verknüpfter Facebook-Page
- Drei-Schritt-Container-Modell (Container anlegen → warten → veröffentlichen)
- ⚠ Das Video muss unter einer **öffentlich erreichbaren URL** liegen; Meta holt
  es selbst ab. Supabase-Storage mit signierter oder öffentlicher URL erfüllt das.
- ⚠ **Keine Musik aus Instagrams Bibliothek über die API** — Musik muss ins Video
  eingebettet sein. Remotion tut das bereits.
- App-Review je Permission, **2–4 Wochen**, mit Screencast

**TikTok — vollautomatischer Upload ist nicht erlaubt** (Aaron-Entscheid 24.08.:
bleibt manuell):
- Ohne bestandenes Audit: alle Posts `SELF_ONLY`, max. 5 Nutzer je 24 h
- Mit Audit: *„Der Creator muss Caption, Privacy-Level und Interaktions-
  einstellungen vor dem Publish sehen und bestätigen. Ein One-Click-Publish ohne
  Review-Screen besteht das Audit nicht."*
- Der Weg bleibt: rendern, freigeben, herunterladen, von Hand posten.

⚠ **Fremdes Material (z. B. Reddit-Videos) ist kein Weg.** Der Poster behält sein
Urheberrecht; die Lizenz geht an die Plattform, nicht an andere Nutzer.
Bearbeitungen brauchen die Einwilligung des Urhebers (§ 23 UrhG) — Umschneiden
plus eigener Kommentar erzeugt kein neues Werk. Legitim sind: eigenes Material,
lizenzfreie Stock-Clips, oder die schriftliche Erlaubnis des Erstellers.

---

## 7 · Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **V0** | **RAM-Entscheidung** (§8) — ohne sie trägt nichts | Pipeline wieder lauffähig |
| **V1** | Technisches Gate + Status `freigegeben` | Qualitätslücke geschlossen, bevor irgendetwas automatisch hochlädt |
| **V2** | Lokales CLI: Rohvideo → auto-editor → whisper → Untertitel → MP4 | Eigenes Material kommt in die Pipeline |
| **V3** | Upload des fertigen MP4 ins Storage + Job-Anlage aus dem CLI | Verbindung lokal ↔ Server |
| **V4** | Meta-Auto-Upload für freigegebene Clips | Reels ohne Handarbeit |

**V1 vor V2** ist Absicht: Das Gate ist billig und schließt die Lücke, die der
Auto-Upload später aufreißen würde. Es zuletzt zu bauen hieße, in der Zwischenzeit
ungeprüft zu veröffentlichen.

**V0 ist Voraussetzung für alles.** Solange der Render nicht läuft, produziert die
Suite nichts, das man freigeben oder hochladen könnte.

---

## 8 · V0: die RAM-Entscheidung (Aaron)

| Option | Kosten | Wirkung |
|---|---|---|
| **A · Verarbeitung lokal** | 0 € | Rohmaterial liegt ohnehin lokal; VPS macht nur Verwaltung + Upload. **Empfehlung.** |
| B · VPS aufrüsten | monatlich | Löst es direkt, auch für den bestehenden Render |
| C · Cluster-LPs konsolidieren | 0 €, Aufwand | 5 Next-Prozesse × ~35 MB = ~173 MB für weitgehend gleiche Seiten. Hilft, reicht aber **allein nicht** für 650 MB |
| D · Render-Fenster nachts | 0 € | Die 13 Apps laufen durchgehend — die Ersparnis ist gering |

**A ist der einzige Weg, der ohne laufende Kosten trägt** und zugleich zu Aarons
Ziel passt: Er dreht die Videos ohnehin selbst, auf seinem Rechner.

⚠ **Nebenbefund, fremde Lane:** `powerdialer` steht bei **76 Restarts** — das
riecht nach Crash-Loop und sollte jemand ansehen, unabhängig von diesem Vorhaben.

---

## 9 · Offene Punkte

| # | Punkt | Wer |
|---|---|---|
| V-O1 | RAM-Entscheidung aus §8 | Aaron |
| V-O2 | Ist der Freigabe-Status gewollt, oder reicht das technische Gate? | Aaron |
| V-O3 | Instagram-Business-Account + Facebook-Page vorhanden? (Voraussetzung für V4) | Aaron |
| V-O4 | Wer stellt den App-Review-Antrag bei Meta (2–4 Wochen Vorlauf)? | Aaron |
| V-O5 | Whisper-Modellgröße lokal (small reicht meist für Deutsch, medium ist genauer) | beim Bau |

---

## 10 · Bewusst nicht enthalten

- **TikTok-Auto-Upload** — von TikTok nicht erlaubt (§6)
- **Fremdes Videomaterial** aus sozialen Netzen (§6)
- **Cloud-Rendering** — widerspricht der Kostenvorgabe
- **Automatische Qualitätsbewertung als Freigabe-Ersatz** — messbar ist Technik,
  nicht Überzeugungskraft (§5)
