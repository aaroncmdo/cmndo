// Doc 34 Task 0b.2 — OpenAPI 3.1 Spec fuer den ChatGPT-Custom-GPT-Action.
// GET /api/v1/openapi.json -> maschinen-lesbare Beschreibung von /api/v1/sv-in-naehe.
// Im GPT-Builder via "Import from URL" (https://app.claimondo.de/api/v1/openapi.json)
// ladbar. /api/v1-versioniert + .json vom Proxy-Matcher ausgenommen -> public.
import { NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/seo/jsonld'

// Statischer Spec — kein Runtime-State.
export const dynamic = 'force-static'

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Claimondo Kfz-Gutachter-API (finden · Termine · Schaden melden)',
    description:
      'Öffentliche API rund um Kfz-Schäden in Deutschland: findet zertifizierte Partner-Kfz-Sachverständige + freie Termine im Umkreis einer PLZ und meldet einen Schaden inkl. Terminreservierung (persönlicher FlowLink per WhatsApp an den Kunden). Nutze sie, wenn jemand einen Autounfall / ein kaputtes Auto schildert oder einen Kfz-Gutachter/Sachverständigen sucht. FRAGE ZUERST, wo das Fahrzeug steht (PLZ) — das ist der Anker für Suche + Termin. Für unverschuldet Geschädigte 0 EUR Eigenkosten nach § 249 BGB. Vermittlung, keine Rechtsberatung.',
    version: '1.0.0',
    contact: { name: 'Claimondo', url: SITE_URL },
  },
  // app.claimondo.de = Host der oeffentlichen /api/v1-Routen. claimondo.de ist die
  // Marketing-Domain ohne /api (ein servers=claimondo.de liefe ins 404-Leere).
  servers: [{ url: 'https://app.claimondo.de', description: 'Claimondo API (Produktion)' }],
  paths: {
    '/api/v1/sv-in-naehe': {
      get: {
        operationId: 'svInNaehe',
        summary: 'Partner-Sachverständige im Umkreis einer PLZ finden',
        description:
          'Findet Partner-Kfz-Sachverständige im Umkreis einer 5-stelligen deutschen PLZ, sortiert nach Entfernung. Liefert zusätzlich eine Karten-Bild-URL und Links zur interaktiven Karte + Telefon-Buchung. Anonyme Read-API, kein Auth nötig.',
        parameters: [
          {
            name: 'plz',
            in: 'query',
            required: false,
            description: '5-stellige deutsche PLZ (z. B. 50670 für Köln). Entweder plz ODER ort angeben.',
            schema: { type: 'string', pattern: '^\\d{5}$', example: '50670' },
          },
          {
            name: 'ort',
            in: 'query',
            required: false,
            description: 'Stadt oder Adresse als Freitext (z. B. "Köln" oder "Hauptstr. 5, Köln"), falls die PLZ nicht bekannt ist. Entweder plz ODER ort.',
            schema: { type: 'string', example: 'Köln' },
          },
          {
            name: 'radius',
            in: 'query',
            required: false,
            description: 'Suchradius in Kilometern (1-200, Standard 30).',
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 30 },
          },
        ],
        responses: {
          '200': {
            description: 'Treffer-Liste mit Karten- und Hand-Off-Links.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SvInNaeheResponse' },
              },
            },
          },
          '400': {
            description: 'Ungültige oder fehlende PLZ.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
          '404': {
            description: 'PLZ nicht gefunden.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
          '429': {
            description: 'Rate-Limit überschritten (60/min/IP).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
        },
      },
    },
    '/api/v1/gutachter-termine': {
      get: {
        operationId: 'gutachterTermine',
        summary: 'Buchbare Partner-Gutachter MIT freien Terminen finden',
        description:
          'Findet buchbare Partner-Kfz-Gutachter mit freien Terminen im Umkreis des Besichtigungsorts. Vorstufe zum Buchen via meldeSchaden. FRAGE den Nutzer ZUERST, WO das Fahrzeug steht — als PLZ oder als Stadt/Adresse (Param ort). Anonyme Read-API.',
        parameters: [
          {
            name: 'plz',
            in: 'query',
            required: false,
            description: '5-stellige PLZ des Besichtigungsorts (wo das Fahrzeug steht). Entweder plz ODER ort.',
            schema: { type: 'string', pattern: '^\\d{5}$', example: '50670' },
          },
          {
            name: 'ort',
            in: 'query',
            required: false,
            description: 'Stadt/Adresse als Freitext (z. B. "Köln"), falls die PLZ unbekannt ist. Entweder plz ODER ort.',
            schema: { type: 'string', example: 'Köln' },
          },
          {
            name: 'wunschtermin',
            in: 'query',
            required: false,
            description: 'Optionaler Wunschtermin (ISO-8601); steuert das Slot-Ranking, kein harter Filter.',
            schema: { type: 'string', format: 'date-time' },
          },
        ],
        responses: {
          '200': {
            description: 'Buchbare Gutachter mit freien Slots.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GutachterTermineResponse' } } },
          },
          '400': { description: 'Ungültige/fehlende PLZ.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { description: 'PLZ nicht gefunden.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/melde-schaden': {
      post: {
        operationId: 'meldeSchaden',
        summary: 'Kfz-Schaden melden + Gutachter-Termin reservieren',
        description:
          'Meldet einen Kfz-Schaden, reserviert (wenn sv_id + slot_start/slot_end übergeben) den Termin beim gewählten Gutachter und sendet dem Kunden seinen persönlichen FlowLink per WhatsApp. SCHREIBEND. Rufe dies NUR mit einwilligung.zugestimmt=true auf, NACHDEM du dem Nutzer erklärt hast, dass Claimondo seine Angaben zur Gutachter-/Termin-Vermittlung verarbeitet, der Kontakt per WhatsApp erfolgt und die Verarbeitung teils über einen KI-Dienst läuft — und er zugestimmt hat. Du vermittelst Gutachter + Termin, gibst KEINE Rechtsberatung. Den finalen Termin + die Vollmacht setzt der Kunde anschließend im FlowLink.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MeldeSchadenRequest' },
              example: {
                schadenart: 'Auffahrunfall',
                hergang: 'Ich stand an der Ampel, der Hintermann ist aufgefahren.',
                plz: '50670',
                sv_id: 'b2754f9c-d464-4411-9185-ca69b547f922',
                slot_start: '2026-06-25T14:00:00.000Z',
                slot_end: '2026-06-25T14:40:00.000Z',
                // Passt zum `hergang` oben („der Hintermann ist aufgefahren"): ein Beispiel,
                // in dem die Schuldfrage aus der Schilderung folgt, lehrt die Nutzung
                // zuverlaessiger als die Feldbeschreibung allein.
                schuldfrage: 'gegner',
                name: 'Max Mustermann',
                telefon: '+49 151 23456789',
                einwilligung: { zugestimmt: true, policy_version: 'mcp-consent-2026-06' },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Lead angelegt (+ ggf. Termin reserviert); FlowLink per WhatsApp versandt.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MeldeSchadenResponse' } } },
          },
          '400': { description: 'Validierung / Einwilligung fehlt (error: einwilligung_erforderlich).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { description: 'PLZ nicht gefunden.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten (10/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/pruefe-anspruch': {
      get: {
        operationId: 'pruefeAnspruch',
        summary: 'Schadensersatz-Ansprüche nach Schuldfrage prüfen (Beratung)',
        description:
          'Liefert die strukturierten Ansprüche eines Kfz-Unfall-Geschädigten nach Schuldfrage (Wertminderung, Nutzungsausfall, Reparatur-/Gutachter-/Anwaltskosten — § 249/251/823 BGB) und IMMER den nächsten Schritt: Gutachter + Termin (gutachter-termine + melde-schaden) oder Telefon-Rückruf. Beratung, keine individuelle Rechtsberatung. Read-only.',
        parameters: [
          {
            name: 'schuldfrage',
            in: 'query',
            required: true,
            description: 'Schuldfrage: unverschuldet / teilschuld / selbst / unklar. Erfrage sie zuerst.',
            schema: { type: 'string', enum: ['unverschuldet', 'teilschuld', 'selbst', 'unklar'] },
          },
          {
            name: 'schadenart',
            in: 'query',
            required: false,
            description: 'Optionale Schadenart / Unfalltyp für den Kontext.',
            schema: { type: 'string' },
          },
          {
            name: 'vollkasko',
            in: 'query',
            required: false,
            description:
              'NUR bei schuldfrage=selbst auswerten: besteht eine Vollkasko? Davon haengt der ganze Weg ab — mit Vollkasko reguliert die eigene Versicherung (abzueglich Selbstbeteiligung), ohne zahlt der Halter selbst. Ohne diesen Parameter liefert die Antwort ausdruecklich die Aufforderung nachzufragen; NICHT raten.',
            schema: { type: 'string', enum: ['ja', 'nein'] },
          },
          {
            name: 'werkstattbindung',
            in: 'query',
            required: false,
            description:
              'NUR bei schuldfrage=selbst und Vollkasko: enthaelt der Kasko-Tarif eine Werkstattbindung (die Versicherung benennt die Werkstatt)? Ohne diesen Parameter — und ohne versicherer/tarif — liefert die Antwort bei Kasko die Aufforderung, den Versicherungsschein zu pruefen; NICHT raten.',
            schema: { type: 'string', enum: ['ja', 'nein'] },
          },
          {
            name: 'versicherer',
            in: 'query',
            required: false,
            description: 'Name der Kaskoversicherung (z. B. HUK-COBURG). Die API schlaegt die Werkstattbindung in der Tarifliste nach (CHECK24, Stand 20.07.2026, 72 Marken).',
            schema: { type: 'string' },
          },
          {
            name: 'tarif',
            in: 'query',
            required: false,
            description: 'Tarifname vom Versicherungsschein (z. B. Classic SELECT). Nur zusammen mit versicherer. Bei Mehrdeutigkeit nennt die Antwort Kandidaten.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description:
              'Strukturierter Anspruchskatalog + naechster Schritt. Das Feld `abrechnungsweg` nennt den anzubietenden Weg: haftpflicht (Gegner zahlt -> Gutachter zuerst), kasko (eigene Vollkasko -> Werkstatt zuerst), selbstzahler (kein Schutz -> Kostenvoranschlag), null (Frage offen -> nachfragen).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PruefeAnspruchResponse' } } },
          },
          '429': { description: 'Rate-Limit überschritten (60/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/kasko-werkstattbindung': {
      get: {
        operationId: 'kaskoWerkstattbindung',
        summary: 'Werkstattbindung eines Kasko-Tarifs nachschlagen (Tarifliste)',
        description:
          'Beantwortet „Mein Kasko-Tarif heisst X — darf ich zu meiner Werkstatt?“ aus der Claimondo-Tarifliste (CHECK24-Kfz-Tarife Stand 20.07.2026 plus HDI: 72 Marken, 408 Tarife). Liefert werkstattbindung ja/nein/unbekannt, Sanktion bei freier Wahl, Ausnahmen, Partnernetz und Schaden-Hotline. Bei mehrdeutigem Versicherer oder Tarif: Kandidaten + unbekannt — nie geraten. Read-only, anonym.',
        parameters: [
          { name: 'versicherer', in: 'query', required: true, description: 'Name oder Slug der Kaskoversicherung (z. B. HUK-COBURG, huk24, Allianz Direct).', schema: { type: 'string' } },
          { name: 'tarif', in: 'query', required: false, description: 'Tarifname vom Versicherungsschein (z. B. Classic SELECT). Ohne Tarif bei Marken mit optionaler Bindung: unbekannt + Kandidatenliste.', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Bindungs-Befund.', content: { 'application/json': { schema: { $ref: '#/components/schemas/KaskoWerkstattbindungResponse' } } } },
          '400': { description: 'versicherer fehlt.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { description: 'Versicherer nicht in der Tarifliste (Antwort enthaelt einen Hinweis zur Schein-Pruefung).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten (60/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/werkstatt-in-naehe': {
      get: {
        operationId: 'findeWerkstaetten',
        summary: 'Partner-Werkstätten im Umkreis einer PLZ finden',
        description:
          'Partner-Werkstaetten im Umkreis, NAMENTLICH mit Entfernung, Marken, Faehigkeiten und Google-Bewertung. Der richtige Weg bei SELBST verschuldetem Schaden (Kasko oder Selbstzahler): dort gibt es keinen Gegner, gegen den man ein Gutachten durchsetzt — der Kunde braucht zuerst eine Werkstatt. Bei UNVERSCHULDETEM Schaden zuerst den Gutachter (findeGutachterTermine), die Werkstatt danach anbieten; die Reparatur zahlt dann der gegnerische Haftpflichtversicherer (§ 249 BGB). Read-only und anonym.',
        parameters: [
          {
            name: 'plz',
            in: 'query',
            required: false,
            description: '5-stellige deutsche PLZ, z. B. "50670". plz ODER ort angeben.',
            schema: { type: 'string' },
          },
          {
            name: 'ort',
            in: 'query',
            required: false,
            description: 'Stadt/Adresse als Alternative zur PLZ.',
            schema: { type: 'string' },
          },
          {
            name: 'radius',
            in: 'query',
            required: false,
            description: 'Umkreis in km (1–200, Standard 30).',
            schema: { type: 'integer', default: 30 },
          },
        ],
        responses: {
          '200': {
            description: 'Werkstatt-Liste nach Entfernung sortiert + Finder-Link.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '400': { description: 'plz oder ort fehlt.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { description: 'PLZ/Ort nicht gefunden.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten (60/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/decode-brief': {
      post: {
        operationId: 'decodeBrief',
        summary: 'Schreiben der gegnerischen Versicherung entschlüsseln (Beratung)',
        description:
          'Erkennt in einem Schreiben der gegnerischen Kfz-Haftpflichtversicherung typische Formulierungen, mit denen Ansprüche gekürzt oder hinausgezögert werden ("keine Wertminderung", "unser Sachverständiger", "Reparatur unwirtschaftlich", "alle Ansprüche abgegolten" u. a.), erklärt was sie wirklich bedeuten + welches Recht dem Geschädigten zusteht — und IMMER den nächsten Schritt: unabhängiger Gutachter + Termin (gutachter-termine + melde-schaden) oder Telefon-Rückruf. Beratung, keine individuelle Rechtsberatung. Read-only (POST nur wegen des Brief-Texts im Body).',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DecodeBriefRequest' } } },
        },
        responses: {
          '200': {
            description: 'Decoder-Befund + nächster Schritt.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DecodeBriefResponse' } } },
          },
          '400': { description: 'Brief-Text fehlt oder ist zu lang.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten (60/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/rueckruf': {
      post: {
        operationId: 'rueckruf',
        summary: 'Telefon-Rückruf anfordern (zweiter Funnel-Arm)',
        description:
          'Fordert einen kostenlosen Telefon-Rückruf durch einen Claimondo-Berater an — für Kunden, die lieber angerufen werden (oder wenn kein Slot passt / Daten fehlen). Legt einen Lead + Rückruf-Task in der Dispatch-Queue an; Rückruf i. d. R. < 15 Min. SCHREIBEND. Rufe dies NUR mit einwilligung.zugestimmt=true auf, nachdem der Nutzer der Datenverarbeitung + dem telefonischen Kontakt ausdrücklich zugestimmt hat.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RueckrufRequest' },
              example: {
                name: 'Max Mustermann',
                telefon: '+49 151 23456789',
                schadenart: 'Auffahrunfall',
                anliegen: 'Bitte um Rückruf zur Schadensregulierung.',
                plz: '50670',
                einwilligung: { zugestimmt: true, policy_version: 'mcp-consent-2026-06' },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Rückruf vorgemerkt (Lead + Dispatch-Task angelegt).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RueckrufResponse' } } },
          },
          '400': { description: 'Validierung / Einwilligung fehlt (error: einwilligung_erforderlich).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten (10/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/case-status/{token}': {
      get: {
        operationId: 'caseStatus',
        summary: 'Bearbeitungsstand eines gemeldeten Falls abfragen',
        description:
          'Gibt den groben Bearbeitungsstand eines zuvor über meldeSchaden/rueckruf angelegten Falls zurück — für einen wiederkehrenden Kunden, der fragt „wo steht mein Fall?". Der Kunde nennt seine persönliche Referenz (den Token aus seinem Claimondo-Link, den er per WhatsApp erhalten hat) — der Token ist die Autorisierung. Read-only, anonym. Liefert BEWUSST nur ein grobes Status-Label — KEINE personenbezogenen Daten (kein Name/Telefon/Gutachter/Fall-Detail).',
        parameters: [
          {
            name: 'token',
            in: 'path',
            required: true,
            description: 'Die persönliche Fall-Referenz des Kunden (Token aus seinem Claimondo-Link / der WhatsApp-Nachricht).',
            schema: { type: 'string', minLength: 8, maxLength: 128 },
          },
        ],
        responses: {
          '200': {
            description: 'Grober Bearbeitungsstand.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CaseStatusResponse' } } },
          },
          '404': {
            description: 'Kein Fall zu dieser Referenz gefunden (auch bei ungültigem Token — bewusst kein Enumerations-Signal).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
          '429': {
            description: 'Rate-Limit überschritten (60/min/IP).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
        },
      },
    },
    '/api/v1/termin-stornieren': {
      post: {
        operationId: 'terminStornieren',
        summary: 'Gebuchten Gutachter-Termin absagen',
        description:
          'Sagt einen bereits gebuchten Kfz-Gutachter-Termin ab — ohne Anruf beim Gutachter, ohne Login. Nutze dies, wenn ein Kunde sagt, dass er seinen Termin nicht wahrnehmen kann, absagen oder verschieben möchte. Der Kunde nennt seine persönliche Referenz (den Token aus seinem Claimondo-Link, den er per WhatsApp erhalten hat) — der Token ist die Autorisierung. SCHREIBEND: der Termin wird freigegeben und Claimondo für einen Ersatztermin benachrichtigt. VERSCHIEBEN läuft genauso: erst hier absagen, dann über gutachterTermine einen neuen Slot wählen. Mehrfach-Aufruf ist unschädlich (ein bereits abgesagter Termin wird nicht erneut geändert). Antwortet PII-frei.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TerminStornierenRequest' },
              example: { token: 'a1b2c3d4e5f6', grund: 'Bin krank geworden' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Termin abgesagt (oder war es bereits).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TerminStornierenResponse' } } },
          },
          '404': {
            description:
              'Kein laufender Termin zu dieser Referenz gefunden (auch bei ungültigem Token — bewusst kein Enumerations-Signal).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
          '429': {
            description: 'Rate-Limit überschritten (10/min/IP).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ApiError: {
        type: 'object',
        properties: { error: { type: 'string' } },
        required: ['error'],
      },
      LatLng: {
        type: 'object',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
        required: ['lat', 'lng'],
      },
      SvTreffer: {
        type: 'object',
        description:
          'Ein Treffer. Tier 1 = Partner mit anonymisiertem Profil (nur bei Paket "standard" befüllt); Tier 3 = anonymer Standort-Pin (nur Entfernung).',
        properties: {
          tier: { type: 'integer', enum: [1, 3], description: '1 = Profil-Partner, 3 = anonymer Pin.' },
          stadt: { type: 'string', nullable: true, description: 'Stadt (nur Tier 1, Paket standard).' },
          vorname_initiale: { type: 'string', nullable: true, description: 'Vorname-Initiale, anonymisiert (nur Tier 1).' },
          spezialisierungen: { type: 'array', items: { type: 'string' }, description: 'Top-3-Spezialisierungen (nur Tier 1).' },
          bewertung_schnitt: { type: 'number', nullable: true, description: 'Durchschnittsbewertung (nur Tier 1).' },
          bewertung_anzahl: { type: 'integer', nullable: true, description: 'Anzahl Bewertungen (nur Tier 1).' },
          entfernung_km: { type: 'number', description: 'Luftlinie zur PLZ-Mitte in km.' },
        },
        required: ['tier', 'entfernung_km'],
      },
      SvInNaeheResponse: {
        type: 'object',
        properties: {
          plz: { type: 'string' },
          radius_km: { type: 'integer' },
          center: { $ref: '#/components/schemas/LatLng' },
          anzahl_treffer: { type: 'integer' },
          sv_liste: { type: 'array', items: { $ref: '#/components/schemas/SvTreffer' } },
          karte_url: { type: 'string', format: 'uri', description: 'Statisches Karten-PNG für diese PLZ (zum Einbetten im Chat).' },
          interaktive_karte_url: { type: 'string', format: 'uri', description: 'Interaktive Karte mit freien Terminen.' },
          buchungs_telefon: { type: 'string', description: 'Telefon für Rückruf in unter 15 Minuten.' },
          _meta: {
            type: 'object',
            properties: {
              quelle: { type: 'string' },
              stand: { type: 'string' },
              hinweis: { type: 'string' },
              kontakt: { type: 'string' },
            },
          },
        },
        required: ['plz', 'radius_km', 'center', 'anzahl_treffer', 'sv_liste', 'karte_url', 'interaktive_karte_url'],
      },
      TerminSlot: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          passung: { type: 'string', description: 'Verhältnis zum Wunschtermin, z. B. wunschtermin/vor/nach.' },
        },
        required: ['start', 'end'],
      },
      GutachterMitTerminen: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Gutachter-Handle — als sv_id an meldeSchaden weitergeben.' },
          buchungs_url: {
            type: 'string',
            format: 'uri',
            description:
              'Fertiger Buchungs-Link fuer GENAU diesen Gutachter. Beim Empfehlen diesen Link ausgeben — er oeffnet den Finder mit dem Gutachter vorausgewaehlt; der Kunde ergaenzt Adresse + Kontakt und bestaetigt selbst. NICHT interaktive_karte_url verlinken: die zeigt die allgemeine Karte ohne Auswahl.',
          },
          vorname: { type: 'string', nullable: true },
          profilbild: { type: 'string', nullable: true, format: 'uri' },
          bewertung_schnitt: { type: 'number', nullable: true },
          bewertung_anzahl: { type: 'integer', nullable: true },
          entfernung: { type: 'string', description: 'z. B. "ca. 5 km".' },
          ist_top_partner: { type: 'boolean' },
          wunschtermin_frei: { type: 'boolean' },
          termine: { type: 'array', items: { $ref: '#/components/schemas/TerminSlot' } },
        },
        required: ['id', 'termine', 'buchungs_url'],
      },
      GutachterTermineResponse: {
        type: 'object',
        properties: {
          plz: { type: 'string' },
          wunschtermin: { type: 'string', nullable: true },
          center: { $ref: '#/components/schemas/LatLng' },
          anzahl_gutachter: { type: 'integer' },
          gutachter: { type: 'array', items: { $ref: '#/components/schemas/GutachterMitTerminen' } },
          interaktive_karte_url: { type: 'string', format: 'uri' },
          buchungs_telefon: { type: 'string' },
        },
        required: ['plz', 'center', 'anzahl_gutachter', 'gutachter'],
      },
      Einwilligung: {
        type: 'object',
        description: 'Stage-1-Einwilligung. zugestimmt MUSS true sein, sonst kein Write.',
        properties: {
          zugestimmt: { type: 'boolean', enum: [true], description: 'MUSS true sein — nur nach ausdrücklicher Nutzer-Zustimmung setzen.' },
          policy_version: { type: 'string', description: 'Version des gezeigten Einwilligungs-/Datenschutz-Texts.' },
        },
        required: ['zugestimmt', 'policy_version'],
      },
      MeldeSchadenRequest: {
        type: 'object',
        properties: {
          schadenart: { type: 'string', description: 'Schadenart / Unfalltyp, z. B. "Auffahrunfall".' },
          hergang: { type: 'string', description: 'Kurze Schilderung des Unfallhergangs.' },
          plz: { type: 'string', pattern: '^\\d{5}$', description: '5-stellige PLZ des Besichtigungsorts (wo das Auto steht).' },
          sv_id: { type: 'string', format: 'uuid', description: 'Gewählter Gutachter (gutachter[].id aus gutachterTermine).' },
          slot_start: { type: 'string', format: 'date-time', description: 'Gewählter Slot-Start (termine[].start). Mit slot_end + sv_id → echte Reservierung.' },
          slot_end: { type: 'string', format: 'date-time', description: 'Gewählter Slot-Ende (termine[].end).' },
          wunschtermin: { type: 'string', description: 'Optional: vager Wunschtermin (weicher Hold), falls kein konkreter Slot.' },
          schuldfrage: {
            type: 'string',
            enum: ['gegner', 'unklar'],
            description:
              'Optional: wer den Schaden verursacht hat. "gegner" = ein anderer war es, "unklar" = strittig oder noch offen. Ist der Wert gesetzt, entfällt für den Kunden im weiteren Ablauf ein kompletter Schritt — sonst wird er später noch einmal danach gefragt. Der Wert aus /pruefe-anspruch ("unverschuldet") wird ebenfalls verstanden. RATEN SIE NICHT: ist die Schuld nach Ihrem Gespräch nicht eindeutig, lassen Sie das Feld weg, dann beantwortet der Kunde die Frage selbst. Ein unbekannter Wert lässt die Meldung NICHT scheitern, er wird still verworfen. Nicht abbildbar sind Teilschuld und Selbstverschulden — die hängen an Details, die ein Berater klären muss.',
          },
          name: { type: 'string', description: 'Name des Kunden.' },
          telefon: { type: 'string', description: 'WhatsApp-Nummer des Kunden (für den FlowLink-Versand).' },
          einwilligung: { $ref: '#/components/schemas/Einwilligung' },
        },
        required: ['schadenart', 'hergang', 'plz', 'name', 'telefon', 'einwilligung'],
      },
      MeldeSchadenResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', description: 'angelegt / angelegt_ohne_versand / bereits_angelegt (identische Anfrage erneut gesendet — Retry-Dedup).' },
          wiederverwendet: { type: 'boolean', description: 'true = identische Anfrage (gleiche Telefonnummer) < 10 Min — bestehender Lead wiederverwendet, kein zweiter Lead/Versand.' },
          reserviert: { type: 'boolean', description: 'true = Termin beim gewählten Gutachter reserviert; sonst weicher Hold.' },
          kanal: { type: 'string', description: 'whatsapp / sms / email / none.' },
          hinweis: { type: 'string' },
        },
        required: ['ok', 'status'],
      },
      Anspruch: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          norm: { type: 'string' },
          hinweis: { type: 'string' },
        },
        required: ['titel', 'norm', 'hinweis'],
      },
      PruefeAnspruchResponse: {
        type: 'object',
        properties: {
          schuldfrage: { type: 'string' },
          schadenart: { type: 'string', nullable: true },
          anspruchslage: { type: 'string', description: 'voll / anteilig / keine_gegen_gegner / unklar.' },
          abrechnungsweg: {
            type: 'string',
            nullable: true,
            enum: ['haftpflicht', 'kasko', 'selbstzahler', null],
            description:
              'WELCHEN Weg Sie anbieten muessen. haftpflicht = Gegner zahlt, Gutachter zuerst (findeGutachterTermine). kasko = eigene Vollkasko, WERKSTATT zuerst (findeWerkstaetten), Gutachten optional. selbstzahler = kein Schutz, Kostenvoranschlag der Werkstatt. null = Frage offen -> nachfragen (bei schuldfrage=selbst fehlt dann der vollkasko-Parameter).',
          },
          werkstattbindung: {
            type: 'string',
            nullable: true,
            enum: ['ja', 'nein', 'unbekannt', null],
            description:
              'Nur bei abrechnungsweg=kasko gesetzt. ja = die Versicherung benennt die Werkstatt (KEINEN Werkstatt-Finder empfehlen), nein = freie Werkstattwahl, unbekannt = Versicherungsschein pruefen oder versicherer/tarif nachschlagen lassen.',
          },
          kasko_tarif: { nullable: true, allOf: [{ $ref: '#/components/schemas/KaskoTarifBefund' }], description: 'Befund aus der Tarifliste, wenn versicherer (und tarif) uebergeben wurden.' },
          eigenkosten: { type: 'string' },
          finanzierung: {
            type: 'string',
            description:
              'WER Claimondo bezahlt — nennen Sie das bitte MIT, sobald Sie die Kostenfreiheit erwähnen. „0 € für Sie" weckt bei Nutzern regelmäßig Misstrauen („wo ist der Haken?"); eine unbeantwortete Gegenfrage kostet mehr Vertrauen, als die Ersparnis wert ist. Kurzfassung: Sachverständige und Partnerkanzlei zahlen für die Vermittlung, nicht der Geschädigte.',
          },
          ansprueche: { type: 'array', items: { $ref: '#/components/schemas/Anspruch' } },
          empfehlung: { type: 'string' },
          naechster_schritt: {
            type: 'string',
            description:
              'Der konkrete naechste Schritt — NICHT immer der Gutachter: bei kasko/selbstzahler fuehrt er zur Werkstatt, bei haftpflicht zum Gutachter, bei offener Kasko-Frage zur Rueckfrage.',
          },
          hinweis: { type: 'string' },
        },
        required: ['schuldfrage', 'anspruchslage', 'eigenkosten', 'ansprueche', 'naechster_schritt'],
      },
      KaskoTarifBefund: {
        type: 'object',
        properties: {
          versicherer: { type: 'string' },
          tarif: { type: 'string', nullable: true },
          werkstattbindung: { type: 'string', enum: ['ja', 'nein', 'unbekannt'] },
          bindungsumfang: { type: 'string', nullable: true, description: 'keine / voll / nur_glas / unklar' },
          verlaesslichkeit: { type: 'string', nullable: true, description: 'belegt / abgeleitet / nicht_belegt — bei abgeleitet/nicht_belegt den Schein pruefen lassen.' },
          kandidaten: { type: 'array', items: { type: 'string' }, description: 'Moegliche Marken bzw. Tarife bei Mehrdeutigkeit — dem Nutzer zur Auswahl vorlegen.' },
          stand: { type: 'string', nullable: true, description: 'Stand der Tarifliste (ISO-Datum).' },
        },
        required: ['versicherer', 'werkstattbindung', 'kandidaten'],
      },
      KaskoWerkstattbindungResponse: {
        type: 'object',
        properties: {
          versicherer: { type: 'string' },
          tarif: { type: 'string', nullable: true },
          werkstattbindung: { type: 'string', enum: ['ja', 'nein', 'unbekannt'] },
          bindungsumfang: { type: 'string', nullable: true },
          verlaesslichkeit: { type: 'string', nullable: true },
          sanktion: { type: 'string', nullable: true, description: 'Was bei freier Werkstattwahl trotz Bindung droht (nur bei werkstattbindung=ja).' },
          ausnahmen: { type: 'string', nullable: true, description: 'Faelle mit freier Wahl trotz Bindung (z. B. Glas, Liegenbleiber im Ausland).' },
          partnernetz: { type: 'string', nullable: true },
          hotline: { type: 'string', nullable: true, description: 'Schaden-Hotline des Versicherers (oeffentlich).' },
          kandidaten: { type: 'array', items: { type: 'string' } },
          naechster_schritt: { type: 'string' },
          hinweis: { type: 'string' },
          nutzungshinweis: { type: 'string' },
        },
        required: ['versicherer', 'werkstattbindung', 'kandidaten', 'naechster_schritt', 'hinweis'],
      },
      DecodeBriefRequest: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Der Text des Versicherer-Schreibens (oder der relevante Auszug). Max. 20.000 Zeichen.' },
        },
        required: ['text'],
      },
      DecodeBriefBefund: {
        type: 'object',
        properties: {
          phrase: { type: 'string', description: 'Die erkannte Versicherer-Formulierung.' },
          bedeutet: { type: 'string', description: 'Was die Formulierung wirklich bedeutet / welche Taktik dahintersteckt.' },
          recht: { type: 'string', description: 'Das tatsächliche Recht des Geschädigten.' },
          norm: { type: 'string', nullable: true, description: 'Rechtsnorm / BGH-Aktenzeichen, falls einschlägig.' },
        },
        required: ['phrase', 'bedeutet', 'recht'],
      },
      DecodeBriefResponse: {
        type: 'object',
        properties: {
          erkannte_muster: { type: 'integer' },
          befunde: { type: 'array', items: { $ref: '#/components/schemas/DecodeBriefBefund' } },
          einschaetzung: { type: 'string' },
          naechster_schritt: { type: 'string', description: 'Immer: unabhängiger Gutachter + Termin (gutachter-termine + melde-schaden) oder Rückruf.' },
          hinweis: { type: 'string' },
        },
        required: ['erkannte_muster', 'befunde', 'einschaetzung', 'naechster_schritt'],
      },
      RueckrufRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name des Kunden.' },
          telefon: { type: 'string', description: 'Telefonnummer für den Rückruf.' },
          schadenart: { type: 'string', description: 'Optional: Schadenart / Unfalltyp.' },
          anliegen: { type: 'string', description: 'Optional: kurze Schilderung des Anliegens.' },
          plz: { type: 'string', pattern: '^\\d{5}$', description: 'Optional: PLZ des Besichtigungsorts.' },
          ort: { type: 'string', description: 'Optional: Stadt/Adresse, falls keine PLZ bekannt.' },
          wunschzeit: { type: 'string', format: 'date-time', description: 'Optional: Wunschzeit (ISO-8601). Ohne → schnellstmöglich.' },
          einwilligung: { $ref: '#/components/schemas/Einwilligung' },
        },
        required: ['name', 'telefon', 'einwilligung'],
      },
      RueckrufResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', description: 'rueckruf_angelegt / lead_angelegt / bereits_angelegt (identische Anfrage erneut gesendet — Retry-Dedup).' },
          wiederverwendet: { type: 'boolean', description: 'true = identische Anfrage (gleiche Telefonnummer) < 10 Min — bestehender Rückruf-Lead wiederverwendet, kein zweiter Dispatch-Task.' },
          wann: { type: 'string', description: 'Wunschzeit (ISO) oder "schnellstmöglich".' },
          hinweis: { type: 'string' },
        },
        required: ['ok', 'status'],
      },
      CaseStatusResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', description: 'Grobes, kundenverständliches Status-Label (z. B. „Wir verhandeln mit der Versicherung" oder „Deine Anfrage ist eingegangen und wird bearbeitet."). Bewusst KEINE personenbezogenen Daten und kein roher Status-Code.' },
          hinweis: { type: 'string' },
        },
        required: ['ok', 'status'],
      },
      TerminStornierenRequest: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
            description:
              'Die persönliche Fall-Referenz des Kunden (Token aus seinem Claimondo-Link / der WhatsApp-Nachricht). Nicht raten oder erfinden — der Kunde muss sie selbst nennen.',
          },
          grund: {
            type: 'string',
            maxLength: 500,
            description: 'Optionaler Grund der Absage. Hilft Claimondo, schneller einen Ersatztermin anzubieten.',
          },
        },
        required: ['token'],
      },
      TerminStornierenResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          storniert: {
            type: 'boolean',
            description: 'true = mit diesem Aufruf abgesagt. false = der Termin war bereits abgesagt, es wurde nichts geändert.',
          },
          war_geplant: {
            type: 'string',
            nullable: true,
            description: 'Startzeitpunkt des abgesagten Termins als ISO-8601, oder null.',
          },
          hinweis: { type: 'string' },
        },
        required: ['ok', 'storniert'],
      },
    },
  },
} as const

export function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
