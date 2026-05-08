/**
 * scripts/smoke/phases/phase-2-dispatch.mjs — Phase 2: Dispatch übernimmt Lead
 *
 * Was getestet wird:
 *  Dispatch loggt sich ein, sieht den Lead aus Phase 1 in der Liste,
 *  öffnet das Lead-Detail, startet die SV-Vorschlagsliste,
 *  wählt Thomas Schmidt und weist ihn zu.
 *
 * Selektoren-Strategie:
 *  1. data-testid (falls vorhanden)
 *  2. getByText / getByRole (stabil über Umbenennungen)
 *  3. URL-basierte Navigation (Fallback: direkt zu /dispatch/leads/<id>)
 *
 * Wichtige Architektur-Hinweise:
 *  - /dispatch/leads zeigt Leads in Listen- oder Kanban-Ansicht (LeadsViewToggle)
 *  - Lead-Links sind <Link href="/dispatch/leads/<id>">
 *  - Detail-Seite /dispatch/leads/[id] enthält SvDispatchPanel
 *  - SV-Vorschlags-Trigger: Button "Best-SV vorschlagen" (listSvSuggestionsForLead)
 *  - Zuweisung: Button "Zuweisen" + Confirm-Dialog
 *  - SV-Name in Smoke: "Thomas Schmidt" — muss in sachverstaendige-Tabelle existieren
 *
 * DB-Checks nach Phase:
 *  - leads.status wechselt (vermutlich 'flow-gesendet' oder 'zugewiesen')
 *  - auftraege-Row mit sv_id gesetzt und status='zugewiesen'
 *  - mitteilungen für sv-Empfänger mit typ=auftrag.zugewiesen
 */

import { clickAndShoot, gotoAndShoot, assertDb, loadFixtureIds, waitForMitteilung, loginAs, logPhase, logWarn, logHard, logSoft, getServiceDb } from '../helpers.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Name des SVs der im Smoke zugewiesen wird
const TARGET_SV_NAME = 'Thomas Schmidt'

/**
 * Haupt-Funktion Phase 2.
 *
 * @param {import('playwright').BrowserContext} dispatchContext
 * @param {{ leadId: string|null, notes: string[] }} phase1Result
 * @returns {{ phase: 2, result: 'pass'|'soft'|'hard', notes: string[], auftragId: string|null }}
 */
export async function runPhase2(dispatchContext, phase1Result) {
  const notes = []
  let result = 'pass'
  let auftragId = null
  let page = null

  logPhase(2, '=== Phase 2: Dispatch übernimmt Lead ===')

  // --- Pre-Condition: Lead-ID aus Phase 1 ---------------------------------
  const { leadId } = phase1Result
  if (!leadId) {
    const msg = 'leadId aus Phase 1 ist null — Phase 2 kann nicht laufen (kein Lead zum Öffnen)'
    logHard(2, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 2, result: 'hard', notes, auftragId: null }
  }

  // --- Pre-Condition: Thomas Schmidt in sachverstaendige vorhanden? --------
  const db = getServiceDb()
  // F-07-Fix: Query auf Profile-Join umgestellt — Vorname/Nachname liegen in profiles, nicht in sachverstaendige
  const { data: svByEmail } = await db
    .from('sachverstaendige')
    .select('id, profiles!inner(vorname, nachname, id)')
    .eq('profiles.email', 'test-sv@claimondo.de')
    .limit(1)

  // Fallback: ilike-Suche auf profiles-Join falls test-sv kein Thomas Schmidt ist
  let { data: svRows } = await db
    .from('sachverstaendige')
    .select('id, profiles!inner(vorname, nachname, id)')
    .ilike('profiles.nachname', '%Schmidt%')
    .ilike('profiles.vorname', '%Thomas%')
    .limit(5)

  // test-sv hat Vorrang (für Smoke-Fixtures), dann Thomas Schmidt Suche
  const svCandidate = (svByEmail && svByEmail.length > 0) ? svByEmail[0] : (svRows && svRows.length > 0 ? svRows[0] : null)

  // Normalisiere Profil (Array.isArray guard für Supabase-Cardinality)
  const svProfile = svCandidate ? (Array.isArray(svCandidate.profiles) ? svCandidate.profiles[0] : svCandidate.profiles) : null

  const thomasSchmidt = svCandidate ? {
    id: svCandidate.id,
    vorname: svProfile?.vorname ?? 'Test',
    nachname: svProfile?.nachname ?? 'SV',
    profile_id: svProfile?.id ?? null,
  } : null
  if (!thomasSchmidt) {
    const msg = `SV "${TARGET_SV_NAME}" nicht in sachverstaendige-Tabelle gefunden — SV-Zuweisung kann nicht getestet werden`
    logSoft(2, msg)
    notes.push(`SOFT: ${msg} — Bitte SV "Thomas Schmidt" über /admin/sachverstaendige anlegen oder Smoke-Config auf vorhandenen SV anpassen`)
    result = 'soft'
  } else {
    logPhase(2, `SV gefunden: ${thomasSchmidt.vorname} ${thomasSchmidt.nachname} (ID: ${thomasSchmidt.id})`)
  }

  // --- Login als test-dispatch@claimondo.de --------------------------------
  logPhase(2, 'Login als test-dispatch@claimondo.de')
  try {
    page = await loginAs(dispatchContext, 'test-dispatch@claimondo.de', 'Test1234!', BASE_URL)
  } catch (err) {
    const msg = `Login als test-dispatch fehlgeschlagen: ${err.message}`
    logHard(2, msg)
    notes.push(`HARD: ${msg} — Prüfe: test-dispatch@claimondo.de existiert in auth.users mit Passwort Test1234! und force_password_change=false`)
    return { phase: 2, result: 'hard', notes, auftragId: null }
  }

  logPhase(2, `Nach Login URL: ${page.url()}`)

  try {
    // --- Schritt 2a: /dispatch aufrufen ------------------------------------
    logPhase(2, 'Navigiere zu /dispatch/leads')
    await gotoAndShoot(page, `${BASE_URL}/dispatch/leads`, 'dispatch-leads-liste')

    // Prüfen ob wir auf der Dispatch-Seite sind (nicht auf /login redirected)
    if (page.url().includes('/login')) {
      const msg = 'Dispatch-Login fehlgeschlagen — URL ist /login (vermutlich Auth-Problem oder Rolle falsch)'
      logHard(2, msg)
      notes.push(`HARD: ${msg} — test-dispatch@claimondo.de muss rolle='dispatch' oder 'admin' in profiles haben`)
      return { phase: 2, result: 'hard', notes, auftragId: null }
    }

    // --- Schritt 2b: Lead aus Phase 1 in der Liste finden -----------------
    logPhase(2, `Suche Lead ${leadId} in der Liste`)

    // Primär: Link mit Lead-ID in der href
    const leadLink = page.locator(`a[href*="${leadId}"]`).first()
    let leadOffen = false

    if (await leadLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      logPhase(2, 'Lead-Link gefunden — klicke')
      await clickAndShoot(page, leadLink, 'dispatch-lead-oeffnen')
      leadOffen = true
    } else {
      // Fallback: direkt navigieren
      const msg = `Lead-Card für ID ${leadId} in /dispatch/leads nicht sichtbar — navigiere direkt zu /dispatch/leads/${leadId}`
      logSoft(2, msg)
      notes.push(`SOFT: ${msg} — LeadsViewToggle zeigt Lead möglicherweise nicht an weil status!=quali-offen oder Filter aktiv. Datei: src/app/dispatch/leads/_components/LeadsViewToggle.tsx`)
      result = 'soft'
      await gotoAndShoot(page, `${BASE_URL}/dispatch/leads/${leadId}`, 'dispatch-lead-detail-direkt')
      leadOffen = true
    }

    if (!leadOffen) {
      const msg = 'Lead-Detail konnte nicht geöffnet werden'
      logHard(2, msg)
      notes.push(`HARD: ${msg}`)
      return { phase: 2, result: 'hard', notes, auftragId: null }
    }

    // Warten bis Lead-Detail geladen ist
    await page.waitForURL((url) => url.pathname.includes(leadId), { timeout: 15000 }).catch(() => {
      logWarn(2, 'URL enthält Lead-ID nicht — möglicherweise Redirect-Problem')
    })

    logPhase(2, `Lead-Detail geladen: ${page.url()}`)

    // --- Schritt 2c: SV-Vorschlag starten ---------------------------------
    logPhase(2, 'Suche "Best-SV vorschlagen"-Button')

    // SvDispatchPanel rendert diesen Button — Selektor: Text oder Button-Label
    // Korrekte Texte aus SvDispatchPanel.tsx:
    //   - "Gutachter suchen" (Erstaufruf)
    //   - "Erneut suchen" (nach Fehler)
    // hardGateOk muss true sein (Lead braucht bestimmte qualifizierungs_phase)
    const svButtonSelectors = [
      page.getByRole('button', { name: /Gutachter suchen/i }),
      page.getByRole('button', { name: /Erneut suchen/i }),
      page.getByRole('button', { name: /Best.SV vorschlagen/i }),
      page.getByRole('button', { name: /SV vorschlagen/i }),
      page.getByRole('button', { name: /SV suchen/i }),
    ]

    let svVorschlagBtn = null
    for (const btn of svButtonSelectors) {
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        svVorschlagBtn = btn
        break
      }
    }

    if (!svVorschlagBtn) {
      const msg = `"Gutachter suchen"-Button nicht gefunden — SvDispatchPanel zeigt den Button nur wenn hardGateOk=true (Qualifizierungs-Phase abgeschlossen)`
      logHard(2, msg)
      notes.push(`HARD: ${msg} — src/app/dispatch/leads/[id]/SvDispatchPanel.tsx:459-463 — hardGateOk prüft qualifizierungs_phase des Leads. Fixture-Lead hat qualifizierungs_phase=null → Hard Gate schlägt fehl. Lösung: Seed-Skript muss qualifizierungs_phase auf einen Wert setzen der hardGateOk=true liefert (Prüfe hard-gate.ts für gültige Werte), ODER Phase 1 Dispatch-Qualifizierung (Schritt 1-4 im Dispatch-Flow) muss vor SV-Suche durchgeführt werden.`)
      await page.screenshot({ path: 'HARD-dispatch-sv-button-fehlt.png' }).catch(() => {})
      return { phase: 2, result: 'hard', notes, auftragId: null }
    }

    logPhase(2, 'Best-SV-Vorschlag-Button gefunden — klicke')
    await clickAndShoot(page, svVorschlagBtn, 'sv-vorschlag-starten')

    // Warten auf Ladeliste — SV-Suche braucht Geo-Berechnung + Mapbox-ETA-Calls
    // Längeres Warten: bis "Suche passende Gutachter..." verschwunden ist oder Timeout
    logPhase(2, 'Warte bis SV-Suchergebnis geladen (max 15s)')
    await page.waitForFunction(
      () => !document.body.innerText.includes('Suche passende Gutachter'),
      { timeout: 15000 }
    ).catch(() => {
      logPhase(2, '[WARN] SV-Suche lädt noch nach 15s — versuche trotzdem weiterzumachen')
    })

    // Zusätzlicher Screenshot nach Warten
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? '.'}/sv-liste-nach-warten.png`,
    }).catch(() => {})

    // --- Schritt 2d: Slot in Thomas-Schmidt-Card klicken ------------------
    // UI-Pattern: "KLICK AUF SLOT RESERVIERT SOFORT" — kein separater Zuweisen-Button.
    // Jede SV-Card enthält 1-3 Slot-Buttons (SlotKachel). Klick auf Slot = direkte Reservierung.
    // Strategie: Thomas Schmidt card finden, dann ersten Slot darin klicken.
    logPhase(2, `Suche "${TARGET_SV_NAME}"-Card in SV-Vorschlagsliste`)

    // Finde die Thomas-Schmidt-Card: Das Element das den Text enthält + einen Eltern-div mit border
    const thomasCardExists = await page.getByText(TARGET_SV_NAME, { exact: false }).first().isVisible({ timeout: 5000 }).catch(() => false)

    if (thomasCardExists) {
      logPhase(2, `${TARGET_SV_NAME} in Liste gefunden — suche ersten Slot in seiner Card`)

      // Finde die Card die Thomas Schmidt enthält und klicke deren ersten Slot-Button
      // SvCard ist ein div mit rounded-lg border. Thomas Schmidt ist in der zweiten Karte (nach Test-Aaron).
      // WICHTIG: hasText ist ein substring-Match und kann den ersten SV-Container matchen wenn er auch "Thomas Schmidt" enthält.
      // Daher: Wir nehmen die narrowste Card die NUR Thomas Schmidt matcht — .last() statt .first()
      // Alternative: XPath, das den exakten Text findet und den Button im gleichen Container klickt.
      const thomasCardSlot = page.locator('div.rounded-lg').filter({ hasText: /Thomas Schmidt/ }).locator('button').first()

      if (await thomasCardSlot.isVisible({ timeout: 3000 }).catch(() => false)) {
        logPhase(2, 'Slot in Thomas-Schmidt-Card gefunden — klicke (reserviert sofort)')
        await clickAndShoot(page, thomasCardSlot, 'sv-thomas-slot-reservieren')

        // Nach Slot-Klick: kurz warten auf Toast / Reload
        await page.waitForTimeout(3000)

        // Screenshot nach Reservierung
        await page.screenshot({
          path: `${process.env._SMOKE_OUT_DIR ?? '.'}/sv-nach-slot-klick.png`,
        }).catch(() => {})

        logPhase(2, `Nach Slot-Reservierung URL: ${page.url()}`)

        // Phase 2 "Zuweisen"-Prüfung überspringen — Slot-Klick = direkte Reservierung
        // Führe DB-Asserts direkt durch
        if (page) await page.close().catch(() => {})

        // DB-Asserts nach Reservierung
        logPhase(2, 'DB-Assert: leads.status + auftraege-Insert nach Slot-Reservierung')
        await new Promise((r) => setTimeout(r, 2000))

        const { data: leadRow } = await db.from('leads').select('status').eq('id', leadId).maybeSingle()
        logPhase(2, `Lead-Status nach Reservierung: ${leadRow?.status}`)
        if (leadRow?.status === 'quali-offen') {
          notes.push('SOFT: leads.status ist noch quali-offen nach Slot-Reservierung — Status-Transition hat nicht stattgefunden')
          result = result === 'hard' ? 'hard' : 'soft'
        }

        const { data: auftragRows } = await db.from('auftraege').select('id, status, sv_id').eq('lead_id', leadId).limit(5)
        if (!auftragRows || auftragRows.length === 0) {
          // Suche via Fall
          const { data: fall } = await db.from('faelle').select('id').eq('lead_id', leadId).maybeSingle()
          if (fall?.id) {
            const { data: auftragByFall } = await db.from('auftraege').select('id, status, sv_id').eq('fall_id', fall.id).limit(5)
            if (auftragByFall && auftragByFall.length > 0) {
              auftragId = auftragByFall[0].id
              logPhase(2, `Auftrag (via fall_id) gefunden: ID=${auftragId}, status=${auftragByFall[0].status}`)
            }
          }
          if (!auftragId) {
            notes.push('SOFT: auftraege-Tabelle: Kein Eintrag mit lead_id — Reservierung hat keinen Auftrag angelegt (prüfe reserveSvTerminForLead-Action)')
            result = result === 'hard' ? 'hard' : 'soft'
          }
        } else {
          auftragId = auftragRows[0].id
          logPhase(2, `Auftrag (via lead_id) gefunden: ID=${auftragId}, status=${auftragRows[0].status}`)
        }

        // Mitteilungs-Assert
        const { data: svProfileRows } = await db.from('profiles').select('id').eq('email', 'test-sv@claimondo.de').limit(1)
        if (svProfileRows && svProfileRows.length > 0) {
          const mitteilungResult = await waitForMitteilung({ empfaenger_id: svProfileRows[0].id, timeoutMs: 8000 })
          if (!mitteilungResult.ok) {
            notes.push(`SOFT: Mitteilung für SV nicht gefunden — ${mitteilungResult.msg}`)
            result = result === 'hard' ? 'hard' : 'soft'
          } else {
            logPhase(2, `Mitteilung für SV gefunden: ${mitteilungResult.msg}`)
          }
        }

        logPhase(2, `Phase 2 abgeschlossen: ${result.toUpperCase()}`)
        return { phase: 2, result, notes, auftragId }
      } else {
        logSoft(2, 'Kein Slot-Button in Thomas-Schmidt-Card gefunden — keine Slots verfügbar?')
        notes.push('SOFT: Thomas Schmidt hat keine Slot-Buttons (SlotKachel) — möglicherweise kein GCal oder keine verfügbaren Zeiten. Prüfe getSvSuggestionsWithSlots() → slots=[]')
        result = 'soft'
      }
    } else {
      // Fallback: Service-Role direkter Auftrag-Insert — UI-Pfad gesmoked bis SV-Liste
      // Pragmatische Entscheidung: SV-UI-Suche zeigt keine Ergebnisse (API-Timeout?),
      // aber Forward-Progress ist wichtiger als UI-Vollständigkeit.
      // Aaron-Doku: "SV-Vorschlagsliste leer" — bitte Mapbox-ETA-Logs + SV-Isochrone prüfen.
      const msg = `"${TARGET_SV_NAME}" nicht in SV-Vorschlagsliste nach 15s Warten — SV-Suche liefert keine Ergebnisse im UI`
      logSoft(2, msg)
      notes.push(`SOFT: ${msg} — URSACHE PRÜFEN: Mapbox-Driving-ETA-API (etaFromBueroMin) schlägt möglicherweise fehl → SvSuggestion wird nicht zurückgegeben. Datei: src/app/dispatch/leads/[id]/actions.ts → getSvSuggestionsWithSlots(). Fallback: Direkt-Zuweisung über Service-Role für Forward-Progress.`)
      result = 'soft'

      // Screenshot für Diagnose
      await page.screenshot({ path: `${process.env._SMOKE_OUT_DIR ?? '.'}/SOFT-dispatch-sv-liste-leer.png` }).catch(() => {})

      // --- Direkte DB-Zuweisung als Fallback (Service-Role) ----------------
      logPhase(2, 'FALLBACK: Direkte SV-Zuweisung über Service-Role (UI überbrückt)')
      const db2 = getServiceDb()

      // auftraege-Insert
      const termin_start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 Tage von jetzt
      const termin_end = new Date(termin_start.getTime() + 2 * 60 * 60 * 1000) // +2h

      // Fall suchen oder anlegen
      const { data: existingFall } = await db2.from('faelle').select('id').eq('lead_id', leadId).maybeSingle()
      let fallId = existingFall?.id

      if (!fallId) {
        // Fall aus Lead-Daten anlegen
        const { data: lead } = await db2.from('leads').select('*').eq('id', leadId).maybeSingle()
        if (lead) {
          const { data: newFall } = await db2.from('faelle').insert({
            lead_id: leadId,
            sv_id: thomasSchmidt?.id,
            status: 'sv-zugewiesen',
            vorname: lead.vorname ?? 'Test',
            nachname: lead.nachname ?? 'Kunde',
            email: lead.email ?? 'test@claimondo.de',
            telefon: lead.telefon,
            schadentyp: lead.schadentyp,
            schuldfrage: lead.schuldfrage,
            unfallhergang: lead.unfallhergang,
            besichtigungsort_lat: lead.besichtigungsort_lat,
            besichtigungsort_lng: lead.besichtigungsort_lng,
            besichtigungsort_adresse: lead.besichtigungsort_adresse,
          }).select('id').maybeSingle()
          fallId = newFall?.id
          logPhase(2, `Neuer Fall angelegt: ${fallId}`)
        }
      }

      if (!fallId) {
        notes.push('SOFT: Kein Fall vorhanden und konnte auch nicht angelegt werden — Auftrag-Insert übersprungen')
        result = 'soft'
      } else if (thomasSchmidt) {
        // Auftrag anlegen
        const { data: auftrag, error: auftragErr } = await db2.from('auftraege').insert({
          fall_id: fallId,
          lead_id: leadId,
          sv_id: thomasSchmidt.id,
          status: 'zugewiesen',
          start_zeit: termin_start.toISOString(),
          end_zeit: termin_end.toISOString(),
        }).select('id').maybeSingle()

        if (auftragErr) {
          notes.push(`SOFT: Auftrag-Insert fehlgeschlagen: ${auftragErr.message}`)
        } else if (auftrag) {
          auftragId = auftrag.id
          logPhase(2, `FALLBACK-Auftrag angelegt: ${auftragId} (sv_id=${thomasSchmidt.id})`)
          notes.push(`SOFT: Auftrag via Service-Role direkten Insert angelegt (nicht via UI-Zuweisung) — auftragId=${auftragId}`)
        }
      }

      // Früh zurückkehren für DB-Asserts
      if (page) await page.close().catch(() => {})
      // DB-Asserts direkt hier da wir early-return machen
      if (auftragId) {
        return { phase: 2, result, notes, auftragId }
      }
      return { phase: 2, result: 'soft', notes, auftragId: null }
    }

    // --- Schritt 2e: Zeitslot wählen (falls Slot-Picker erscheint) --------
    logPhase(2, 'Prüfe ob Slot-Picker sichtbar ist')
    await page.waitForTimeout(1500)
    // Slot-Picker zeigt Buttons mit Datum/Uhrzeit — klicke ersten verfügbaren Slot
    const slotBtn = page.locator('button[data-slot], button:has-text("Uhr"), button:has-text(":00")').first()
    if (await slotBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logPhase(2, 'Slot-Picker sichtbar — wähle ersten Slot')
      await clickAndShoot(page, slotBtn, 'sv-slot-waehlen')
    } else {
      logPhase(2, 'Kein Slot-Picker sichtbar — weiter zur Zuweisung')
    }

    // --- Schritt 2f: Zuweisen klicken -------------------------------------
    logPhase(2, 'Suche "Zuweisen"-Button')
    const zuweisungSelectors = [
      page.getByRole('button', { name: /Zuweisen/i }),
      page.getByRole('button', { name: /An SV senden/i }),
      page.getByRole('button', { name: /Termin reservieren/i }),
      page.getByRole('button', { name: /Bestätigen/i }),
    ]

    let zuweisBtn = null
    for (const btn of zuweisungSelectors) {
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        zuweisBtn = btn
        break
      }
    }

    if (!zuweisBtn) {
      const msg = '"Zuweisen"-Button nicht gefunden — möglicherweise kein Slot gewählt oder Panel im falschen Zustand'
      logHard(2, msg)
      notes.push(`HARD: ${msg} — src/app/dispatch/leads/[id]/SvDispatchPanel.tsx — "Zuweisen" erscheint erst nach SV + Slot-Auswahl`)
      return { phase: 2, result: 'hard', notes, auftragId: null }
    }

    logPhase(2, '"Zuweisen"-Button gefunden — klicke')
    await clickAndShoot(page, zuweisBtn, 'sv-zuweisen-klick')

    // Bestätigungs-Dialog (falls vorhanden)
    await page.waitForTimeout(1000)
    const confirmBtn = page.getByRole('button', { name: /Bestätigen|Ja, zuweisen|OK/i }).first()
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logPhase(2, 'Bestätigungs-Dialog — bestätige')
      await clickAndShoot(page, confirmBtn, 'sv-zuweisen-confirm')
    }

    // Toast-Bestätigung abwarten
    await page.waitForSelector('[data-sonner-toast], [role="status"], .toast', { timeout: 8000 }).catch(() => {})
    logPhase(2, `Nach Zuweisung URL: ${page.url()}`)

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 2: ${err.message}`
    logHard(2, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 2, result: 'hard', notes, auftragId: null }
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- DB-Asserts --------------------------------------------------------
  logPhase(2, 'DB-Assert: leads.status wechsel + auftraege-Insert')

  // Warten damit Async-Transitions abgeschlossen sind
  await new Promise((r) => setTimeout(r, 2000))

  // Lead-Status prüfen (genauer Enum-Wert TBD — aus leads.status-Enum ermitteln)
  const { data: leadRow } = await db
    .from('leads')
    .select('status, qualifizierungs_phase')
    .eq('id', leadId)
    .maybeSingle()

  if (!leadRow) {
    notes.push(`SOFT: Lead ${leadId} nach Zuweisung nicht mehr in DB — unerwartet`)
    result = 'soft'
  } else {
    logPhase(2, `Lead-Status nach Zuweisung: ${leadRow.status} (Phase: ${leadRow.qualifizierungs_phase})`)
    // Status sollte nicht mehr 'quali-offen' sein
    if (leadRow.status === 'quali-offen') {
      notes.push(`SOFT: leads.status ist noch 'quali-offen' nach Zuweisung — Status-Transition hat nicht stattgefunden`)
      result = result === 'hard' ? 'hard' : 'soft'
    }
  }

  // auftraege-Assert
  const { data: auftragRows } = await db
    .from('auftraege')
    .select('id, status, sv_id, claim_id')
    .eq('lead_id', leadId)
    .limit(5)

  if (!auftragRows || auftragRows.length === 0) {
    // Aufträge können auch ohne lead_id angelegt sein — über Fall-ID suchen
    const msg = `auftraege-Tabelle: Kein Eintrag mit lead_id=${leadId} — Entweder FK-Spalte heißt anders oder Zuweisung hat nicht DB-seitig gefeuert`
    logSoft(2, msg)
    notes.push(`SOFT: ${msg} — Prüfe src/app/dispatch/leads/[id]/actions.ts → reserveSvTerminForLead() ob auftrag wirklich angelegt wird`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    const auftrag = auftragRows[0]
    auftragId = auftrag.id
    logPhase(2, `Auftrag gefunden: ID=${auftrag.id}, status=${auftrag.status}, sv_id=${auftrag.sv_id}`)

    if (!auftrag.sv_id) {
      notes.push(`SOFT: auftraege.sv_id ist null — SV-Zuweisung nicht vollständig in DB geschrieben`)
      result = result === 'hard' ? 'hard' : 'soft'
    }
    if (!auftrag.claim_id) {
      notes.push(`SOFT: auftraege.claim_id ist null — CMM Phase 1.5 Sync hat möglicherweise noch keinen Fall angelegt`)
      // Das ist kein Hard-Blocker für Phase 2 — Fall-Anlage kann async sein
    }
  }

  // Mitteilungs-Assert: SV soll Mitteilung bekommen
  logPhase(2, 'Mitteilungs-Assert: SV-Empfänger')
  const { data: svProfileRows } = await db
    .from('profiles')
    .select('id')
    .eq('email', 'test-sv@claimondo.de')
    .limit(1)

  if (svProfileRows && svProfileRows.length > 0) {
    const mitteilungResult = await waitForMitteilung({
      empfaenger_id: svProfileRows[0].id,
      timeoutMs: 10000,
    })
    if (!mitteilungResult.ok) {
      logSoft(2, mitteilungResult.msg)
      notes.push(`SOFT: Mitteilung für SV (test-sv@claimondo.de) nicht gefunden — ${mitteilungResult.msg} — Prüfe emit.ts: lead.assigned_sv oder auftrag.zugewiesen Event`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(2, `Mitteilung für SV gefunden: ${mitteilungResult.msg}`)
    }
  } else {
    notes.push('SOFT: test-sv@claimondo.de nicht in profiles — Mitteilungs-Assert übersprungen')
    result = result === 'hard' ? 'hard' : 'soft'
  }

  logPhase(2, `Phase 2 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 2, result, notes, auftragId }
}
