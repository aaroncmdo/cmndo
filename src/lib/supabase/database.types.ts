export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      abrechnung_positionen: {
        Row: {
          abrechnung_id: string
          fall_datum: string
          fall_id: string
          guthaben_verrechnet_netto: number
          id: string
          kennzeichen: string | null
          lead_preis_netto: number
          lead_preis_typ: string
          position_nr: number
          schadenhoehe_netto: number
          sv_nachzahlung_netto: number
        }
        Insert: {
          abrechnung_id: string
          fall_datum: string
          fall_id: string
          guthaben_verrechnet_netto?: number
          id?: string
          kennzeichen?: string | null
          lead_preis_netto: number
          lead_preis_typ: string
          position_nr: number
          schadenhoehe_netto: number
          sv_nachzahlung_netto?: number
        }
        Update: {
          abrechnung_id?: string
          fall_datum?: string
          fall_id?: string
          guthaben_verrechnet_netto?: number
          id?: string
          kennzeichen?: string | null
          lead_preis_netto?: number
          lead_preis_typ?: string
          position_nr?: number
          schadenhoehe_netto?: number
          sv_nachzahlung_netto?: number
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_positionen_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      abrechnung_reminders: {
        Row: {
          abrechnung_id: string
          details: Json | null
          id: string
          reminder_typ: string
          versendet_am: string
        }
        Insert: {
          abrechnung_id: string
          details?: Json | null
          id?: string
          reminder_typ: string
          versendet_am?: string
        }
        Update: {
          abrechnung_id?: string
          details?: Json | null
          id?: string
          reminder_typ?: string
          versendet_am?: string
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_reminders_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnungen"
            referencedColumns: ["id"]
          },
        ]
      }
      abrechnungen: {
        Row: {
          abrechnungs_nr: string
          abrechnungs_zeitraum_ende: string
          abrechnungs_zeitraum_start: string
          bezahlt_am: string | null
          bezahlt_betrag: number | null
          created_at: string
          einzug_fehler: string | null
          einzug_versucht_am: string | null
          email_log_id: string | null
          empfaenger_email: string
          empfaenger_id: string | null
          empfaenger_name: string
          empfaenger_typ: string
          ersetzt_durch_abrechnung_id: string | null
          faellig_am: string | null
          id: string
          notiz: string | null
          pdf_path: string | null
          positionen: Json
          reminder_gesendet_am: string | null
          status: string
          storniert_am: string | null
          storniert_grund: string | null
          stripe_payment_intent_id: string | null
          summe_brutto: number
          summe_netto: number
          updated_at: string
          ust_betrag: number
          ust_satz: number
          versand_datum: string | null
          whatsapp_gesendet_am: string | null
        }
        Insert: {
          abrechnungs_nr: string
          abrechnungs_zeitraum_ende: string
          abrechnungs_zeitraum_start: string
          bezahlt_am?: string | null
          bezahlt_betrag?: number | null
          created_at?: string
          einzug_fehler?: string | null
          einzug_versucht_am?: string | null
          email_log_id?: string | null
          empfaenger_email: string
          empfaenger_id?: string | null
          empfaenger_name: string
          empfaenger_typ: string
          ersetzt_durch_abrechnung_id?: string | null
          faellig_am?: string | null
          id?: string
          notiz?: string | null
          pdf_path?: string | null
          positionen: Json
          reminder_gesendet_am?: string | null
          status?: string
          storniert_am?: string | null
          storniert_grund?: string | null
          stripe_payment_intent_id?: string | null
          summe_brutto: number
          summe_netto: number
          updated_at?: string
          ust_betrag: number
          ust_satz?: number
          versand_datum?: string | null
          whatsapp_gesendet_am?: string | null
        }
        Update: {
          abrechnungs_nr?: string
          abrechnungs_zeitraum_ende?: string
          abrechnungs_zeitraum_start?: string
          bezahlt_am?: string | null
          bezahlt_betrag?: number | null
          created_at?: string
          einzug_fehler?: string | null
          einzug_versucht_am?: string | null
          email_log_id?: string | null
          empfaenger_email?: string
          empfaenger_id?: string | null
          empfaenger_name?: string
          empfaenger_typ?: string
          ersetzt_durch_abrechnung_id?: string | null
          faellig_am?: string | null
          id?: string
          notiz?: string | null
          pdf_path?: string | null
          positionen?: Json
          reminder_gesendet_am?: string | null
          status?: string
          storniert_am?: string | null
          storniert_grund?: string | null
          stripe_payment_intent_id?: string | null
          summe_brutto?: number
          summe_netto?: number
          updated_at?: string
          ust_betrag?: number
          ust_satz?: number
          versand_datum?: string | null
          whatsapp_gesendet_am?: string | null
        }
        Relationships: []
      }
      admin_termine: {
        Row: {
          beschreibung: string | null
          created_at: string
          end_zeit: string
          erinnerung_min_vorher: number | null
          erstellt_von: string
          fall_id: string | null
          id: string
          kunde_id: string | null
          notizen: string | null
          start_zeit: string
          status: string
          titel: string
          typ: string
          updated_at: string
          zugewiesen_an: string | null
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          end_zeit: string
          erinnerung_min_vorher?: number | null
          erstellt_von: string
          fall_id?: string | null
          id?: string
          kunde_id?: string | null
          notizen?: string | null
          start_zeit: string
          status?: string
          titel: string
          typ: string
          updated_at?: string
          zugewiesen_an?: string | null
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          end_zeit?: string
          erinnerung_min_vorher?: number | null
          erstellt_von?: string
          fall_id?: string | null
          id?: string
          kunde_id?: string | null
          notizen?: string | null
          start_zeit?: string
          status?: string
          titel?: string
          typ?: string
          updated_at?: string
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          endpoint: string
          fall_id: string | null
          id: string
          input_tokens: number
          model: string
          output_tokens: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          endpoint: string
          fall_id?: string | null
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          endpoint?: string
          fall_id?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      aircall_calls: {
        Row: {
          aircall_id: string
          aircall_user_email: string | null
          aircall_user_id: string | null
          answered_at: string | null
          comments: string | null
          created_at: string | null
          direction: string
          duration: number | null
          ended_at: string | null
          fall_id: string | null
          from_number: string
          id: number
          initiated_by_profile_id: string | null
          lead_id: string | null
          raw_event: Json | null
          recording_url: string | null
          started_at: string
          status: string
          tags: string[] | null
          to_number: string
          updated_at: string | null
          voicemail_url: string | null
        }
        Insert: {
          aircall_id: string
          aircall_user_email?: string | null
          aircall_user_id?: string | null
          answered_at?: string | null
          comments?: string | null
          created_at?: string | null
          direction: string
          duration?: number | null
          ended_at?: string | null
          fall_id?: string | null
          from_number: string
          id?: number
          initiated_by_profile_id?: string | null
          lead_id?: string | null
          raw_event?: Json | null
          recording_url?: string | null
          started_at: string
          status: string
          tags?: string[] | null
          to_number: string
          updated_at?: string | null
          voicemail_url?: string | null
        }
        Update: {
          aircall_id?: string
          aircall_user_email?: string | null
          aircall_user_id?: string | null
          answered_at?: string | null
          comments?: string | null
          created_at?: string | null
          direction?: string
          duration?: number | null
          ended_at?: string | null
          fall_id?: string | null
          from_number?: string
          id?: number
          initiated_by_profile_id?: string | null
          lead_id?: string | null
          raw_event?: Json | null
          recording_url?: string | null
          started_at?: string
          status?: string
          tags?: string[] | null
          to_number?: string
          updated_at?: string | null
          voicemail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aircall_calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_initiated_by_profile_id_fkey"
            columns: ["initiated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      aircall_relay_seats: {
        Row: {
          aircall_number_id: number
          aircall_user_email: string
          aircall_user_id: number
          aktiv: boolean
          belegt: boolean
          belegt_call_id: string | null
          belegt_seit: string | null
          bezeichnung: string
          created_at: string
          id: string
          notiz: string | null
          updated_at: string
          zuletzt_verwendet: string | null
        }
        Insert: {
          aircall_number_id: number
          aircall_user_email: string
          aircall_user_id: number
          aktiv?: boolean
          belegt?: boolean
          belegt_call_id?: string | null
          belegt_seit?: string | null
          bezeichnung: string
          created_at?: string
          id?: string
          notiz?: string | null
          updated_at?: string
          zuletzt_verwendet?: string | null
        }
        Update: {
          aircall_number_id?: number
          aircall_user_email?: string
          aircall_user_id?: number
          aktiv?: boolean
          belegt?: boolean
          belegt_call_id?: string | null
          belegt_seit?: string | null
          bezeichnung?: string
          created_at?: string
          id?: string
          notiz?: string | null
          updated_at?: string
          zuletzt_verwendet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aircall_relay_seats_belegt_call_id_fkey"
            columns: ["belegt_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_remember_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          expires_at: string
          id: string
          ip_address: string | null
          last_used_at: string
          revoked_am: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          last_used_at?: string
          revoked_am?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_used_at?: string
          revoked_am?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      benachrichtigungen: {
        Row: {
          beschreibung: string | null
          created_at: string
          erstellt_am: string | null
          gelesen: boolean
          id: string
          link: string | null
          nachricht: string | null
          titel: string
          typ: string | null
          user_id: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          erstellt_am?: string | null
          gelesen?: boolean
          id?: string
          link?: string | null
          nachricht?: string | null
          titel: string
          typ?: string | null
          user_id: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          erstellt_am?: string | null
          gelesen?: boolean
          id?: string
          link?: string | null
          nachricht?: string | null
          titel?: string
          typ?: string | null
          user_id?: string
        }
        Relationships: []
      }
      branchen_benchmarks: {
        Row: {
          beschreibung: string
          branchen_wert: number
          created_at: string
          einheit: string
          gueltig_ab: string
          id: string
          metrik: string
          quelle: string | null
        }
        Insert: {
          beschreibung: string
          branchen_wert: number
          created_at?: string
          einheit: string
          gueltig_ab: string
          id?: string
          metrik: string
          quelle?: string | null
        }
        Update: {
          beschreibung?: string
          branchen_wert?: number
          created_at?: string
          einheit?: string
          gueltig_ab?: string
          id?: string
          metrik?: string
          quelle?: string | null
        }
        Relationships: []
      }
      call_copilot_suggestions: {
        Row: {
          ausloeser: string
          call_id: string
          created_at: string
          id: string
          kategorie: string
          vorschlag: string
          zeitpunkt_offset_sek: number
        }
        Insert: {
          ausloeser: string
          call_id: string
          created_at?: string
          id?: string
          kategorie: string
          vorschlag: string
          zeitpunkt_offset_sek?: number
        }
        Update: {
          ausloeser?: string
          call_id?: string
          created_at?: string
          id?: string
          kategorie?: string
          vorschlag?: string
          zeitpunkt_offset_sek?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_copilot_suggestions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcription_utterances: {
        Row: {
          aircall_call_id: string
          call_id: string
          empfangen_am: string
          end_time: number | null
          id: string
          speaker: string | null
          start_time: number | null
          text: string
          verarbeitet: boolean
        }
        Insert: {
          aircall_call_id: string
          call_id: string
          empfangen_am?: string
          end_time?: number | null
          id?: string
          speaker?: string | null
          start_time?: number | null
          text: string
          verarbeitet?: boolean
        }
        Update: {
          aircall_call_id?: string
          call_id?: string
          empfangen_am?: string
          end_time?: number | null
          id?: string
          speaker?: string | null
          start_time?: number | null
          text?: string
          verarbeitet?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "call_transcription_utterances_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          aircall_call_id: string
          beantwortet_am: string | null
          beendet_am: string | null
          bridge: Json | null
          created_at: string
          dauer_sekunden: number | null
          fall_id: string | null
          gestartet_am: string | null
          id: string
          initiator_user_id: string | null
          ki_naechste_schritte: string | null
          ki_zusammenfassung: string | null
          lead_id: string | null
          notiz: string | null
          recording_url: string | null
          richtung: string
          sentiment: string | null
          status: string
          transkript: Json | null
          transkript_text: string | null
          updated_at: string
          von_nummer: string | null
          zu_nummer: string | null
        }
        Insert: {
          aircall_call_id: string
          beantwortet_am?: string | null
          beendet_am?: string | null
          bridge?: Json | null
          created_at?: string
          dauer_sekunden?: number | null
          fall_id?: string | null
          gestartet_am?: string | null
          id?: string
          initiator_user_id?: string | null
          ki_naechste_schritte?: string | null
          ki_zusammenfassung?: string | null
          lead_id?: string | null
          notiz?: string | null
          recording_url?: string | null
          richtung: string
          sentiment?: string | null
          status: string
          transkript?: Json | null
          transkript_text?: string | null
          updated_at?: string
          von_nummer?: string | null
          zu_nummer?: string | null
        }
        Update: {
          aircall_call_id?: string
          beantwortet_am?: string | null
          beendet_am?: string | null
          bridge?: Json | null
          created_at?: string
          dauer_sekunden?: number | null
          fall_id?: string | null
          gestartet_am?: string | null
          id?: string
          initiator_user_id?: string | null
          ki_naechste_schritte?: string | null
          ki_zusammenfassung?: string | null
          lead_id?: string | null
          notiz?: string | null
          recording_url?: string | null
          richtung?: string
          sentiment?: string | null
          status?: string
          transkript?: Json | null
          transkript_text?: string | null
          updated_at?: string
          von_nummer?: string | null
          zu_nummer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      community_leaderboard: {
        Row: {
          durchschnitt_bearbeitungsdauer_h: number | null
          faelle_count: number
          id: string
          letzte_aktualisierung: string
          organisation_id: string
          rang: number | null
          sv_id: string
          umsatz_netto: number
          zeitraum_jahr: number
          zeitraum_monat: number
        }
        Insert: {
          durchschnitt_bearbeitungsdauer_h?: number | null
          faelle_count?: number
          id?: string
          letzte_aktualisierung?: string
          organisation_id: string
          rang?: number | null
          sv_id: string
          umsatz_netto?: number
          zeitraum_jahr: number
          zeitraum_monat: number
        }
        Update: {
          durchschnitt_bearbeitungsdauer_h?: number | null
          faelle_count?: number
          id?: string
          letzte_aktualisierung?: string
          organisation_id?: string
          rang?: number | null
          sv_id?: string
          umsatz_netto?: number
          zeitraum_jahr?: number
          zeitraum_monat?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_leaderboard_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_leaderboard_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      dokument_katalog: {
        Row: {
          aktiv: boolean
          akzeptierte_mime_types: string[]
          anforderbar_von: string[]
          beschreibung: string | null
          created_at: string | null
          freigeschaltet_wenn: Json | null
          kategorie: Database["public"]["Enums"]["dokument_kategorie"]
          label: string
          max_mb: number
          multi_file: boolean
          pflicht_wenn: Json | null
          sichtbar_fuer: string[]
          slot_id: string
          sort_order: number
          updated_at: string | null
          uploadbar_von: string[]
        }
        Insert: {
          aktiv?: boolean
          akzeptierte_mime_types?: string[]
          anforderbar_von?: string[]
          beschreibung?: string | null
          created_at?: string | null
          freigeschaltet_wenn?: Json | null
          kategorie: Database["public"]["Enums"]["dokument_kategorie"]
          label: string
          max_mb?: number
          multi_file?: boolean
          pflicht_wenn?: Json | null
          sichtbar_fuer?: string[]
          slot_id: string
          sort_order?: number
          updated_at?: string | null
          uploadbar_von?: string[]
        }
        Update: {
          aktiv?: boolean
          akzeptierte_mime_types?: string[]
          anforderbar_von?: string[]
          beschreibung?: string | null
          created_at?: string | null
          freigeschaltet_wenn?: Json | null
          kategorie?: Database["public"]["Enums"]["dokument_kategorie"]
          label?: string
          max_mb?: number
          multi_file?: boolean
          pflicht_wenn?: Json | null
          sichtbar_fuer?: string[]
          slot_id?: string
          sort_order?: number
          updated_at?: string | null
          uploadbar_von?: string[]
        }
        Relationships: []
      }
      dokument_upload_anfragen: {
        Row: {
          erstellt_am: string
          erstellt_von: string | null
          expires_at: string
          gesendet_am: string
          id: string
          kanal: string
          lead_id: string
          slots: Json
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          erstellt_am?: string
          erstellt_von?: string | null
          expires_at: string
          gesendet_am?: string
          id?: string
          kanal: string
          lead_id: string
          slots: Json
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          erstellt_am?: string
          erstellt_von?: string | null
          expires_at?: string
          gesendet_am?: string
          id?: string
          kanal?: string
          lead_id?: string
          slots?: Json
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dokument_upload_anfragen_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dokument_upload_anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          attachments: Json | null
          created_at: string
          empfaenger: string
          empfaenger_typ: string
          fall_id: string | null
          fehler: string | null
          gesendet_am: string | null
          gesendet_von_user_id: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          provider: string
          richtung: string
          status: string
          subject: string
          template: string
          versuche: number
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          empfaenger: string
          empfaenger_typ: string
          fall_id?: string | null
          fehler?: string | null
          gesendet_am?: string | null
          gesendet_von_user_id?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          provider?: string
          richtung?: string
          status?: string
          subject: string
          template: string
          versuche?: number
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          empfaenger?: string
          empfaenger_typ?: string
          fall_id?: string | null
          fehler?: string | null
          gesendet_am?: string | null
          gesendet_von_user_id?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          provider?: string
          richtung?: string
          status?: string
          subject?: string
          template?: string
          versuche?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_otp_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
          verifiziert_am: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
          verifiziert_am?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          verifiziert_am?: string | null
        }
        Relationships: []
      }
      faelle: {
        Row: {
          abgeschlossen_am: string | null
          abrechnung_id: string | null
          abrechnungsart_besprochen: string | null
          abrechnungsart_besprochen_am: string | null
          abrechnungsart_notiz: string | null
          abtretung_pdf: string | null
          abtretung_signiert_am: string | null
          aktuelle_phase: string | null
          anschlussschreiben_am: string | null
          anschlussschreiben_ocr_am: string | null
          anschlussschreiben_sendedatum: string | null
          anschlussschreiben_unterschrift: boolean | null
          anschlussschreiben_url: string | null
          as_frist: string | null
          as_geforderte_summe: number | null
          as_salesforce_id: string | null
          as_vs_reaktion_text: string | null
          as_zuletzt_synced_am: string | null
          auszahlung_gutachter_eingegangen_am: string | null
          auszahlung_kunde_betrag: number | null
          auszahlung_kunde_eingegangen_am: string | null
          auszahlung_zahlungsweg: string | null
          bank_name: string | null
          bankdaten_hinterlegt_am: string | null
          besichtigungsort_adresse: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_place_id: string | null
          betreuungspaket: Database["public"]["Enums"]["betreuungspaket"] | null
          bevorzugter_kanal: string | null
          bic: string | null
          cardentity_abfrage_am: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          created_at: string | null
          datenschutz_akzeptiert: boolean | null
          datenschutz_akzeptiert_am: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          deaktiviert_notiz: string | null
          dokumente_reminder_whatsapp_letzte_sendung: string | null
          dokumente_vollstaendig_am_phase: string | null
          dokumente_vollstaendig_fuer_phase: string | null
          erstzulassung: string | null
          eskalation_tag_14_am: string | null
          eskalation_tag_14_ergebnis: string | null
          eskalation_tag_14_ergebnis_am: string | null
          eskalation_tag_14_ergebnis_von: string | null
          eskalation_tag_21_am: string | null
          eskalation_tag_21_ergebnis: string | null
          eskalation_tag_21_ergebnis_am: string | null
          eskalation_tag_21_ergebnis_von: string | null
          eskalation_tag_28_am: string | null
          eskalation_tag_28_ergebnis: string | null
          eskalation_tag_28_ergebnis_am: string | null
          eskalation_tag_28_ergebnis_von: string | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_typ: string | null
          fall_nummer: string | null
          filmcheck_am: string | null
          filmcheck_notizen: string | null
          filmcheck_ok: boolean | null
          fin_extrahiert_am: string | null
          fin_quelle: string | null
          fin_vin: string | null
          finanzierung_leasing: string | null
          finanzierungsgeber_adresse: string | null
          finanzierungsgeber_name: string | null
          finanzierungsgeber_vertragsnr: string | null
          firma_name: string | null
          gcal_event_id: string | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_schadennummer: string | null
          gegner_versicherung: string | null
          gegner_versicherung_anfrage_datum: string | null
          gegner_versicherung_id: string | null
          gegner_versicherungsnummer: string | null
          geschaetzte_fahrdistanz_km: number | null
          geschaetzte_fahrzeit_min: number | null
          geschlossen_grund: string | null
          gewerbe_flag: boolean | null
          google_review_gesendet: boolean | null
          gutachten_betrag: number | null
          gutachten_eingegangen_am: string | null
          gutachten_hochgeladen_am: string | null
          gutachten_nummer: string | null
          gutachten_positionen: Json | null
          gutachten_stundensatz: number | null
          gutachten_vorhanden: boolean | null
          gutachter_honorar: number | null
          guthaben_verrechnet_netto: number
          halter_email: string | null
          halter_geburtsdatum: string | null
          halter_nachname: string | null
          halter_name: string | null
          halter_plz: string | null
          halter_stadt: string | null
          halter_strasse: string | null
          halter_telefon: string | null
          halter_ungleich_fahrer_flag: boolean | null
          halter_vorname: string | null
          hat_vorschaeden: boolean | null
          iban: string | null
          id: string
          interne_notizen: string | null
          ist_aktiv: boolean | null
          ist_fahrzeughalter: boolean | null
          kanzlei_abrechnung_id: string | null
          kanzlei_ansprechpartner_email: string | null
          kanzlei_ansprechpartner_name: string | null
          kanzlei_ansprechpartner_position: string | null
          kanzlei_ansprechpartner_telefon: string | null
          kanzlei_honorar: number | null
          kanzlei_id: string | null
          kanzlei_provision_ausgezahlt_am: string | null
          kanzlei_provision_status: string | null
          kanzlei_uebergeben_am: string | null
          kennzeichen: string | null
          ki_geschaetzte_kosten_max: number | null
          ki_geschaetzte_kosten_min: number | null
          ki_kalkulation: Json | null
          ki_kalkulation_am: string | null
          kilometerstand: number | null
          kontoinhaber: string | null
          konvertiert_am: string | null
          konvertiert_von_lead: string | null
          kuerzungs_betrag: number | null
          kunde_id: string | null
          kunden_konstellation: string | null
          kundenbetreuer_fallback_flag: boolean
          kundenbetreuer_id: string | null
          kundenbetreuer_zugewiesen_am: string | null
          lead_id: string | null
          lead_preis_berechnet_am: string | null
          lead_preis_netto: number | null
          lead_preis_typ: string | null
          leadbearbeiter_id: string | null
          leasinggeber_informiert: boolean | null
          leasinggeber_name: string | null
          lexdrive_case_id: string | null
          lexdrive_ocr_data: Json | null
          lexdrive_ocr_received_at: string | null
          losfahren_erinnerung_gesendet: boolean | null
          makler_id: string | null
          mandatsnummer: string | null
          marketing_provision: number | null
          marketing_provision_status: string | null
          marketing_quelle: string | null
          mietwagen_flag: boolean | null
          mietwagen_kanzlei_informiert: boolean | null
          mietwagen_kanzlei_informiert_am: string | null
          nachbesichtigung_angefordert_am: string | null
          nachbesichtigung_ergebnis: string | null
          nachbesichtigung_konfrontation: boolean | null
          nachbesichtigung_kunde_termin_eingereicht_am: string | null
          nachbesichtigung_kunde_termin_vorschlaege: Json | null
          nachbesichtigung_status: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am: string | null
          nachbesichtigung_termin_datum: string | null
          no_show_count: number | null
          no_show_gemeldet_am: string | null
          notizen: string | null
          nutzungsausfall: boolean | null
          nutzungsausfall_gesamt: number | null
          nutzungsausfall_tage: number | null
          nutzungsausfall_tagessatz: number | null
          ocr_extrahiert_am: string | null
          ocr_rohdaten: Json | null
          onboarding_complete: boolean | null
          organisation_id: string | null
          personenschaden_flag: boolean | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          polizei_vor_ort: boolean | null
          prioritaet: string | null
          regulierung_am: string | null
          regulierung_angekuendigt_am: string | null
          regulierung_betrag: number | null
          regulierungsweise: string | null
          reparaturdauer_tage: number | null
          reparaturkosten: number | null
          restwert: number | null
          ruege_betrag: number | null
          ruege_counter: number | null
          ruege_erhalten_am: string | null
          ruege_gesendet_am: string | null
          ruege_grund: string | null
          sa_pdf_url: string | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sa_unterschrift_url: string | null
          sachschaden_beschreibung: string | null
          sachschaden_flag: boolean
          schadens_adresse: string | null
          schadens_art: string | null
          schadens_beschreibung: string | null
          schadens_datum: string | null
          schadens_entdeckt_am: string | null
          schadens_fall_typ: string | null
          schadens_hergang: string | null
          schadens_hoehe_netto: number | null
          schadens_ort: string | null
          schadens_plz: string | null
          schadens_ursache: string | null
          schlussabrechnung_am: string | null
          service_typ: string
          source_channel: string | null
          source_domain: string | null
          spezifikation: string | null
          sprache: string | null
          status: Database["public"]["Enums"]["fall_status"]
          status_changed_at: string | null
          storniert_am: string | null
          storno_durch_user_id: string | null
          storno_grund: string | null
          sv_briefing_generated_at: string | null
          sv_briefing_model: string | null
          sv_briefing_struktur: Json | null
          sv_briefing_text: string | null
          sv_briefing_version: number
          sv_id: string | null
          sv_nachzahlung_netto: number | null
          sv_notizen_vor_ort: string | null
          sv_termin_dokument_reminder_gesendet_am: string | null
          sv_zugewiesen_am: string | null
          szenario: string | null
          technische_stellungnahme_beauftragt_am: string | null
          technische_stellungnahme_freigabe_am: string | null
          technische_stellungnahme_hochgeladen_am: string | null
          technische_stellungnahme_status: string | null
          termin_erinnerung_5min_gesendet: boolean | null
          totalschaden: boolean | null
          unfall_konstellation: string | null
          unfalldatum: string | null
          unfallhergang: string | null
          unfallmitteilung_status: string | null
          unfallort: string | null
          unfallort_kategorie: string | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          ust_id: string | null
          vollmacht_geprueft_am: string | null
          vollmacht_geprueft_von: string | null
          vollmacht_pdf: string | null
          vollmacht_pruefung_begruendung: string | null
          vollmacht_pruefung_status: string | null
          vollmacht_signiert_am: string | null
          vollmacht_status: string | null
          vorschaden_anzahl: number | null
          vorschaden_erkannt: boolean
          vorschaden_geprueft: boolean | null
          vorschaden_letzter_datum: string | null
          vorschaden_typ_a_ergebnis: Json | null
          vorschaden_typ_b_bericht: Json | null
          vorschaden_typ_b_pdf_url: string | null
          vorschaeden_beschreibung: string | null
          vorsteuerabzugsberechtigt: boolean | null
          vs_ablehnungsgrund: string | null
          vs_eskalationsstufe: string | null
          vs_frist_bis: string | null
          vs_kuerzung_grund: string | null
          vs_kuerzungs_typ: string | null
          vs_quote_akzeptiert_am: string | null
          vs_quote_betrag_ausgezahlt: number | null
          vs_quote_grund: string | null
          vs_quote_prozent: number | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
          werkstatt_seit_datum: string | null
          wertminderung: number | null
          wiederbeschaffungswert: number | null
          wunschtermin: string | null
          zahlung_betrag: number | null
          zahlung_eingegangen_am: string | null
          zahlung_erwartet_am: string | null
          zahlungsweg: string | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean
        }
        Insert: {
          abgeschlossen_am?: string | null
          abrechnung_id?: string | null
          abrechnungsart_besprochen?: string | null
          abrechnungsart_besprochen_am?: string | null
          abrechnungsart_notiz?: string | null
          abtretung_pdf?: string | null
          abtretung_signiert_am?: string | null
          aktuelle_phase?: string | null
          anschlussschreiben_am?: string | null
          anschlussschreiben_ocr_am?: string | null
          anschlussschreiben_sendedatum?: string | null
          anschlussschreiben_unterschrift?: boolean | null
          anschlussschreiben_url?: string | null
          as_frist?: string | null
          as_geforderte_summe?: number | null
          as_salesforce_id?: string | null
          as_vs_reaktion_text?: string | null
          as_zuletzt_synced_am?: string | null
          auszahlung_gutachter_eingegangen_am?: string | null
          auszahlung_kunde_betrag?: number | null
          auszahlung_kunde_eingegangen_am?: string | null
          auszahlung_zahlungsweg?: string | null
          bank_name?: string | null
          bankdaten_hinterlegt_am?: string | null
          besichtigungsort_adresse?: string | null
          besichtigungsort_lat?: number | null
          besichtigungsort_lng?: number | null
          besichtigungsort_place_id?: string | null
          betreuungspaket?:
            | Database["public"]["Enums"]["betreuungspaket"]
            | null
          bevorzugter_kanal?: string | null
          bic?: string | null
          cardentity_abfrage_am?: string | null
          cardentity_enriched_at?: string | null
          cardentity_report?: Json | null
          created_at?: string | null
          datenschutz_akzeptiert?: boolean | null
          datenschutz_akzeptiert_am?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          deaktiviert_notiz?: string | null
          dokumente_reminder_whatsapp_letzte_sendung?: string | null
          dokumente_vollstaendig_am_phase?: string | null
          dokumente_vollstaendig_fuer_phase?: string | null
          erstzulassung?: string | null
          eskalation_tag_14_am?: string | null
          eskalation_tag_14_ergebnis?: string | null
          eskalation_tag_14_ergebnis_am?: string | null
          eskalation_tag_14_ergebnis_von?: string | null
          eskalation_tag_21_am?: string | null
          eskalation_tag_21_ergebnis?: string | null
          eskalation_tag_21_ergebnis_am?: string | null
          eskalation_tag_21_ergebnis_von?: string | null
          eskalation_tag_28_am?: string | null
          eskalation_tag_28_ergebnis?: string | null
          eskalation_tag_28_ergebnis_am?: string | null
          eskalation_tag_28_ergebnis_von?: string | null
          fahrzeug_ausstattung?: Json | null
          fahrzeug_baujahr?: number | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeug_farbe?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeug_typ?: string | null
          fall_nummer?: string | null
          filmcheck_am?: string | null
          filmcheck_notizen?: string | null
          filmcheck_ok?: boolean | null
          fin_extrahiert_am?: string | null
          fin_quelle?: string | null
          fin_vin?: string | null
          finanzierung_leasing?: string | null
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          firma_name?: string | null
          gcal_event_id?: string | null
          gegner_anzahl_beteiligte?: number | null
          gegner_bekannt?: boolean | null
          gegner_fahrzeugtyp?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_schadennummer?: string | null
          gegner_versicherung?: string | null
          gegner_versicherung_anfrage_datum?: string | null
          gegner_versicherung_id?: string | null
          gegner_versicherungsnummer?: string | null
          geschaetzte_fahrdistanz_km?: number | null
          geschaetzte_fahrzeit_min?: number | null
          geschlossen_grund?: string | null
          gewerbe_flag?: boolean | null
          google_review_gesendet?: boolean | null
          gutachten_betrag?: number | null
          gutachten_eingegangen_am?: string | null
          gutachten_hochgeladen_am?: string | null
          gutachten_nummer?: string | null
          gutachten_positionen?: Json | null
          gutachten_stundensatz?: number | null
          gutachten_vorhanden?: boolean | null
          gutachter_honorar?: number | null
          guthaben_verrechnet_netto?: number
          halter_email?: string | null
          halter_geburtsdatum?: string | null
          halter_nachname?: string | null
          halter_name?: string | null
          halter_plz?: string | null
          halter_stadt?: string | null
          halter_strasse?: string | null
          halter_telefon?: string | null
          halter_ungleich_fahrer_flag?: boolean | null
          halter_vorname?: string | null
          hat_vorschaeden?: boolean | null
          iban?: string | null
          id?: string
          interne_notizen?: string | null
          ist_aktiv?: boolean | null
          ist_fahrzeughalter?: boolean | null
          kanzlei_abrechnung_id?: string | null
          kanzlei_ansprechpartner_email?: string | null
          kanzlei_ansprechpartner_name?: string | null
          kanzlei_ansprechpartner_position?: string | null
          kanzlei_ansprechpartner_telefon?: string | null
          kanzlei_honorar?: number | null
          kanzlei_id?: string | null
          kanzlei_provision_ausgezahlt_am?: string | null
          kanzlei_provision_status?: string | null
          kanzlei_uebergeben_am?: string | null
          kennzeichen?: string | null
          ki_geschaetzte_kosten_max?: number | null
          ki_geschaetzte_kosten_min?: number | null
          ki_kalkulation?: Json | null
          ki_kalkulation_am?: string | null
          kilometerstand?: number | null
          kontoinhaber?: string | null
          konvertiert_am?: string | null
          konvertiert_von_lead?: string | null
          kuerzungs_betrag?: number | null
          kunde_id?: string | null
          kunden_konstellation?: string | null
          kundenbetreuer_fallback_flag?: boolean
          kundenbetreuer_id?: string | null
          kundenbetreuer_zugewiesen_am?: string | null
          lead_id?: string | null
          lead_preis_berechnet_am?: string | null
          lead_preis_netto?: number | null
          lead_preis_typ?: string | null
          leadbearbeiter_id?: string | null
          leasinggeber_informiert?: boolean | null
          leasinggeber_name?: string | null
          lexdrive_case_id?: string | null
          lexdrive_ocr_data?: Json | null
          lexdrive_ocr_received_at?: string | null
          losfahren_erinnerung_gesendet?: boolean | null
          makler_id?: string | null
          mandatsnummer?: string | null
          marketing_provision?: number | null
          marketing_provision_status?: string | null
          marketing_quelle?: string | null
          mietwagen_flag?: boolean | null
          mietwagen_kanzlei_informiert?: boolean | null
          mietwagen_kanzlei_informiert_am?: string | null
          nachbesichtigung_angefordert_am?: string | null
          nachbesichtigung_ergebnis?: string | null
          nachbesichtigung_konfrontation?: boolean | null
          nachbesichtigung_kunde_termin_eingereicht_am?: string | null
          nachbesichtigung_kunde_termin_vorschlaege?: Json | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am?: string | null
          nachbesichtigung_termin_datum?: string | null
          no_show_count?: number | null
          no_show_gemeldet_am?: string | null
          notizen?: string | null
          nutzungsausfall?: boolean | null
          nutzungsausfall_gesamt?: number | null
          nutzungsausfall_tage?: number | null
          nutzungsausfall_tagessatz?: number | null
          ocr_extrahiert_am?: string | null
          ocr_rohdaten?: Json | null
          onboarding_complete?: boolean | null
          organisation_id?: string | null
          personenschaden_flag?: boolean | null
          polizei_aktenzeichen?: string | null
          polizei_bericht_vorhanden?: boolean | null
          polizei_vor_ort?: boolean | null
          prioritaet?: string | null
          regulierung_am?: string | null
          regulierung_angekuendigt_am?: string | null
          regulierung_betrag?: number | null
          regulierungsweise?: string | null
          reparaturdauer_tage?: number | null
          reparaturkosten?: number | null
          restwert?: number | null
          ruege_betrag?: number | null
          ruege_counter?: number | null
          ruege_erhalten_am?: string | null
          ruege_gesendet_am?: string | null
          ruege_grund?: string | null
          sa_pdf_url?: string | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sa_unterschrift_url?: string | null
          sachschaden_beschreibung?: string | null
          sachschaden_flag?: boolean
          schadens_adresse?: string | null
          schadens_art?: string | null
          schadens_beschreibung?: string | null
          schadens_datum?: string | null
          schadens_entdeckt_am?: string | null
          schadens_fall_typ?: string | null
          schadens_hergang?: string | null
          schadens_hoehe_netto?: number | null
          schadens_ort?: string | null
          schadens_plz?: string | null
          schadens_ursache?: string | null
          schlussabrechnung_am?: string | null
          service_typ?: string
          source_channel?: string | null
          source_domain?: string | null
          spezifikation?: string | null
          sprache?: string | null
          status?: Database["public"]["Enums"]["fall_status"]
          status_changed_at?: string | null
          storniert_am?: string | null
          storno_durch_user_id?: string | null
          storno_grund?: string | null
          sv_briefing_generated_at?: string | null
          sv_briefing_model?: string | null
          sv_briefing_struktur?: Json | null
          sv_briefing_text?: string | null
          sv_briefing_version?: number
          sv_id?: string | null
          sv_nachzahlung_netto?: number | null
          sv_notizen_vor_ort?: string | null
          sv_termin_dokument_reminder_gesendet_am?: string | null
          sv_zugewiesen_am?: string | null
          szenario?: string | null
          technische_stellungnahme_beauftragt_am?: string | null
          technische_stellungnahme_freigabe_am?: string | null
          technische_stellungnahme_hochgeladen_am?: string | null
          technische_stellungnahme_status?: string | null
          termin_erinnerung_5min_gesendet?: boolean | null
          totalschaden?: boolean | null
          unfall_konstellation?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallmitteilung_status?: string | null
          unfallort?: string | null
          unfallort_kategorie?: string | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
          ust_id?: string | null
          vollmacht_geprueft_am?: string | null
          vollmacht_geprueft_von?: string | null
          vollmacht_pdf?: string | null
          vollmacht_pruefung_begruendung?: string | null
          vollmacht_pruefung_status?: string | null
          vollmacht_signiert_am?: string | null
          vollmacht_status?: string | null
          vorschaden_anzahl?: number | null
          vorschaden_erkannt?: boolean
          vorschaden_geprueft?: boolean | null
          vorschaden_letzter_datum?: string | null
          vorschaden_typ_a_ergebnis?: Json | null
          vorschaden_typ_b_bericht?: Json | null
          vorschaden_typ_b_pdf_url?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean | null
          vs_ablehnungsgrund?: string | null
          vs_eskalationsstufe?: string | null
          vs_frist_bis?: string | null
          vs_kuerzung_grund?: string | null
          vs_kuerzungs_typ?: string | null
          vs_quote_akzeptiert_am?: string | null
          vs_quote_betrag_ausgezahlt?: number | null
          vs_quote_grund?: string | null
          vs_quote_prozent?: number | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
          werkstatt_seit_datum?: string | null
          wertminderung?: number | null
          wiederbeschaffungswert?: number | null
          wunschtermin?: string | null
          zahlung_betrag?: number | null
          zahlung_eingegangen_am?: string | null
          zahlung_erwartet_am?: string | null
          zahlungsweg?: string | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
        }
        Update: {
          abgeschlossen_am?: string | null
          abrechnung_id?: string | null
          abrechnungsart_besprochen?: string | null
          abrechnungsart_besprochen_am?: string | null
          abrechnungsart_notiz?: string | null
          abtretung_pdf?: string | null
          abtretung_signiert_am?: string | null
          aktuelle_phase?: string | null
          anschlussschreiben_am?: string | null
          anschlussschreiben_ocr_am?: string | null
          anschlussschreiben_sendedatum?: string | null
          anschlussschreiben_unterschrift?: boolean | null
          anschlussschreiben_url?: string | null
          as_frist?: string | null
          as_geforderte_summe?: number | null
          as_salesforce_id?: string | null
          as_vs_reaktion_text?: string | null
          as_zuletzt_synced_am?: string | null
          auszahlung_gutachter_eingegangen_am?: string | null
          auszahlung_kunde_betrag?: number | null
          auszahlung_kunde_eingegangen_am?: string | null
          auszahlung_zahlungsweg?: string | null
          bank_name?: string | null
          bankdaten_hinterlegt_am?: string | null
          besichtigungsort_adresse?: string | null
          besichtigungsort_lat?: number | null
          besichtigungsort_lng?: number | null
          besichtigungsort_place_id?: string | null
          betreuungspaket?:
            | Database["public"]["Enums"]["betreuungspaket"]
            | null
          bevorzugter_kanal?: string | null
          bic?: string | null
          cardentity_abfrage_am?: string | null
          cardentity_enriched_at?: string | null
          cardentity_report?: Json | null
          created_at?: string | null
          datenschutz_akzeptiert?: boolean | null
          datenschutz_akzeptiert_am?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          deaktiviert_notiz?: string | null
          dokumente_reminder_whatsapp_letzte_sendung?: string | null
          dokumente_vollstaendig_am_phase?: string | null
          dokumente_vollstaendig_fuer_phase?: string | null
          erstzulassung?: string | null
          eskalation_tag_14_am?: string | null
          eskalation_tag_14_ergebnis?: string | null
          eskalation_tag_14_ergebnis_am?: string | null
          eskalation_tag_14_ergebnis_von?: string | null
          eskalation_tag_21_am?: string | null
          eskalation_tag_21_ergebnis?: string | null
          eskalation_tag_21_ergebnis_am?: string | null
          eskalation_tag_21_ergebnis_von?: string | null
          eskalation_tag_28_am?: string | null
          eskalation_tag_28_ergebnis?: string | null
          eskalation_tag_28_ergebnis_am?: string | null
          eskalation_tag_28_ergebnis_von?: string | null
          fahrzeug_ausstattung?: Json | null
          fahrzeug_baujahr?: number | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeug_farbe?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeug_typ?: string | null
          fall_nummer?: string | null
          filmcheck_am?: string | null
          filmcheck_notizen?: string | null
          filmcheck_ok?: boolean | null
          fin_extrahiert_am?: string | null
          fin_quelle?: string | null
          fin_vin?: string | null
          finanzierung_leasing?: string | null
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          firma_name?: string | null
          gcal_event_id?: string | null
          gegner_anzahl_beteiligte?: number | null
          gegner_bekannt?: boolean | null
          gegner_fahrzeugtyp?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_schadennummer?: string | null
          gegner_versicherung?: string | null
          gegner_versicherung_anfrage_datum?: string | null
          gegner_versicherung_id?: string | null
          gegner_versicherungsnummer?: string | null
          geschaetzte_fahrdistanz_km?: number | null
          geschaetzte_fahrzeit_min?: number | null
          geschlossen_grund?: string | null
          gewerbe_flag?: boolean | null
          google_review_gesendet?: boolean | null
          gutachten_betrag?: number | null
          gutachten_eingegangen_am?: string | null
          gutachten_hochgeladen_am?: string | null
          gutachten_nummer?: string | null
          gutachten_positionen?: Json | null
          gutachten_stundensatz?: number | null
          gutachten_vorhanden?: boolean | null
          gutachter_honorar?: number | null
          guthaben_verrechnet_netto?: number
          halter_email?: string | null
          halter_geburtsdatum?: string | null
          halter_nachname?: string | null
          halter_name?: string | null
          halter_plz?: string | null
          halter_stadt?: string | null
          halter_strasse?: string | null
          halter_telefon?: string | null
          halter_ungleich_fahrer_flag?: boolean | null
          halter_vorname?: string | null
          hat_vorschaeden?: boolean | null
          iban?: string | null
          id?: string
          interne_notizen?: string | null
          ist_aktiv?: boolean | null
          ist_fahrzeughalter?: boolean | null
          kanzlei_abrechnung_id?: string | null
          kanzlei_ansprechpartner_email?: string | null
          kanzlei_ansprechpartner_name?: string | null
          kanzlei_ansprechpartner_position?: string | null
          kanzlei_ansprechpartner_telefon?: string | null
          kanzlei_honorar?: number | null
          kanzlei_id?: string | null
          kanzlei_provision_ausgezahlt_am?: string | null
          kanzlei_provision_status?: string | null
          kanzlei_uebergeben_am?: string | null
          kennzeichen?: string | null
          ki_geschaetzte_kosten_max?: number | null
          ki_geschaetzte_kosten_min?: number | null
          ki_kalkulation?: Json | null
          ki_kalkulation_am?: string | null
          kilometerstand?: number | null
          kontoinhaber?: string | null
          konvertiert_am?: string | null
          konvertiert_von_lead?: string | null
          kuerzungs_betrag?: number | null
          kunde_id?: string | null
          kunden_konstellation?: string | null
          kundenbetreuer_fallback_flag?: boolean
          kundenbetreuer_id?: string | null
          kundenbetreuer_zugewiesen_am?: string | null
          lead_id?: string | null
          lead_preis_berechnet_am?: string | null
          lead_preis_netto?: number | null
          lead_preis_typ?: string | null
          leadbearbeiter_id?: string | null
          leasinggeber_informiert?: boolean | null
          leasinggeber_name?: string | null
          lexdrive_case_id?: string | null
          lexdrive_ocr_data?: Json | null
          lexdrive_ocr_received_at?: string | null
          losfahren_erinnerung_gesendet?: boolean | null
          makler_id?: string | null
          mandatsnummer?: string | null
          marketing_provision?: number | null
          marketing_provision_status?: string | null
          marketing_quelle?: string | null
          mietwagen_flag?: boolean | null
          mietwagen_kanzlei_informiert?: boolean | null
          mietwagen_kanzlei_informiert_am?: string | null
          nachbesichtigung_angefordert_am?: string | null
          nachbesichtigung_ergebnis?: string | null
          nachbesichtigung_konfrontation?: boolean | null
          nachbesichtigung_kunde_termin_eingereicht_am?: string | null
          nachbesichtigung_kunde_termin_vorschlaege?: Json | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am?: string | null
          nachbesichtigung_termin_datum?: string | null
          no_show_count?: number | null
          no_show_gemeldet_am?: string | null
          notizen?: string | null
          nutzungsausfall?: boolean | null
          nutzungsausfall_gesamt?: number | null
          nutzungsausfall_tage?: number | null
          nutzungsausfall_tagessatz?: number | null
          ocr_extrahiert_am?: string | null
          ocr_rohdaten?: Json | null
          onboarding_complete?: boolean | null
          organisation_id?: string | null
          personenschaden_flag?: boolean | null
          polizei_aktenzeichen?: string | null
          polizei_bericht_vorhanden?: boolean | null
          polizei_vor_ort?: boolean | null
          prioritaet?: string | null
          regulierung_am?: string | null
          regulierung_angekuendigt_am?: string | null
          regulierung_betrag?: number | null
          regulierungsweise?: string | null
          reparaturdauer_tage?: number | null
          reparaturkosten?: number | null
          restwert?: number | null
          ruege_betrag?: number | null
          ruege_counter?: number | null
          ruege_erhalten_am?: string | null
          ruege_gesendet_am?: string | null
          ruege_grund?: string | null
          sa_pdf_url?: string | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sa_unterschrift_url?: string | null
          sachschaden_beschreibung?: string | null
          sachschaden_flag?: boolean
          schadens_adresse?: string | null
          schadens_art?: string | null
          schadens_beschreibung?: string | null
          schadens_datum?: string | null
          schadens_entdeckt_am?: string | null
          schadens_fall_typ?: string | null
          schadens_hergang?: string | null
          schadens_hoehe_netto?: number | null
          schadens_ort?: string | null
          schadens_plz?: string | null
          schadens_ursache?: string | null
          schlussabrechnung_am?: string | null
          service_typ?: string
          source_channel?: string | null
          source_domain?: string | null
          spezifikation?: string | null
          sprache?: string | null
          status?: Database["public"]["Enums"]["fall_status"]
          status_changed_at?: string | null
          storniert_am?: string | null
          storno_durch_user_id?: string | null
          storno_grund?: string | null
          sv_briefing_generated_at?: string | null
          sv_briefing_model?: string | null
          sv_briefing_struktur?: Json | null
          sv_briefing_text?: string | null
          sv_briefing_version?: number
          sv_id?: string | null
          sv_nachzahlung_netto?: number | null
          sv_notizen_vor_ort?: string | null
          sv_termin_dokument_reminder_gesendet_am?: string | null
          sv_zugewiesen_am?: string | null
          szenario?: string | null
          technische_stellungnahme_beauftragt_am?: string | null
          technische_stellungnahme_freigabe_am?: string | null
          technische_stellungnahme_hochgeladen_am?: string | null
          technische_stellungnahme_status?: string | null
          termin_erinnerung_5min_gesendet?: boolean | null
          totalschaden?: boolean | null
          unfall_konstellation?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallmitteilung_status?: string | null
          unfallort?: string | null
          unfallort_kategorie?: string | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
          ust_id?: string | null
          vollmacht_geprueft_am?: string | null
          vollmacht_geprueft_von?: string | null
          vollmacht_pdf?: string | null
          vollmacht_pruefung_begruendung?: string | null
          vollmacht_pruefung_status?: string | null
          vollmacht_signiert_am?: string | null
          vollmacht_status?: string | null
          vorschaden_anzahl?: number | null
          vorschaden_erkannt?: boolean
          vorschaden_geprueft?: boolean | null
          vorschaden_letzter_datum?: string | null
          vorschaden_typ_a_ergebnis?: Json | null
          vorschaden_typ_b_bericht?: Json | null
          vorschaden_typ_b_pdf_url?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean | null
          vs_ablehnungsgrund?: string | null
          vs_eskalationsstufe?: string | null
          vs_frist_bis?: string | null
          vs_kuerzung_grund?: string | null
          vs_kuerzungs_typ?: string | null
          vs_quote_akzeptiert_am?: string | null
          vs_quote_betrag_ausgezahlt?: number | null
          vs_quote_grund?: string | null
          vs_quote_prozent?: number | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
          werkstatt_seit_datum?: string | null
          wertminderung?: number | null
          wiederbeschaffungswert?: number | null
          wunschtermin?: string | null
          zahlung_betrag?: number | null
          zahlung_eingegangen_am?: string | null
          zahlung_erwartet_am?: string | null
          zahlungsweg?: string | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "faelle_eskalation_tag_14_ergebnis_von_fkey"
            columns: ["eskalation_tag_14_ergebnis_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_eskalation_tag_21_ergebnis_von_fkey"
            columns: ["eskalation_tag_21_ergebnis_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_eskalation_tag_28_ergebnis_von_fkey"
            columns: ["eskalation_tag_28_ergebnis_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_konvertiert_von_lead_fkey"
            columns: ["konvertiert_von_lead"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_leadbearbeiter_id_fkey"
            columns: ["leadbearbeiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_makler_id_fkey"
            columns: ["makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      fall_dokumente: {
        Row: {
          ab_phase: string | null
          beschreibung: string | null
          discrepancy_flag: boolean | null
          dokument_typ: string
          fall_id: string
          geloescht_am: string | null
          groesse_bytes: number | null
          hochgeladen_am: string
          hochgeladen_von_user_id: string | null
          id: string
          idempotency_key: string | null
          ist_pflicht: boolean
          kategorie: string | null
          lead_id: string | null
          mime_type: string | null
          ocr_extracted_data: Json | null
          ocr_processed_at: string | null
          ocr_result: Json | null
          ocr_status: string | null
          original_filename: string | null
          position_id: string | null
          quelle: string | null
          schaden_position: string | null
          sichtbar_fuer: string[] | null
          storage_path: string
          uploaded_by_kunde: boolean | null
          uploaded_by_sv: boolean | null
        }
        Insert: {
          ab_phase?: string | null
          beschreibung?: string | null
          discrepancy_flag?: boolean | null
          dokument_typ: string
          fall_id: string
          geloescht_am?: string | null
          groesse_bytes?: number | null
          hochgeladen_am?: string
          hochgeladen_von_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          ist_pflicht?: boolean
          kategorie?: string | null
          lead_id?: string | null
          mime_type?: string | null
          ocr_extracted_data?: Json | null
          ocr_processed_at?: string | null
          ocr_result?: Json | null
          ocr_status?: string | null
          original_filename?: string | null
          position_id?: string | null
          quelle?: string | null
          schaden_position?: string | null
          sichtbar_fuer?: string[] | null
          storage_path: string
          uploaded_by_kunde?: boolean | null
          uploaded_by_sv?: boolean | null
        }
        Update: {
          ab_phase?: string | null
          beschreibung?: string | null
          discrepancy_flag?: boolean | null
          dokument_typ?: string
          fall_id?: string
          geloescht_am?: string | null
          groesse_bytes?: number | null
          hochgeladen_am?: string
          hochgeladen_von_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          ist_pflicht?: boolean
          kategorie?: string | null
          lead_id?: string | null
          mime_type?: string | null
          ocr_extracted_data?: Json | null
          ocr_processed_at?: string | null
          ocr_result?: Json | null
          ocr_status?: string | null
          original_filename?: string | null
          position_id?: string | null
          quelle?: string | null
          schaden_position?: string | null
          sichtbar_fuer?: string[] | null
          storage_path?: string
          uploaded_by_kunde?: boolean | null
          uploaded_by_sv?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "schadenspositionen"
            referencedColumns: ["id"]
          },
        ]
      }
      fall_read_state: {
        Row: {
          fall_id: string
          last_read_chat_at: string
          last_read_update_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          fall_id: string
          last_read_chat_at?: string
          last_read_update_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          fall_id?: string
          last_read_chat_at?: string
          last_read_update_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      fall_summaries: {
        Row: {
          ai_modell: string
          anzahl_dokumente_at_generation: number | null
          anzahl_nachrichten_at_generation: number | null
          completion_tokens: number | null
          empfohlene_naechste_schritte: string | null
          fall_id: string
          fall_status_at_generation: string | null
          generated_at: string | null
          generated_by_user_id: string | null
          id: string
          kunden_anliegen: string | null
          letzte_timeline_event_at_generation: string | null
          prompt_tokens: number | null
          zusammenfassung: string
        }
        Insert: {
          ai_modell?: string
          anzahl_dokumente_at_generation?: number | null
          anzahl_nachrichten_at_generation?: number | null
          completion_tokens?: number | null
          empfohlene_naechste_schritte?: string | null
          fall_id: string
          fall_status_at_generation?: string | null
          generated_at?: string | null
          generated_by_user_id?: string | null
          id?: string
          kunden_anliegen?: string | null
          letzte_timeline_event_at_generation?: string | null
          prompt_tokens?: number | null
          zusammenfassung: string
        }
        Update: {
          ai_modell?: string
          anzahl_dokumente_at_generation?: number | null
          anzahl_nachrichten_at_generation?: number | null
          completion_tokens?: number | null
          empfohlene_naechste_schritte?: string | null
          fall_id?: string
          fall_status_at_generation?: string | null
          generated_at?: string | null
          generated_by_user_id?: string | null
          id?: string
          kunden_anliegen?: string | null
          letzte_timeline_event_at_generation?: string | null
          prompt_tokens?: number | null
          zusammenfassung?: string
        }
        Relationships: [
          {
            foreignKeyName: "fall_summaries_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_eintraege: {
        Row: {
          beschreibung: string | null
          betrag: number | null
          created_at: string | null
          id: string
          referenz_id: string | null
          referenz_typ: string | null
          status: string | null
          typ: string
          updated_at: string | null
        }
        Insert: {
          beschreibung?: string | null
          betrag?: number | null
          created_at?: string | null
          id?: string
          referenz_id?: string | null
          referenz_typ?: string | null
          status?: string | null
          typ: string
          updated_at?: string | null
        }
        Update: {
          beschreibung?: string | null
          betrag?: number | null
          created_at?: string | null
          id?: string
          referenz_id?: string | null
          referenz_typ?: string | null
          status?: string | null
          typ?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      finance_monatsberichte: {
        Row: {
          aktive_faelle: number | null
          aktive_vm_faelle: number | null
          betreuungskosten: number | null
          claimondo_gewinn_75: number | null
          created_at: string | null
          db_ii: number | null
          delta_einzel_einnahmen: number | null
          delta_paket_einnahmen: number | null
          einzelabverkauf_faelle: number | null
          fixkosten: number | null
          gesamt_einnahmen: number | null
          gutachter_anzahlungen_gesamt: number | null
          id: string
          jahr: number
          kanzlei_gewinn_25: number | null
          kanzlei_provision: number | null
          kontingent_gutachter: number | null
          kum_db_ii: number | null
          lead_conversion_rate: number | null
          leads_gesamt: number | null
          maik_cpa_fix: number | null
          maik_google_cpl: number | null
          maik_provision: number | null
          marketing_budget_brutto: number | null
          marketing_budget_netto: number | null
          monat: string
          neue_faelle: number | null
          vollmacht_faelle: number | null
          vollmacht_quote: number | null
        }
        Insert: {
          aktive_faelle?: number | null
          aktive_vm_faelle?: number | null
          betreuungskosten?: number | null
          claimondo_gewinn_75?: number | null
          created_at?: string | null
          db_ii?: number | null
          delta_einzel_einnahmen?: number | null
          delta_paket_einnahmen?: number | null
          einzelabverkauf_faelle?: number | null
          fixkosten?: number | null
          gesamt_einnahmen?: number | null
          gutachter_anzahlungen_gesamt?: number | null
          id?: string
          jahr: number
          kanzlei_gewinn_25?: number | null
          kanzlei_provision?: number | null
          kontingent_gutachter?: number | null
          kum_db_ii?: number | null
          lead_conversion_rate?: number | null
          leads_gesamt?: number | null
          maik_cpa_fix?: number | null
          maik_google_cpl?: number | null
          maik_provision?: number | null
          marketing_budget_brutto?: number | null
          marketing_budget_netto?: number | null
          monat: string
          neue_faelle?: number | null
          vollmacht_faelle?: number | null
          vollmacht_quote?: number | null
        }
        Update: {
          aktive_faelle?: number | null
          aktive_vm_faelle?: number | null
          betreuungskosten?: number | null
          claimondo_gewinn_75?: number | null
          created_at?: string | null
          db_ii?: number | null
          delta_einzel_einnahmen?: number | null
          delta_paket_einnahmen?: number | null
          einzelabverkauf_faelle?: number | null
          fixkosten?: number | null
          gesamt_einnahmen?: number | null
          gutachter_anzahlungen_gesamt?: number | null
          id?: string
          jahr?: number
          kanzlei_gewinn_25?: number | null
          kanzlei_provision?: number | null
          kontingent_gutachter?: number | null
          kum_db_ii?: number | null
          lead_conversion_rate?: number | null
          leads_gesamt?: number | null
          maik_cpa_fix?: number | null
          maik_google_cpl?: number | null
          maik_provision?: number | null
          marketing_budget_brutto?: number | null
          marketing_budget_netto?: number | null
          monat?: string
          neue_faelle?: number | null
          vollmacht_faelle?: number | null
          vollmacht_quote?: number | null
        }
        Relationships: []
      }
      flow_links: {
        Row: {
          abgeschlossen_am: string | null
          erstellt_am: string
          expires_at: string | null
          fall_id: string | null
          geoeffnet_am: string | null
          id: string
          lead_id: string
          service_typ: string | null
          sprache: string | null
          status: string
          token: string
        }
        Insert: {
          abgeschlossen_am?: string | null
          erstellt_am?: string
          expires_at?: string | null
          fall_id?: string | null
          geoeffnet_am?: string | null
          id?: string
          lead_id: string
          service_typ?: string | null
          sprache?: string | null
          status?: string
          token?: string
        }
        Update: {
          abgeschlossen_am?: string | null
          erstellt_am?: string
          expires_at?: string | null
          fall_id?: string | null
          geoeffnet_am?: string | null
          id?: string
          lead_id?: string
          service_typ?: string | null
          sprache?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      forderungspositionen: {
        Row: {
          betrag_gefordert: number | null
          betrag_gekuerzt: number | null
          betrag_reguliert: number | null
          bezeichnung: string
          dokument_id: string | null
          erstellt_am: string | null
          fall_id: string
          id: string
          quelle: string | null
          typ: string
        }
        Insert: {
          betrag_gefordert?: number | null
          betrag_gekuerzt?: number | null
          betrag_reguliert?: number | null
          bezeichnung: string
          dokument_id?: string | null
          erstellt_am?: string | null
          fall_id: string
          id?: string
          quelle?: string | null
          typ: string
        }
        Update: {
          betrag_gefordert?: number | null
          betrag_gekuerzt?: number | null
          betrag_reguliert?: number | null
          bezeichnung?: string
          dokument_id?: string | null
          erstellt_am?: string | null
          fall_id?: string
          id?: string
          quelle?: string | null
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      gebiet_exklusivitaeten: {
        Row: {
          aktiv_bis: string | null
          aktiv_seit: string
          created_at: string
          id: string
          isochron_geojson: Json
          organisation_id: string
        }
        Insert: {
          aktiv_bis?: string | null
          aktiv_seit?: string
          created_at?: string
          id?: string
          isochron_geojson: Json
          organisation_id: string
        }
        Update: {
          aktiv_bis?: string | null
          aktiv_seit?: string
          created_at?: string
          id?: string
          isochron_geojson?: Json
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gebiet_exklusivitaeten_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_abrechnungen: {
        Row: {
          abgerechnet_am: string | null
          created_at: string | null
          fall_id: string | null
          guthaben_nachher: number | null
          guthaben_vorher: number | null
          id: string
          leadpreis: number | null
          monat: string | null
          preistyp: string | null
          schadenhoehe: number | null
          sv_id: string | null
        }
        Insert: {
          abgerechnet_am?: string | null
          created_at?: string | null
          fall_id?: string | null
          guthaben_nachher?: number | null
          guthaben_vorher?: number | null
          id?: string
          leadpreis?: number | null
          monat?: string | null
          preistyp?: string | null
          schadenhoehe?: number | null
          sv_id?: string | null
        }
        Update: {
          abgerechnet_am?: string | null
          created_at?: string | null
          fall_id?: string | null
          guthaben_nachher?: number | null
          guthaben_vorher?: number | null
          id?: string
          leadpreis?: number | null
          monat?: string | null
          preistyp?: string | null
          schadenhoehe?: number | null
          sv_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_abrechnungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_abrechnungspositionen: {
        Row: {
          abrechnung_id: string | null
          erstellt_am: string | null
          fall_id: string | null
          id: string
          kennzeichen: string | null
          kunde_name: string | null
          leadpreis: number | null
          leadpreis_typ: string | null
          schadenshoehe: number | null
          termin_datum: string | null
        }
        Insert: {
          abrechnung_id?: string | null
          erstellt_am?: string | null
          fall_id?: string | null
          id?: string
          kennzeichen?: string | null
          kunde_name?: string | null
          leadpreis?: number | null
          leadpreis_typ?: string | null
          schadenshoehe?: number | null
          termin_datum?: string | null
        }
        Update: {
          abrechnung_id?: string | null
          erstellt_am?: string | null
          fall_id?: string | null
          id?: string
          kennzeichen?: string | null
          kunde_name?: string | null
          leadpreis?: number | null
          leadpreis_typ?: string | null
          schadenshoehe?: number | null
          termin_datum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_abrechnungspositionen_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "gutachter_monatsabrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_einzahlungen: {
        Row: {
          beschreibung: string | null
          betrag: number
          eingezahlt_am: string | null
          id: string
          sv_id: string | null
          typ: string | null
        }
        Insert: {
          beschreibung?: string | null
          betrag: number
          eingezahlt_am?: string | null
          id?: string
          sv_id?: string | null
          typ?: string | null
        }
        Update: {
          beschreibung?: string | null
          betrag?: number
          eingezahlt_am?: string | null
          id?: string
          sv_id?: string | null
          typ?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_einzahlungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_mitteilungen: {
        Row: {
          created_at: string | null
          fall_id: string | null
          gelesen: boolean | null
          id: string
          link: string | null
          nachricht: string
          sv_id: string | null
          titel: string
          typ: string
        }
        Insert: {
          created_at?: string | null
          fall_id?: string | null
          gelesen?: boolean | null
          id?: string
          link?: string | null
          nachricht: string
          sv_id?: string | null
          titel: string
          typ: string
        }
        Update: {
          created_at?: string | null
          fall_id?: string | null
          gelesen?: boolean | null
          id?: string
          link?: string | null
          nachricht?: string
          sv_id?: string | null
          titel?: string
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_mitteilungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_mitteilungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_mitteilungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_mitteilungen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_mitteilungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_monatsabrechnungen: {
        Row: {
          bezahlt_am: string | null
          erstellt_am: string | null
          faelle_einzel: number | null
          faelle_im_paket: number | null
          faellig_am: string | null
          gesamtbetrag: number | null
          id: string
          monat: string
          status: string | null
          summe_einzel: number | null
          summe_paket: number | null
          sv_id: string
        }
        Insert: {
          bezahlt_am?: string | null
          erstellt_am?: string | null
          faelle_einzel?: number | null
          faelle_im_paket?: number | null
          faellig_am?: string | null
          gesamtbetrag?: number | null
          id?: string
          monat: string
          status?: string | null
          summe_einzel?: number | null
          summe_paket?: number | null
          sv_id: string
        }
        Update: {
          bezahlt_am?: string | null
          erstellt_am?: string | null
          faelle_einzel?: number | null
          faelle_im_paket?: number | null
          faellig_am?: string | null
          gesamtbetrag?: number | null
          id?: string
          monat?: string
          status?: string | null
          summe_einzel?: number | null
          summe_paket?: number | null
          sv_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_monatsabrechnungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_termine: {
        Row: {
          abgelehnt_am: string | null
          abgelehnt_grund: string | null
          ablehnen_token: string | null
          ablehnen_token_expires_at: string | null
          ablehnungsgrund: string | null
          abschluss_zeit: string | null
          ankunft_via: string | null
          ankunft_zeit: string | null
          bezahlt: boolean
          cancelled_at: string | null
          created_at: string | null
          durchgefuehrt_am: string | null
          end_zeit: string
          erinnerung_24h_gesendet: boolean | null
          erinnerung_2h_gesendet: boolean | null
          erinnerung_48h_docs_gesendet: boolean | null
          externer_kalender_id: string | null
          fall_id: string | null
          final_verbindlich_ab: string | null
          gegenvorschlag_grund: string | null
          gegenvorschlag_von: string | null
          gegenvorschlag_zeit: string | null
          gps_lat_ankunft: number | null
          gps_lng_ankunft: number | null
          honorar_betrag: number | null
          id: string
          kanal: string | null
          kb_id: string | null
          kunde_angekommen_am: string | null
          kunde_eta_letzte_berechnung: string | null
          kunde_eta_minuten: number | null
          kunde_losgefahren_am: string | null
          kunde_tracking_aktiviert: boolean | null
          kunde_verspaetung_gemeldet_am: string | null
          kunden_tracking_token: string | null
          lead_id: string | null
          losgefahren_am: string | null
          navigation_started_at: string | null
          notification_5min_gesendet_am: string | null
          notification_angekommen_gesendet_am: string | null
          notification_losgefahren_gesendet_am: string | null
          notiz_intern: string | null
          notiz_kunde: string | null
          notizen_vor_ort: string | null
          reminder_15min_sent_at: string | null
          reminder_1h_sent_at: string | null
          reminder_5min_sent_at: string | null
          reminder_sent_at: string | null
          start_zeit: string
          status: string | null
          sv_ablehnung_am: string | null
          sv_ablehnung_grund: string | null
          sv_angekommen_am: string | null
          sv_eta_letzte_berechnung: string | null
          sv_eta_minuten: number | null
          sv_id: string | null
          sv_unterwegs_seit: string | null
          sv_vorgeschlagene_slots: Json | null
          typ: string
          uebersprung_grund: string | null
          uebersprungen: boolean | null
          verspaetung_minuten: number | null
          video_link: string | null
          vorgeschlagenes_datum: string | null
        }
        Insert: {
          abgelehnt_am?: string | null
          abgelehnt_grund?: string | null
          ablehnen_token?: string | null
          ablehnen_token_expires_at?: string | null
          ablehnungsgrund?: string | null
          abschluss_zeit?: string | null
          ankunft_via?: string | null
          ankunft_zeit?: string | null
          bezahlt?: boolean
          cancelled_at?: string | null
          created_at?: string | null
          durchgefuehrt_am?: string | null
          end_zeit: string
          erinnerung_24h_gesendet?: boolean | null
          erinnerung_2h_gesendet?: boolean | null
          erinnerung_48h_docs_gesendet?: boolean | null
          externer_kalender_id?: string | null
          fall_id?: string | null
          final_verbindlich_ab?: string | null
          gegenvorschlag_grund?: string | null
          gegenvorschlag_von?: string | null
          gegenvorschlag_zeit?: string | null
          gps_lat_ankunft?: number | null
          gps_lng_ankunft?: number | null
          honorar_betrag?: number | null
          id?: string
          kanal?: string | null
          kb_id?: string | null
          kunde_angekommen_am?: string | null
          kunde_eta_letzte_berechnung?: string | null
          kunde_eta_minuten?: number | null
          kunde_losgefahren_am?: string | null
          kunde_tracking_aktiviert?: boolean | null
          kunde_verspaetung_gemeldet_am?: string | null
          kunden_tracking_token?: string | null
          lead_id?: string | null
          losgefahren_am?: string | null
          navigation_started_at?: string | null
          notification_5min_gesendet_am?: string | null
          notification_angekommen_gesendet_am?: string | null
          notification_losgefahren_gesendet_am?: string | null
          notiz_intern?: string | null
          notiz_kunde?: string | null
          notizen_vor_ort?: string | null
          reminder_15min_sent_at?: string | null
          reminder_1h_sent_at?: string | null
          reminder_5min_sent_at?: string | null
          reminder_sent_at?: string | null
          start_zeit: string
          status?: string | null
          sv_ablehnung_am?: string | null
          sv_ablehnung_grund?: string | null
          sv_angekommen_am?: string | null
          sv_eta_letzte_berechnung?: string | null
          sv_eta_minuten?: number | null
          sv_id?: string | null
          sv_unterwegs_seit?: string | null
          sv_vorgeschlagene_slots?: Json | null
          typ?: string
          uebersprung_grund?: string | null
          uebersprungen?: boolean | null
          verspaetung_minuten?: number | null
          video_link?: string | null
          vorgeschlagenes_datum?: string | null
        }
        Update: {
          abgelehnt_am?: string | null
          abgelehnt_grund?: string | null
          ablehnen_token?: string | null
          ablehnen_token_expires_at?: string | null
          ablehnungsgrund?: string | null
          abschluss_zeit?: string | null
          ankunft_via?: string | null
          ankunft_zeit?: string | null
          bezahlt?: boolean
          cancelled_at?: string | null
          created_at?: string | null
          durchgefuehrt_am?: string | null
          end_zeit?: string
          erinnerung_24h_gesendet?: boolean | null
          erinnerung_2h_gesendet?: boolean | null
          erinnerung_48h_docs_gesendet?: boolean | null
          externer_kalender_id?: string | null
          fall_id?: string | null
          final_verbindlich_ab?: string | null
          gegenvorschlag_grund?: string | null
          gegenvorschlag_von?: string | null
          gegenvorschlag_zeit?: string | null
          gps_lat_ankunft?: number | null
          gps_lng_ankunft?: number | null
          honorar_betrag?: number | null
          id?: string
          kanal?: string | null
          kb_id?: string | null
          kunde_angekommen_am?: string | null
          kunde_eta_letzte_berechnung?: string | null
          kunde_eta_minuten?: number | null
          kunde_losgefahren_am?: string | null
          kunde_tracking_aktiviert?: boolean | null
          kunde_verspaetung_gemeldet_am?: string | null
          kunden_tracking_token?: string | null
          lead_id?: string | null
          losgefahren_am?: string | null
          navigation_started_at?: string | null
          notification_5min_gesendet_am?: string | null
          notification_angekommen_gesendet_am?: string | null
          notification_losgefahren_gesendet_am?: string | null
          notiz_intern?: string | null
          notiz_kunde?: string | null
          notizen_vor_ort?: string | null
          reminder_15min_sent_at?: string | null
          reminder_1h_sent_at?: string | null
          reminder_5min_sent_at?: string | null
          reminder_sent_at?: string | null
          start_zeit?: string
          status?: string | null
          sv_ablehnung_am?: string | null
          sv_ablehnung_grund?: string | null
          sv_angekommen_am?: string | null
          sv_eta_letzte_berechnung?: string | null
          sv_eta_minuten?: number | null
          sv_id?: string | null
          sv_unterwegs_seit?: string | null
          sv_vorgeschlagene_slots?: Json | null
          typ?: string
          uebersprung_grund?: string | null
          uebersprungen?: boolean | null
          verspaetung_minuten?: number | null
          video_link?: string | null
          vorgeschlagenes_datum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      gutschriften: {
        Row: {
          ausgezahlt_am: string | null
          betrag_brutto: number
          betrag_netto: number
          created_at: string
          grund: string
          id: string
          mwst_betrag: number
          referenz_abrechnung_id: string | null
          referenz_fall_id: string | null
          status: string
          stripe_refund_id: string | null
          sv_id: string
          updated_at: string
          verrechnet_in_abrechnung_id: string | null
        }
        Insert: {
          ausgezahlt_am?: string | null
          betrag_brutto: number
          betrag_netto: number
          created_at?: string
          grund: string
          id?: string
          mwst_betrag: number
          referenz_abrechnung_id?: string | null
          referenz_fall_id?: string | null
          status?: string
          stripe_refund_id?: string | null
          sv_id: string
          updated_at?: string
          verrechnet_in_abrechnung_id?: string | null
        }
        Update: {
          ausgezahlt_am?: string | null
          betrag_brutto?: number
          betrag_netto?: number
          created_at?: string
          grund?: string
          id?: string
          mwst_betrag?: number
          referenz_abrechnung_id?: string | null
          referenz_fall_id?: string | null
          status?: string
          stripe_refund_id?: string | null
          sv_id?: string
          updated_at?: string
          verrechnet_in_abrechnung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutschriften_referenz_abrechnung_id_fkey"
            columns: ["referenz_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutschriften_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_auszahlungen: {
        Row: {
          betrag: number | null
          created_at: string | null
          id: string
          incentive_id: string | null
          mitarbeiter_id: string | null
          monat: string | null
          status: string | null
        }
        Insert: {
          betrag?: number | null
          created_at?: string | null
          id?: string
          incentive_id?: string | null
          mitarbeiter_id?: string | null
          monat?: string | null
          status?: string | null
        }
        Update: {
          betrag?: number | null
          created_at?: string | null
          id?: string
          incentive_id?: string | null
          mitarbeiter_id?: string | null
          monat?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_auszahlungen_incentive_id_fkey"
            columns: ["incentive_id"]
            isOneToOne: false
            referencedRelation: "incentives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_auszahlungen_mitarbeiter_id_fkey"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incentives: {
        Row: {
          aktiv: boolean | null
          bedingung: string
          beschreibung: string | null
          created_at: string | null
          gueltig_ab: string | null
          gueltig_bis: string | null
          id: string
          kategorie: string | null
          titel: string
          typ: string | null
          wert: number | null
        }
        Insert: {
          aktiv?: boolean | null
          bedingung: string
          beschreibung?: string | null
          created_at?: string | null
          gueltig_ab?: string | null
          gueltig_bis?: string | null
          id?: string
          kategorie?: string | null
          titel: string
          typ?: string | null
          wert?: number | null
        }
        Update: {
          aktiv?: boolean | null
          bedingung?: string
          beschreibung?: string | null
          created_at?: string | null
          gueltig_ab?: string | null
          gueltig_bis?: string | null
          id?: string
          kategorie?: string | null
          titel?: string
          typ?: string | null
          wert?: number | null
        }
        Relationships: []
      }
      individuelle_anfragen: {
        Row: {
          erstellt_am: string | null
          gewuenschte_faelle: number | null
          gewuenschter_radius_km: number | null
          id: string
          nachricht: string | null
          status: string | null
          sv_id: string | null
        }
        Insert: {
          erstellt_am?: string | null
          gewuenschte_faelle?: number | null
          gewuenschter_radius_km?: number | null
          id?: string
          nachricht?: string | null
          status?: string | null
          sv_id?: string | null
        }
        Update: {
          erstellt_am?: string | null
          gewuenschte_faelle?: number | null
          gewuenschter_radius_km?: number | null
          id?: string
          nachricht?: string | null
          status?: string | null
          sv_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "individuelle_anfragen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzlei_abrechnung_positionen: {
        Row: {
          betrag_netto: number
          fall_id: string
          fall_nr: string
          id: string
          kanzlei_abrechnung_id: string
          kunde_name: string
          position_nr: number
          vollmacht_unterschrieben_am: string
        }
        Insert: {
          betrag_netto?: number
          fall_id: string
          fall_nr: string
          id?: string
          kanzlei_abrechnung_id: string
          kunde_name: string
          position_nr: number
          vollmacht_unterschrieben_am: string
        }
        Update: {
          betrag_netto?: number
          fall_id?: string
          fall_nr?: string
          id?: string
          kanzlei_abrechnung_id?: string
          kunde_name?: string
          position_nr?: number
          vollmacht_unterschrieben_am?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzlei_abrechnung_reminders: {
        Row: {
          gesendet_am: string
          id: string
          kanzlei_abrechnung_id: string
          reminder_typ: string
        }
        Insert: {
          gesendet_am?: string
          id?: string
          kanzlei_abrechnung_id: string
          reminder_typ: string
        }
        Update: {
          gesendet_am?: string
          id?: string
          kanzlei_abrechnung_id?: string
          reminder_typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanzlei_abrechnung_reminders_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzlei_abrechnungen: {
        Row: {
          abrechnungsjahr: number
          abrechnungsmonat: number
          anzahl_vollmachten: number
          betrag_pro_vollmacht_netto: number
          bezahlt_am: string | null
          created_at: string
          endbetrag_brutto: number
          endbetrag_netto: number
          faelligkeitsdatum: string
          fehlgeschlagen_am: string | null
          fehlgeschlagen_grund: string | null
          id: string
          kanzlei_id: string | null
          magic_link_expires_at: string
          magic_link_token: string
          mwst_betrag: number
          pdf_storage_path: string | null
          rechnungsnummer: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          versendet_am: string | null
        }
        Insert: {
          abrechnungsjahr: number
          abrechnungsmonat: number
          anzahl_vollmachten: number
          betrag_pro_vollmacht_netto?: number
          bezahlt_am?: string | null
          created_at?: string
          endbetrag_brutto: number
          endbetrag_netto: number
          faelligkeitsdatum: string
          fehlgeschlagen_am?: string | null
          fehlgeschlagen_grund?: string | null
          id?: string
          kanzlei_id?: string | null
          magic_link_expires_at: string
          magic_link_token: string
          mwst_betrag: number
          pdf_storage_path?: string | null
          rechnungsnummer: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          versendet_am?: string | null
        }
        Update: {
          abrechnungsjahr?: number
          abrechnungsmonat?: number
          anzahl_vollmachten?: number
          betrag_pro_vollmacht_netto?: number
          bezahlt_am?: string | null
          created_at?: string
          endbetrag_brutto?: number
          endbetrag_netto?: number
          faelligkeitsdatum?: string
          fehlgeschlagen_am?: string | null
          fehlgeschlagen_grund?: string | null
          id?: string
          kanzlei_id?: string | null
          magic_link_expires_at?: string
          magic_link_token?: string
          mwst_betrag?: number
          pdf_storage_path?: string | null
          rechnungsnummer?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          versendet_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kanzlei_abrechnungen_kanzlei_id_fkey"
            columns: ["kanzlei_id"]
            isOneToOne: false
            referencedRelation: "kanzleien"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzleien: {
        Row: {
          adresse: string | null
          aktiv: boolean
          ansprechpartner: string | null
          created_at: string
          email: string
          iban: string | null
          id: string
          name: string
          ust_id: string | null
        }
        Insert: {
          adresse?: string | null
          aktiv?: boolean
          ansprechpartner?: string | null
          created_at?: string
          email: string
          iban?: string | null
          id?: string
          name: string
          ust_id?: string | null
        }
        Update: {
          adresse?: string | null
          aktiv?: boolean
          ansprechpartner?: string | null
          created_at?: string
          email?: string
          iban?: string | null
          id?: string
          name?: string
          ust_id?: string | null
        }
        Relationships: []
      }
      ki_gespraeche: {
        Row: {
          created_at: string | null
          fall_id: string | null
          id: string
          nachrichten: Json
          rolle: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          fall_id?: string | null
          id?: string
          nachrichten?: Json
          rolle: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          fall_id?: string | null
          id?: string
          nachrichten?: Json
          rolle?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ki_gespraeche_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      kunde_gutachten_requests: {
        Row: {
          accessed_at: string | null
          created_at: string
          empfaenger_email: string
          expires_at: string
          fall_id: string
          id: string
          magic_link_token: string
        }
        Insert: {
          accessed_at?: string | null
          created_at?: string
          empfaenger_email: string
          expires_at: string
          fall_id: string
          id?: string
          magic_link_token: string
        }
        Update: {
          accessed_at?: string | null
          created_at?: string
          empfaenger_email?: string
          expires_at?: string
          fall_id?: string
          id?: string
          magic_link_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      kunde_live_position: {
        Row: {
          accuracy_m: number | null
          distance_to_target_meters: number | null
          id: string
          kunde_id: string | null
          lat: number
          lng: number
          speed_kmh: number | null
          termin_id: string
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          distance_to_target_meters?: number | null
          id?: string
          kunde_id?: string | null
          lat: number
          lng: number
          speed_kmh?: number | null
          termin_id: string
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          distance_to_target_meters?: number | null
          id?: string
          kunde_id?: string | null
          lat?: number
          lng?: number
          speed_kmh?: number | null
          termin_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kunde_live_position_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_live_position_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
        ]
      }
      lead_historie: {
        Row: {
          alter_wert: string | null
          feld: string
          geaendert_am: string
          geaendert_von: string | null
          id: string
          lead_id: string
          neuer_wert: string | null
        }
        Insert: {
          alter_wert?: string | null
          feld: string
          geaendert_am?: string
          geaendert_von?: string | null
          id?: string
          lead_id: string
          neuer_wert?: string | null
        }
        Update: {
          alter_wert?: string | null
          feld?: string
          geaendert_am?: string
          geaendert_von?: string | null
          id?: string
          lead_id?: string
          neuer_wert?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_historie_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leadpreise_tabelle: {
        Row: {
          aktiv: boolean
          created_at: string
          einzelpreis_netto: number
          id: string
          paketpreis_netto: number
          schadenhoehe_bis_netto: number
          version: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          einzelpreis_netto: number
          id?: string
          paketpreis_netto: number
          schadenhoehe_bis_netto: number
          version?: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          einzelpreis_netto?: number
          id?: string
          paketpreis_netto?: number
          schadenhoehe_bis_netto?: number
          version?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          aircall_contact_id: string | null
          anruf_versuche: number | null
          aufklaerung_teilschuld_bestaetigt: boolean | null
          auslandskennzeichen: boolean | null
          bevorzugter_kanal: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          claude_vision_analyse: Json | null
          created_at: string | null
          dat_einschaetzung: Json | null
          dat_pdf_url: string | null
          disqualifikations_grund: string | null
          disqualifikations_grund_key: string | null
          disqualifiziert: boolean | null
          disqualifiziert_am: string | null
          disqualifiziert_grund: string | null
          disqualifiziert_notiz: string | null
          disqualifizierung_grund: string | null
          eigene_policennr: string | null
          eigene_versicherung: string | null
          email: string | null
          erstzulassung: string | null
          fahrerflucht: boolean | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_standort_adresse: string | null
          fahrzeug_standort_plz: string | null
          fin: string | null
          finanzierung_bank: string | null
          finanzierung_flag: boolean | null
          finanzierung_leasing: string | null
          finanzierungsgeber_adresse: string | null
          finanzierungsgeber_name: string | null
          finanzierungsgeber_vertragsnr: string | null
          firma_name: string | null
          firma_ustid: string | null
          flow_link_abgeschlossen: boolean | null
          flow_link_geoeffnet: boolean | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_schadennummer: string | null
          gegner_versicherung: string | null
          gegner_versicherung_anfrage_datum: string | null
          gegner_versicherung_id: string | null
          gespraech_beendet_am: string | null
          gespraech_dauer_sekunden: number | null
          gespraech_gestartet_am: string | null
          gewerbe_flag: boolean | null
          gutachter_termin: string | null
          halter_email: string | null
          halter_geburtsdatum: string | null
          halter_nachname: string | null
          halter_name: string | null
          halter_plz: string | null
          halter_stadt: string | null
          halter_strasse: string | null
          halter_telefon: string | null
          halter_ungleich_fahrer_flag: boolean | null
          halter_vorname: string | null
          hat_haftpflicht: boolean | null
          hat_vorschaeden: boolean | null
          hsn: string | null
          id: string
          ist_fahrzeughalter: boolean | null
          kanzlei_triggered: boolean | null
          kennzeichen: string | null
          kilometerstand: number | null
          kontaktversuche: number | null
          konvertiert_zu_fall_id: string | null
          kunde_adresse: string | null
          kunde_lat: number | null
          kunde_lng: number | null
          kunde_plz: string | null
          kunde_stadt: string | null
          kunde_strasse: string | null
          kunden_konstellation: string | null
          leasing_flag: boolean | null
          leasing_geber: string | null
          letzter_anruf_am: string | null
          letzter_anruf_status: string | null
          mandatstyp: string | null
          mietwagen_flag: boolean | null
          missed_call_times: Json | null
          nachname: string | null
          notiz: string | null
          nutzungsausfall: boolean | null
          parkplatz_kamera: boolean | null
          personenschaden_flag: boolean | null
          polizei_aktenzeichen: string | null
          polizei_vor_ort: boolean | null
          polizeibericht_gesendet_am: string | null
          polizeibericht_hochgeladen_am: string | null
          polizeibericht_ocr_daten: Json | null
          polizeibericht_pflicht: boolean | null
          polizeibericht_status: string | null
          polizeibericht_token: string | null
          polizeibericht_url: string | null
          promotion_code_id: string | null
          qualifizierung_data: Json | null
          qualifizierungs_phase: string | null
          reminder_1_sent_at: string | null
          reminder_2_sent_at: string | null
          reminder_3_sent_at: string | null
          reminder_token: string | null
          rueckruf_datum: string | null
          rueckruf_erledigt: boolean | null
          rueckruf_notiz: string | null
          rueckruf_termin: string | null
          sa_datum: string | null
          sa_signiert: boolean | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sachschaden_beschreibung: string | null
          sachschaden_flag: boolean
          schaden_sichtbar: boolean | null
          schadens_art: string | null
          schadens_fall_typ: string | null
          schadens_hergang: string | null
          schadensfoto_urls: Json | null
          schadensursache: string | null
          schadentyp: string | null
          schadentyp_freitext: string | null
          schuldfrage: string | null
          service_typ: string
          sf_variante: string | null
          source_channel: string | null
          source_domain: string | null
          spezifikation: string | null
          sprache: string | null
          status: Database["public"]["Enums"]["lead_status"]
          sv_treffpunkt: string | null
          telefon: string | null
          timeline: Json | null
          tsn: string | null
          unfall_konstellation: string | null
          unfall_uhrzeit: string | null
          unfalldatum: string | null
          unfallhergang: string | null
          unfallmitteilung_hochgeladen: boolean | null
          unfallort: string | null
          unfallort_kategorie: string | null
          unfallort_lat: number | null
          unfallort_lng: number | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          verpasste_anrufe: number | null
          voice_input_quelle: boolean
          vollmacht_datum: string | null
          vollmacht_signiert: boolean | null
          vollmacht_unterschrieben: boolean | null
          vorname: string | null
          vorschaeden_beschreibung: string | null
          vorsteuerabzugsberechtigt: boolean | null
          wa_gesendet: boolean | null
          werkstatt_seit_datum: string | null
          wunschtermin: string | null
          wunschtermin_wochentage: number[] | null
          zb1_gesendet_am: string | null
          zb1_hochgeladen_am: string | null
          zb1_ocr_daten: Json | null
          zb1_status: string | null
          zb1_token: string | null
          zb1_token_expires_at: string | null
          zb1_upload_versuche: number | null
          zb1_url: string | null
          zeuge_anschrift: string | null
          zeuge_email: string | null
          zeuge_name: string | null
          zeuge_telefon: string | null
          zeugen: boolean | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean
          zugewiesen_an: string | null
        }
        Insert: {
          aircall_contact_id?: string | null
          anruf_versuche?: number | null
          aufklaerung_teilschuld_bestaetigt?: boolean | null
          auslandskennzeichen?: boolean | null
          bevorzugter_kanal?: string | null
          cardentity_enriched_at?: string | null
          cardentity_report?: Json | null
          claude_vision_analyse?: Json | null
          created_at?: string | null
          dat_einschaetzung?: Json | null
          dat_pdf_url?: string | null
          disqualifikations_grund?: string | null
          disqualifikations_grund_key?: string | null
          disqualifiziert?: boolean | null
          disqualifiziert_am?: string | null
          disqualifiziert_grund?: string | null
          disqualifiziert_notiz?: string | null
          disqualifizierung_grund?: string | null
          eigene_policennr?: string | null
          eigene_versicherung?: string | null
          email?: string | null
          erstzulassung?: string | null
          fahrerflucht?: boolean | null
          fahrzeug_ausstattung?: Json | null
          fahrzeug_baujahr?: number | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeug_farbe?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeug_standort_adresse?: string | null
          fahrzeug_standort_plz?: string | null
          fin?: string | null
          finanzierung_bank?: string | null
          finanzierung_flag?: boolean | null
          finanzierung_leasing?: string | null
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          firma_name?: string | null
          firma_ustid?: string | null
          flow_link_abgeschlossen?: boolean | null
          flow_link_geoeffnet?: boolean | null
          gegner_anzahl_beteiligte?: number | null
          gegner_bekannt?: boolean | null
          gegner_fahrzeugtyp?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_schadennummer?: string | null
          gegner_versicherung?: string | null
          gegner_versicherung_anfrage_datum?: string | null
          gegner_versicherung_id?: string | null
          gespraech_beendet_am?: string | null
          gespraech_dauer_sekunden?: number | null
          gespraech_gestartet_am?: string | null
          gewerbe_flag?: boolean | null
          gutachter_termin?: string | null
          halter_email?: string | null
          halter_geburtsdatum?: string | null
          halter_nachname?: string | null
          halter_name?: string | null
          halter_plz?: string | null
          halter_stadt?: string | null
          halter_strasse?: string | null
          halter_telefon?: string | null
          halter_ungleich_fahrer_flag?: boolean | null
          halter_vorname?: string | null
          hat_haftpflicht?: boolean | null
          hat_vorschaeden?: boolean | null
          hsn?: string | null
          id?: string
          ist_fahrzeughalter?: boolean | null
          kanzlei_triggered?: boolean | null
          kennzeichen?: string | null
          kilometerstand?: number | null
          kontaktversuche?: number | null
          konvertiert_zu_fall_id?: string | null
          kunde_adresse?: string | null
          kunde_lat?: number | null
          kunde_lng?: number | null
          kunde_plz?: string | null
          kunde_stadt?: string | null
          kunde_strasse?: string | null
          kunden_konstellation?: string | null
          leasing_flag?: boolean | null
          leasing_geber?: string | null
          letzter_anruf_am?: string | null
          letzter_anruf_status?: string | null
          mandatstyp?: string | null
          mietwagen_flag?: boolean | null
          missed_call_times?: Json | null
          nachname?: string | null
          notiz?: string | null
          nutzungsausfall?: boolean | null
          parkplatz_kamera?: boolean | null
          personenschaden_flag?: boolean | null
          polizei_aktenzeichen?: string | null
          polizei_vor_ort?: boolean | null
          polizeibericht_gesendet_am?: string | null
          polizeibericht_hochgeladen_am?: string | null
          polizeibericht_ocr_daten?: Json | null
          polizeibericht_pflicht?: boolean | null
          polizeibericht_status?: string | null
          polizeibericht_token?: string | null
          polizeibericht_url?: string | null
          promotion_code_id?: string | null
          qualifizierung_data?: Json | null
          qualifizierungs_phase?: string | null
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          reminder_token?: string | null
          rueckruf_datum?: string | null
          rueckruf_erledigt?: boolean | null
          rueckruf_notiz?: string | null
          rueckruf_termin?: string | null
          sa_datum?: string | null
          sa_signiert?: boolean | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sachschaden_beschreibung?: string | null
          sachschaden_flag?: boolean
          schaden_sichtbar?: boolean | null
          schadens_art?: string | null
          schadens_fall_typ?: string | null
          schadens_hergang?: string | null
          schadensfoto_urls?: Json | null
          schadensursache?: string | null
          schadentyp?: string | null
          schadentyp_freitext?: string | null
          schuldfrage?: string | null
          service_typ?: string
          sf_variante?: string | null
          source_channel?: string | null
          source_domain?: string | null
          spezifikation?: string | null
          sprache?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sv_treffpunkt?: string | null
          telefon?: string | null
          timeline?: Json | null
          tsn?: string | null
          unfall_konstellation?: string | null
          unfall_uhrzeit?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallmitteilung_hochgeladen?: boolean | null
          unfallort?: string | null
          unfallort_kategorie?: string | null
          unfallort_lat?: number | null
          unfallort_lng?: number | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
          verpasste_anrufe?: number | null
          voice_input_quelle?: boolean
          vollmacht_datum?: string | null
          vollmacht_signiert?: boolean | null
          vollmacht_unterschrieben?: boolean | null
          vorname?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean | null
          wa_gesendet?: boolean | null
          werkstatt_seit_datum?: string | null
          wunschtermin?: string | null
          wunschtermin_wochentage?: number[] | null
          zb1_gesendet_am?: string | null
          zb1_hochgeladen_am?: string | null
          zb1_ocr_daten?: Json | null
          zb1_status?: string | null
          zb1_token?: string | null
          zb1_token_expires_at?: string | null
          zb1_upload_versuche?: number | null
          zb1_url?: string | null
          zeuge_anschrift?: string | null
          zeuge_email?: string | null
          zeuge_name?: string | null
          zeuge_telefon?: string | null
          zeugen?: boolean | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
          zugewiesen_an?: string | null
        }
        Update: {
          aircall_contact_id?: string | null
          anruf_versuche?: number | null
          aufklaerung_teilschuld_bestaetigt?: boolean | null
          auslandskennzeichen?: boolean | null
          bevorzugter_kanal?: string | null
          cardentity_enriched_at?: string | null
          cardentity_report?: Json | null
          claude_vision_analyse?: Json | null
          created_at?: string | null
          dat_einschaetzung?: Json | null
          dat_pdf_url?: string | null
          disqualifikations_grund?: string | null
          disqualifikations_grund_key?: string | null
          disqualifiziert?: boolean | null
          disqualifiziert_am?: string | null
          disqualifiziert_grund?: string | null
          disqualifiziert_notiz?: string | null
          disqualifizierung_grund?: string | null
          eigene_policennr?: string | null
          eigene_versicherung?: string | null
          email?: string | null
          erstzulassung?: string | null
          fahrerflucht?: boolean | null
          fahrzeug_ausstattung?: Json | null
          fahrzeug_baujahr?: number | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeug_farbe?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeug_standort_adresse?: string | null
          fahrzeug_standort_plz?: string | null
          fin?: string | null
          finanzierung_bank?: string | null
          finanzierung_flag?: boolean | null
          finanzierung_leasing?: string | null
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          firma_name?: string | null
          firma_ustid?: string | null
          flow_link_abgeschlossen?: boolean | null
          flow_link_geoeffnet?: boolean | null
          gegner_anzahl_beteiligte?: number | null
          gegner_bekannt?: boolean | null
          gegner_fahrzeugtyp?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_schadennummer?: string | null
          gegner_versicherung?: string | null
          gegner_versicherung_anfrage_datum?: string | null
          gegner_versicherung_id?: string | null
          gespraech_beendet_am?: string | null
          gespraech_dauer_sekunden?: number | null
          gespraech_gestartet_am?: string | null
          gewerbe_flag?: boolean | null
          gutachter_termin?: string | null
          halter_email?: string | null
          halter_geburtsdatum?: string | null
          halter_nachname?: string | null
          halter_name?: string | null
          halter_plz?: string | null
          halter_stadt?: string | null
          halter_strasse?: string | null
          halter_telefon?: string | null
          halter_ungleich_fahrer_flag?: boolean | null
          halter_vorname?: string | null
          hat_haftpflicht?: boolean | null
          hat_vorschaeden?: boolean | null
          hsn?: string | null
          id?: string
          ist_fahrzeughalter?: boolean | null
          kanzlei_triggered?: boolean | null
          kennzeichen?: string | null
          kilometerstand?: number | null
          kontaktversuche?: number | null
          konvertiert_zu_fall_id?: string | null
          kunde_adresse?: string | null
          kunde_lat?: number | null
          kunde_lng?: number | null
          kunde_plz?: string | null
          kunde_stadt?: string | null
          kunde_strasse?: string | null
          kunden_konstellation?: string | null
          leasing_flag?: boolean | null
          leasing_geber?: string | null
          letzter_anruf_am?: string | null
          letzter_anruf_status?: string | null
          mandatstyp?: string | null
          mietwagen_flag?: boolean | null
          missed_call_times?: Json | null
          nachname?: string | null
          notiz?: string | null
          nutzungsausfall?: boolean | null
          parkplatz_kamera?: boolean | null
          personenschaden_flag?: boolean | null
          polizei_aktenzeichen?: string | null
          polizei_vor_ort?: boolean | null
          polizeibericht_gesendet_am?: string | null
          polizeibericht_hochgeladen_am?: string | null
          polizeibericht_ocr_daten?: Json | null
          polizeibericht_pflicht?: boolean | null
          polizeibericht_status?: string | null
          polizeibericht_token?: string | null
          polizeibericht_url?: string | null
          promotion_code_id?: string | null
          qualifizierung_data?: Json | null
          qualifizierungs_phase?: string | null
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          reminder_token?: string | null
          rueckruf_datum?: string | null
          rueckruf_erledigt?: boolean | null
          rueckruf_notiz?: string | null
          rueckruf_termin?: string | null
          sa_datum?: string | null
          sa_signiert?: boolean | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sachschaden_beschreibung?: string | null
          sachschaden_flag?: boolean
          schaden_sichtbar?: boolean | null
          schadens_art?: string | null
          schadens_fall_typ?: string | null
          schadens_hergang?: string | null
          schadensfoto_urls?: Json | null
          schadensursache?: string | null
          schadentyp?: string | null
          schadentyp_freitext?: string | null
          schuldfrage?: string | null
          service_typ?: string
          sf_variante?: string | null
          source_channel?: string | null
          source_domain?: string | null
          spezifikation?: string | null
          sprache?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sv_treffpunkt?: string | null
          telefon?: string | null
          timeline?: Json | null
          tsn?: string | null
          unfall_konstellation?: string | null
          unfall_uhrzeit?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallmitteilung_hochgeladen?: boolean | null
          unfallort?: string | null
          unfallort_kategorie?: string | null
          unfallort_lat?: number | null
          unfallort_lng?: number | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
          verpasste_anrufe?: number | null
          voice_input_quelle?: boolean
          vollmacht_datum?: string | null
          vollmacht_signiert?: boolean | null
          vollmacht_unterschrieben?: boolean | null
          vorname?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean | null
          wa_gesendet?: boolean | null
          werkstatt_seit_datum?: string | null
          wunschtermin?: string | null
          wunschtermin_wochentage?: number[] | null
          zb1_gesendet_am?: string | null
          zb1_hochgeladen_am?: string | null
          zb1_ocr_daten?: Json | null
          zb1_status?: string | null
          zb1_token?: string | null
          zb1_token_expires_at?: string | null
          zb1_upload_versuche?: number | null
          zb1_url?: string | null
          zeuge_anschrift?: string | null
          zeuge_email?: string | null
          zeuge_name?: string | null
          zeuge_telefon?: string | null
          zeugen?: boolean | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promotion_code_id_fkey"
            columns: ["promotion_code_id"]
            isOneToOne: false
            referencedRelation: "promotion_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_zugewiesen_an_fk"
            columns: ["zugewiesen_an"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_zugewiesen_an_fkey"
            columns: ["zugewiesen_an"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      makler: {
        Row: {
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          aktiviert_am: string | null
          aktiviert_von: string | null
          aktualisiert_am: string
          ansprechpartner_nachname: string
          ansprechpartner_vorname: string
          bank_bic: string | null
          bank_iban: string | null
          bank_kontoinhaber: string | null
          email: string
          erstellt_am: string
          firma: string
          gesperrt_am: string | null
          gesperrt_grund: string | null
          id: string
          ihk_nummer: string | null
          notification_preferences: Json | null
          provision_aktiv: boolean
          provision_betrag_komplett_netto: number
          provision_betrag_nur_gutachter_netto: number
          status: string
          telefon: string | null
          user_id: string | null
        }
        Insert: {
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          aktiviert_am?: string | null
          aktiviert_von?: string | null
          aktualisiert_am?: string
          ansprechpartner_nachname: string
          ansprechpartner_vorname: string
          bank_bic?: string | null
          bank_iban?: string | null
          bank_kontoinhaber?: string | null
          email: string
          erstellt_am?: string
          firma: string
          gesperrt_am?: string | null
          gesperrt_grund?: string | null
          id?: string
          ihk_nummer?: string | null
          notification_preferences?: Json | null
          provision_aktiv?: boolean
          provision_betrag_komplett_netto?: number
          provision_betrag_nur_gutachter_netto?: number
          status?: string
          telefon?: string | null
          user_id?: string | null
        }
        Update: {
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          aktiviert_am?: string | null
          aktiviert_von?: string | null
          aktualisiert_am?: string
          ansprechpartner_nachname?: string
          ansprechpartner_vorname?: string
          bank_bic?: string | null
          bank_iban?: string | null
          bank_kontoinhaber?: string | null
          email?: string
          erstellt_am?: string
          firma?: string
          gesperrt_am?: string | null
          gesperrt_grund?: string | null
          id?: string
          ihk_nummer?: string | null
          notification_preferences?: Json | null
          provision_aktiv?: boolean
          provision_betrag_komplett_netto?: number
          provision_betrag_nur_gutachter_netto?: number
          status?: string
          telefon?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      makler_fall_consent: {
        Row: {
          consent_gegeben_am: string
          consent_scope: string
          fall_id: string
          id: string
          makler_id: string
          widerrufen_am: string | null
          widerrufen_von: string | null
        }
        Insert: {
          consent_gegeben_am?: string
          consent_scope?: string
          fall_id: string
          id?: string
          makler_id: string
          widerrufen_am?: string | null
          widerrufen_von?: string | null
        }
        Update: {
          consent_gegeben_am?: string
          consent_scope?: string
          fall_id?: string
          id?: string
          makler_id?: string
          widerrufen_am?: string | null
          widerrufen_von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_makler_id_fkey"
            columns: ["makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
        ]
      }
      makler_provisionen: {
        Row: {
          abrechnung_id: string | null
          betrag_netto_eur: number
          erstellt_am: string
          fall_id: string | null
          hold_until: string
          id: string
          lead_id: string | null
          makler_id: string
          promotion_code_id: string | null
          service_typ: string
          status: string
          storniert_am: string | null
          storno_grund: string | null
          trigger_at: string
          trigger_event: string
        }
        Insert: {
          abrechnung_id?: string | null
          betrag_netto_eur: number
          erstellt_am?: string
          fall_id?: string | null
          hold_until: string
          id?: string
          lead_id?: string | null
          makler_id: string
          promotion_code_id?: string | null
          service_typ: string
          status?: string
          storniert_am?: string | null
          storno_grund?: string | null
          trigger_at: string
          trigger_event: string
        }
        Update: {
          abrechnung_id?: string | null
          betrag_netto_eur?: number
          erstellt_am?: string
          fall_id?: string | null
          hold_until?: string
          id?: string
          lead_id?: string | null
          makler_id?: string
          promotion_code_id?: string | null
          service_typ?: string
          status?: string
          storniert_am?: string | null
          storno_grund?: string | null
          trigger_at?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "makler_provisionen_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_makler_id_fkey"
            columns: ["makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_provisionen_promotion_code_id_fkey"
            columns: ["promotion_code_id"]
            isOneToOne: false
            referencedRelation: "promotion_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      mitarbeiter_performance: {
        Row: {
          aktive_faelle: number | null
          created_at: string | null
          durchschnittliche_bearbeitungszeit_tage: number | null
          faelle_abgeschlossen: number | null
          id: string
          jahr: number
          kundenzufriedenheit: number | null
          leads_konvertiert: number | null
          leads_qualifiziert: number | null
          mitarbeiter_id: string | null
          monat: string
          umsatz_generiert: number | null
        }
        Insert: {
          aktive_faelle?: number | null
          created_at?: string | null
          durchschnittliche_bearbeitungszeit_tage?: number | null
          faelle_abgeschlossen?: number | null
          id?: string
          jahr: number
          kundenzufriedenheit?: number | null
          leads_konvertiert?: number | null
          leads_qualifiziert?: number | null
          mitarbeiter_id?: string | null
          monat: string
          umsatz_generiert?: number | null
        }
        Update: {
          aktive_faelle?: number | null
          created_at?: string | null
          durchschnittliche_bearbeitungszeit_tage?: number | null
          faelle_abgeschlossen?: number | null
          id?: string
          jahr?: number
          kundenzufriedenheit?: number | null
          leads_konvertiert?: number | null
          leads_qualifiziert?: number | null
          mitarbeiter_id?: string | null
          monat?: string
          umsatz_generiert?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mitarbeiter_performance_mitarbeiter_id_fkey"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mitteilungen: {
        Row: {
          absender_id: string | null
          absender_name: string | null
          created_at: string
          empfaenger_id: string
          empfaenger_rolle: string
          gelesen: boolean
          gelesen_am: string | null
          icon: string | null
          id: string
          inhalt: string | null
          kategorie: string
          kontext_id: string | null
          kontext_typ: string | null
          prioritaet: string | null
          route_url: string | null
          titel: string
        }
        Insert: {
          absender_id?: string | null
          absender_name?: string | null
          created_at?: string
          empfaenger_id: string
          empfaenger_rolle: string
          gelesen?: boolean
          gelesen_am?: string | null
          icon?: string | null
          id?: string
          inhalt?: string | null
          kategorie: string
          kontext_id?: string | null
          kontext_typ?: string | null
          prioritaet?: string | null
          route_url?: string | null
          titel: string
        }
        Update: {
          absender_id?: string | null
          absender_name?: string | null
          created_at?: string
          empfaenger_id?: string
          empfaenger_rolle?: string
          gelesen?: boolean
          gelesen_am?: string | null
          icon?: string | null
          id?: string
          inhalt?: string | null
          kategorie?: string
          kontext_id?: string | null
          kontext_typ?: string | null
          prioritaet?: string | null
          route_url?: string | null
          titel?: string
        }
        Relationships: [
          {
            foreignKeyName: "mitteilungen_absender_id_fkey"
            columns: ["absender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mitteilungen_empfaenger_id_fkey"
            columns: ["empfaenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nachrichten: {
        Row: {
          anhang_typ: string | null
          anhang_url: string | null
          created_at: string | null
          empfaenger_id: string | null
          external_id: string | null
          fall_id: string | null
          gelesen: boolean | null
          hat_anhang: boolean | null
          id: string
          is_system: boolean
          kanal: string
          kb_empfaenger_id: string | null
          lead_id: string | null
          nachricht: string
          richtung: string | null
          sender_id: string | null
          sender_rolle: string | null
          system_event: string | null
        }
        Insert: {
          anhang_typ?: string | null
          anhang_url?: string | null
          created_at?: string | null
          empfaenger_id?: string | null
          external_id?: string | null
          fall_id?: string | null
          gelesen?: boolean | null
          hat_anhang?: boolean | null
          id?: string
          is_system?: boolean
          kanal: string
          kb_empfaenger_id?: string | null
          lead_id?: string | null
          nachricht: string
          richtung?: string | null
          sender_id?: string | null
          sender_rolle?: string | null
          system_event?: string | null
        }
        Update: {
          anhang_typ?: string | null
          anhang_url?: string | null
          created_at?: string | null
          empfaenger_id?: string | null
          external_id?: string | null
          fall_id?: string | null
          gelesen?: boolean | null
          hat_anhang?: boolean | null
          id?: string
          is_system?: boolean
          kanal?: string
          kb_empfaenger_id?: string | null
          lead_id?: string | null
          nachricht?: string
          richtung?: string | null
          sender_id?: string | null
          sender_rolle?: string | null
          system_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          event_id: string
          external_id: string | null
          id: string
          recipient_role: string
          recipient_user_id: string
          sent_at: string | null
          skip_reason: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          event_id: string
          external_id?: string | null
          id?: string
          recipient_role: string
          recipient_user_id: string
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_id?: string
          external_id?: string | null
          id?: string
          recipient_role?: string
          recipient_user_id?: string
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          fall_id: string | null
          id: string
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          retry_count: number
          status: string
          triggered_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          fall_id?: string | null
          id?: string
          next_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
          triggered_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          fall_id?: string | null
          id?: string
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel_opt_outs: Json
          event_opt_outs: Json
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_opt_outs?: Json
          event_opt_outs?: Json
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_opt_outs?: Json
          event_opt_outs?: Json
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organisationen: {
        Row: {
          akademie_erst_anzahlung_eur: number | null
          akademie_max_faelle_monat: number | null
          akademie_radius_km: number | null
          anschrift: string | null
          brand_accent: string | null
          brand_extracted_at: string | null
          brand_primary: string | null
          brand_secondary: string | null
          brand_theme: Json | null
          community_exklusiv: boolean
          community_leaderboard_aktiv: boolean
          community_max_faelle_monat: number | null
          created_at: string | null
          einsatzgebiet_isochron_geojson: Json | null
          einsatzgebiet_km: number | null
          einsatzgebiet_radius_km: number | null
          einsatzgebiet_zentrum_lat: number | null
          einsatzgebiet_zentrum_lng: number | null
          hauptansprechpartner_user_id: string | null
          id: string
          isochrone_polygon: Json | null
          logo_url: string | null
          name: string
          onboarding_status: string
          parent_stripe_customer_id: string | null
          parent_stripe_default_pm_id: string | null
          parent_user_id: string | null
          rechtsform: string | null
          standort_adresse: string | null
          standort_lat: number | null
          standort_lng: number | null
          standort_place_id: string | null
          standort_plz: string | null
          steuernummer: string | null
          typ: string | null
          updated_at: string
          use_custom_branding: boolean
          ust_id: string | null
          vertrag_unterzeichnet_id: string | null
        }
        Insert: {
          akademie_erst_anzahlung_eur?: number | null
          akademie_max_faelle_monat?: number | null
          akademie_radius_km?: number | null
          anschrift?: string | null
          brand_accent?: string | null
          brand_extracted_at?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_theme?: Json | null
          community_exklusiv?: boolean
          community_leaderboard_aktiv?: boolean
          community_max_faelle_monat?: number | null
          created_at?: string | null
          einsatzgebiet_isochron_geojson?: Json | null
          einsatzgebiet_km?: number | null
          einsatzgebiet_radius_km?: number | null
          einsatzgebiet_zentrum_lat?: number | null
          einsatzgebiet_zentrum_lng?: number | null
          hauptansprechpartner_user_id?: string | null
          id?: string
          isochrone_polygon?: Json | null
          logo_url?: string | null
          name: string
          onboarding_status?: string
          parent_stripe_customer_id?: string | null
          parent_stripe_default_pm_id?: string | null
          parent_user_id?: string | null
          rechtsform?: string | null
          standort_adresse?: string | null
          standort_lat?: number | null
          standort_lng?: number | null
          standort_place_id?: string | null
          standort_plz?: string | null
          steuernummer?: string | null
          typ?: string | null
          updated_at?: string
          use_custom_branding?: boolean
          ust_id?: string | null
          vertrag_unterzeichnet_id?: string | null
        }
        Update: {
          akademie_erst_anzahlung_eur?: number | null
          akademie_max_faelle_monat?: number | null
          akademie_radius_km?: number | null
          anschrift?: string | null
          brand_accent?: string | null
          brand_extracted_at?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_theme?: Json | null
          community_exklusiv?: boolean
          community_leaderboard_aktiv?: boolean
          community_max_faelle_monat?: number | null
          created_at?: string | null
          einsatzgebiet_isochron_geojson?: Json | null
          einsatzgebiet_km?: number | null
          einsatzgebiet_radius_km?: number | null
          einsatzgebiet_zentrum_lat?: number | null
          einsatzgebiet_zentrum_lng?: number | null
          hauptansprechpartner_user_id?: string | null
          id?: string
          isochrone_polygon?: Json | null
          logo_url?: string | null
          name?: string
          onboarding_status?: string
          parent_stripe_customer_id?: string | null
          parent_stripe_default_pm_id?: string | null
          parent_user_id?: string | null
          rechtsform?: string | null
          standort_adresse?: string | null
          standort_lat?: number | null
          standort_lng?: number | null
          standort_place_id?: string | null
          standort_plz?: string | null
          steuernummer?: string | null
          typ?: string | null
          updated_at?: string
          use_custom_branding?: boolean
          ust_id?: string | null
          vertrag_unterzeichnet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisationen_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisationen_vertrag_unterzeichnet_id_fkey"
            columns: ["vertrag_unterzeichnet_id"]
            isOneToOne: false
            referencedRelation: "vertraege_unterzeichnet"
            referencedColumns: ["id"]
          },
        ]
      }
      paket_upgrades: {
        Row: {
          aktiviert_am: string | null
          altes_paket: string
          angefragt_am: string | null
          bezahlt_am: string | null
          differenz_anzahlung: number
          id: string
          neues_paket: string
          status: string | null
          sv_id: string
        }
        Insert: {
          aktiviert_am?: string | null
          altes_paket: string
          angefragt_am?: string | null
          bezahlt_am?: string | null
          differenz_anzahlung: number
          id?: string
          neues_paket: string
          status?: string | null
          sv_id: string
        }
        Update: {
          aktiviert_am?: string | null
          altes_paket?: string
          angefragt_am?: string | null
          bezahlt_am?: string | null
          differenz_anzahlung?: number
          id?: string
          neues_paket?: string
          status?: string | null
          sv_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paket_upgrades_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      parteien: {
        Row: {
          adresse: string | null
          created_at: string | null
          email: string | null
          fall_id: string
          id: string
          name: string
          ort: string | null
          plz: string | null
          rolle: Database["public"]["Enums"]["partei_rolle"]
          telefon: string | null
          versicherung_name: string | null
          versicherung_nr: string | null
          vertrag_details: string | null
          vertrag_typ: Database["public"]["Enums"]["vertrag_typ"] | null
        }
        Insert: {
          adresse?: string | null
          created_at?: string | null
          email?: string | null
          fall_id: string
          id?: string
          name: string
          ort?: string | null
          plz?: string | null
          rolle: Database["public"]["Enums"]["partei_rolle"]
          telefon?: string | null
          versicherung_name?: string | null
          versicherung_nr?: string | null
          vertrag_details?: string | null
          vertrag_typ?: Database["public"]["Enums"]["vertrag_typ"] | null
        }
        Update: {
          adresse?: string | null
          created_at?: string | null
          email?: string | null
          fall_id?: string
          id?: string
          name?: string
          ort?: string | null
          plz?: string | null
          rolle?: Database["public"]["Enums"]["partei_rolle"]
          telefon?: string | null
          versicherung_name?: string | null
          versicherung_nr?: string | null
          vertrag_details?: string | null
          vertrag_typ?: Database["public"]["Enums"]["vertrag_typ"] | null
        }
        Relationships: [
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      personenschaden_personen: {
        Row: {
          created_at: string
          fall_id: string | null
          geburtsdatum: string | null
          id: string
          ist_fahrzeuginsasse: boolean
          lead_id: string | null
          nachname: string | null
          notizen: string | null
          updated_at: string
          verletzungsart: string | null
          vorname: string | null
        }
        Insert: {
          created_at?: string
          fall_id?: string | null
          geburtsdatum?: string | null
          id?: string
          ist_fahrzeuginsasse?: boolean
          lead_id?: string | null
          nachname?: string | null
          notizen?: string | null
          updated_at?: string
          verletzungsart?: string | null
          vorname?: string | null
        }
        Update: {
          created_at?: string
          fall_id?: string | null
          geburtsdatum?: string | null
          id?: string
          ist_fahrzeuginsasse?: boolean
          lead_id?: string | null
          nachname?: string | null
          notizen?: string | null
          updated_at?: string
          verletzungsart?: string | null
          vorname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      pflichtdokumente: {
        Row: {
          angefordert_am: string | null
          angefordert_von_rolle: string | null
          angefordert_von_user_id: string | null
          begruendung: string | null
          created_at: string | null
          dokument_typ: string
          dokument_url: string | null
          fall_id: string | null
          frist: string | null
          gueltig_bis: string | null
          hochgeladen_am: string | null
          id: string
          person_id: string | null
          pflicht: boolean | null
          quelle: string | null
          sort_order: number
          spaeter_nachreichen_markiert_am: string | null
          status: string | null
          sv_id: string | null
        }
        Insert: {
          angefordert_am?: string | null
          angefordert_von_rolle?: string | null
          angefordert_von_user_id?: string | null
          begruendung?: string | null
          created_at?: string | null
          dokument_typ: string
          dokument_url?: string | null
          fall_id?: string | null
          frist?: string | null
          gueltig_bis?: string | null
          hochgeladen_am?: string | null
          id?: string
          person_id?: string | null
          pflicht?: boolean | null
          quelle?: string | null
          sort_order?: number
          spaeter_nachreichen_markiert_am?: string | null
          status?: string | null
          sv_id?: string | null
        }
        Update: {
          angefordert_am?: string | null
          angefordert_von_rolle?: string | null
          angefordert_von_user_id?: string | null
          begruendung?: string | null
          created_at?: string | null
          dokument_typ?: string
          dokument_url?: string | null
          fall_id?: string | null
          frist?: string | null
          gueltig_bis?: string | null
          hochgeladen_am?: string | null
          id?: string
          person_id?: string | null
          pflicht?: boolean | null
          quelle?: string | null
          sort_order?: number
          spaeter_nachreichen_markiert_am?: string | null
          status?: string | null
          sv_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pflichtdokumente_angefordert_von_user_id_fkey"
            columns: ["angefordert_von_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "personenschaden_personen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      plz_geo: {
        Row: {
          lat: number
          lng: number
          plz: string
        }
        Insert: {
          lat: number
          lng: number
          plz: string
        }
        Update: {
          lat?: number
          lng?: number
          plz?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adresse: string | null
          aircall_email: string | null
          aircall_user_id: string | null
          aktiv: boolean | null
          anrede: string | null
          anzeigename: string | null
          audio_settings: Json | null
          auth_provider: string | null
          avatar_url: string | null
          created_at: string | null
          eingestellt_am: string | null
          email: string
          firma: string | null
          force_password_change: boolean | null
          gehalt_brutto: number | null
          gehaltsstufe: string | null
          google_access_token: string | null
          google_connected_at: string | null
          google_email: string | null
          google_refresh_token: string | null
          google_token_expires_at: string | null
          id: string
          kapazitaet_max: number | null
          kategorie: string | null
          nachname: string | null
          onboarding_completed_at: string | null
          ort: string | null
          plz: string | null
          position: string | null
          profilbeschreibung: string | null
          rolle: Database["public"]["Enums"]["user_role"]
          telefon: string | null
          titel: string | null
          twilio_nummer_provisioned_am: string | null
          twilio_phone_sid: string | null
          twilio_whatsapp_nummer: string | null
          twofa_aktiviert: boolean
          twofa_email_aktiviert: boolean
          twofa_email_verifiziert_am: string | null
          twofa_telefon: string | null
          twofa_telefon_verifiziert_am: string | null
          updated_at: string | null
          vorname: string | null
          working_hours: Json | null
        }
        Insert: {
          adresse?: string | null
          aircall_email?: string | null
          aircall_user_id?: string | null
          aktiv?: boolean | null
          anrede?: string | null
          anzeigename?: string | null
          audio_settings?: Json | null
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string | null
          eingestellt_am?: string | null
          email: string
          firma?: string | null
          force_password_change?: boolean | null
          gehalt_brutto?: number | null
          gehaltsstufe?: string | null
          google_access_token?: string | null
          google_connected_at?: string | null
          google_email?: string | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          id: string
          kapazitaet_max?: number | null
          kategorie?: string | null
          nachname?: string | null
          onboarding_completed_at?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          profilbeschreibung?: string | null
          rolle?: Database["public"]["Enums"]["user_role"]
          telefon?: string | null
          titel?: string | null
          twilio_nummer_provisioned_am?: string | null
          twilio_phone_sid?: string | null
          twilio_whatsapp_nummer?: string | null
          twofa_aktiviert?: boolean
          twofa_email_aktiviert?: boolean
          twofa_email_verifiziert_am?: string | null
          twofa_telefon?: string | null
          twofa_telefon_verifiziert_am?: string | null
          updated_at?: string | null
          vorname?: string | null
          working_hours?: Json | null
        }
        Update: {
          adresse?: string | null
          aircall_email?: string | null
          aircall_user_id?: string | null
          aktiv?: boolean | null
          anrede?: string | null
          anzeigename?: string | null
          audio_settings?: Json | null
          auth_provider?: string | null
          avatar_url?: string | null
          created_at?: string | null
          eingestellt_am?: string | null
          email?: string
          firma?: string | null
          force_password_change?: boolean | null
          gehalt_brutto?: number | null
          gehaltsstufe?: string | null
          google_access_token?: string | null
          google_connected_at?: string | null
          google_email?: string | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          id?: string
          kapazitaet_max?: number | null
          kategorie?: string | null
          nachname?: string | null
          onboarding_completed_at?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          profilbeschreibung?: string | null
          rolle?: Database["public"]["Enums"]["user_role"]
          telefon?: string | null
          titel?: string | null
          twilio_nummer_provisioned_am?: string | null
          twilio_phone_sid?: string | null
          twilio_whatsapp_nummer?: string | null
          twofa_aktiviert?: boolean
          twofa_email_aktiviert?: boolean
          twofa_email_verifiziert_am?: string | null
          twofa_telefon?: string | null
          twofa_telefon_verifiziert_am?: string | null
          updated_at?: string | null
          vorname?: string | null
          working_hours?: Json | null
        }
        Relationships: []
      }
      promo_clicks: {
        Row: {
          clicked_at: string
          id: string
          ip_hash: string | null
          promotion_code_id: string
          referer: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          ip_hash?: string | null
          promotion_code_id: string
          referer?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          ip_hash?: string | null
          promotion_code_id?: string
          referer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_clicks_promotion_code_id_fkey"
            columns: ["promotion_code_id"]
            isOneToOne: false
            referencedRelation: "promotion_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_codes: {
        Row: {
          aktiv: boolean
          code: string
          erstellt_am: string
          id: string
          makler_id: string
        }
        Insert: {
          aktiv?: boolean
          code: string
          erstellt_am?: string
          id?: string
          makler_id: string
        }
        Update: {
          aktiv?: boolean
          code?: string
          erstellt_am?: string
          id?: string
          makler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_codes_makler_id_fkey"
            columns: ["makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
        ]
      }
      provisionen_maik: {
        Row: {
          basis_provision: number
          cpl_actual: number | null
          created_at: string | null
          id: string
          lead_id: string
          monat: string
          netto_provision: number | null
          paid_at: string | null
          reversed_grund: string | null
          source_channel: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          basis_provision?: number
          cpl_actual?: number | null
          created_at?: string | null
          id?: string
          lead_id: string
          monat: string
          netto_provision?: number | null
          paid_at?: string | null
          reversed_grund?: string | null
          source_channel?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          basis_provision?: number
          cpl_actual?: number | null
          created_at?: string | null
          id?: string
          lead_id?: string
          monat?: string
          netto_provision?: number | null
          paid_at?: string | null
          reversed_grund?: string | null
          source_channel?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provisionen_maik_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          expired_at: string | null
          id: string
          last_used_at: string | null
          p256dh_key: string
          platform: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          expired_at?: string | null
          id?: string
          last_used_at?: string | null
          p256dh_key: string
          platform?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          expired_at?: string | null
          id?: string
          last_used_at?: string | null
          p256dh_key?: string
          platform?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      qc_checkliste: {
        Row: {
          created_at: string | null
          fall_id: string | null
          fin_17_zeichen: boolean | null
          fotos_ausreichend: boolean | null
          geprueft_am: string | null
          geprueft_von: string | null
          gutachten_vollstaendig: boolean | null
          gutachten_vorhanden: boolean | null
          id: string
          kommentar: string | null
          kundendaten_vollstaendig: boolean | null
          sa_vorhanden: boolean | null
          schadenspositionen_erfasst: boolean | null
          status: string | null
          vollmacht_vorhanden: boolean | null
          vorschaeden_beruecksichtigt: boolean | null
        }
        Insert: {
          created_at?: string | null
          fall_id?: string | null
          fin_17_zeichen?: boolean | null
          fotos_ausreichend?: boolean | null
          geprueft_am?: string | null
          geprueft_von?: string | null
          gutachten_vollstaendig?: boolean | null
          gutachten_vorhanden?: boolean | null
          id?: string
          kommentar?: string | null
          kundendaten_vollstaendig?: boolean | null
          sa_vorhanden?: boolean | null
          schadenspositionen_erfasst?: boolean | null
          status?: string | null
          vollmacht_vorhanden?: boolean | null
          vorschaeden_beruecksichtigt?: boolean | null
        }
        Update: {
          created_at?: string | null
          fall_id?: string | null
          fin_17_zeichen?: boolean | null
          fotos_ausreichend?: boolean | null
          geprueft_am?: string | null
          geprueft_von?: string | null
          gutachten_vollstaendig?: boolean | null
          gutachten_vorhanden?: boolean | null
          id?: string
          kommentar?: string | null
          kundendaten_vollstaendig?: boolean | null
          sa_vorhanden?: boolean | null
          schadenspositionen_erfasst?: boolean | null
          status?: string | null
          vollmacht_vorhanden?: boolean | null
          vorschaeden_beruecksichtigt?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_geprueft_von_fkey"
            columns: ["geprueft_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rechnungs_konfiguration: {
        Row: {
          created_at: string | null
          firmenname: string
          geschaeftsfuehrer: string | null
          gueltig_ab: string
          gueltig_bis: string | null
          hrb: string | null
          id: string
          ort: string
          plz: string
          rechnungssteller: string
          steuernummer: string | null
          strasse: string
          ust_id: string | null
          version: number
          zahlungsempfaenger_bank: string
          zahlungsempfaenger_bic: string
          zahlungsempfaenger_hinweis: string | null
          zahlungsempfaenger_iban: string
          zahlungsempfaenger_name: string
        }
        Insert: {
          created_at?: string | null
          firmenname: string
          geschaeftsfuehrer?: string | null
          gueltig_ab: string
          gueltig_bis?: string | null
          hrb?: string | null
          id?: string
          ort: string
          plz: string
          rechnungssteller: string
          steuernummer?: string | null
          strasse: string
          ust_id?: string | null
          version?: number
          zahlungsempfaenger_bank: string
          zahlungsempfaenger_bic: string
          zahlungsempfaenger_hinweis?: string | null
          zahlungsempfaenger_iban: string
          zahlungsempfaenger_name: string
        }
        Update: {
          created_at?: string | null
          firmenname?: string
          geschaeftsfuehrer?: string | null
          gueltig_ab?: string
          gueltig_bis?: string | null
          hrb?: string | null
          id?: string
          ort?: string
          plz?: string
          rechnungssteller?: string
          steuernummer?: string | null
          strasse?: string
          ust_id?: string | null
          version?: number
          zahlungsempfaenger_bank?: string
          zahlungsempfaenger_bic?: string
          zahlungsempfaenger_hinweis?: string | null
          zahlungsempfaenger_iban?: string
          zahlungsempfaenger_name?: string
        }
        Relationships: []
      }
      rechnungs_nr_counter: {
        Row: {
          jahr: number
          laufende_nr: number
          serie: string
          updated_at: string
        }
        Insert: {
          jahr: number
          laufende_nr?: number
          serie: string
          updated_at?: string
        }
        Update: {
          jahr?: number
          laufende_nr?: number
          serie?: string
          updated_at?: string
        }
        Relationships: []
      }
      regulierungs_klassifizierung: {
        Row: {
          begruendung_versicherer: string | null
          erfasst_am: string
          erfasst_von: string
          fall_id: string
          geltend_gemacht_netto: number | null
          id: string
          kuerzung_betrag_netto: number | null
          kuerzungsgrund: string | null
          notiz_intern: string | null
          reguliert_betrag_netto: number | null
          regulierungs_status: string
          updated_am: string
          versicherer: string | null
        }
        Insert: {
          begruendung_versicherer?: string | null
          erfasst_am?: string
          erfasst_von: string
          fall_id: string
          geltend_gemacht_netto?: number | null
          id?: string
          kuerzung_betrag_netto?: number | null
          kuerzungsgrund?: string | null
          notiz_intern?: string | null
          reguliert_betrag_netto?: number | null
          regulierungs_status: string
          updated_am?: string
          versicherer?: string | null
        }
        Update: {
          begruendung_versicherer?: string | null
          erfasst_am?: string
          erfasst_von?: string
          fall_id?: string
          geltend_gemacht_netto?: number | null
          id?: string
          kuerzung_betrag_netto?: number | null
          kuerzungsgrund?: string | null
          notiz_intern?: string | null
          reguliert_betrag_netto?: number | null
          regulierungs_status?: string
          updated_am?: string
          versicherer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      reklamationen: {
        Row: {
          admin_begruendung: string | null
          bearbeitet_am: string | null
          bearbeitet_von: string | null
          begruendung: string
          created_at: string
          eingereicht_am: string
          fall_id: string
          frist_bis: string
          grund: string
          id: string
          nachweis_storage_path: string | null
          status: string
          sv_id: string
        }
        Insert: {
          admin_begruendung?: string | null
          bearbeitet_am?: string | null
          bearbeitet_von?: string | null
          begruendung: string
          created_at?: string
          eingereicht_am?: string
          fall_id: string
          frist_bis: string
          grund: string
          id?: string
          nachweis_storage_path?: string | null
          status?: string
          sv_id: string
        }
        Update: {
          admin_begruendung?: string | null
          bearbeitet_am?: string | null
          bearbeitet_von?: string | null
          begruendung?: string
          created_at?: string
          eingereicht_am?: string
          fall_id?: string
          frist_bis?: string
          grund?: string
          id?: string
          nachweis_storage_path?: string | null
          status?: string
          sv_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_cache: {
        Row: {
          cached_at: string
          fahrtzeit_sek: number
          nach_hash: string
          von_hash: string
        }
        Insert: {
          cached_at?: string
          fahrtzeit_sek: number
          nach_hash: string
          von_hash: string
        }
        Update: {
          cached_at?: string
          fahrtzeit_sek?: number
          nach_hash?: string
          von_hash?: string
        }
        Relationships: []
      }
      sachverstaendige: {
        Row: {
          ablehnungen_30_tage: number
          anzahlung_betrag: number | null
          anzahlung_faellig: number | null
          anzahlung_status: string | null
          brand_accent: string | null
          brand_extracted_at: string | null
          brand_primary: string | null
          brand_secondary: string | null
          brand_theme: Json | null
          community_anonym: boolean
          created_at: string | null
          dat_nummer: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          firmenname: string | null
          gcal_access_token: string | null
          gcal_calendar_id: string | null
          gcal_connected: boolean | null
          gcal_refresh_token: string | null
          gcal_token_expiry: string | null
          gebiet_plz: string[]
          geloescht_am: string | null
          gesperrt_grund: string | null
          gesperrt_seit: string | null
          gesperrt_von_user_id: string | null
          gutachter_typ: string | null
          hrb: string | null
          id: string
          isochrone_polygon: Json | null
          ist_aktiv: boolean | null
          ist_parent_account: boolean | null
          kalender_sync_aktiv: boolean | null
          kalender_sync_letzte: string | null
          kalender_typ: string | null
          live_tracking_enabled: boolean | null
          logo_url: string | null
          notizen: string | null
          offene_faelle: number
          onboarding_anzahlung_betrag: number | null
          onboarding_anzahlung_faellig_am: string | null
          onboarding_status: string
          organisation_id: string | null
          paket: string
          paket_faelle_genutzt: number | null
          paket_faelle_gesamt: number | null
          paket_preis: number | null
          paket_umkreis_km: number | null
          partner_seit: string
          portal_zugang_freigeschaltet: boolean
          profile_id: string | null
          qualifikationen_neu: string[]
          rechtsform: string | null
          rolle_in_organisation: string | null
          sa_vorlage_admin_notiz: string | null
          sa_vorlage_geprueft_am: string | null
          sa_vorlage_geprueft_von_user_id: string | null
          sa_vorlage_hochgeladen_am: string | null
          sa_vorlage_signatur_konfig: Json | null
          sa_vorlage_status: string | null
          sa_vorlage_storage_path: string | null
          schadenarten: string[]
          spezifikationen: string[]
          standort_adresse: string | null
          standort_lat: number | null
          standort_lng: number | null
          standort_place_id: string | null
          standort_plz: string | null
          steuernummer: string | null
          stripe_anzahlung_bezahlt_am: string | null
          stripe_anzahlung_payment_intent_id: string | null
          stripe_customer_id: string | null
          stripe_default_payment_method_id: string | null
          unterschrift_url: string | null
          updated_at: string | null
          urlaub_bis: string | null
          urlaub_von: string | null
          use_custom_branding: boolean
          user_id: string | null
          ust_id: string | null
          verifiziert: boolean
          verifiziert_am: string | null
          verifiziert_von: string | null
          verifizierung_admin_notiz: string | null
          verifizierung_frist_bis: string | null
          verifizierung_frist_ueberschritten_am: string | null
          verifizierung_reminder_7d_gesendet_am: string | null
          verifizierung_status: string | null
          vertrag_pdf_url: string | null
          vertrag_unterschrieben: boolean | null
          vertrag_unterschrieben_am: string | null
          werbebudget_guthaben_netto: number
        }
        Insert: {
          ablehnungen_30_tage?: number
          anzahlung_betrag?: number | null
          anzahlung_faellig?: number | null
          anzahlung_status?: string | null
          brand_accent?: string | null
          brand_extracted_at?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_theme?: Json | null
          community_anonym?: boolean
          created_at?: string | null
          dat_nummer?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          firmenname?: string | null
          gcal_access_token?: string | null
          gcal_calendar_id?: string | null
          gcal_connected?: boolean | null
          gcal_refresh_token?: string | null
          gcal_token_expiry?: string | null
          gebiet_plz?: string[]
          geloescht_am?: string | null
          gesperrt_grund?: string | null
          gesperrt_seit?: string | null
          gesperrt_von_user_id?: string | null
          gutachter_typ?: string | null
          hrb?: string | null
          id?: string
          isochrone_polygon?: Json | null
          ist_aktiv?: boolean | null
          ist_parent_account?: boolean | null
          kalender_sync_aktiv?: boolean | null
          kalender_sync_letzte?: string | null
          kalender_typ?: string | null
          live_tracking_enabled?: boolean | null
          logo_url?: string | null
          notizen?: string | null
          offene_faelle?: number
          onboarding_anzahlung_betrag?: number | null
          onboarding_anzahlung_faellig_am?: string | null
          onboarding_status?: string
          organisation_id?: string | null
          paket?: string
          paket_faelle_genutzt?: number | null
          paket_faelle_gesamt?: number | null
          paket_preis?: number | null
          paket_umkreis_km?: number | null
          partner_seit?: string
          portal_zugang_freigeschaltet?: boolean
          profile_id?: string | null
          qualifikationen_neu?: string[]
          rechtsform?: string | null
          rolle_in_organisation?: string | null
          sa_vorlage_admin_notiz?: string | null
          sa_vorlage_geprueft_am?: string | null
          sa_vorlage_geprueft_von_user_id?: string | null
          sa_vorlage_hochgeladen_am?: string | null
          sa_vorlage_signatur_konfig?: Json | null
          sa_vorlage_status?: string | null
          sa_vorlage_storage_path?: string | null
          schadenarten?: string[]
          spezifikationen?: string[]
          standort_adresse?: string | null
          standort_lat?: number | null
          standort_lng?: number | null
          standort_place_id?: string | null
          standort_plz?: string | null
          steuernummer?: string | null
          stripe_anzahlung_bezahlt_am?: string | null
          stripe_anzahlung_payment_intent_id?: string | null
          stripe_customer_id?: string | null
          stripe_default_payment_method_id?: string | null
          unterschrift_url?: string | null
          updated_at?: string | null
          urlaub_bis?: string | null
          urlaub_von?: string | null
          use_custom_branding?: boolean
          user_id?: string | null
          ust_id?: string | null
          verifiziert?: boolean
          verifiziert_am?: string | null
          verifiziert_von?: string | null
          verifizierung_admin_notiz?: string | null
          verifizierung_frist_bis?: string | null
          verifizierung_frist_ueberschritten_am?: string | null
          verifizierung_reminder_7d_gesendet_am?: string | null
          verifizierung_status?: string | null
          vertrag_pdf_url?: string | null
          vertrag_unterschrieben?: boolean | null
          vertrag_unterschrieben_am?: string | null
          werbebudget_guthaben_netto?: number
        }
        Update: {
          ablehnungen_30_tage?: number
          anzahlung_betrag?: number | null
          anzahlung_faellig?: number | null
          anzahlung_status?: string | null
          brand_accent?: string | null
          brand_extracted_at?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_theme?: Json | null
          community_anonym?: boolean
          created_at?: string | null
          dat_nummer?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          firmenname?: string | null
          gcal_access_token?: string | null
          gcal_calendar_id?: string | null
          gcal_connected?: boolean | null
          gcal_refresh_token?: string | null
          gcal_token_expiry?: string | null
          gebiet_plz?: string[]
          geloescht_am?: string | null
          gesperrt_grund?: string | null
          gesperrt_seit?: string | null
          gesperrt_von_user_id?: string | null
          gutachter_typ?: string | null
          hrb?: string | null
          id?: string
          isochrone_polygon?: Json | null
          ist_aktiv?: boolean | null
          ist_parent_account?: boolean | null
          kalender_sync_aktiv?: boolean | null
          kalender_sync_letzte?: string | null
          kalender_typ?: string | null
          live_tracking_enabled?: boolean | null
          logo_url?: string | null
          notizen?: string | null
          offene_faelle?: number
          onboarding_anzahlung_betrag?: number | null
          onboarding_anzahlung_faellig_am?: string | null
          onboarding_status?: string
          organisation_id?: string | null
          paket?: string
          paket_faelle_genutzt?: number | null
          paket_faelle_gesamt?: number | null
          paket_preis?: number | null
          paket_umkreis_km?: number | null
          partner_seit?: string
          portal_zugang_freigeschaltet?: boolean
          profile_id?: string | null
          qualifikationen_neu?: string[]
          rechtsform?: string | null
          rolle_in_organisation?: string | null
          sa_vorlage_admin_notiz?: string | null
          sa_vorlage_geprueft_am?: string | null
          sa_vorlage_geprueft_von_user_id?: string | null
          sa_vorlage_hochgeladen_am?: string | null
          sa_vorlage_signatur_konfig?: Json | null
          sa_vorlage_status?: string | null
          sa_vorlage_storage_path?: string | null
          schadenarten?: string[]
          spezifikationen?: string[]
          standort_adresse?: string | null
          standort_lat?: number | null
          standort_lng?: number | null
          standort_place_id?: string | null
          standort_plz?: string | null
          steuernummer?: string | null
          stripe_anzahlung_bezahlt_am?: string | null
          stripe_anzahlung_payment_intent_id?: string | null
          stripe_customer_id?: string | null
          stripe_default_payment_method_id?: string | null
          unterschrift_url?: string | null
          updated_at?: string | null
          urlaub_bis?: string | null
          urlaub_von?: string | null
          use_custom_branding?: boolean
          user_id?: string | null
          ust_id?: string | null
          verifiziert?: boolean
          verifiziert_am?: string | null
          verifiziert_von?: string | null
          verifizierung_admin_notiz?: string | null
          verifizierung_frist_bis?: string | null
          verifizierung_frist_ueberschritten_am?: string | null
          verifizierung_reminder_7d_gesendet_am?: string | null
          verifizierung_status?: string | null
          vertrag_pdf_url?: string | null
          vertrag_unterschrieben?: boolean | null
          vertrag_unterschrieben_am?: string | null
          werbebudget_guthaben_netto?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_organisation"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sachverstaendige_gesperrt_von_user_id_fkey"
            columns: ["gesperrt_von_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sachverstaendige_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sachverstaendige_sa_vorlage_geprueft_von_user_id_fkey"
            columns: ["sa_vorlage_geprueft_von_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sachverstaendige_verifiziert_von_fkey"
            columns: ["verifiziert_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schadenspositionen: {
        Row: {
          alter_jahre: number | null
          beschreibung: string | null
          bezeichnung: string
          created_at: string | null
          fall_id: string
          geschaetzter_wert: number | null
          id: string
          kategorie: Database["public"]["Enums"]["schadens_kategorie"]
          reparaturkosten: number | null
          sort_order: number | null
          zustand_vorher: string | null
        }
        Insert: {
          alter_jahre?: number | null
          beschreibung?: string | null
          bezeichnung: string
          created_at?: string | null
          fall_id: string
          geschaetzter_wert?: number | null
          id?: string
          kategorie: Database["public"]["Enums"]["schadens_kategorie"]
          reparaturkosten?: number | null
          sort_order?: number | null
          zustand_vorher?: string | null
        }
        Update: {
          alter_jahre?: number | null
          beschreibung?: string | null
          bezeichnung?: string
          created_at?: string | null
          fall_id?: string
          geschaetzter_wert?: number | null
          id?: string
          kategorie?: Database["public"]["Enums"]["schadens_kategorie"]
          reparaturkosten?: number | null
          sort_order?: number | null
          zustand_vorher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      sla_tracking: {
        Row: {
          blocker_grund: string | null
          blocker_rolle: string | null
          breach_at: string
          completed_at: string | null
          created_at: string | null
          eskalation_task_id: string | null
          fall_id: string
          id: string
          letzte_mahnung_am: string | null
          n_mahnungen: number | null
          phase: string | null
          sla_typ: string
          started_at: string
          status: string
          target_rolle: string | null
        }
        Insert: {
          blocker_grund?: string | null
          blocker_rolle?: string | null
          breach_at: string
          completed_at?: string | null
          created_at?: string | null
          eskalation_task_id?: string | null
          fall_id: string
          id?: string
          letzte_mahnung_am?: string | null
          n_mahnungen?: number | null
          phase?: string | null
          sla_typ: string
          started_at?: string
          status?: string
          target_rolle?: string | null
        }
        Update: {
          blocker_grund?: string | null
          blocker_rolle?: string | null
          breach_at?: string
          completed_at?: string | null
          created_at?: string | null
          eskalation_task_id?: string | null
          fall_id?: string
          id?: string
          letzte_mahnung_am?: string | null
          n_mahnungen?: number | null
          phase?: string | null
          sla_typ?: string
          started_at?: string
          status?: string
          target_rolle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_tracking_eskalation_task_id_fkey"
            columns: ["eskalation_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          empfangen_am: string
          event_type: string
          fehler: string | null
          id: string
          payload: Json
          stripe_event_id: string
          sv_id: string | null
          verarbeitet: boolean
        }
        Insert: {
          empfangen_am?: string
          event_type: string
          fehler?: string | null
          id?: string
          payload: Json
          stripe_event_id: string
          sv_id?: string | null
          verarbeitet?: boolean
        }
        Update: {
          empfangen_am?: string
          event_type?: string
          fehler?: string | null
          id?: string
          payload?: Json
          stripe_event_id?: string
          sv_id?: string | null
          verarbeitet?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      support_rate_limits: {
        Row: {
          count: number
          hour_bucket: string
          user_id: string
        }
        Insert: {
          count?: number
          hour_bucket: string
          user_id: string
        }
        Update: {
          count?: number
          hour_bucket?: string
          user_id?: string
        }
        Relationships: []
      }
      support_ticket_log: {
        Row: {
          action_type: string
          created_at: string
          has_screenshot: boolean
          has_voice: boolean
          id: number
          linear_issue_id: string | null
          page_url: string | null
          turn_count: number
          user_id: string
        }
        Insert: {
          action_type?: string
          created_at?: string
          has_screenshot?: boolean
          has_voice?: boolean
          id?: number
          linear_issue_id?: string | null
          page_url?: string | null
          turn_count?: number
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          has_screenshot?: boolean
          has_voice?: boolean
          id?: number
          linear_issue_id?: string | null
          page_url?: string | null
          turn_count?: number
          user_id?: string
        }
        Relationships: []
      }
      sv_live_position: {
        Row: {
          accuracy_m: number | null
          captured_at: string | null
          distance_to_target_meters: number | null
          heading: number | null
          id: string
          lat: number
          lng: number
          route_polyline: string | null
          speed_kmh: number | null
          sv_id: string
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          captured_at?: string | null
          distance_to_target_meters?: number | null
          heading?: number | null
          id?: string
          lat: number
          lng: number
          route_polyline?: string | null
          speed_kmh?: number | null
          sv_id: string
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string | null
          distance_to_target_meters?: number | null
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          route_polyline?: string | null
          speed_kmh?: number | null
          sv_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_live_position_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_onboarding_rechnungen: {
        Row: {
          brutto_cent: number
          created_at: string
          id: string
          konfig_version: number | null
          kv_pdf_storage_path: string | null
          leistungs_datum: string
          nb_pdf_storage_path: string | null
          netto_cent: number
          organisation_id: string | null
          paket: string | null
          pdf_storage_path: string | null
          rechnungs_datum: string
          rechnungs_konfiguration_id: string | null
          rechnungs_nr: string
          rechnungssteller: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          sv_id: string | null
          typ: string
          ust_cent: number
          ust_satz_pct: number
          versendet_am: string | null
        }
        Insert: {
          brutto_cent: number
          created_at?: string
          id?: string
          konfig_version?: number | null
          kv_pdf_storage_path?: string | null
          leistungs_datum: string
          nb_pdf_storage_path?: string | null
          netto_cent: number
          organisation_id?: string | null
          paket?: string | null
          pdf_storage_path?: string | null
          rechnungs_datum?: string
          rechnungs_konfiguration_id?: string | null
          rechnungs_nr: string
          rechnungssteller?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          sv_id?: string | null
          typ: string
          ust_cent: number
          ust_satz_pct?: number
          versendet_am?: string | null
        }
        Update: {
          brutto_cent?: number
          created_at?: string
          id?: string
          konfig_version?: number | null
          kv_pdf_storage_path?: string | null
          leistungs_datum?: string
          nb_pdf_storage_path?: string | null
          netto_cent?: number
          organisation_id?: string | null
          paket?: string | null
          pdf_storage_path?: string | null
          rechnungs_datum?: string
          rechnungs_konfiguration_id?: string | null
          rechnungs_nr?: string
          rechnungssteller?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          sv_id?: string | null
          typ?: string
          ust_cent?: number
          ust_satz_pct?: number
          versendet_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sv_onboarding_rechnungen_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_onboarding_rechnungen_rechnungs_konfiguration_id_fkey"
            columns: ["rechnungs_konfiguration_id"]
            isOneToOne: false
            referencedRelation: "rechnungs_konfiguration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_onboarding_rechnungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_payment_reminders: {
        Row: {
          id: string
          reminder_typ: string
          sv_id: string
          versendet_am: string
        }
        Insert: {
          id?: string
          reminder_typ: string
          sv_id: string
          versendet_am?: string
        }
        Update: {
          id?: string
          reminder_typ?: string
          sv_id?: string
          versendet_am?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_payment_reminders_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_tages_session: {
        Row: {
          aktueller_termin_id: string | null
          completed_at: string | null
          created_at: string
          datum: string
          id: string
          paused_at: string | null
          reihenfolge_termin_ids: Json
          started_at: string | null
          status: string
          sv_id: string
          updated_at: string
        }
        Insert: {
          aktueller_termin_id?: string | null
          completed_at?: string | null
          created_at?: string
          datum: string
          id?: string
          paused_at?: string | null
          reihenfolge_termin_ids?: Json
          started_at?: string | null
          status?: string
          sv_id: string
          updated_at?: string
        }
        Update: {
          aktueller_termin_id?: string | null
          completed_at?: string | null
          created_at?: string
          datum?: string
          id?: string
          paused_at?: string | null
          reihenfolge_termin_ids?: Json
          started_at?: string | null
          status?: string
          sv_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_tages_session_aktueller_termin_id_fkey"
            columns: ["aktueller_termin_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_tages_session_aktueller_termin_id_fkey"
            columns: ["aktueller_termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "sv_tages_session_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reminders: {
        Row: {
          created_at: string | null
          empfaenger_rolle: string | null
          fehler: string | null
          geplant_fuer: string
          id: string
          kanal: string
          reminder_typ: string
          status: string
          task_id: string
          versendet_am: string | null
          versuche: number
        }
        Insert: {
          created_at?: string | null
          empfaenger_rolle?: string | null
          fehler?: string | null
          geplant_fuer: string
          id?: string
          kanal?: string
          reminder_typ: string
          status?: string
          task_id: string
          versendet_am?: string | null
          versuche?: number
        }
        Update: {
          created_at?: string | null
          empfaenger_rolle?: string | null
          fehler?: string | null
          geplant_fuer?: string
          id?: string
          kanal?: string
          reminder_typ?: string
          status?: string
          task_id?: string
          versendet_am?: string | null
          versuche?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          auto_erstellt: boolean | null
          auto_resolved_am: string | null
          auto_resolved_grund: string | null
          beschreibung: string | null
          created_at: string | null
          deadline: string | null
          empfaenger_rolle: string | null
          empfaenger_user_id: string | null
          entity_id: string | null
          entity_type: string | null
          erinnerung_gesendet: boolean | null
          erledigt_am: string | null
          erstellt_von_id: string | null
          faellig_am: string | null
          fall_id: string | null
          gate_task_id: string | null
          id: string
          lead_id: string | null
          phase: string | null
          prioritaet: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string | null
          task_typ: string | null
          titel: string
          trigger_event: string | null
          typ: string
          updated_at: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          auto_erstellt?: boolean | null
          auto_resolved_am?: string | null
          auto_resolved_grund?: string | null
          beschreibung?: string | null
          created_at?: string | null
          deadline?: string | null
          empfaenger_rolle?: string | null
          empfaenger_user_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          erinnerung_gesendet?: boolean | null
          erledigt_am?: string | null
          erstellt_von_id?: string | null
          faellig_am?: string | null
          fall_id?: string | null
          gate_task_id?: string | null
          id?: string
          lead_id?: string | null
          phase?: string | null
          prioritaet?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          task_code?: string | null
          task_typ?: string | null
          titel: string
          trigger_event?: string | null
          typ: string
          updated_at?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          auto_erstellt?: boolean | null
          auto_resolved_am?: string | null
          auto_resolved_grund?: string | null
          beschreibung?: string | null
          created_at?: string | null
          deadline?: string | null
          empfaenger_rolle?: string | null
          empfaenger_user_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          erinnerung_gesendet?: boolean | null
          erledigt_am?: string | null
          erstellt_von_id?: string | null
          faellig_am?: string | null
          fall_id?: string | null
          gate_task_id?: string | null
          id?: string
          lead_id?: string | null
          phase?: string | null
          prioritaet?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          task_code?: string | null
          task_typ?: string | null
          titel?: string
          trigger_event?: string | null
          typ?: string
          updated_at?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_gate_task_id_fkey"
            columns: ["gate_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_zugewiesen_an_fkey"
            columns: ["zugewiesen_an"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technische_probleme: {
        Row: {
          aktuelle_url: string | null
          antwort: string | null
          beschreibung: string
          browser: string | null
          erstellt_am: string | null
          fall_id: string | null
          id: string
          kategorie: string
          screenshot_url: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          aktuelle_url?: string | null
          antwort?: string | null
          beschreibung: string
          browser?: string | null
          erstellt_am?: string | null
          fall_id?: string | null
          id?: string
          kategorie: string
          screenshot_url?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          aktuelle_url?: string | null
          antwort?: string | null
          beschreibung?: string
          browser?: string | null
          erstellt_am?: string | null
          fall_id?: string | null
          id?: string
          kategorie?: string
          screenshot_url?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technische_probleme_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      termin_reminders: {
        Row: {
          created_at: string
          empfaenger: string
          fehler: string | null
          geplant_fuer: string
          id: string
          reminder_typ: string
          status: string
          termin_id: string
          versendet_am: string | null
          versuche: number
        }
        Insert: {
          created_at?: string
          empfaenger: string
          fehler?: string | null
          geplant_fuer: string
          id?: string
          reminder_typ: string
          status?: string
          termin_id: string
          versendet_am?: string | null
          versuche?: number
        }
        Update: {
          created_at?: string
          empfaenger?: string
          fehler?: string | null
          geplant_fuer?: string
          id?: string
          reminder_typ?: string
          status?: string
          termin_id?: string
          versendet_am?: string | null
          versuche?: number
        }
        Relationships: [
          {
            foreignKeyName: "termin_reminders_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termin_reminders_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
        ]
      }
      termine: {
        Row: {
          betreff: string | null
          betreuer_user_id: string | null
          datum: string
          dauer_minuten: number
          ergebnis_notiz: string | null
          erstellt_am: string | null
          event_sync_status: string | null
          event_synced_at: string | null
          fall_id: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          kunde_user_id: string | null
          meet_link: string | null
          notiz: string | null
          status: string
          typ: string
          verschiebung_grund: string | null
        }
        Insert: {
          betreff?: string | null
          betreuer_user_id?: string | null
          datum: string
          dauer_minuten?: number
          ergebnis_notiz?: string | null
          erstellt_am?: string | null
          event_sync_status?: string | null
          event_synced_at?: string | null
          fall_id?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          kunde_user_id?: string | null
          meet_link?: string | null
          notiz?: string | null
          status?: string
          typ?: string
          verschiebung_grund?: string | null
        }
        Update: {
          betreff?: string | null
          betreuer_user_id?: string | null
          datum?: string
          dauer_minuten?: number
          ergebnis_notiz?: string | null
          erstellt_am?: string | null
          event_sync_status?: string | null
          event_synced_at?: string | null
          fall_id?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          kunde_user_id?: string | null
          meet_link?: string | null
          notiz?: string | null
          status?: string
          typ?: string
          verschiebung_grund?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline: {
        Row: {
          beschreibung: string | null
          created_at: string | null
          erstellt_von: string | null
          fall_id: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          titel: string
          typ: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string | null
          erstellt_von?: string | null
          fall_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          titel: string
          typ: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string | null
          erstellt_von?: string | null
          fall_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          titel?: string
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      versicherungen: {
        Row: {
          adresse: string | null
          aktualisiert_am: string | null
          bafin_nummer: string | null
          erstellt_am: string | null
          hotline_telefon: string | null
          id: string
          ist_aktiv: boolean | null
          logo_url: string | null
          name: string
          plz: string | null
          schaden_email: string | null
          schaden_telefon: string | null
          stadt: string | null
          webseite: string | null
        }
        Insert: {
          adresse?: string | null
          aktualisiert_am?: string | null
          bafin_nummer?: string | null
          erstellt_am?: string | null
          hotline_telefon?: string | null
          id?: string
          ist_aktiv?: boolean | null
          logo_url?: string | null
          name: string
          plz?: string | null
          schaden_email?: string | null
          schaden_telefon?: string | null
          stadt?: string | null
          webseite?: string | null
        }
        Update: {
          adresse?: string | null
          aktualisiert_am?: string | null
          bafin_nummer?: string | null
          erstellt_am?: string | null
          hotline_telefon?: string | null
          id?: string
          ist_aktiv?: boolean | null
          logo_url?: string | null
          name?: string
          plz?: string | null
          schaden_email?: string | null
          schaden_telefon?: string | null
          stadt?: string | null
          webseite?: string | null
        }
        Relationships: []
      }
      vertraege_unterzeichnet: {
        Row: {
          created_at: string
          email_log_id: string | null
          id: string
          organisation_id: string | null
          pdf_generiert_am: string | null
          pdf_storage_path: string | null
          sv_id: string | null
          unterschrift_datum: string
          unterschrift_ip: string | null
          unterschrift_name: string
          unterschrift_user_agent: string | null
          vorlage_id: string
          vorlage_typ: string
          vorlage_version: string
        }
        Insert: {
          created_at?: string
          email_log_id?: string | null
          id?: string
          organisation_id?: string | null
          pdf_generiert_am?: string | null
          pdf_storage_path?: string | null
          sv_id?: string | null
          unterschrift_datum?: string
          unterschrift_ip?: string | null
          unterschrift_name: string
          unterschrift_user_agent?: string | null
          vorlage_id: string
          vorlage_typ: string
          vorlage_version: string
        }
        Update: {
          created_at?: string
          email_log_id?: string | null
          id?: string
          organisation_id?: string | null
          pdf_generiert_am?: string | null
          pdf_storage_path?: string | null
          sv_id?: string | null
          unterschrift_datum?: string
          unterschrift_ip?: string | null
          unterschrift_name?: string
          unterschrift_user_agent?: string | null
          vorlage_id?: string
          vorlage_typ?: string
          vorlage_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "vertraege_unterzeichnet_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vertraege_unterzeichnet_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vertraege_unterzeichnet_vorlage_id_fkey"
            columns: ["vorlage_id"]
            isOneToOne: false
            referencedRelation: "vertragsvorlagen"
            referencedColumns: ["id"]
          },
        ]
      }
      vertragsvorlagen: {
        Row: {
          aktiv: boolean
          created_at: string
          gueltig_ab: string
          id: string
          inhalt_html: string
          pflicht_unterschrift: boolean
          titel: string
          typ: string
          updated_at: string
          version: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          gueltig_ab?: string
          id?: string
          inhalt_html: string
          pflicht_unterschrift?: boolean
          titel: string
          typ: string
          updated_at?: string
          version: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          gueltig_ab?: string
          id?: string
          inhalt_html?: string
          pflicht_unterschrift?: boolean
          titel?: string
          typ?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_id: string
          event_type: string
          fall_id: string | null
          fall_nr: string | null
          id: string
          payload: Json
          processed_at: string | null
          source: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_id: string
          event_type: string
          fall_id?: string | null
          fall_nr?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          source?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string
          event_type?: string
          fall_id?: string | null
          fall_nr?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          source?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbound_messages: {
        Row: {
          body: string | null
          created_at: string | null
          from_phone: string
          id: string
          intent: string | null
          matched_fall_id: string | null
          matched_lead_id: string | null
          matched_termin_id: string | null
          media_urls: Json | null
          num_media: number | null
          processed: boolean | null
          processed_at: string | null
          raw_payload: Json | null
          to_phone: string
          twilio_message_sid: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          from_phone: string
          id?: string
          intent?: string | null
          matched_fall_id?: string | null
          matched_lead_id?: string | null
          matched_termin_id?: string | null
          media_urls?: Json | null
          num_media?: number | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
          to_phone: string
          twilio_message_sid: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          from_phone?: string
          id?: string
          intent?: string | null
          matched_fall_id?: string | null
          matched_lead_id?: string | null
          matched_termin_id?: string | null
          media_urls?: Json | null
          num_media?: number | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
          to_phone?: string
          twilio_message_sid?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_termin_id_fkey"
            columns: ["matched_termin_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_termin_id_fkey"
            columns: ["matched_termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
        ]
      }
      zahlungseingaenge: {
        Row: {
          erfasst_von: string | null
          erstellt_am: string | null
          fall_id: string
          gesamtbetrag: number
          id: string
          referenz: string | null
          zahlungsdatum: string
        }
        Insert: {
          erfasst_von?: string | null
          erstellt_am?: string | null
          fall_id: string
          gesamtbetrag: number
          id?: string
          referenz?: string | null
          zahlungsdatum: string
        }
        Update: {
          erfasst_von?: string | null
          erstellt_am?: string | null
          fall_id?: string
          gesamtbetrag?: number
          id?: string
          referenz?: string | null
          zahlungsdatum?: string
        }
        Relationships: [
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      zahlungspositionen: {
        Row: {
          erstellt_am: string | null
          fall_id: string
          gefordert: number
          gezahlt: number | null
          id: string
          notiz: string | null
          position: string
          zahlung_id: string
        }
        Insert: {
          erstellt_am?: string | null
          fall_id: string
          gefordert?: number
          gezahlt?: number | null
          id?: string
          notiz?: string | null
          position: string
          zahlung_id: string
        }
        Update: {
          erstellt_am?: string | null
          fall_id?: string
          gefordert?: number
          gezahlt?: number | null
          id?: string
          notiz?: string | null
          position?: string
          zahlung_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_zahlung_id_fkey"
            columns: ["zahlung_id"]
            isOneToOne: false
            referencedRelation: "zahlungseingaenge"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      faelle_kunde_view: {
        Row: {
          abgeschlossen_am: string | null
          aktuelle_phase: string | null
          auszahlung_kunde_betrag: number | null
          auszahlung_kunde_eingegangen_am: string | null
          auszahlung_zahlungsweg: string | null
          besichtigungsort_adresse: string | null
          eskalation_tag_14_ergebnis: string | null
          eskalation_tag_14_ergebnis_am: string | null
          eskalation_tag_21_ergebnis: string | null
          eskalation_tag_21_ergebnis_am: string | null
          eskalation_tag_28_ergebnis: string | null
          eskalation_tag_28_ergebnis_am: string | null
          fahrzeug_baujahr: number | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fall_nummer: string | null
          id: string | null
          kennzeichen: string | null
          kunde_id: string | null
          nachbesichtigung_kunde_termin_eingereicht_am: string | null
          nachbesichtigung_kunde_termin_vorschlaege: Json | null
          nachbesichtigung_status: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht: boolean | null
          nachbesichtigung_termin_datum: string | null
          schadens_adresse: string | null
          schadens_beschreibung: string | null
          schadens_datum: string | null
          schadens_ort: string | null
          schadens_plz: string | null
          status: Database["public"]["Enums"]["fall_status"] | null
          sv_id: string | null
          vs_quote_akzeptiert_am: string | null
          vs_quote_betrag_ausgezahlt: number | null
          vs_quote_grund: string | null
          vs_quote_prozent: number | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
        }
        Insert: {
          abgeschlossen_am?: string | null
          aktuelle_phase?: string | null
          auszahlung_kunde_betrag?: number | null
          auszahlung_kunde_eingegangen_am?: string | null
          auszahlung_zahlungsweg?: string | null
          besichtigungsort_adresse?: string | null
          eskalation_tag_14_ergebnis?: string | null
          eskalation_tag_14_ergebnis_am?: string | null
          eskalation_tag_21_ergebnis?: string | null
          eskalation_tag_21_ergebnis_am?: string | null
          eskalation_tag_28_ergebnis?: string | null
          eskalation_tag_28_ergebnis_am?: string | null
          fahrzeug_baujahr?: number | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fall_nummer?: string | null
          id?: string | null
          kennzeichen?: string | null
          kunde_id?: string | null
          nachbesichtigung_kunde_termin_eingereicht_am?: string | null
          nachbesichtigung_kunde_termin_vorschlaege?: Json | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_termin_datum?: string | null
          schadens_adresse?: string | null
          schadens_beschreibung?: string | null
          schadens_datum?: string | null
          schadens_ort?: string | null
          schadens_plz?: string | null
          status?: Database["public"]["Enums"]["fall_status"] | null
          sv_id?: string | null
          vs_quote_akzeptiert_am?: string | null
          vs_quote_betrag_ausgezahlt?: number | null
          vs_quote_grund?: string | null
          vs_quote_prozent?: number | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
        }
        Update: {
          abgeschlossen_am?: string | null
          aktuelle_phase?: string | null
          auszahlung_kunde_betrag?: number | null
          auszahlung_kunde_eingegangen_am?: string | null
          auszahlung_zahlungsweg?: string | null
          besichtigungsort_adresse?: string | null
          eskalation_tag_14_ergebnis?: string | null
          eskalation_tag_14_ergebnis_am?: string | null
          eskalation_tag_21_ergebnis?: string | null
          eskalation_tag_21_ergebnis_am?: string | null
          eskalation_tag_28_ergebnis?: string | null
          eskalation_tag_28_ergebnis_am?: string | null
          fahrzeug_baujahr?: number | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fall_nummer?: string | null
          id?: string | null
          kennzeichen?: string | null
          kunde_id?: string | null
          nachbesichtigung_kunde_termin_eingereicht_am?: string | null
          nachbesichtigung_kunde_termin_vorschlaege?: Json | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_termin_datum?: string | null
          schadens_adresse?: string | null
          schadens_beschreibung?: string | null
          schadens_datum?: string | null
          schadens_ort?: string | null
          schadens_plz?: string | null
          status?: Database["public"]["Enums"]["fall_status"] | null
          sv_id?: string | null
          vs_quote_akzeptiert_am?: string | null
          vs_quote_betrag_ausgezahlt?: number | null
          vs_quote_grund?: string | null
          vs_quote_prozent?: number | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faelle_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      faelle_sv_view: {
        Row: {
          aktuelle_phase: string | null
          auszahlung_gutachter_eingegangen_am: string | null
          besichtigungsort_adresse: string | null
          eskalation_tag_14_ergebnis: string | null
          eskalation_tag_14_ergebnis_am: string | null
          eskalation_tag_21_ergebnis: string | null
          eskalation_tag_21_ergebnis_am: string | null
          eskalation_tag_28_ergebnis: string | null
          eskalation_tag_28_ergebnis_am: string | null
          fahrzeug_baujahr: number | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fall_nummer: string | null
          gutachter_honorar: number | null
          id: string | null
          kennzeichen: string | null
          kuerzungs_betrag: number | null
          kunde_id: string | null
          nachbesichtigung_status: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am: string | null
          nachbesichtigung_termin_datum: string | null
          schadens_adresse: string | null
          schadens_beschreibung: string | null
          schadens_datum: string | null
          schadens_ort: string | null
          schadens_plz: string | null
          status: Database["public"]["Enums"]["fall_status"] | null
          sv_id: string | null
          technische_stellungnahme_beauftragt_am: string | null
          technische_stellungnahme_freigabe_am: string | null
          technische_stellungnahme_hochgeladen_am: string | null
          technische_stellungnahme_status: string | null
          vs_kuerzung_grund: string | null
          vs_kuerzungs_typ: string | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
        }
        Insert: {
          aktuelle_phase?: string | null
          auszahlung_gutachter_eingegangen_am?: string | null
          besichtigungsort_adresse?: string | null
          eskalation_tag_14_ergebnis?: string | null
          eskalation_tag_14_ergebnis_am?: string | null
          eskalation_tag_21_ergebnis?: string | null
          eskalation_tag_21_ergebnis_am?: string | null
          eskalation_tag_28_ergebnis?: string | null
          eskalation_tag_28_ergebnis_am?: string | null
          fahrzeug_baujahr?: number | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fall_nummer?: string | null
          gutachter_honorar?: number | null
          id?: string | null
          kennzeichen?: string | null
          kuerzungs_betrag?: number | null
          kunde_id?: string | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am?: string | null
          nachbesichtigung_termin_datum?: string | null
          schadens_adresse?: string | null
          schadens_beschreibung?: string | null
          schadens_datum?: string | null
          schadens_ort?: string | null
          schadens_plz?: string | null
          status?: Database["public"]["Enums"]["fall_status"] | null
          sv_id?: string | null
          technische_stellungnahme_beauftragt_am?: string | null
          technische_stellungnahme_freigabe_am?: string | null
          technische_stellungnahme_hochgeladen_am?: string | null
          technische_stellungnahme_status?: string | null
          vs_kuerzung_grund?: string | null
          vs_kuerzungs_typ?: string | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
        }
        Update: {
          aktuelle_phase?: string | null
          auszahlung_gutachter_eingegangen_am?: string | null
          besichtigungsort_adresse?: string | null
          eskalation_tag_14_ergebnis?: string | null
          eskalation_tag_14_ergebnis_am?: string | null
          eskalation_tag_21_ergebnis?: string | null
          eskalation_tag_21_ergebnis_am?: string | null
          eskalation_tag_28_ergebnis?: string | null
          eskalation_tag_28_ergebnis_am?: string | null
          fahrzeug_baujahr?: number | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fall_nummer?: string | null
          gutachter_honorar?: number | null
          id?: string | null
          kennzeichen?: string | null
          kuerzungs_betrag?: number | null
          kunde_id?: string | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am?: string | null
          nachbesichtigung_termin_datum?: string | null
          schadens_adresse?: string | null
          schadens_beschreibung?: string | null
          schadens_datum?: string | null
          schadens_ort?: string | null
          schadens_plz?: string | null
          status?: Database["public"]["Enums"]["fall_status"] | null
          sv_id?: string | null
          technische_stellungnahme_beauftragt_am?: string | null
          technische_stellungnahme_freigabe_am?: string | null
          technische_stellungnahme_hochgeladen_am?: string | null
          technische_stellungnahme_status?: string | null
          vs_kuerzung_grund?: string | null
          vs_kuerzungs_typ?: string | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faelle_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
      v_faelle_mit_aktuellem_termin: {
        Row: {
          abgeschlossen_am: string | null
          abrechnung_id: string | null
          abrechnungsart_besprochen: string | null
          abrechnungsart_besprochen_am: string | null
          abrechnungsart_notiz: string | null
          abtretung_pdf: string | null
          abtretung_signiert_am: string | null
          aktuelle_phase: string | null
          aktueller_termin_end: string | null
          aktueller_termin_final_verbindlich_ab: string | null
          aktueller_termin_id: string | null
          aktueller_termin_kanal: string | null
          aktueller_termin_start: string | null
          aktueller_termin_status: string | null
          aktueller_termin_sv_id: string | null
          aktueller_termin_typ: string | null
          anschlussschreiben_am: string | null
          anschlussschreiben_ocr_am: string | null
          anschlussschreiben_sendedatum: string | null
          anschlussschreiben_unterschrift: boolean | null
          anschlussschreiben_url: string | null
          as_frist: string | null
          as_geforderte_summe: number | null
          as_salesforce_id: string | null
          as_vs_reaktion_text: string | null
          as_zuletzt_synced_am: string | null
          bank_name: string | null
          bankdaten_hinterlegt_am: string | null
          besichtigungsort_adresse: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_place_id: string | null
          betreuungspaket: Database["public"]["Enums"]["betreuungspaket"] | null
          bevorzugter_kanal: string | null
          bic: string | null
          cardentity_abfrage_am: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          created_at: string | null
          datenschutz_akzeptiert: boolean | null
          datenschutz_akzeptiert_am: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          deaktiviert_notiz: string | null
          dokumente_reminder_whatsapp_letzte_sendung: string | null
          dokumente_vollstaendig_am_phase: string | null
          dokumente_vollstaendig_fuer_phase: string | null
          erstzulassung: string | null
          eskalation_tag_14_am: string | null
          eskalation_tag_21_am: string | null
          eskalation_tag_28_am: string | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_typ: string | null
          fall_nummer: string | null
          filmcheck_am: string | null
          filmcheck_notizen: string | null
          filmcheck_ok: boolean | null
          fin_extrahiert_am: string | null
          fin_quelle: string | null
          fin_vin: string | null
          finanzierung_leasing: string | null
          finanzierungsgeber_adresse: string | null
          finanzierungsgeber_name: string | null
          finanzierungsgeber_vertragsnr: string | null
          firma_name: string | null
          gcal_event_id: string | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_schadennummer: string | null
          gegner_versicherung: string | null
          gegner_versicherung_anfrage_datum: string | null
          gegner_versicherung_id: string | null
          gegner_versicherungsnummer: string | null
          geschaetzte_fahrdistanz_km: number | null
          geschaetzte_fahrzeit_min: number | null
          geschlossen_grund: string | null
          gewerbe_flag: boolean | null
          google_review_gesendet: boolean | null
          gutachten_betrag: number | null
          gutachten_eingegangen_am: string | null
          gutachten_hochgeladen_am: string | null
          gutachten_nummer: string | null
          gutachten_positionen: Json | null
          gutachten_stundensatz: number | null
          gutachten_vorhanden: boolean | null
          gutachter_gegenvorschlag_datum: string | null
          gutachter_gegenvorschlag_grund: string | null
          gutachter_honorar: number | null
          gutachter_termin_bestaetigt: boolean | null
          gutachter_termin_status: string | null
          guthaben_verrechnet_netto: number | null
          halter_email: string | null
          halter_geburtsdatum: string | null
          halter_nachname: string | null
          halter_name: string | null
          halter_plz: string | null
          halter_stadt: string | null
          halter_strasse: string | null
          halter_telefon: string | null
          halter_ungleich_fahrer_flag: boolean | null
          halter_vorname: string | null
          hat_vorschaeden: boolean | null
          iban: string | null
          id: string | null
          interne_notizen: string | null
          ist_aktiv: boolean | null
          ist_fahrzeughalter: boolean | null
          kanzlei_abrechnung_id: string | null
          kanzlei_ansprechpartner_email: string | null
          kanzlei_ansprechpartner_name: string | null
          kanzlei_ansprechpartner_position: string | null
          kanzlei_ansprechpartner_telefon: string | null
          kanzlei_honorar: number | null
          kanzlei_id: string | null
          kanzlei_provision_ausgezahlt_am: string | null
          kanzlei_provision_status: string | null
          kanzlei_uebergeben_am: string | null
          kennzeichen: string | null
          ki_geschaetzte_kosten_max: number | null
          ki_geschaetzte_kosten_min: number | null
          ki_kalkulation: Json | null
          ki_kalkulation_am: string | null
          kilometerstand: number | null
          kontoinhaber: string | null
          konvertiert_am: string | null
          konvertiert_von_lead: string | null
          kuerzungs_betrag: number | null
          kunde_id: string | null
          kunden_konstellation: string | null
          kundenbetreuer_fallback_flag: boolean | null
          kundenbetreuer_id: string | null
          kundenbetreuer_zugewiesen_am: string | null
          lead_id: string | null
          lead_preis_berechnet_am: string | null
          lead_preis_netto: number | null
          lead_preis_typ: string | null
          leadbearbeiter_id: string | null
          leasinggeber_informiert: boolean | null
          leasinggeber_name: string | null
          lexdrive_case_id: string | null
          lexdrive_ocr_data: Json | null
          lexdrive_ocr_received_at: string | null
          losfahren_erinnerung_gesendet: boolean | null
          makler_id: string | null
          mandatsnummer: string | null
          marketing_provision: number | null
          marketing_provision_status: string | null
          marketing_quelle: string | null
          mietwagen_flag: boolean | null
          mietwagen_kanzlei_informiert: boolean | null
          mietwagen_kanzlei_informiert_am: string | null
          nachbesichtigung_angefordert_am: string | null
          nachbesichtigung_ergebnis: string | null
          nachbesichtigung_konfrontation: boolean | null
          nachbesichtigung_status: string | null
          nachbesichtigung_termin_datum: string | null
          no_show_count: number | null
          no_show_gemeldet_am: string | null
          notizen: string | null
          nutzungsausfall: boolean | null
          nutzungsausfall_gesamt: number | null
          nutzungsausfall_tage: number | null
          nutzungsausfall_tagessatz: number | null
          ocr_extrahiert_am: string | null
          ocr_rohdaten: Json | null
          onboarding_complete: boolean | null
          organisation_id: string | null
          personenschaden_flag: boolean | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          polizei_vor_ort: boolean | null
          prioritaet: string | null
          regulierung_am: string | null
          regulierung_angekuendigt_am: string | null
          regulierung_betrag: number | null
          regulierungsweise: string | null
          reparaturdauer_tage: number | null
          reparaturkosten: number | null
          restwert: number | null
          ruege_betrag: number | null
          ruege_counter: number | null
          ruege_erhalten_am: string | null
          ruege_gesendet_am: string | null
          ruege_grund: string | null
          sa_pdf_url: string | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sa_unterschrift_url: string | null
          sachschaden_beschreibung: string | null
          sachschaden_flag: boolean | null
          schadens_adresse: string | null
          schadens_art: string | null
          schadens_beschreibung: string | null
          schadens_datum: string | null
          schadens_entdeckt_am: string | null
          schadens_fall_typ: string | null
          schadens_hergang: string | null
          schadens_hoehe_netto: number | null
          schadens_ort: string | null
          schadens_plz: string | null
          schadens_ursache: string | null
          schlussabrechnung_am: string | null
          service_typ: string | null
          source_channel: string | null
          source_domain: string | null
          spezifikation: string | null
          sprache: string | null
          status: Database["public"]["Enums"]["fall_status"] | null
          status_changed_at: string | null
          storniert_am: string | null
          storno_durch_user_id: string | null
          storno_grund: string | null
          sv_briefing_generated_at: string | null
          sv_briefing_model: string | null
          sv_briefing_struktur: Json | null
          sv_briefing_text: string | null
          sv_briefing_version: number | null
          sv_id: string | null
          sv_nachzahlung_netto: number | null
          sv_notizen_vor_ort: string | null
          sv_termin: string | null
          sv_termin_dokument_reminder_gesendet_am: string | null
          sv_zugewiesen_am: string | null
          szenario: string | null
          technische_stellungnahme_beauftragt_am: string | null
          technische_stellungnahme_freigabe_am: string | null
          technische_stellungnahme_hochgeladen_am: string | null
          technische_stellungnahme_status: string | null
          termin_erinnerung_5min_gesendet: boolean | null
          totalschaden: boolean | null
          unfall_konstellation: string | null
          unfalldatum: string | null
          unfallhergang: string | null
          unfallmitteilung_status: string | null
          unfallort: string | null
          unfallort_kategorie: string | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          ust_id: string | null
          vollmacht_geprueft_am: string | null
          vollmacht_geprueft_von: string | null
          vollmacht_pdf: string | null
          vollmacht_pruefung_begruendung: string | null
          vollmacht_pruefung_status: string | null
          vollmacht_signiert_am: string | null
          vollmacht_status: string | null
          vorschaden_anzahl: number | null
          vorschaden_erkannt: boolean | null
          vorschaden_geprueft: boolean | null
          vorschaden_letzter_datum: string | null
          vorschaden_typ_a_ergebnis: Json | null
          vorschaden_typ_b_bericht: Json | null
          vorschaden_typ_b_pdf_url: string | null
          vorschaeden_beschreibung: string | null
          vorsteuerabzugsberechtigt: boolean | null
          vs_ablehnungsgrund: string | null
          vs_eskalationsstufe: string | null
          vs_frist_bis: string | null
          vs_kuerzung_grund: string | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
          werkstatt_seit_datum: string | null
          wertminderung: number | null
          wiederbeschaffungswert: number | null
          wunschtermin: string | null
          zahlung_betrag: number | null
          zahlung_eingegangen_am: string | null
          zahlung_erwartet_am: string | null
          zahlungsweg: string | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "faelle_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_konvertiert_von_lead_fkey"
            columns: ["konvertiert_von_lead"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_leadbearbeiter_id_fkey"
            columns: ["leadbearbeiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_makler_id_fkey"
            columns: ["makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faelle_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_sv_id_fkey"
            columns: ["aktueller_termin_sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_fall: { Args: { p_fall_id: string }; Returns: boolean }
      count_unread_updates: {
        Args: { p_fall_id: string; p_since: string }
        Returns: number
      }
      delete_fall_komplett: { Args: { p_fall_id: string }; Returns: undefined }
      delete_gutachter_komplett: {
        Args: { p_sv_id: string }
        Returns: undefined
      }
      delete_lead_komplett: { Args: { p_lead_id: string }; Returns: undefined }
      get_sv_id: { Args: never; Returns: string }
      get_user_rolle: { Args: never; Returns: string }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      increment_offene_faelle: {
        Args: { sv_id_param: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_kanzlei: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_sv: { Args: never; Returns: boolean }
      link_lead_data_to_fall: {
        Args: { p_fall_id: string; p_lead_id: string }
        Returns: Json
      }
      mark_expired_leads: { Args: never; Returns: undefined }
      next_rechnungs_nr: {
        Args: { p_jahr: number; p_serie: string }
        Returns: number
      }
      notify_admins: {
        Args: { p_link?: string; p_nachricht?: string; p_titel: string }
        Returns: undefined
      }
    }
    Enums: {
      betreuungspaket: "vollservice" | "sv-only"
      dokument_kategorie:
        | "stammdaten"
        | "unfall"
        | "personenschaden"
        | "fahrzeug"
        | "kosten"
        | "kanzlei"
        | "gutachten"
        | "sonstiges"
        | "gutachter_verifizierung"
      dokument_typ:
        | "foto-schaden"
        | "foto-vorher"
        | "mietvertrag"
        | "uebergabeprotokoll"
        | "gutachten"
        | "abtretung"
        | "vollmacht"
        | "rechnung"
        | "korrespondenz"
        | "buchungsbestaetigung"
        | "sonstiges"
        | "fahrzeugschein"
        | "fuehrerschein"
        | "schadensfotos"
        | "schadensfoto"
        | "gegner-daten"
        | "eigene-versicherung"
        | "polizeibericht"
        | "eigene-versicherungspolice"
        | "leasingvertrag"
        | "finanzierungsvertrag"
        | "gewerbenachweis"
        | "gf-vollmacht"
        | "halter-ausweis"
        | "aerztliches-attest"
        | "mietwagenvertrag"
        | "kunde-nachreichung"
        | "kanzlei-paket"
        | "anschlussschreiben"
        | "regulierungsbescheid"
        | "gutachter-foto"
        | "whatsapp-foto"
        | "sa-unterschrift"
        | "kundendokument"
        | "kanzlei"
        | "unterschrift"
      fall_status:
        | "ersterfassung"
        | "onboarding"
        | "sv-gesucht"
        | "sv-zugewiesen"
        | "sv-termin"
        | "besichtigung"
        | "begutachtung-laeuft"
        | "gutachten-eingegangen"
        | "filmcheck"
        | "qc-pruefung"
        | "kanzlei-uebergeben"
        | "anschlussschreiben"
        | "regulierung"
        | "regulierung-laeuft"
        | "nachbesichtigung-laeuft"
        | "zahlung-eingegangen"
        | "vs-abgelehnt"
        | "abgeschlossen"
        | "storniert"
      lead_status:
        | "neu"
        | "rueckruf"
        | "quali-offen"
        | "flow-gesendet"
        | "umgewandelt"
        | "umgewandelt-sv"
        | "disqualifiziert"
        | "kalt"
      partei_rolle: "geschaedigter" | "schaediger"
      schadens_kategorie:
        | "boden"
        | "wand"
        | "decke"
        | "moebel"
        | "kueche"
        | "bad"
        | "elektro"
        | "sanitaer"
        | "fenster"
        | "tuer"
        | "fassade"
        | "sonstiges"
      schadens_ursache:
        | "wasserschaden"
        | "sachbeschaedigung"
        | "brand"
        | "einbruch"
        | "sturmschaden"
        | "vandalismus"
        | "verschleiss"
        | "sonstiges"
      task_status: "offen" | "in-bearbeitung" | "erledigt" | "blockiert"
      task_typ:
        | "filmcheck"
        | "kanzlei-anschlussschreiben"
        | "kanzlei-nachfrage"
        | "versicherung-kontakt"
        | "kunde-rueckfrage"
        | "sv-termin"
        | "zahlung-pruefen"
        | "sonstiges"
      user_role:
        | "kunde"
        | "sachverstaendiger"
        | "admin"
        | "kanzlei"
        | "leadbearbeiter"
        | "dispatch"
        | "kundenbetreuer"
        | "makler"
      vertrag_typ:
        | "mietvertrag"
        | "airbnb"
        | "gewerbemietvertrag"
        | "nachbarschaft"
        | "dienstvertrag"
        | "sonstiges"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      betreuungspaket: ["vollservice", "sv-only"],
      dokument_kategorie: [
        "stammdaten",
        "unfall",
        "personenschaden",
        "fahrzeug",
        "kosten",
        "kanzlei",
        "gutachten",
        "sonstiges",
        "gutachter_verifizierung",
      ],
      dokument_typ: [
        "foto-schaden",
        "foto-vorher",
        "mietvertrag",
        "uebergabeprotokoll",
        "gutachten",
        "abtretung",
        "vollmacht",
        "rechnung",
        "korrespondenz",
        "buchungsbestaetigung",
        "sonstiges",
        "fahrzeugschein",
        "fuehrerschein",
        "schadensfotos",
        "schadensfoto",
        "gegner-daten",
        "eigene-versicherung",
        "polizeibericht",
        "eigene-versicherungspolice",
        "leasingvertrag",
        "finanzierungsvertrag",
        "gewerbenachweis",
        "gf-vollmacht",
        "halter-ausweis",
        "aerztliches-attest",
        "mietwagenvertrag",
        "kunde-nachreichung",
        "kanzlei-paket",
        "anschlussschreiben",
        "regulierungsbescheid",
        "gutachter-foto",
        "whatsapp-foto",
        "sa-unterschrift",
        "kundendokument",
        "kanzlei",
        "unterschrift",
      ],
      fall_status: [
        "ersterfassung",
        "onboarding",
        "sv-gesucht",
        "sv-zugewiesen",
        "sv-termin",
        "besichtigung",
        "begutachtung-laeuft",
        "gutachten-eingegangen",
        "filmcheck",
        "qc-pruefung",
        "kanzlei-uebergeben",
        "anschlussschreiben",
        "regulierung",
        "regulierung-laeuft",
        "nachbesichtigung-laeuft",
        "zahlung-eingegangen",
        "vs-abgelehnt",
        "abgeschlossen",
        "storniert",
      ],
      lead_status: [
        "neu",
        "rueckruf",
        "quali-offen",
        "flow-gesendet",
        "umgewandelt",
        "umgewandelt-sv",
        "disqualifiziert",
        "kalt",
      ],
      partei_rolle: ["geschaedigter", "schaediger"],
      schadens_kategorie: [
        "boden",
        "wand",
        "decke",
        "moebel",
        "kueche",
        "bad",
        "elektro",
        "sanitaer",
        "fenster",
        "tuer",
        "fassade",
        "sonstiges",
      ],
      schadens_ursache: [
        "wasserschaden",
        "sachbeschaedigung",
        "brand",
        "einbruch",
        "sturmschaden",
        "vandalismus",
        "verschleiss",
        "sonstiges",
      ],
      task_status: ["offen", "in-bearbeitung", "erledigt", "blockiert"],
      task_typ: [
        "filmcheck",
        "kanzlei-anschlussschreiben",
        "kanzlei-nachfrage",
        "versicherung-kontakt",
        "kunde-rueckfrage",
        "sv-termin",
        "zahlung-pruefen",
        "sonstiges",
      ],
      user_role: [
        "kunde",
        "sachverstaendiger",
        "admin",
        "kanzlei",
        "leadbearbeiter",
        "dispatch",
        "kundenbetreuer",
        "makler",
      ],
      vertrag_typ: [
        "mietvertrag",
        "airbnb",
        "gewerbemietvertrag",
        "nachbarschaft",
        "dienstvertrag",
        "sonstiges",
      ],
    },
  },
} as const
