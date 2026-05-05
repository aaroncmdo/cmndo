import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_API_KEY = Deno.env.get("WEBHOOK_API_KEY")!;

// ─── Hilfsfunktionen ──────────────────────────────────────────

// Erwartet "DD.MM.YYYY HH:MM" → ISO-String
function parseGermanDateTime(input: string): string | null {
  if (!input) return null;
  const match = input
    .trim()
    .match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const dateStr = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const m = parseInt(month);
  const offset = m >= 4 && m <= 9 ? "+02:00" : "+01:00";
  return new Date(dateStr + offset).toISOString();
}

// Erwartet "DD.MM.YYYY" oder "DD.MM.YYYY HH:MM" → "YYYY-MM-DD" (Unfalldatum, kein Timestamp).
// Elementor sendet Date-Felder je nach Konfig mit Zeit-Suffix; wir matchen tolerant
// und ignorieren die Zeit hier, weil unfalldatum ein DATE ist.
function parseGermanDate(input: string): string | null {
  if (!input) return null;
  const match = input.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+\d{2}:\d{2})?$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

// Kombiniert Datum (mit oder ohne Zeit-Suffix) + separate Uhrzeit zu ISO-Timestamp.
// Elementor schickt field_rueckrufdatum oft als "DD.MM.YYYY HH:MM" (datetime-Field)
// und field_rueckrufzeit als reine Uhrzeit "HH:MM". Wir nehmen nur das Datum aus
// rueckrufdatum und kombinieren es mit rueckrufzeit (= echte Wunsch-Uhrzeit).
function parseRueckrufTermin(datum: string, zeit: string): string | null {
  if (!datum || !zeit) return null;
  const datumMatch = datum.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!datumMatch) return null;
  const [, day, month, year] = datumMatch;
  return parseGermanDateTime(`${day}.${month}.${year} ${zeit.trim()}`);
}

// Vollständiger Name → { vorname, nachname }
function splitName(name: string): { vorname: string | null; nachname: string | null } {
  const parts = (name ?? "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { vorname: null, nachname: null };
  const vorname = parts[0];
  const nachname = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { vorname, nachname };
}

function isWithinWorkingHours(
  dateISO: string,
  workingHours: Record<string, string[]>
): boolean {
  if (!workingHours) return false;
  const date = new Date(dateISO);
  const dayMap: Record<number, string> = {
    0: "so", 1: "mo", 2: "di", 3: "mi", 4: "do", 5: "fr", 6: "sa",
  };
  const dayKey = dayMap[date.getUTCDay()];
  const hours = workingHours[dayKey];
  if (!hours || hours.length < 2) return false;

  const month = date.getUTCMonth() + 1;
  const offset = month >= 4 && month <= 9 ? 2 : 1;
  const localHour = date.getUTCHours() + offset;
  const localMinute = date.getUTCMinutes();
  const localTime = localHour * 60 + localMinute;

  const [startH, startM] = hours[0].split(":").map(Number);
  const [endH, endM] = hours[1].split(":").map(Number);

  return localTime >= startH * 60 + startM && localTime <= endH * 60 + endM;
}

// ─── Resolver ─────────────────────────────────────────────────

async function resolveAssignee(
  supabase: ReturnType<typeof createClient>,
  rueckrufTermin: string | null
): Promise<string | null> {
  // Rückruftermine gehen ausschließlich an Dispatch — KB/Admin sind kein
  // Fallback. Wenn kein Dispatch verfügbar ist, läuft der Lead unassigned
  // ins System (zugewiesen_an = null) und wird in der Dispatch-Lead-Liste
  // sichtbar damit ihn der nächste verfügbare Dispatcher selbst greift.
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, working_hours")
    .eq("rolle", "dispatch")
    .eq("aktiv", true);

  if (error || !profiles?.length) return null;

  const { data: leadCounts } = await supabase
    .from("leads")
    .select("zugewiesen_an")
    .not("zugewiesen_an", "is", null)
    .not(
      "status",
      "in",
      '("umgewandelt","umgewandelt-sv","disqualifiziert","kalt")'
    );

  const countMap: Record<string, number> = {};
  (leadCounts || []).forEach((l: { zugewiesen_an: string }) => {
    countMap[l.zugewiesen_an] = (countMap[l.zugewiesen_an] || 0) + 1;
  });

  // Sortierung: zuerst Dispatcher die zum Rückrufzeitpunkt verfügbar sind
  // (working_hours-Match), dann nach offenen Leads aufsteigend (load-balanced).
  const sorted = profiles
    .map((p) => ({
      id: p.id,
      openLeads: countMap[p.id] || 0,
      available: rueckrufTermin
        ? isWithinWorkingHours(rueckrufTermin, p.working_hours)
        : true,
    }))
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.openLeads - b.openLeads;
    });

  return sorted[0]?.id || null;
}

// ─── Hauptlogik ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== WEBHOOK_API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    if (!body.field_datenschutz || body.field_datenschutz === "false") {
      return new Response(
        JSON.stringify({ error: "Datenschutz muss akzeptiert werden" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.phone) {
      return new Response(
        JSON.stringify({ error: "Telefonnummer ist Pflicht" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Name aufsplitten: "Max Mustermann" → vorname="Max", nachname="Mustermann"
    const { vorname, nachname } = splitName(body.name ?? "");

    // Unfalldatum (field_wann = "DD.MM.YYYY")
    const schadensDatum = parseGermanDate(body.field_wann);

    // Rückruftermin: field_rueckrufdatum + field_rueckrufzeit → kombinierter ISO-Timestamp
    const rueckrufTermin = parseRueckrufTermin(
      body.field_rueckrufdatum ?? "",
      body.field_rueckrufzeit ?? ""
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Zuständigen Mitarbeiter anhand Rückruf-Verfügbarkeit finden
    const assigneeId = await resolveAssignee(supabase, rueckrufTermin);

    // 2. Lead anlegen
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        vorname: vorname || null,
        nachname: nachname || null,
        telefon: body.phone,
        notiz: body.message || null,
        source_channel: body.source_channel || "elementor",
        source_domain: body.source_domain || null,
        unfalldatum: schadensDatum,
        status: "neu",
        qualifizierungs_phase: "neu",
        service_typ: "komplett",
        zugewiesen_an: assigneeId,
      })
      .select("id, vorname, nachname, telefon")
      .single();

    if (leadError) {
      console.error("Lead insert error:", leadError);
      return new Response(
        JSON.stringify({
          error: "Lead konnte nicht gespeichert werden",
          details: leadError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Rückruf-Termin für den Dispatcher anlegen (nur wenn Datum + Zeit mitgeschickt)
    if (rueckrufTermin && assigneeId) {
      const terminStart = new Date(rueckrufTermin);
      const terminEnd = new Date(terminStart.getTime() + 15 * 60 * 1000);
      const nameFull = [vorname, nachname].filter(Boolean).join(" ") || "Neuer Lead";

      await supabase.from("admin_termine").insert({
        typ: "rueckruf",
        titel: `Rückruf: ${nameFull} (${body.phone})`,
        beschreibung: body.message || null,
        start_zeit: terminStart.toISOString(),
        end_zeit: terminEnd.toISOString(),
        lead_id: lead.id,
        erstellt_von: assigneeId,
        zugewiesen_an: assigneeId,
        status: "offen",
      });

      // Migration 20260501085948 (AAR-637): denormalisiertes Feld
      // leads.rueckruf_geplant_am für Dispatch-Listen-Schnell-Lookup
      // synchron schreiben. saveRueckruf() macht das im Web-Flow,
      // hier in der Edge Function müssen wir es selbst nachziehen.
      await supabase
        .from("leads")
        .update({ rueckruf_geplant_am: terminStart.toISOString() })
        .eq("id", lead.id);
    }

    // 4. Timeline-Eintrag
    const nameFull = [vorname, nachname].filter(Boolean).join(" ") || "–";
    await supabase.from("timeline").insert({
      lead_id: lead.id,
      typ: "lead_erstellt",
      titel: "Lead über Elementor eingegangen",
      beschreibung: [
        `Neuer Lead: ${nameFull} (${body.phone})`,
        schadensDatum ? `Unfalldatum: ${body.field_wann}` : null,
        rueckrufTermin
          ? `Rückruf gewünscht: ${body.field_rueckrufdatum} um ${body.field_rueckrufzeit}`
          : null,
        body.message ? `Nachricht: ${body.message}` : null,
        assigneeId ? "Automatisch zugewiesen" : "Keine Zuweisung möglich",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        assigned_to: assigneeId,
        rueckruf_termin: rueckrufTermin || null,
        schadens_datum: schadensDatum || null,
        message: `Lead ${nameFull} erfolgreich angelegt`,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Ungültiger Request Body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
});
