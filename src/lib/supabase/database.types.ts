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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          caldav_event_uid: string | null
          caldav_object_url: string | null
          caldav_synced_at: string | null
          claim_id: string | null
          created_at: string
          end_zeit: string
          erinnerung_min_vorher: number | null
          erstellt_von: string
          fall_id: string | null
          gesehen_am: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          google_event_synced_at: string | null
          id: string
          kanal: string | null
          kunde_id: string | null
          lead_id: string | null
          ms_event_id: string | null
          notizen: string | null
          partner_lead_id: string | null
          start_zeit: string
          status: string
          titel: string
          treffpunkt_adresse: string | null
          treffpunkt_lat: number | null
          treffpunkt_lng: number | null
          typ: string
          updated_at: string
          video_link: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          beschreibung?: string | null
          caldav_event_uid?: string | null
          caldav_object_url?: string | null
          caldav_synced_at?: string | null
          claim_id?: string | null
          created_at?: string
          end_zeit: string
          erinnerung_min_vorher?: number | null
          erstellt_von: string
          fall_id?: string | null
          gesehen_am?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_event_synced_at?: string | null
          id?: string
          kanal?: string | null
          kunde_id?: string | null
          lead_id?: string | null
          ms_event_id?: string | null
          notizen?: string | null
          partner_lead_id?: string | null
          start_zeit: string
          status?: string
          titel: string
          treffpunkt_adresse?: string | null
          treffpunkt_lat?: number | null
          treffpunkt_lng?: number | null
          typ: string
          updated_at?: string
          video_link?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          beschreibung?: string | null
          caldav_event_uid?: string | null
          caldav_object_url?: string | null
          caldav_synced_at?: string | null
          claim_id?: string | null
          created_at?: string
          end_zeit?: string
          erinnerung_min_vorher?: number | null
          erstellt_von?: string
          fall_id?: string | null
          gesehen_am?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_event_synced_at?: string | null
          id?: string
          kanal?: string | null
          kunde_id?: string | null
          lead_id?: string | null
          ms_event_id?: string | null
          notizen?: string | null
          partner_lead_id?: string | null
          start_zeit?: string
          status?: string
          titel?: string
          treffpunkt_adresse?: string | null
          treffpunkt_lat?: number | null
          treffpunkt_lng?: number | null
          typ?: string
          updated_at?: string
          video_link?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "admin_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_termine_partner_lead_id_fkey"
            columns: ["partner_lead_id"]
            isOneToOne: false
            referencedRelation: "partner_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_claim_proposals: {
        Row: {
          ausfuehrung_ergebnis: Json | null
          auto_ausgefuehrt: boolean
          begruendung: string
          claim_id: string
          dedupe_key: string
          entschieden_am: string | null
          entschieden_von: string | null
          erstellt_am: string
          erzeugte_task_id: string | null
          feedback: string | null
          id: string
          modell: string
          payload: Json
          quelle: string
          status: string
          vorschlag_typ: string
          ziel_rolle: string | null
        }
        Insert: {
          ausfuehrung_ergebnis?: Json | null
          auto_ausgefuehrt?: boolean
          begruendung: string
          claim_id: string
          dedupe_key: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          erstellt_am?: string
          erzeugte_task_id?: string | null
          feedback?: string | null
          id?: string
          modell: string
          payload?: Json
          quelle?: string
          status?: string
          vorschlag_typ: string
          ziel_rolle?: string | null
        }
        Update: {
          ausfuehrung_ergebnis?: Json | null
          auto_ausgefuehrt?: boolean
          begruendung?: string
          claim_id?: string
          dedupe_key?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          erstellt_am?: string
          erzeugte_task_id?: string | null
          feedback?: string | null
          id?: string
          modell?: string
          payload?: Json
          quelle?: string
          status?: string
          vorschlag_typ?: string
          ziel_rolle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_claim_proposals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      ai_task_executions: {
        Row: {
          abgeschlossen_am: string | null
          begruendung: string | null
          bestaetigt_von: string | null
          claim_id: string | null
          erstellt_am: string
          fehler: string | null
          gestartet_von: string | null
          id: string
          modell: string
          plan: Json
          status: string
          task_id: string
          typ: string | null
        }
        Insert: {
          abgeschlossen_am?: string | null
          begruendung?: string | null
          bestaetigt_von?: string | null
          claim_id?: string | null
          erstellt_am?: string
          fehler?: string | null
          gestartet_von?: string | null
          id?: string
          modell: string
          plan?: Json
          status?: string
          task_id: string
          typ?: string | null
        }
        Update: {
          abgeschlossen_am?: string | null
          begruendung?: string | null
          bestaetigt_von?: string | null
          claim_id?: string | null
          erstellt_am?: string
          fehler?: string | null
          gestartet_von?: string | null
          id?: string
          modell?: string
          plan?: Json
          status?: string
          task_id?: string
          typ?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_task_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          claim_id: string | null
          created_at: string
          endpoint: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          claim_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          claim_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ai_usage_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      aircall_calls: {
        Row: {
          aircall_id: string
          aircall_user_email: string | null
          aircall_user_id: string | null
          answered_at: string | null
          claim_id: string | null
          comments: string | null
          created_at: string | null
          direction: string
          duration: number | null
          ended_at: string | null
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
          claim_id?: string | null
          comments?: string | null
          created_at?: string | null
          direction: string
          duration?: number | null
          ended_at?: string | null
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
          claim_id?: string | null
          comments?: string | null
          created_at?: string | null
          direction?: string
          duration?: number | null
          ended_at?: string | null
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
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "aircall_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
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
          {
            foreignKeyName: "aircall_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "aircall_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aircall_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
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
      airdrop_invitations: {
        Row: {
          abgelaufen_am: string | null
          claim_id: string
          created_at: string
          expires_at: string
          id: string
          invited_at: string
          invited_by_party_id: string | null
          invited_by_user_id: string | null
          invited_via: string
          ip_address_open: string | null
          konvertiert_zu_voll_am: string | null
          opened_at: string | null
          responded_at: string | null
          resulting_party_id: string | null
          resulting_user_id: string | null
          status: string
          token_hash: string
          token_lookup_prefix: string
          updated_at: string
          user_agent_open: string | null
          withdrawn_at: string | null
          withdrawn_by_user_id: string | null
          withdrawn_grund: string | null
        }
        Insert: {
          abgelaufen_am?: string | null
          claim_id: string
          created_at?: string
          expires_at: string
          id?: string
          invited_at?: string
          invited_by_party_id?: string | null
          invited_by_user_id?: string | null
          invited_via: string
          ip_address_open?: string | null
          konvertiert_zu_voll_am?: string | null
          opened_at?: string | null
          responded_at?: string | null
          resulting_party_id?: string | null
          resulting_user_id?: string | null
          status?: string
          token_hash: string
          token_lookup_prefix: string
          updated_at?: string
          user_agent_open?: string | null
          withdrawn_at?: string | null
          withdrawn_by_user_id?: string | null
          withdrawn_grund?: string | null
        }
        Update: {
          abgelaufen_am?: string | null
          claim_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by_party_id?: string | null
          invited_by_user_id?: string | null
          invited_via?: string
          ip_address_open?: string | null
          konvertiert_zu_voll_am?: string | null
          opened_at?: string | null
          responded_at?: string | null
          resulting_party_id?: string | null
          resulting_user_id?: string | null
          status?: string
          token_hash?: string
          token_lookup_prefix?: string
          updated_at?: string
          user_agent_open?: string | null
          withdrawn_at?: string | null
          withdrawn_by_user_id?: string | null
          withdrawn_grund?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "airdrop_invitations_invited_by_party_id_fkey"
            columns: ["invited_by_party_id"]
            isOneToOne: false
            referencedRelation: "claim_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_invited_by_party_id_fkey"
            columns: ["invited_by_party_id"]
            isOneToOne: false
            referencedRelation: "v_claim_parties_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_resulting_party_id_fkey"
            columns: ["resulting_party_id"]
            isOneToOne: false
            referencedRelation: "claim_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_resulting_party_id_fkey"
            columns: ["resulting_party_id"]
            isOneToOne: false
            referencedRelation: "v_claim_parties_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_resulting_user_id_fkey"
            columns: ["resulting_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_invitations_withdrawn_by_user_id_fkey"
            columns: ["withdrawn_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anfragen: {
        Row: {
          client_ip: unknown
          created_at: string
          disqualifiziert_am: string | null
          disqualifiziert_durch: string | null
          disqualifiziert_grund: string | null
          dsgvo_zustimmung_am: string | null
          id: string
          kontakt_email: string | null
          kontakt_name: string | null
          kontakt_plz_oder_stadt: string | null
          kontakt_telefon: string | null
          konvertier_fehler: string | null
          konvertier_status: string
          konvertiert_am: string | null
          lead_id: string | null
          payload: Json
          quelle: string
          quelle_url: string | null
          quelle_variant: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          client_ip?: unknown
          created_at?: string
          disqualifiziert_am?: string | null
          disqualifiziert_durch?: string | null
          disqualifiziert_grund?: string | null
          dsgvo_zustimmung_am?: string | null
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_plz_oder_stadt?: string | null
          kontakt_telefon?: string | null
          konvertier_fehler?: string | null
          konvertier_status?: string
          konvertiert_am?: string | null
          lead_id?: string | null
          payload?: Json
          quelle: string
          quelle_url?: string | null
          quelle_variant?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          client_ip?: unknown
          created_at?: string
          disqualifiziert_am?: string | null
          disqualifiziert_durch?: string | null
          disqualifiziert_grund?: string | null
          dsgvo_zustimmung_am?: string | null
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_plz_oder_stadt?: string | null
          kontakt_telefon?: string | null
          konvertier_fehler?: string | null
          konvertier_status?: string
          konvertiert_am?: string | null
          lead_id?: string | null
          payload?: Json
          quelle?: string
          quelle_url?: string | null
          quelle_variant?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      anruf_log: {
        Row: {
          created_at: string
          erstellt_von: string | null
          id: string
          lead_id: string
          notiz: string | null
          status: string
          zeitpunkt: string
        }
        Insert: {
          created_at?: string
          erstellt_von?: string | null
          id?: string
          lead_id: string
          notiz?: string | null
          status: string
          zeitpunkt?: string
        }
        Update: {
          created_at?: string
          erstellt_von?: string | null
          id?: string
          lead_id?: string
          notiz?: string | null
          status?: string
          zeitpunkt?: string
        }
        Relationships: [
          {
            foreignKeyName: "anruf_log_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anruf_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anruf_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "anruf_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anruf_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      anspruch_config: {
        Row: {
          created_at: string
          key: string
          wert: number
        }
        Insert: {
          created_at?: string
          key: string
          wert: number
        }
        Update: {
          created_at?: string
          key?: string
          wert?: number
        }
        Relationships: []
      }
      anspruch_schaetzungen: {
        Row: {
          erkanntes_segment: string | null
          erstellt_am: string
          ez_jahr: number | null
          fahrbereit: boolean | null
          foto_pfade: Json
          id: string
          lead_id: string | null
          positionen: Json | null
          schuld: string | null
          schweregrad: string | null
          session_token: string
          totalschaden: Json | null
          vision_result: Json | null
        }
        Insert: {
          erkanntes_segment?: string | null
          erstellt_am?: string
          ez_jahr?: number | null
          fahrbereit?: boolean | null
          foto_pfade?: Json
          id?: string
          lead_id?: string | null
          positionen?: Json | null
          schuld?: string | null
          schweregrad?: string | null
          session_token: string
          totalschaden?: Json | null
          vision_result?: Json | null
        }
        Update: {
          erkanntes_segment?: string | null
          erstellt_am?: string
          ez_jahr?: number | null
          fahrbereit?: boolean | null
          foto_pfade?: Json
          id?: string
          lead_id?: string | null
          positionen?: Json | null
          schuld?: string | null
          schweregrad?: string | null
          session_token?: string
          totalschaden?: Json | null
          vision_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "anspruch_schaetzungen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anspruch_schaetzungen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "anspruch_schaetzungen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anspruch_schaetzungen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      article_comments: {
        Row: {
          article_slug: string
          author_display: string | null
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          parent_id: string | null
          report_count: number
          status: Database["public"]["Enums"]["comment_status"]
        }
        Insert: {
          article_slug: string
          author_display?: string | null
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          parent_id?: string | null
          report_count?: number
          status?: Database["public"]["Enums"]["comment_status"]
        }
        Update: {
          article_slug?: string
          author_display?: string | null
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          parent_id?: string | null
          report_count?: number
          status?: Database["public"]["Enums"]["comment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "article_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "article_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      auftraege: {
        Row: {
          abgeschlossen_am: string | null
          besichtigung_gestartet_am: string | null
          claim_id: string
          erstellt_am: string
          fall_id: string
          filmcheck_am: string | null
          filmcheck_notizen: string | null
          filmcheck_ok: boolean | null
          grundhonorar_brutto: number | null
          grundhonorar_netto: number | null
          gutachten_final_freigegeben: boolean
          gutachten_url: string | null
          id: string
          reihenfolge: number
          status: string
          storniert_am: string | null
          storno_durch_user_id: string | null
          storno_grund: string | null
          sv_briefing_generated_at: string | null
          sv_briefing_model: string | null
          sv_briefing_struktur: Json | null
          sv_briefing_text: string | null
          sv_briefing_version: number
          sv_id: string
          sv_notizen_vor_ort: string | null
          technische_stellungnahme_beauftragt_am: string | null
          technische_stellungnahme_freigabe_am: string | null
          technische_stellungnahme_hochgeladen_am: string | null
          technische_stellungnahme_notiz_sv: string | null
          technische_stellungnahme_status: string | null
          typ: string
          updated_at: string
          vorheriger_auftrag_id: string | null
          zurueckgewiesen_am: string | null
          zurueckweisung_grund: string | null
        }
        Insert: {
          abgeschlossen_am?: string | null
          besichtigung_gestartet_am?: string | null
          claim_id: string
          erstellt_am?: string
          fall_id: string
          filmcheck_am?: string | null
          filmcheck_notizen?: string | null
          filmcheck_ok?: boolean | null
          grundhonorar_brutto?: number | null
          grundhonorar_netto?: number | null
          gutachten_final_freigegeben?: boolean
          gutachten_url?: string | null
          id?: string
          reihenfolge?: number
          status: string
          storniert_am?: string | null
          storno_durch_user_id?: string | null
          storno_grund?: string | null
          sv_briefing_generated_at?: string | null
          sv_briefing_model?: string | null
          sv_briefing_struktur?: Json | null
          sv_briefing_text?: string | null
          sv_briefing_version?: number
          sv_id: string
          sv_notizen_vor_ort?: string | null
          technische_stellungnahme_beauftragt_am?: string | null
          technische_stellungnahme_freigabe_am?: string | null
          technische_stellungnahme_hochgeladen_am?: string | null
          technische_stellungnahme_notiz_sv?: string | null
          technische_stellungnahme_status?: string | null
          typ: string
          updated_at?: string
          vorheriger_auftrag_id?: string | null
          zurueckgewiesen_am?: string | null
          zurueckweisung_grund?: string | null
        }
        Update: {
          abgeschlossen_am?: string | null
          besichtigung_gestartet_am?: string | null
          claim_id?: string
          erstellt_am?: string
          fall_id?: string
          filmcheck_am?: string | null
          filmcheck_notizen?: string | null
          filmcheck_ok?: boolean | null
          grundhonorar_brutto?: number | null
          grundhonorar_netto?: number | null
          gutachten_final_freigegeben?: boolean
          gutachten_url?: string | null
          id?: string
          reihenfolge?: number
          status?: string
          storniert_am?: string | null
          storno_durch_user_id?: string | null
          storno_grund?: string | null
          sv_briefing_generated_at?: string | null
          sv_briefing_model?: string | null
          sv_briefing_struktur?: Json | null
          sv_briefing_text?: string | null
          sv_briefing_version?: number
          sv_id?: string
          sv_notizen_vor_ort?: string | null
          technische_stellungnahme_beauftragt_am?: string | null
          technische_stellungnahme_freigabe_am?: string | null
          technische_stellungnahme_hochgeladen_am?: string | null
          technische_stellungnahme_notiz_sv?: string | null
          technische_stellungnahme_status?: string | null
          typ?: string
          updated_at?: string
          vorheriger_auftrag_id?: string | null
          zurueckgewiesen_am?: string | null
          zurueckweisung_grund?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "auftraege_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auftraege_vorheriger_auftrag_id_fkey"
            columns: ["vorheriger_auftrag_id"]
            isOneToOne: false
            referencedRelation: "auftraege"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_2fa_attempts: {
        Row: {
          failed_count: number
          locked_until: string | null
          updated_at: string
          user_id: string
          window_started_at: string
        }
        Insert: {
          failed_count?: number
          locked_until?: string | null
          updated_at?: string
          user_id: string
          window_started_at?: string
        }
        Update: {
          failed_count?: number
          locked_until?: string | null
          updated_at?: string
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
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
      bkat_tatbestaende: {
        Row: {
          aktualisiert_am: string | null
          bezeichnung: string
          bkat_version: string
          bussgeld_cent: number | null
          erstellt_am: string | null
          fahrverbot_monate: number | null
          kurzform: string
          mit_gefaehrdung: boolean | null
          mit_sachbeschaedigung: boolean | null
          mit_unfall: boolean | null
          paragraph: string
          paragraph_num: number
          punkte: number | null
          schuldindiz: Database["public"]["Enums"]["bkat_schuldindiz"]
          tbnr: string
          unfallart: Database["public"]["Enums"]["bkat_unfallart"]
          vorschrift: string
        }
        Insert: {
          aktualisiert_am?: string | null
          bezeichnung: string
          bkat_version?: string
          bussgeld_cent?: number | null
          erstellt_am?: string | null
          fahrverbot_monate?: number | null
          kurzform: string
          mit_gefaehrdung?: boolean | null
          mit_sachbeschaedigung?: boolean | null
          mit_unfall?: boolean | null
          paragraph: string
          paragraph_num: number
          punkte?: number | null
          schuldindiz: Database["public"]["Enums"]["bkat_schuldindiz"]
          tbnr: string
          unfallart: Database["public"]["Enums"]["bkat_unfallart"]
          vorschrift: string
        }
        Update: {
          aktualisiert_am?: string | null
          bezeichnung?: string
          bkat_version?: string
          bussgeld_cent?: number | null
          erstellt_am?: string | null
          fahrverbot_monate?: number | null
          kurzform?: string
          mit_gefaehrdung?: boolean | null
          mit_sachbeschaedigung?: boolean | null
          mit_unfall?: boolean | null
          paragraph?: string
          paragraph_num?: number
          punkte?: number | null
          schuldindiz?: Database["public"]["Enums"]["bkat_schuldindiz"]
          tbnr?: string
          unfallart?: Database["public"]["Enums"]["bkat_unfallart"]
          vorschrift?: string
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
          claim_id: string | null
          created_at: string
          dauer_sekunden: number | null
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
          claim_id?: string | null
          created_at?: string
          dauer_sekunden?: number | null
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
          claim_id?: string | null
          created_at?: string
          dauer_sekunden?: number | null
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
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_thread_teilnehmer: {
        Row: {
          hinzugefuegt_am: string
          rolle: string | null
          thread_id: string
          user_id: string
          zuletzt_gelesen_am: string | null
        }
        Insert: {
          hinzugefuegt_am?: string
          rolle?: string | null
          thread_id: string
          user_id: string
          zuletzt_gelesen_am?: string | null
        }
        Update: {
          hinzugefuegt_am?: string
          rolle?: string | null
          thread_id?: string
          user_id?: string
          zuletzt_gelesen_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_teilnehmer_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          art: string
          claim_id: string
          direkt_user_a: string | null
          direkt_user_b: string | null
          erstellt_am: string
          id: string
        }
        Insert: {
          art: string
          claim_id: string
          direkt_user_a?: string | null
          direkt_user_b?: string | null
          erstellt_am?: string
          id?: string
        }
        Update: {
          art?: string
          claim_id?: string
          direkt_user_a?: string | null
          direkt_user_b?: string | null
          erstellt_am?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "chat_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      claim_mietwagen: {
        Row: {
          anbieter: string | null
          beginn_datum: string | null
          claim_id: string
          created_at: string
          created_by_user_id: string | null
          ende_datum: string | null
          erstattbar_max_tage: number | null
          erstattet_durch_vs: boolean | null
          erstattung_am: string | null
          erstattungsbetrag: number | null
          fahrzeugklasse: string | null
          gesamtkosten_netto: number | null
          id: string
          mietvertrag_nr: string | null
          mietwagenunternehmen_id: string | null
          notiz: string | null
          rechnung_url: string | null
          status: string
          tage_gesamt: number | null
          tagespreis_netto: number | null
          tatsaechliches_ende: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          anbieter?: string | null
          beginn_datum?: string | null
          claim_id: string
          created_at?: string
          created_by_user_id?: string | null
          ende_datum?: string | null
          erstattbar_max_tage?: number | null
          erstattet_durch_vs?: boolean | null
          erstattung_am?: string | null
          erstattungsbetrag?: number | null
          fahrzeugklasse?: string | null
          gesamtkosten_netto?: number | null
          id?: string
          mietvertrag_nr?: string | null
          mietwagenunternehmen_id?: string | null
          notiz?: string | null
          rechnung_url?: string | null
          status?: string
          tage_gesamt?: number | null
          tagespreis_netto?: number | null
          tatsaechliches_ende?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          anbieter?: string | null
          beginn_datum?: string | null
          claim_id?: string
          created_at?: string
          created_by_user_id?: string | null
          ende_datum?: string | null
          erstattbar_max_tage?: number | null
          erstattet_durch_vs?: boolean | null
          erstattung_am?: string | null
          erstattungsbetrag?: number | null
          fahrzeugklasse?: string | null
          gesamtkosten_netto?: number | null
          id?: string
          mietvertrag_nr?: string | null
          mietwagenunternehmen_id?: string | null
          notiz?: string | null
          rechnung_url?: string | null
          status?: string
          tage_gesamt?: number | null
          tagespreis_netto?: number | null
          tatsaechliches_ende?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_mietwagen_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_mietwagenunternehmen_id_fkey"
            columns: ["mietwagenunternehmen_id"]
            isOneToOne: false
            referencedRelation: "mietwagenunternehmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_mietwagen_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_parties: {
        Row: {
          airdrop_eingeladen_am: string | null
          airdrop_response_am: string | null
          airdrop_token: string | null
          anonymisiert_am: string | null
          arbeitsunfaehig_bis: string | null
          arbeitsunfaehig_seit: string | null
          beziehung_zum_halter: string | null
          claim_id: string
          created_at: string
          created_by_user_id: string | null
          fahrzeugtyp_klartext: string | null
          firma_id: string | null
          hat_personenschaden: boolean
          id: string
          ist_aktiv: boolean
          ist_anonymisiert: boolean
          ist_eingeladen_via_airdrop: boolean
          ist_fahrer: boolean
          ist_fahrzeuginsasse: boolean | null
          ist_halter: boolean
          kennzeichen: string | null
          kennzeichen_buchstaben: string | null
          kennzeichen_kreis: string | null
          kennzeichen_suffix: string | null
          kennzeichen_zahl: string | null
          krankenhaus_name: string | null
          notiz: string | null
          person_id: string | null
          previous_person_id: string | null
          quelle: string
          reihenfolge: number | null
          rolle: string
          updated_at: string
          user_id: string | null
          vehicle_id: string | null
          verletzungsart: string | null
          versicherung_id: string | null
          versicherung_klartext: string | null
          versicherungs_aktenzeichen: string | null
          versicherungsnummer: string | null
        }
        Insert: {
          airdrop_eingeladen_am?: string | null
          airdrop_response_am?: string | null
          airdrop_token?: string | null
          anonymisiert_am?: string | null
          arbeitsunfaehig_bis?: string | null
          arbeitsunfaehig_seit?: string | null
          beziehung_zum_halter?: string | null
          claim_id: string
          created_at?: string
          created_by_user_id?: string | null
          fahrzeugtyp_klartext?: string | null
          firma_id?: string | null
          hat_personenschaden?: boolean
          id?: string
          ist_aktiv?: boolean
          ist_anonymisiert?: boolean
          ist_eingeladen_via_airdrop?: boolean
          ist_fahrer?: boolean
          ist_fahrzeuginsasse?: boolean | null
          ist_halter?: boolean
          kennzeichen?: string | null
          kennzeichen_buchstaben?: string | null
          kennzeichen_kreis?: string | null
          kennzeichen_suffix?: string | null
          kennzeichen_zahl?: string | null
          krankenhaus_name?: string | null
          notiz?: string | null
          person_id?: string | null
          previous_person_id?: string | null
          quelle: string
          reihenfolge?: number | null
          rolle: string
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
          verletzungsart?: string | null
          versicherung_id?: string | null
          versicherung_klartext?: string | null
          versicherungs_aktenzeichen?: string | null
          versicherungsnummer?: string | null
        }
        Update: {
          airdrop_eingeladen_am?: string | null
          airdrop_response_am?: string | null
          airdrop_token?: string | null
          anonymisiert_am?: string | null
          arbeitsunfaehig_bis?: string | null
          arbeitsunfaehig_seit?: string | null
          beziehung_zum_halter?: string | null
          claim_id?: string
          created_at?: string
          created_by_user_id?: string | null
          fahrzeugtyp_klartext?: string | null
          firma_id?: string | null
          hat_personenschaden?: boolean
          id?: string
          ist_aktiv?: boolean
          ist_anonymisiert?: boolean
          ist_eingeladen_via_airdrop?: boolean
          ist_fahrer?: boolean
          ist_fahrzeuginsasse?: boolean | null
          ist_halter?: boolean
          kennzeichen?: string | null
          kennzeichen_buchstaben?: string | null
          kennzeichen_kreis?: string | null
          kennzeichen_suffix?: string | null
          kennzeichen_zahl?: string | null
          krankenhaus_name?: string | null
          notiz?: string | null
          person_id?: string | null
          previous_person_id?: string | null
          quelle?: string
          reihenfolge?: number | null
          rolle?: string
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
          verletzungsart?: string | null
          versicherung_id?: string | null
          versicherung_klartext?: string | null
          versicherungs_aktenzeichen?: string | null
          versicherungsnummer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "personen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_previous_person_id_fkey"
            columns: ["previous_person_id"]
            isOneToOne: false
            referencedRelation: "personen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_versicherung_id_fkey"
            columns: ["versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_payments: {
        Row: {
          claim_id: string
          created_at: string
          created_by_user_id: string | null
          differenz_betrag: number | null
          empfaenger: string
          erhaltener_betrag: number | null
          forderungsbetrag: number | null
          id: string
          notiz: string | null
          partei: string
          richtung: string
          status: string
          updated_at: string
          zahlungseingang_am: string | null
          zahlungsreferenz: string | null
          zahlungsweg: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          created_by_user_id?: string | null
          differenz_betrag?: number | null
          empfaenger?: string
          erhaltener_betrag?: number | null
          forderungsbetrag?: number | null
          id?: string
          notiz?: string | null
          partei?: string
          richtung?: string
          status?: string
          updated_at?: string
          zahlungseingang_am?: string | null
          zahlungsreferenz?: string | null
          zahlungsweg?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          created_by_user_id?: string | null
          differenz_betrag?: number | null
          empfaenger?: string
          erhaltener_betrag?: number | null
          forderungsbetrag?: number | null
          id?: string
          notiz?: string | null
          partei?: string
          richtung?: string
          status?: string
          updated_at?: string
          zahlungseingang_am?: string | null
          zahlungsreferenz?: string | null
          zahlungsweg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_recency: {
        Row: {
          claim_id: string
          last_activity_at: string
        }
        Insert: {
          claim_id: string
          last_activity_at?: string
        }
        Update: {
          claim_id?: string
          last_activity_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_recency_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      claim_vehicle_involvements: {
        Row: {
          beschaedigung_grad: string | null
          claim_id: string
          created_at: string
          id: string
          notiz: string | null
          reihenfolge: number | null
          rolle: string
          vehicle_id: string
        }
        Insert: {
          beschaedigung_grad?: string | null
          claim_id: string
          created_at?: string
          id?: string
          notiz?: string | null
          reihenfolge?: number | null
          rolle: string
          vehicle_id: string
        }
        Update: {
          beschaedigung_grad?: string | null
          claim_id?: string
          created_at?: string
          id?: string
          notiz?: string | null
          reihenfolge?: number | null
          rolle?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_vehicle_involvements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          abgeschlossen_am: string | null
          abrechnung_id: string | null
          abrechnungsart_besprochen: string | null
          abrechnungsart_besprochen_am: string | null
          abrechnungsart_notiz: string | null
          abrechnungsweg: string | null
          abtretung_pdf: string | null
          abtretung_signiert_am: string | null
          anzahl_beteiligte_total: number
          auslandskennzeichen: boolean | null
          auszahlung_zahlungsweg: string | null
          bankdaten_hinterlegt_am: string | null
          bedarf_confidence: number | null
          bedarf_ermittelt_am: string | null
          bedarf_kategorien: string[] | null
          bedarf_quelle: string | null
          betreuungspaket: Database["public"]["Enums"]["betreuungspaket"] | null
          bevorzugter_kanal: string | null
          bic: string | null
          bkat_unfallart: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn: string | null
          claim_nummer: string | null
          created_at: string
          created_by_user_id: string | null
          created_via: string
          datenschutz_akzeptiert: boolean | null
          datenschutz_akzeptiert_am: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          deaktiviert_notiz: string | null
          dokumente_reminder_whatsapp_letzte_sendung: string | null
          dokumente_vollstaendig_am_phase: string | null
          dokumente_vollstaendig_fuer_phase: string | null
          eigene_versicherung: string | null
          endzustand_gesetzt_am: string | null
          endzustand_gesetzt_durch_user_id: string | null
          endzustand_grund: string | null
          entdeckt_am: string | null
          eskaliert_am: string | null
          eskaliert_an_admin_id: string | null
          eskaliert_grund: string | null
          fahrerflucht: boolean | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeugschaden_beschreibung: string | null
          fall_typ: string | null
          fallakte_angelegt_am: string | null
          finanzierung_bank: string | null
          finanzierung_leasing: string
          finanzierungsgeber_adresse: string | null
          finanzierungsgeber_name: string | null
          finanzierungsgeber_vertragsnr: string | null
          freie_werkstattwahl: boolean | null
          gegner_bekannt: boolean
          gegner_versicherung_id: string | null
          geschaedigter_user_id: string | null
          geschlossen_grund: string | null
          gewerbe_flag: boolean
          google_review_gesendet: boolean | null
          google_review_prompt_gezeigt_am: string | null
          guthaben_verrechnet_netto: number
          halter_ungleich_fahrer: boolean
          hat_abschleppung: boolean
          hat_mietwagen: boolean
          hat_nutzungsausfall: boolean
          hat_personenschaden: boolean
          hat_sachschaden: boolean
          hat_vorschaeden: boolean | null
          hergang_kunde_text: string | null
          hergang_sv_text: string | null
          iban: string | null
          id: string
          interne_notizen: string | null
          ist_aktiv: boolean | null
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
          kanzlei_wunsch: string
          kanzlei_wunsch_gefragt_am: string | null
          kanzlei_wunsch_gefragt_in_phase: string | null
          kontoinhaber: string | null
          konvertiert_am: string | null
          kostenvoranschlag_brutto: number | null
          kostenvoranschlag_netto: number | null
          kunde_no_show_count: number
          kunden_konstellation: string | null
          kundenbetreuer_fallback_flag: boolean
          kundenbetreuer_id: string | null
          kundenbetreuer_zugewiesen_am: string | null
          kva_abgelehnt_am: string | null
          kva_abgelehnt_grund: string | null
          kva_quelle: string | null
          lead_id: string | null
          lead_preis_berechnet_am: string | null
          lead_preis_netto: number | null
          lead_preis_typ: string | null
          leasinggeber_informiert: boolean | null
          leasinggeber_name: string | null
          makler_id: string | null
          marketing_provision: number | null
          mietwagen_argumentations_puffer: number
          mietwagen_kanzlei_informiert: boolean | null
          mietwagen_kanzlei_informiert_am: string | null
          mietwagen_limit_grund: string | null
          mietwagen_limit_tage: number | null
          mietwagen_rechnung_url: string | null
          mietwagen_rechnung_vorhanden: boolean
          mietwagen_seit_datum: string | null
          mietwagen_vermieter: string | null
          netzwerk_owner_id: string | null
          notizen: string | null
          onboarding_complete: boolean | null
          operative_status: string | null
          phase_override: string | null
          phase_override_am: string | null
          phase_override_grund: string | null
          phase_override_von: string | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean
          polizei_vor_ort: boolean
          polizeibericht_status: string | null
          prioritaet: string | null
          reparatur_auftrag_modus: string
          reparatur_auftrag_modus_gesetzt_am: string | null
          reparatur_auftrag_modus_gesetzt_von: string | null
          reparatur_freigegeben_am: string | null
          reparatur_freigegeben_von: string | null
          reparatur_vermittlung_status: string
          reparatur_werkstatt_extern: string | null
          reparatur_werkstatt_id: string | null
          reparatur_werkstatt_quelle: string | null
          reparatur_werkstatt_zugewiesen_am: string | null
          reparatur_werkstatt_zugewiesen_von: string | null
          reparaturdauer_tage_kva: number | null
          reparaturwunsch: string | null
          sa_pdf_url: string | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sa_unterschrift_url: string | null
          sachschaden_beschreibung: string | null
          schadenart: string
          schadenort_adresse: string | null
          schadenort_kategorie: string | null
          schadenort_land: string
          schadenort_lat: number | null
          schadenort_lng: number | null
          schadenort_ort: string | null
          schadenort_place_id: string | null
          schadenort_plz: string | null
          schadens_hoehe_netto: number | null
          schadens_kind: string | null
          schadens_ursache: string | null
          schadenskategorie: string | null
          schadentag: string
          schadenzeit: string | null
          schlussabrechnung_am: string | null
          schuldfrage: string | null
          service_typ: string
          spezifikation: string | null
          sprache: string | null
          status_changed_at: string | null
          sv_datenschutz_widerruf_zugestimmt_am: string | null
          sv_id: string | null
          sv_nachzahlung_netto: number | null
          sv_no_show_count: number
          sv_zugewiesen_am: string | null
          szenario: string | null
          unfall_konstellation: string | null
          unfallmitteilung_status: string | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string
          vehicle_id: string | null
          verjaehrt_am: string | null
          vermittler_id: string | null
          vermittler_typ: string | null
          vollmacht_geprueft_am: string | null
          vollmacht_geprueft_von: string | null
          vollmacht_pdf: string | null
          vollmacht_pruefung_begruendung: string | null
          vollmacht_pruefung_status: string | null
          vollmacht_signiert_am: string | null
          vollmacht_status: string | null
          vorschaden_erkannt: boolean | null
          vorschaden_geprueft: boolean | null
          vorschaden_mit_vs_abgerechnet: string | null
          vorschaeden_beschreibung: string | null
          vorsteuerabzugsberechtigt: boolean
          vs_ablehnungs_grund: string | null
          werkstatt_id: string | null
          werkstatt_seit_datum: string | null
          zahlungsweg: string | null
          zb1_status: string | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean
        }
        Insert: {
          abgeschlossen_am?: string | null
          abrechnung_id?: string | null
          abrechnungsart_besprochen?: string | null
          abrechnungsart_besprochen_am?: string | null
          abrechnungsart_notiz?: string | null
          abrechnungsweg?: string | null
          abtretung_pdf?: string | null
          abtretung_signiert_am?: string | null
          anzahl_beteiligte_total?: number
          auslandskennzeichen?: boolean | null
          auszahlung_zahlungsweg?: string | null
          bankdaten_hinterlegt_am?: string | null
          bedarf_confidence?: number | null
          bedarf_ermittelt_am?: string | null
          bedarf_kategorien?: string[] | null
          bedarf_quelle?: string | null
          betreuungspaket?:
            | Database["public"]["Enums"]["betreuungspaket"]
            | null
          bevorzugter_kanal?: string | null
          bic?: string | null
          bkat_unfallart?: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn?: string | null
          claim_nummer?: string | null
          created_at?: string
          created_by_user_id?: string | null
          created_via?: string
          datenschutz_akzeptiert?: boolean | null
          datenschutz_akzeptiert_am?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          deaktiviert_notiz?: string | null
          dokumente_reminder_whatsapp_letzte_sendung?: string | null
          dokumente_vollstaendig_am_phase?: string | null
          dokumente_vollstaendig_fuer_phase?: string | null
          eigene_versicherung?: string | null
          endzustand_gesetzt_am?: string | null
          endzustand_gesetzt_durch_user_id?: string | null
          endzustand_grund?: string | null
          entdeckt_am?: string | null
          eskaliert_am?: string | null
          eskaliert_an_admin_id?: string | null
          eskaliert_grund?: string | null
          fahrerflucht?: boolean | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeugschaden_beschreibung?: string | null
          fall_typ?: string | null
          fallakte_angelegt_am?: string | null
          finanzierung_bank?: string | null
          finanzierung_leasing?: string
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          freie_werkstattwahl?: boolean | null
          gegner_bekannt?: boolean
          gegner_versicherung_id?: string | null
          geschaedigter_user_id?: string | null
          geschlossen_grund?: string | null
          gewerbe_flag?: boolean
          google_review_gesendet?: boolean | null
          google_review_prompt_gezeigt_am?: string | null
          guthaben_verrechnet_netto?: number
          halter_ungleich_fahrer?: boolean
          hat_abschleppung?: boolean
          hat_mietwagen?: boolean
          hat_nutzungsausfall?: boolean
          hat_personenschaden?: boolean
          hat_sachschaden?: boolean
          hat_vorschaeden?: boolean | null
          hergang_kunde_text?: string | null
          hergang_sv_text?: string | null
          iban?: string | null
          id?: string
          interne_notizen?: string | null
          ist_aktiv?: boolean | null
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
          kanzlei_wunsch?: string
          kanzlei_wunsch_gefragt_am?: string | null
          kanzlei_wunsch_gefragt_in_phase?: string | null
          kontoinhaber?: string | null
          konvertiert_am?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          kunde_no_show_count?: number
          kunden_konstellation?: string | null
          kundenbetreuer_fallback_flag?: boolean
          kundenbetreuer_id?: string | null
          kundenbetreuer_zugewiesen_am?: string | null
          kva_abgelehnt_am?: string | null
          kva_abgelehnt_grund?: string | null
          kva_quelle?: string | null
          lead_id?: string | null
          lead_preis_berechnet_am?: string | null
          lead_preis_netto?: number | null
          lead_preis_typ?: string | null
          leasinggeber_informiert?: boolean | null
          leasinggeber_name?: string | null
          makler_id?: string | null
          marketing_provision?: number | null
          mietwagen_argumentations_puffer?: number
          mietwagen_kanzlei_informiert?: boolean | null
          mietwagen_kanzlei_informiert_am?: string | null
          mietwagen_limit_grund?: string | null
          mietwagen_limit_tage?: number | null
          mietwagen_rechnung_url?: string | null
          mietwagen_rechnung_vorhanden?: boolean
          mietwagen_seit_datum?: string | null
          mietwagen_vermieter?: string | null
          netzwerk_owner_id?: string | null
          notizen?: string | null
          onboarding_complete?: boolean | null
          operative_status?: string | null
          phase_override?: string | null
          phase_override_am?: string | null
          phase_override_grund?: string | null
          phase_override_von?: string | null
          polizei_aktenzeichen?: string | null
          polizei_bericht_vorhanden?: boolean
          polizei_vor_ort?: boolean
          polizeibericht_status?: string | null
          prioritaet?: string | null
          reparatur_auftrag_modus?: string
          reparatur_auftrag_modus_gesetzt_am?: string | null
          reparatur_auftrag_modus_gesetzt_von?: string | null
          reparatur_freigegeben_am?: string | null
          reparatur_freigegeben_von?: string | null
          reparatur_vermittlung_status?: string
          reparatur_werkstatt_extern?: string | null
          reparatur_werkstatt_id?: string | null
          reparatur_werkstatt_quelle?: string | null
          reparatur_werkstatt_zugewiesen_am?: string | null
          reparatur_werkstatt_zugewiesen_von?: string | null
          reparaturdauer_tage_kva?: number | null
          reparaturwunsch?: string | null
          sa_pdf_url?: string | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sa_unterschrift_url?: string | null
          sachschaden_beschreibung?: string | null
          schadenart?: string
          schadenort_adresse?: string | null
          schadenort_kategorie?: string | null
          schadenort_land?: string
          schadenort_lat?: number | null
          schadenort_lng?: number | null
          schadenort_ort?: string | null
          schadenort_place_id?: string | null
          schadenort_plz?: string | null
          schadens_hoehe_netto?: number | null
          schadens_kind?: string | null
          schadens_ursache?: string | null
          schadenskategorie?: string | null
          schadentag: string
          schadenzeit?: string | null
          schlussabrechnung_am?: string | null
          schuldfrage?: string | null
          service_typ?: string
          spezifikation?: string | null
          sprache?: string | null
          status_changed_at?: string | null
          sv_datenschutz_widerruf_zugestimmt_am?: string | null
          sv_id?: string | null
          sv_nachzahlung_netto?: number | null
          sv_no_show_count?: number
          sv_zugewiesen_am?: string | null
          szenario?: string | null
          unfall_konstellation?: string | null
          unfallmitteilung_status?: string | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string
          vehicle_id?: string | null
          verjaehrt_am?: string | null
          vermittler_id?: string | null
          vermittler_typ?: string | null
          vollmacht_geprueft_am?: string | null
          vollmacht_geprueft_von?: string | null
          vollmacht_pdf?: string | null
          vollmacht_pruefung_begruendung?: string | null
          vollmacht_pruefung_status?: string | null
          vollmacht_signiert_am?: string | null
          vollmacht_status?: string | null
          vorschaden_erkannt?: boolean | null
          vorschaden_geprueft?: boolean | null
          vorschaden_mit_vs_abgerechnet?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean
          vs_ablehnungs_grund?: string | null
          werkstatt_id?: string | null
          werkstatt_seit_datum?: string | null
          zahlungsweg?: string | null
          zb1_status?: string | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
        }
        Update: {
          abgeschlossen_am?: string | null
          abrechnung_id?: string | null
          abrechnungsart_besprochen?: string | null
          abrechnungsart_besprochen_am?: string | null
          abrechnungsart_notiz?: string | null
          abrechnungsweg?: string | null
          abtretung_pdf?: string | null
          abtretung_signiert_am?: string | null
          anzahl_beteiligte_total?: number
          auslandskennzeichen?: boolean | null
          auszahlung_zahlungsweg?: string | null
          bankdaten_hinterlegt_am?: string | null
          bedarf_confidence?: number | null
          bedarf_ermittelt_am?: string | null
          bedarf_kategorien?: string[] | null
          bedarf_quelle?: string | null
          betreuungspaket?:
            | Database["public"]["Enums"]["betreuungspaket"]
            | null
          bevorzugter_kanal?: string | null
          bic?: string | null
          bkat_unfallart?: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn?: string | null
          claim_nummer?: string | null
          created_at?: string
          created_by_user_id?: string | null
          created_via?: string
          datenschutz_akzeptiert?: boolean | null
          datenschutz_akzeptiert_am?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          deaktiviert_notiz?: string | null
          dokumente_reminder_whatsapp_letzte_sendung?: string | null
          dokumente_vollstaendig_am_phase?: string | null
          dokumente_vollstaendig_fuer_phase?: string | null
          eigene_versicherung?: string | null
          endzustand_gesetzt_am?: string | null
          endzustand_gesetzt_durch_user_id?: string | null
          endzustand_grund?: string | null
          entdeckt_am?: string | null
          eskaliert_am?: string | null
          eskaliert_an_admin_id?: string | null
          eskaliert_grund?: string | null
          fahrerflucht?: boolean | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeugschaden_beschreibung?: string | null
          fall_typ?: string | null
          fallakte_angelegt_am?: string | null
          finanzierung_bank?: string | null
          finanzierung_leasing?: string
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          freie_werkstattwahl?: boolean | null
          gegner_bekannt?: boolean
          gegner_versicherung_id?: string | null
          geschaedigter_user_id?: string | null
          geschlossen_grund?: string | null
          gewerbe_flag?: boolean
          google_review_gesendet?: boolean | null
          google_review_prompt_gezeigt_am?: string | null
          guthaben_verrechnet_netto?: number
          halter_ungleich_fahrer?: boolean
          hat_abschleppung?: boolean
          hat_mietwagen?: boolean
          hat_nutzungsausfall?: boolean
          hat_personenschaden?: boolean
          hat_sachschaden?: boolean
          hat_vorschaeden?: boolean | null
          hergang_kunde_text?: string | null
          hergang_sv_text?: string | null
          iban?: string | null
          id?: string
          interne_notizen?: string | null
          ist_aktiv?: boolean | null
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
          kanzlei_wunsch?: string
          kanzlei_wunsch_gefragt_am?: string | null
          kanzlei_wunsch_gefragt_in_phase?: string | null
          kontoinhaber?: string | null
          konvertiert_am?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          kunde_no_show_count?: number
          kunden_konstellation?: string | null
          kundenbetreuer_fallback_flag?: boolean
          kundenbetreuer_id?: string | null
          kundenbetreuer_zugewiesen_am?: string | null
          kva_abgelehnt_am?: string | null
          kva_abgelehnt_grund?: string | null
          kva_quelle?: string | null
          lead_id?: string | null
          lead_preis_berechnet_am?: string | null
          lead_preis_netto?: number | null
          lead_preis_typ?: string | null
          leasinggeber_informiert?: boolean | null
          leasinggeber_name?: string | null
          makler_id?: string | null
          marketing_provision?: number | null
          mietwagen_argumentations_puffer?: number
          mietwagen_kanzlei_informiert?: boolean | null
          mietwagen_kanzlei_informiert_am?: string | null
          mietwagen_limit_grund?: string | null
          mietwagen_limit_tage?: number | null
          mietwagen_rechnung_url?: string | null
          mietwagen_rechnung_vorhanden?: boolean
          mietwagen_seit_datum?: string | null
          mietwagen_vermieter?: string | null
          netzwerk_owner_id?: string | null
          notizen?: string | null
          onboarding_complete?: boolean | null
          operative_status?: string | null
          phase_override?: string | null
          phase_override_am?: string | null
          phase_override_grund?: string | null
          phase_override_von?: string | null
          polizei_aktenzeichen?: string | null
          polizei_bericht_vorhanden?: boolean
          polizei_vor_ort?: boolean
          polizeibericht_status?: string | null
          prioritaet?: string | null
          reparatur_auftrag_modus?: string
          reparatur_auftrag_modus_gesetzt_am?: string | null
          reparatur_auftrag_modus_gesetzt_von?: string | null
          reparatur_freigegeben_am?: string | null
          reparatur_freigegeben_von?: string | null
          reparatur_vermittlung_status?: string
          reparatur_werkstatt_extern?: string | null
          reparatur_werkstatt_id?: string | null
          reparatur_werkstatt_quelle?: string | null
          reparatur_werkstatt_zugewiesen_am?: string | null
          reparatur_werkstatt_zugewiesen_von?: string | null
          reparaturdauer_tage_kva?: number | null
          reparaturwunsch?: string | null
          sa_pdf_url?: string | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sa_unterschrift_url?: string | null
          sachschaden_beschreibung?: string | null
          schadenart?: string
          schadenort_adresse?: string | null
          schadenort_kategorie?: string | null
          schadenort_land?: string
          schadenort_lat?: number | null
          schadenort_lng?: number | null
          schadenort_ort?: string | null
          schadenort_place_id?: string | null
          schadenort_plz?: string | null
          schadens_hoehe_netto?: number | null
          schadens_kind?: string | null
          schadens_ursache?: string | null
          schadenskategorie?: string | null
          schadentag?: string
          schadenzeit?: string | null
          schlussabrechnung_am?: string | null
          schuldfrage?: string | null
          service_typ?: string
          spezifikation?: string | null
          sprache?: string | null
          status_changed_at?: string | null
          sv_datenschutz_widerruf_zugestimmt_am?: string | null
          sv_id?: string | null
          sv_nachzahlung_netto?: number | null
          sv_no_show_count?: number
          sv_zugewiesen_am?: string | null
          szenario?: string | null
          unfall_konstellation?: string | null
          unfallmitteilung_status?: string | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string
          vehicle_id?: string | null
          verjaehrt_am?: string | null
          vermittler_id?: string | null
          vermittler_typ?: string | null
          vollmacht_geprueft_am?: string | null
          vollmacht_geprueft_von?: string | null
          vollmacht_pdf?: string | null
          vollmacht_pruefung_begruendung?: string | null
          vollmacht_pruefung_status?: string | null
          vollmacht_signiert_am?: string | null
          vollmacht_status?: string | null
          vorschaden_erkannt?: boolean | null
          vorschaden_geprueft?: boolean | null
          vorschaden_mit_vs_abgerechnet?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean
          vs_ablehnungs_grund?: string | null
          werkstatt_id?: string | null
          werkstatt_seit_datum?: string | null
          zahlungsweg?: string | null
          zb1_status?: string | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "claims_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_endzustand_gesetzt_durch_user_id_fkey"
            columns: ["endzustand_gesetzt_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_eskaliert_an_admin_id_fkey"
            columns: ["eskaliert_an_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["geschaedigter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kanzlei_id_fkey"
            columns: ["kanzlei_id"]
            isOneToOne: false
            referencedRelation: "kanzlei"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_netzwerk_owner_id_fkey"
            columns: ["netzwerk_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "claims_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "claims_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_log: {
        Row: {
          boundary: string
          created_at: string
          digest: string | null
          id: string
          message: string | null
          name: string | null
          pathname: string | null
          rolle: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          boundary: string
          created_at?: string
          digest?: string | null
          id?: string
          message?: string | null
          name?: string | null
          pathname?: string | null
          rolle?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          boundary?: string
          created_at?: string
          digest?: string | null
          id?: string
          message?: string | null
          name?: string | null
          pathname?: string | null
          rolle?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cold_mail_enrollments: {
        Row: {
          aktueller_step: number
          erstellt_am: string
          id: string
          lead_id: string
          next_send_at: string | null
          sequenz_id: string
          status: string
        }
        Insert: {
          aktueller_step?: number
          erstellt_am?: string
          id?: string
          lead_id: string
          next_send_at?: string | null
          sequenz_id: string
          status?: string
        }
        Update: {
          aktueller_step?: number
          erstellt_am?: string
          id?: string
          lead_id?: string
          next_send_at?: string | null
          sequenz_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cold_mail_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "partner_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_mail_enrollments_sequenz_id_fkey"
            columns: ["sequenz_id"]
            isOneToOne: false
            referencedRelation: "cold_mail_sequenzen"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_mail_sends: {
        Row: {
          betreff: string
          body_snapshot: string | null
          empfaenger_email: string
          enrollment_id: string | null
          geklickt_am: string | null
          geoeffnet_am: string | null
          gesendet_am: string
          id: string
          lead_id: string
          resend_message_id: string | null
          status: string
          step_id: string | null
          vorlage_id: string | null
        }
        Insert: {
          betreff: string
          body_snapshot?: string | null
          empfaenger_email: string
          enrollment_id?: string | null
          geklickt_am?: string | null
          geoeffnet_am?: string | null
          gesendet_am?: string
          id?: string
          lead_id: string
          resend_message_id?: string | null
          status?: string
          step_id?: string | null
          vorlage_id?: string | null
        }
        Update: {
          betreff?: string
          body_snapshot?: string | null
          empfaenger_email?: string
          enrollment_id?: string | null
          geklickt_am?: string | null
          geoeffnet_am?: string | null
          gesendet_am?: string
          id?: string
          lead_id?: string
          resend_message_id?: string | null
          status?: string
          step_id?: string | null
          vorlage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cold_mail_sends_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "cold_mail_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_mail_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "partner_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_mail_sends_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "cold_mail_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_mail_sends_vorlage_id_fkey"
            columns: ["vorlage_id"]
            isOneToOne: false
            referencedRelation: "cold_mail_vorlagen"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_mail_sequenzen: {
        Row: {
          aktiv: boolean
          auto_enroll: boolean
          erstellt_am: string
          id: string
          name: string
          rolle: string
        }
        Insert: {
          aktiv?: boolean
          auto_enroll?: boolean
          erstellt_am?: string
          id?: string
          name: string
          rolle: string
        }
        Update: {
          aktiv?: boolean
          auto_enroll?: boolean
          erstellt_am?: string
          id?: string
          name?: string
          rolle?: string
        }
        Relationships: []
      }
      cold_mail_steps: {
        Row: {
          bedingung: string
          delay_tage: number
          id: string
          position: number
          sequenz_id: string
          vorlage_id: string
        }
        Insert: {
          bedingung?: string
          delay_tage?: number
          id?: string
          position: number
          sequenz_id: string
          vorlage_id: string
        }
        Update: {
          bedingung?: string
          delay_tage?: number
          id?: string
          position?: number
          sequenz_id?: string
          vorlage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cold_mail_steps_sequenz_id_fkey"
            columns: ["sequenz_id"]
            isOneToOne: false
            referencedRelation: "cold_mail_sequenzen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_mail_steps_vorlage_id_fkey"
            columns: ["vorlage_id"]
            isOneToOne: false
            referencedRelation: "cold_mail_vorlagen"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_mail_suppression: {
        Row: {
          email: string
          erstellt_am: string
          grund: string
          lead_id: string | null
        }
        Insert: {
          email: string
          erstellt_am?: string
          grund: string
          lead_id?: string | null
        }
        Update: {
          email?: string
          erstellt_am?: string
          grund?: string
          lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cold_mail_suppression_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "partner_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_mail_vorlagen: {
        Row: {
          aktualisiert_am: string
          betreff: string
          body_html: string
          erstellt_am: string
          erstellt_von: string | null
          id: string
          name: string
          rolle: string | null
        }
        Insert: {
          aktualisiert_am?: string
          betreff: string
          body_html: string
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          name: string
          rolle?: string | null
        }
        Update: {
          aktualisiert_am?: string
          betreff?: string
          body_html?: string
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          name?: string
          rolle?: string | null
        }
        Relationships: []
      }
      communities: {
        Row: {
          beschreibung: string | null
          budget_verteilung: string
          erstellt_am: string
          erstellt_von: string | null
          exklusiv: boolean
          faelle_genutzt_aktueller_monat: number
          faelle_pro_monat: number
          id: string
          ist_aktiv: boolean
          name: string
          polygon: Json | null
          radius_km: number | null
          updated_at: string
          zentrum_adresse: string | null
          zentrum_lat: number | null
          zentrum_lng: number | null
          zentrum_plz: string | null
        }
        Insert: {
          beschreibung?: string | null
          budget_verteilung?: string
          erstellt_am?: string
          erstellt_von?: string | null
          exklusiv?: boolean
          faelle_genutzt_aktueller_monat?: number
          faelle_pro_monat?: number
          id?: string
          ist_aktiv?: boolean
          name: string
          polygon?: Json | null
          radius_km?: number | null
          updated_at?: string
          zentrum_adresse?: string | null
          zentrum_lat?: number | null
          zentrum_lng?: number | null
          zentrum_plz?: string | null
        }
        Update: {
          beschreibung?: string | null
          budget_verteilung?: string
          erstellt_am?: string
          erstellt_von?: string | null
          exklusiv?: boolean
          faelle_genutzt_aktueller_monat?: number
          faelle_pro_monat?: number
          id?: string
          ist_aktiv?: boolean
          name?: string
          polygon?: Json | null
          radius_km?: number | null
          updated_at?: string
          zentrum_adresse?: string | null
          zentrum_lat?: number | null
          zentrum_lng?: number | null
          zentrum_plz?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communities_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_display: string
          author_id: string
          author_kind: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          moderated_am: string | null
          moderated_von: string | null
          parent_id: string | null
          report_count: number
          status: string
          target_id: string
          target_kind: string
        }
        Insert: {
          author_display: string
          author_id: string
          author_kind: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          moderated_am?: string | null
          moderated_von?: string | null
          parent_id?: string | null
          report_count?: number
          status?: string
          target_id: string
          target_kind: string
        }
        Update: {
          author_display?: string
          author_id?: string
          author_kind?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          moderated_am?: string | null
          moderated_von?: string | null
          parent_id?: string | null
          report_count?: number
          status?: string
          target_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
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
          {
            foreignKeyName: "community_leaderboard_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      community_memberships: {
        Row: {
          beigetreten_am: string
          community_id: string
          profile_id: string
          rolle_in_community: string
        }
        Insert: {
          beigetreten_am?: string
          community_id: string
          profile_id: string
          rolle_in_community?: string
        }
        Update: {
          beigetreten_am?: string
          community_id?: string
          profile_id?: string
          rolle_in_community?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_memberships_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_display: string
          author_id: string
          author_kind: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          moderated_am: string | null
          moderated_von: string | null
          report_count: number
          status: string
          tags: string[]
        }
        Insert: {
          author_display: string
          author_id: string
          author_kind: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          moderated_am?: string | null
          moderated_von?: string | null
          report_count?: number
          status?: string
          tags?: string[]
        }
        Update: {
          author_display?: string
          author_id?: string
          author_kind?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          moderated_am?: string | null
          moderated_von?: string | null
          report_count?: number
          status?: string
          tags?: string[]
        }
        Relationships: []
      }
      community_profiles: {
        Row: {
          consent_at: string
          created_at: string
          is_blocked: boolean
          trusted: boolean
          user_id: string
          username: string
        }
        Insert: {
          consent_at?: string
          created_at?: string
          is_blocked?: boolean
          trusted?: boolean
          user_id: string
          username: string
        }
        Update: {
          consent_at?: string
          created_at?: string
          is_blocked?: boolean
          trusted?: boolean
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          categories: Json
          created_at: string
          id: string
          policy_version: string
          user_agent: string | null
        }
        Insert: {
          categories: Json
          created_at?: string
          id?: string
          policy_version: string
          user_agent?: string | null
        }
        Update: {
          categories?: Json
          created_at?: string
          id?: string
          policy_version?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      content_translations: {
        Row: {
          erstellt_am: string
          field: string | null
          id: string
          model: string | null
          provider: string
          source_hash: string
          source_id: string | null
          source_table: string | null
          target_locale: string
          translated_text: string
        }
        Insert: {
          erstellt_am?: string
          field?: string | null
          id?: string
          model?: string | null
          provider?: string
          source_hash: string
          source_id?: string | null
          source_table?: string | null
          target_locale: string
          translated_text: string
        }
        Update: {
          erstellt_am?: string
          field?: string | null
          id?: string
          model?: string | null
          provider?: string
          source_hash?: string
          source_id?: string | null
          source_table?: string | null
          target_locale?: string
          translated_text?: string
        }
        Relationships: []
      }
      conversion_events: {
        Row: {
          anfrage_id: string | null
          event_type: string
          flow_key: string
          id: string
          kanzlei_wunsch: string | null
          phase_key: string
          service_typ: string | null
          session_id: string | null
          ts: string
          user_agent: string | null
        }
        Insert: {
          anfrage_id?: string | null
          event_type: string
          flow_key: string
          id?: string
          kanzlei_wunsch?: string | null
          phase_key: string
          service_typ?: string | null
          session_id?: string | null
          ts?: string
          user_agent?: string | null
        }
        Update: {
          anfrage_id?: string | null
          event_type?: string
          flow_key?: string
          id?: string
          kanzlei_wunsch?: string | null
          phase_key?: string
          service_typ?: string | null
          session_id?: string | null
          ts?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      cron_jobs_audit: {
        Row: {
          duration_ms: number | null
          ended_at: string | null
          error_message: string | null
          id: string
          job_name: string
          metadata_jsonb: Json | null
          rows_processed: number | null
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          job_name: string
          metadata_jsonb?: Json | null
          rows_processed?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          job_name?: string
          metadata_jsonb?: Json | null
          rows_processed?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
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
          maps_to_qualifikation: string | null
          max_mb: number
          multi_file: boolean
          pflicht_wenn: Json | null
          sichtbar_fuer: string[]
          slot_id: string
          sort_order: number
          steuert_kundensichtbarkeit: boolean
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
          maps_to_qualifikation?: string | null
          max_mb?: number
          multi_file?: boolean
          pflicht_wenn?: Json | null
          sichtbar_fuer?: string[]
          slot_id: string
          sort_order?: number
          steuert_kundensichtbarkeit?: boolean
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
          maps_to_qualifikation?: string | null
          max_mb?: number
          multi_file?: boolean
          pflicht_wenn?: Json | null
          sichtbar_fuer?: string[]
          slot_id?: string
          sort_order?: number
          steuert_kundensichtbarkeit?: boolean
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
          {
            foreignKeyName: "dokument_upload_anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "dokument_upload_anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dokument_upload_anfragen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      dsgvo_loeschauftraege: {
        Row: {
          abgelehnt_grund: string | null
          audit_payload: Json | null
          ausgefuehrt_am: string | null
          bestaetigt_am: string | null
          bestaetigt_von_user_id: string | null
          eingereicht_am: string
          eingereicht_von: string
          email: string
          grund: string | null
          id: string
          status: string
          user_id: string | null
        }
        Insert: {
          abgelehnt_grund?: string | null
          audit_payload?: Json | null
          ausgefuehrt_am?: string | null
          bestaetigt_am?: string | null
          bestaetigt_von_user_id?: string | null
          eingereicht_am?: string
          eingereicht_von?: string
          email: string
          grund?: string | null
          id?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          abgelehnt_grund?: string | null
          audit_payload?: Json | null
          ausgefuehrt_am?: string | null
          bestaetigt_am?: string | null
          bestaetigt_von_user_id?: string | null
          eingereicht_am?: string
          eingereicht_von?: string
          email?: string
          grund?: string | null
          id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          attachments: Json | null
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "email_log_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "email_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "email_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      embed_abrechnung_positionen: {
        Row: {
          abrechnung_id: string
          anfrage_id: string | null
          einzelpreis_eur: number
          embed_site_id: string
          erstellt_am: string
          id: string
          leistung_text: string
          termin_id: string | null
          updated_at: string
        }
        Insert: {
          abrechnung_id: string
          anfrage_id?: string | null
          einzelpreis_eur?: number
          embed_site_id: string
          erstellt_am?: string
          id?: string
          leistung_text: string
          termin_id?: string | null
          updated_at?: string
        }
        Update: {
          abrechnung_id?: string
          anfrage_id?: string | null
          einzelpreis_eur?: number
          embed_site_id?: string
          erstellt_am?: string
          id?: string
          leistung_text?: string
          termin_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "embed_abrechnung_positionen_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_anfrage_id_fkey"
            columns: ["anfrage_id"]
            isOneToOne: false
            referencedRelation: "gutachter_finder_anfragen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_anfrage_id_fkey"
            columns: ["anfrage_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["anfrage_id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_anfrage_id_fkey"
            columns: ["anfrage_id"]
            isOneToOne: false
            referencedRelation: "v_offene_anfragen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_anfrage_id_fkey"
            columns: ["anfrage_id"]
            isOneToOne: false
            referencedRelation: "v_sv_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_embed_site_id_fkey"
            columns: ["embed_site_id"]
            isOneToOne: false
            referencedRelation: "embed_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "embed_abrechnung_positionen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
        ]
      }
      embed_sites: {
        Row: {
          agb_akzeptiert_am: string | null
          agb_version: string | null
          aktiv: boolean
          anfragen_gesamt: number
          baileys_routing_nummer: string
          brand_accent_override: string | null
          brand_logo_url_override: string | null
          brand_primary_override: string | null
          brand_secondary_override: string | null
          cc_email: string | null
          einzelpreis_eur: number
          empfaenger_email: string
          erlaubte_domains: string[]
          erstellt_am: string
          funnel_modus: string
          id: string
          inhaber_profile_id: string
          letzte_anfrage_am: string | null
          max_anfragen_pro_h: number
          name: string
          paused_grund: string | null
          slug: string
          sv_id: string | null
          sv_telefon: string | null
          tracking_ga4_measurement_id: string | null
          tracking_gads_conversion_id: string | null
          tracking_gads_conversion_label: string | null
          tracking_gads_customer_id: string | null
          tracking_webhook_last_at: string | null
          tracking_webhook_last_error: string | null
          tracking_webhook_last_status: string | null
          tracking_webhook_secret: string | null
          tracking_webhook_url: string | null
          updated_at: string
          variante: string
        }
        Insert: {
          agb_akzeptiert_am?: string | null
          agb_version?: string | null
          aktiv?: boolean
          anfragen_gesamt?: number
          baileys_routing_nummer: string
          brand_accent_override?: string | null
          brand_logo_url_override?: string | null
          brand_primary_override?: string | null
          brand_secondary_override?: string | null
          cc_email?: string | null
          einzelpreis_eur?: number
          empfaenger_email?: string
          erlaubte_domains?: string[]
          erstellt_am?: string
          funnel_modus?: string
          id?: string
          inhaber_profile_id: string
          letzte_anfrage_am?: string | null
          max_anfragen_pro_h?: number
          name: string
          paused_grund?: string | null
          slug: string
          sv_id?: string | null
          sv_telefon?: string | null
          tracking_ga4_measurement_id?: string | null
          tracking_gads_conversion_id?: string | null
          tracking_gads_conversion_label?: string | null
          tracking_gads_customer_id?: string | null
          tracking_webhook_last_at?: string | null
          tracking_webhook_last_error?: string | null
          tracking_webhook_last_status?: string | null
          tracking_webhook_secret?: string | null
          tracking_webhook_url?: string | null
          updated_at?: string
          variante?: string
        }
        Update: {
          agb_akzeptiert_am?: string | null
          agb_version?: string | null
          aktiv?: boolean
          anfragen_gesamt?: number
          baileys_routing_nummer?: string
          brand_accent_override?: string | null
          brand_logo_url_override?: string | null
          brand_primary_override?: string | null
          brand_secondary_override?: string | null
          cc_email?: string | null
          einzelpreis_eur?: number
          empfaenger_email?: string
          erlaubte_domains?: string[]
          erstellt_am?: string
          funnel_modus?: string
          id?: string
          inhaber_profile_id?: string
          letzte_anfrage_am?: string | null
          max_anfragen_pro_h?: number
          name?: string
          paused_grund?: string | null
          slug?: string
          sv_id?: string | null
          sv_telefon?: string | null
          tracking_ga4_measurement_id?: string | null
          tracking_gads_conversion_id?: string | null
          tracking_gads_conversion_label?: string | null
          tracking_gads_customer_id?: string | null
          tracking_webhook_last_at?: string | null
          tracking_webhook_last_error?: string | null
          tracking_webhook_last_status?: string | null
          tracking_webhook_secret?: string | null
          tracking_webhook_url?: string | null
          updated_at?: string
          variante?: string
        }
        Relationships: [
          {
            foreignKeyName: "embed_sites_inhaber_profile_id_fkey"
            columns: ["inhaber_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_sites_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_sites_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      faelle_claim_bridge: {
        Row: {
          claim_id: string
          created_at: string
          fall_created_at: string | null
          fall_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          fall_created_at?: string | null
          fall_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          fall_created_at?: string | null
          fall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fk_bridge_claim"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      fahrzeugklassen: {
        Row: {
          bezeichnung: string
          eu_klasse: string
          reparatur_gruppe: string
          sortierung: number
        }
        Insert: {
          bezeichnung: string
          eu_klasse: string
          reparatur_gruppe: string
          sortierung?: number
        }
        Update: {
          bezeichnung?: string
          eu_klasse?: string
          reparatur_gruppe?: string
          sortierung?: number
        }
        Relationships: []
      }
      failed_async_operations: {
        Row: {
          attempts: number
          created_at: string
          dedup_key: string
          entity_id: string | null
          entity_type: string | null
          escalate_after: string
          escalated_at: string | null
          id: string
          last_error: string | null
          operation_type: string
          payload: Json
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedup_key: string
          entity_id?: string | null
          entity_type?: string | null
          escalate_after?: string
          escalated_at?: string | null
          id?: string
          last_error?: string | null
          operation_type: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedup_key?: string
          entity_id?: string | null
          entity_type?: string | null
          escalate_after?: string
          escalated_at?: string | null
          id?: string
          last_error?: string | null
          operation_type?: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fall_dokumente: {
        Row: {
          ab_phase: string | null
          abgelehnt_am: string | null
          beschreibung: string | null
          claim_id: string
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
          kb_gesehen_am: string | null
          lead_id: string | null
          mime_type: string | null
          ocr_extracted_data: Json | null
          ocr_processed_at: string | null
          ocr_result: Json | null
          ocr_status: string | null
          original_filename: string | null
          pflichtdokument_id: string | null
          position_id: string | null
          quelle: string | null
          schaden_position: string | null
          sichtbar_fuer: string[] | null
          storage_path: string
          uploaded_by_kunde: boolean | null
          uploaded_by_sv: boolean | null
          zurueckweisung_kommentar: string | null
        }
        Insert: {
          ab_phase?: string | null
          abgelehnt_am?: string | null
          beschreibung?: string | null
          claim_id: string
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
          kb_gesehen_am?: string | null
          lead_id?: string | null
          mime_type?: string | null
          ocr_extracted_data?: Json | null
          ocr_processed_at?: string | null
          ocr_result?: Json | null
          ocr_status?: string | null
          original_filename?: string | null
          pflichtdokument_id?: string | null
          position_id?: string | null
          quelle?: string | null
          schaden_position?: string | null
          sichtbar_fuer?: string[] | null
          storage_path: string
          uploaded_by_kunde?: boolean | null
          uploaded_by_sv?: boolean | null
          zurueckweisung_kommentar?: string | null
        }
        Update: {
          ab_phase?: string | null
          abgelehnt_am?: string | null
          beschreibung?: string | null
          claim_id?: string
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
          kb_gesehen_am?: string | null
          lead_id?: string | null
          mime_type?: string | null
          ocr_extracted_data?: Json | null
          ocr_processed_at?: string | null
          ocr_result?: Json | null
          ocr_status?: string | null
          original_filename?: string | null
          pflichtdokument_id?: string | null
          position_id?: string | null
          quelle?: string | null
          schaden_position?: string | null
          sichtbar_fuer?: string[] | null
          storage_path?: string
          uploaded_by_kunde?: boolean | null
          uploaded_by_sv?: boolean | null
          zurueckweisung_kommentar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_dokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_hochgeladen_von_user_id_fkey"
            columns: ["hochgeladen_von_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "fall_dokumente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "fall_dokumente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_pflichtdokument_id_fkey"
            columns: ["pflichtdokument_id"]
            isOneToOne: false
            referencedRelation: "pflichtdokumente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_dokumente_pflichtdokument_id_fkey"
            columns: ["pflichtdokument_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["pflicht_row_id"]
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
          claim_id: string | null
          fall_id: string
          last_read_chat_at: string
          last_read_update_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claim_id?: string | null
          fall_id: string
          last_read_chat_at?: string
          last_read_update_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claim_id?: string | null
          fall_id?: string
          last_read_chat_at?: string
          last_read_update_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "fall_read_state_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          claim_id: string | null
          completion_tokens: number | null
          empfohlene_naechste_schritte: string | null
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
          claim_id?: string | null
          completion_tokens?: number | null
          empfohlene_naechste_schritte?: string | null
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
          claim_id?: string | null
          completion_tokens?: number | null
          empfohlene_naechste_schritte?: string | null
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
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "fall_summaries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
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
          google_ads_cpl_eur: number | null
          google_ads_kosten_eur: number | null
          google_ads_leads: number | null
          google_ads_sync_am: string | null
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
          google_ads_cpl_eur?: number | null
          google_ads_kosten_eur?: number | null
          google_ads_leads?: number | null
          google_ads_sync_am?: string | null
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
          google_ads_cpl_eur?: number | null
          google_ads_kosten_eur?: number | null
          google_ads_leads?: number | null
          google_ads_sync_am?: string | null
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
      firmen: {
        Row: {
          adresse_land: string | null
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          anonymisiert_am: string | null
          ansprechpartner_person_id: string | null
          created_at: string
          email: string | null
          handelsregister: string | null
          id: string
          ist_anonymisiert: boolean
          ist_kleinunternehmer: boolean | null
          name: string
          normalized_name: string | null
          notiz: string | null
          organisation_id: string | null
          quelle: string | null
          rechtsform: string | null
          steuernummer: string | null
          telefon: string | null
          updated_at: string
          ust_id: string | null
          webseite: string | null
        }
        Insert: {
          adresse_land?: string | null
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          anonymisiert_am?: string | null
          ansprechpartner_person_id?: string | null
          created_at?: string
          email?: string | null
          handelsregister?: string | null
          id?: string
          ist_anonymisiert?: boolean
          ist_kleinunternehmer?: boolean | null
          name: string
          normalized_name?: string | null
          notiz?: string | null
          organisation_id?: string | null
          quelle?: string | null
          rechtsform?: string | null
          steuernummer?: string | null
          telefon?: string | null
          updated_at?: string
          ust_id?: string | null
          webseite?: string | null
        }
        Update: {
          adresse_land?: string | null
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          anonymisiert_am?: string | null
          ansprechpartner_person_id?: string | null
          created_at?: string
          email?: string | null
          handelsregister?: string | null
          id?: string
          ist_anonymisiert?: boolean
          ist_kleinunternehmer?: boolean | null
          name?: string
          normalized_name?: string | null
          notiz?: string | null
          organisation_id?: string | null
          quelle?: string | null
          rechtsform?: string | null
          steuernummer?: string | null
          telefon?: string | null
          updated_at?: string
          ust_id?: string | null
          webseite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firmen_ansprechpartner_person_id_fkey"
            columns: ["ansprechpartner_person_id"]
            isOneToOne: false
            referencedRelation: "personen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firmen_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisationen"
            referencedColumns: ["id"]
          },
        ]
      }
      firmen_flotten_konten: {
        Row: {
          aktiviert_am: string
          aktiviert_von: string | null
          created_at: string
          firma_id: string
          id: string
          status: string
          user_id: string
          whatsapp_nummer: string | null
        }
        Insert: {
          aktiviert_am?: string
          aktiviert_von?: string | null
          created_at?: string
          firma_id: string
          id?: string
          status?: string
          user_id: string
          whatsapp_nummer?: string | null
        }
        Update: {
          aktiviert_am?: string
          aktiviert_von?: string | null
          created_at?: string
          firma_id?: string
          id?: string
          status?: string
          user_id?: string
          whatsapp_nummer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firmen_flotten_konten_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
        ]
      }
      flotten_fahrzeuge: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          firma_id: string
          id: string
          notiz: string | null
          vehicle_id: string
        }
        Insert: {
          added_by_user_id?: string | null
          created_at?: string
          firma_id: string
          id?: string
          notiz?: string | null
          vehicle_id: string
        }
        Update: {
          added_by_user_id?: string | null
          created_at?: string
          firma_id?: string
          id?: string
          notiz?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flotten_fahrzeuge_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flotten_fahrzeuge_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_links: {
        Row: {
          abgeschlossen_am: string | null
          claim_id: string | null
          erstellt_am: string
          expires_at: string | null
          fall_id: string | null
          geoeffnet_am: string | null
          gesendet_am: string | null
          gesendet_anzahl: number
          gesendet_kanal: string | null
          id: string
          lead_id: string
          service_typ: string | null
          sprache: string | null
          status: string
          token: string
        }
        Insert: {
          abgeschlossen_am?: string | null
          claim_id?: string | null
          erstellt_am?: string
          expires_at?: string | null
          fall_id?: string | null
          geoeffnet_am?: string | null
          gesendet_am?: string | null
          gesendet_anzahl?: number
          gesendet_kanal?: string | null
          id?: string
          lead_id: string
          service_typ?: string | null
          sprache?: string | null
          status?: string
          token?: string
        }
        Update: {
          abgeschlossen_am?: string | null
          claim_id?: string | null
          erstellt_am?: string
          expires_at?: string | null
          fall_id?: string | null
          geoeffnet_am?: string | null
          gesendet_am?: string | null
          gesendet_anzahl?: number
          gesendet_kanal?: string | null
          id?: string
          lead_id?: string
          service_typ?: string | null
          sprache?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "flow_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "flow_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_szenarien: {
        Row: {
          aktiv: boolean
          aktualisiert_am: string
          bezeichnung: string
          eigene_versicherung: string | null
          erstellt_am: string
          feststellung_zweig: string
          id: string
          prioritaet: number
          schuldfrage: string | null
          service_typ: string | null
        }
        Insert: {
          aktiv?: boolean
          aktualisiert_am?: string
          bezeichnung: string
          eigene_versicherung?: string | null
          erstellt_am?: string
          feststellung_zweig?: string
          id: string
          prioritaet?: number
          schuldfrage?: string | null
          service_typ?: string | null
        }
        Update: {
          aktiv?: boolean
          aktualisiert_am?: string
          bezeichnung?: string
          eigene_versicherung?: string | null
          erstellt_am?: string
          feststellung_zweig?: string
          id?: string
          prioritaet?: number
          schuldfrage?: string | null
          service_typ?: string | null
        }
        Relationships: []
      }
      flow_szenario_steps: {
        Row: {
          aktiv: boolean
          bedingung: Json | null
          erhebt_felder: string[]
          erstellt_am: string
          id: string
          reihenfolge: number
          step_id: string
          szenario_id: string
        }
        Insert: {
          aktiv?: boolean
          bedingung?: Json | null
          erhebt_felder?: string[]
          erstellt_am?: string
          id?: string
          reihenfolge: number
          step_id: string
          szenario_id: string
        }
        Update: {
          aktiv?: boolean
          bedingung?: Json | null
          erhebt_felder?: string[]
          erstellt_am?: string
          id?: string
          reihenfolge?: number
          step_id?: string
          szenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_szenario_steps_szenario_id_fkey"
            columns: ["szenario_id"]
            isOneToOne: false
            referencedRelation: "flow_szenarien"
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
          dokument_id?: string | null
          erstellt_am?: string | null
          fall_id?: string
          id?: string
          quelle?: string | null
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "forderungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
      gfa_rate_limit: {
        Row: {
          created_at: string
          id: number
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: number
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: number
          ip_hash?: string
        }
        Relationships: []
      }
      google_bewertungen_cache: {
        Row: {
          anzahl_bewertungen: number | null
          created_at: string
          durchschnitt: number | null
          id: string
          photo_reference: string | null
          profile_id: string
          zuletzt_aktualisiert_am: string
        }
        Insert: {
          anzahl_bewertungen?: number | null
          created_at?: string
          durchschnitt?: number | null
          id?: string
          photo_reference?: string | null
          profile_id: string
          zuletzt_aktualisiert_am?: string
        }
        Update: {
          anzahl_bewertungen?: number | null
          created_at?: string
          durchschnitt?: number | null
          id?: string
          photo_reference?: string | null
          profile_id?: string
          zuletzt_aktualisiert_am?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_bewertungen_cache_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachten: {
        Row: {
          auftragsnummer: string | null
          bericht_pdf_url: string | null
          besichtigt_am: string | null
          besichtigungstermin: string | null
          claim_id: string
          created_at: string
          created_by_user_id: string | null
          editable_for_kb: boolean
          editable_for_sv: boolean
          felder_quelle_jsonb: Json | null
          fertiggestellt_am: string | null
          gesamt_schadensbetrag: number | null
          gutachten_datum: string | null
          gutachten_erstzulassung: string | null
          gutachten_fahrzeug_typ: string | null
          gutachten_farbcode: string | null
          gutachten_farbe: string | null
          gutachten_fin: string | null
          gutachten_kalkulationssystem: string | null
          gutachten_karosseriezustand: string | null
          gutachten_kennzeichen: string | null
          gutachten_kraftstoff: string | null
          gutachten_lackmaterial_eur: number | null
          gutachten_lackmesswert_max_my: number | null
          gutachten_laufleistung_km: number | null
          gutachten_lohnsatz_ak_eur: number | null
          gutachten_lohnsatz_kar_eur: number | null
          gutachten_lohnsatz_lack_eur: number | null
          gutachten_materialkosten_eur: number | null
          gutachten_mietwagen_klasse: string | null
          gutachten_mietwagen_tagessatz_eur: number | null
          gutachten_nutzungsausfall_tagessatz_eur: number | null
          gutachten_ocr_error: string | null
          gutachten_ocr_manuell_ueberschrieben: boolean
          gutachten_ocr_processed_at: string | null
          gutachten_ocr_raw: Json | null
          gutachten_seitenzahl: number | null
          gutachten_sv_honorar_brutto: number | null
          gutachten_sv_honorar_netto: number | null
          gutachten_tuv_bis: string | null
          gutachten_verbringung_eur: number | null
          gutachten_vorschaeden_text: string | null
          gutachten_zeit_ak_std: number | null
          gutachten_zeit_kar_std: number | null
          gutachten_zeit_lack_std: number | null
          gutachter_anbieter: string | null
          id: string
          ki_geschaetzte_kosten_max: number | null
          ki_geschaetzte_kosten_min: number | null
          ki_kalkulation: Json | null
          ki_kalkulation_am: string | null
          minderwert: number | null
          notiz: string | null
          nutzungsausfall_tage: number | null
          ocr_confidence: number | null
          ocr_engine: string | null
          ocr_engine_version: string | null
          ocr_error_jsonb: Json | null
          ocr_finished_at: string | null
          ocr_run_id: string | null
          ocr_started_at: string | null
          ocr_status: string
          pdf_size_bytes: number | null
          pdf_uploaded_at: string | null
          pdf_uploaded_by_user_id: string | null
          positionen: Json | null
          reparaturkosten_brutto: number | null
          reparaturkosten_netto: number | null
          restwert: number | null
          status: string
          sv_id: string
          totalschaden: boolean | null
          unterschrieben_am: string | null
          unterschrift_sv_url: string | null
          updated_at: string
          wiederbeschaffungsdauer_tage: number | null
          wiederbeschaffungswert: number | null
        }
        Insert: {
          auftragsnummer?: string | null
          bericht_pdf_url?: string | null
          besichtigt_am?: string | null
          besichtigungstermin?: string | null
          claim_id: string
          created_at?: string
          created_by_user_id?: string | null
          editable_for_kb?: boolean
          editable_for_sv?: boolean
          felder_quelle_jsonb?: Json | null
          fertiggestellt_am?: string | null
          gesamt_schadensbetrag?: number | null
          gutachten_datum?: string | null
          gutachten_erstzulassung?: string | null
          gutachten_fahrzeug_typ?: string | null
          gutachten_farbcode?: string | null
          gutachten_farbe?: string | null
          gutachten_fin?: string | null
          gutachten_kalkulationssystem?: string | null
          gutachten_karosseriezustand?: string | null
          gutachten_kennzeichen?: string | null
          gutachten_kraftstoff?: string | null
          gutachten_lackmaterial_eur?: number | null
          gutachten_lackmesswert_max_my?: number | null
          gutachten_laufleistung_km?: number | null
          gutachten_lohnsatz_ak_eur?: number | null
          gutachten_lohnsatz_kar_eur?: number | null
          gutachten_lohnsatz_lack_eur?: number | null
          gutachten_materialkosten_eur?: number | null
          gutachten_mietwagen_klasse?: string | null
          gutachten_mietwagen_tagessatz_eur?: number | null
          gutachten_nutzungsausfall_tagessatz_eur?: number | null
          gutachten_ocr_error?: string | null
          gutachten_ocr_manuell_ueberschrieben?: boolean
          gutachten_ocr_processed_at?: string | null
          gutachten_ocr_raw?: Json | null
          gutachten_seitenzahl?: number | null
          gutachten_sv_honorar_brutto?: number | null
          gutachten_sv_honorar_netto?: number | null
          gutachten_tuv_bis?: string | null
          gutachten_verbringung_eur?: number | null
          gutachten_vorschaeden_text?: string | null
          gutachten_zeit_ak_std?: number | null
          gutachten_zeit_kar_std?: number | null
          gutachten_zeit_lack_std?: number | null
          gutachter_anbieter?: string | null
          id?: string
          ki_geschaetzte_kosten_max?: number | null
          ki_geschaetzte_kosten_min?: number | null
          ki_kalkulation?: Json | null
          ki_kalkulation_am?: string | null
          minderwert?: number | null
          notiz?: string | null
          nutzungsausfall_tage?: number | null
          ocr_confidence?: number | null
          ocr_engine?: string | null
          ocr_engine_version?: string | null
          ocr_error_jsonb?: Json | null
          ocr_finished_at?: string | null
          ocr_run_id?: string | null
          ocr_started_at?: string | null
          ocr_status?: string
          pdf_size_bytes?: number | null
          pdf_uploaded_at?: string | null
          pdf_uploaded_by_user_id?: string | null
          positionen?: Json | null
          reparaturkosten_brutto?: number | null
          reparaturkosten_netto?: number | null
          restwert?: number | null
          status?: string
          sv_id: string
          totalschaden?: boolean | null
          unterschrieben_am?: string | null
          unterschrift_sv_url?: string | null
          updated_at?: string
          wiederbeschaffungsdauer_tage?: number | null
          wiederbeschaffungswert?: number | null
        }
        Update: {
          auftragsnummer?: string | null
          bericht_pdf_url?: string | null
          besichtigt_am?: string | null
          besichtigungstermin?: string | null
          claim_id?: string
          created_at?: string
          created_by_user_id?: string | null
          editable_for_kb?: boolean
          editable_for_sv?: boolean
          felder_quelle_jsonb?: Json | null
          fertiggestellt_am?: string | null
          gesamt_schadensbetrag?: number | null
          gutachten_datum?: string | null
          gutachten_erstzulassung?: string | null
          gutachten_fahrzeug_typ?: string | null
          gutachten_farbcode?: string | null
          gutachten_farbe?: string | null
          gutachten_fin?: string | null
          gutachten_kalkulationssystem?: string | null
          gutachten_karosseriezustand?: string | null
          gutachten_kennzeichen?: string | null
          gutachten_kraftstoff?: string | null
          gutachten_lackmaterial_eur?: number | null
          gutachten_lackmesswert_max_my?: number | null
          gutachten_laufleistung_km?: number | null
          gutachten_lohnsatz_ak_eur?: number | null
          gutachten_lohnsatz_kar_eur?: number | null
          gutachten_lohnsatz_lack_eur?: number | null
          gutachten_materialkosten_eur?: number | null
          gutachten_mietwagen_klasse?: string | null
          gutachten_mietwagen_tagessatz_eur?: number | null
          gutachten_nutzungsausfall_tagessatz_eur?: number | null
          gutachten_ocr_error?: string | null
          gutachten_ocr_manuell_ueberschrieben?: boolean
          gutachten_ocr_processed_at?: string | null
          gutachten_ocr_raw?: Json | null
          gutachten_seitenzahl?: number | null
          gutachten_sv_honorar_brutto?: number | null
          gutachten_sv_honorar_netto?: number | null
          gutachten_tuv_bis?: string | null
          gutachten_verbringung_eur?: number | null
          gutachten_vorschaeden_text?: string | null
          gutachten_zeit_ak_std?: number | null
          gutachten_zeit_kar_std?: number | null
          gutachten_zeit_lack_std?: number | null
          gutachter_anbieter?: string | null
          id?: string
          ki_geschaetzte_kosten_max?: number | null
          ki_geschaetzte_kosten_min?: number | null
          ki_kalkulation?: Json | null
          ki_kalkulation_am?: string | null
          minderwert?: number | null
          notiz?: string | null
          nutzungsausfall_tage?: number | null
          ocr_confidence?: number | null
          ocr_engine?: string | null
          ocr_engine_version?: string | null
          ocr_error_jsonb?: Json | null
          ocr_finished_at?: string | null
          ocr_run_id?: string | null
          ocr_started_at?: string | null
          ocr_status?: string
          pdf_size_bytes?: number | null
          pdf_uploaded_at?: string | null
          pdf_uploaded_by_user_id?: string | null
          positionen?: Json | null
          reparaturkosten_brutto?: number | null
          reparaturkosten_netto?: number | null
          restwert?: number | null
          status?: string
          sv_id?: string
          totalschaden?: boolean | null
          unterschrieben_am?: string | null
          unterschrift_sv_url?: string | null
          updated_at?: string
          wiederbeschaffungsdauer_tage?: number | null
          wiederbeschaffungswert?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_gutachten_ocr_run"
            columns: ["ocr_run_id"]
            isOneToOne: false
            referencedRelation: "ocr_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_pdf_uploaded_by_user_id_fkey"
            columns: ["pdf_uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachten_fotos: {
        Row: {
          aufnahme_zeitpunkt: string | null
          beschreibung: string | null
          claim_id: string
          created_at: string
          exif_processed: boolean
          file_size_bytes: number | null
          gutachten_id: string
          id: string
          kategorie: string | null
          mime_type: string | null
          original_filename: string | null
          position_nr: number | null
          storage_path: string
          upload_quelle: string
          uploaded_by: string | null
        }
        Insert: {
          aufnahme_zeitpunkt?: string | null
          beschreibung?: string | null
          claim_id: string
          created_at?: string
          exif_processed?: boolean
          file_size_bytes?: number | null
          gutachten_id: string
          id?: string
          kategorie?: string | null
          mime_type?: string | null
          original_filename?: string | null
          position_nr?: number | null
          storage_path: string
          upload_quelle: string
          uploaded_by?: string | null
        }
        Update: {
          aufnahme_zeitpunkt?: string | null
          beschreibung?: string | null
          claim_id?: string
          created_at?: string
          exif_processed?: boolean
          file_size_bytes?: number | null
          gutachten_id?: string
          id?: string
          kategorie?: string | null
          mime_type?: string | null
          original_filename?: string | null
          position_nr?: number | null
          storage_path?: string
          upload_quelle?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "gutachten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_fotos_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["gutachten_id"]
          },
          {
            foreignKeyName: "gutachten_fotos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachten_positionen: {
        Row: {
          arbeitszeit_aw: number | null
          bezeichnung: string
          claim_id: string
          created_at: string
          ersatzteil_nr: string | null
          gutachten_id: string
          id: string
          kategorie: string | null
          mwst_satz: number | null
          position_nr: number
          reparaturart: string | null
          schadensbetrag_brutto: number | null
          schadensbetrag_netto: number | null
          updated_at: string
        }
        Insert: {
          arbeitszeit_aw?: number | null
          bezeichnung: string
          claim_id: string
          created_at?: string
          ersatzteil_nr?: string | null
          gutachten_id: string
          id?: string
          kategorie?: string | null
          mwst_satz?: number | null
          position_nr: number
          reparaturart?: string | null
          schadensbetrag_brutto?: number | null
          schadensbetrag_netto?: number | null
          updated_at?: string
        }
        Update: {
          arbeitszeit_aw?: number | null
          bezeichnung?: string
          claim_id?: string
          created_at?: string
          ersatzteil_nr?: string | null
          gutachten_id?: string
          id?: string
          kategorie?: string | null
          mwst_satz?: number | null
          position_nr?: number
          reparaturart?: string | null
          schadensbetrag_brutto?: number | null
          schadensbetrag_netto?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachten_positionen_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "gutachten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_positionen_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["gutachten_id"]
          },
        ]
      }
      gutachter_abrechnungspositionen: {
        Row: {
          abrechnung_id: string | null
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_abrechnungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "gutachter_einzahlungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      gutachter_finder_anfragen: {
        Row: {
          abbruch_phase: string | null
          abgebrochen_am: string | null
          abgerechnet_am: string | null
          abrechnung_id: string | null
          abrechnung_storniert_am: string | null
          abrechnung_storno_durch_user_id: string | null
          abrechnung_storno_grund: string | null
          abrechnung_sv_id: string | null
          abrechnungs_betrag_eur: number | null
          abrechnungs_relevant: boolean
          abrechnungsweg: string | null
          am_unfallort_flag: boolean | null
          anliegen: string | null
          aufgenommen_am: string | null
          aufnahme_fotos: Json | null
          besichtigungsort_adresse: string | null
          bestaetigung_gesendet_am: string | null
          bevorzugter_kanal: string | null
          bewertungsgrund: string | null
          billing_review_erstellt_am: string | null
          billing_review_grund: string | null
          billing_review_status: string | null
          cluster: string | null
          dsgvo_zustimmung_am: string | null
          email: string
          embed_site_id: string | null
          erstellt_am: string
          erstzulassung: string | null
          fahrzeug_baujahr: number | null
          fahrzeug_beschreibung: string | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeugtyp: string | null
          fall_id: string | null
          fin_vin: string | null
          ga_client_id: string | null
          gclid: string | null
          halter_nachname: string | null
          halter_plz: string | null
          halter_stadt: string | null
          halter_strasse: string | null
          halter_vorname: string | null
          hsn: string | null
          id: string
          imagin_url: string | null
          kanzlei_wunsch: string | null
          kennzeichen: string | null
          konvertiert_am: string | null
          konvertiert_zu_fall_id: string | null
          konvertiert_zu_lead_id: string | null
          konvertiert_zu_user_id: string | null
          konvertierung_fehler: string | null
          kostenvoranschlag_brutto: number | null
          kostenvoranschlag_netto: number | null
          magic_link_gesendet_am: string | null
          matching_typ: string | null
          nachname: string
          ocr_extrahiert_am: string | null
          ocr_rohdaten: Json | null
          origin_domain: string | null
          page_url: string | null
          regulierungs_modus: string | null
          reservierter_slot_bis: string | null
          reservierter_slot_von: string | null
          reservierter_sv_id: string | null
          sa_signatur_data_url: string | null
          sa_unterzeichnet_am: string | null
          schadenort: string | null
          schadenort_lat: number | null
          schadenort_lng: number | null
          schadens_kurzbeschreibung: string | null
          schadentyp: string
          schaetzung_session_id: string | null
          schuld_einschaetzung: string | null
          schuldfrage: string | null
          source: string | null
          stadt_slug: string | null
          status: string
          telefon: string | null
          termin_id: string | null
          tsn: string | null
          unfalltyp: string | null
          unterschrift_data_url: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variante: string | null
          vorname: string
          vorschaden_check_payload: Json | null
          vorschaden_check_status: string | null
          werkstatt_id: string | null
          whatsapp_geprueft_am: string | null
          whatsapp_verfuegbar: boolean | null
          wunsch_tag: string | null
          wunsch_zeit: string | null
          wunschtermin: string | null
          wunschtermin_wann: string | null
          zugeordneter_sv_id: string | null
          zugeordneter_sv_lead_id: string | null
        }
        Insert: {
          abbruch_phase?: string | null
          abgebrochen_am?: string | null
          abgerechnet_am?: string | null
          abrechnung_id?: string | null
          abrechnung_storniert_am?: string | null
          abrechnung_storno_durch_user_id?: string | null
          abrechnung_storno_grund?: string | null
          abrechnung_sv_id?: string | null
          abrechnungs_betrag_eur?: number | null
          abrechnungs_relevant?: boolean
          abrechnungsweg?: string | null
          am_unfallort_flag?: boolean | null
          anliegen?: string | null
          aufgenommen_am?: string | null
          aufnahme_fotos?: Json | null
          besichtigungsort_adresse?: string | null
          bestaetigung_gesendet_am?: string | null
          bevorzugter_kanal?: string | null
          bewertungsgrund?: string | null
          billing_review_erstellt_am?: string | null
          billing_review_grund?: string | null
          billing_review_status?: string | null
          cluster?: string | null
          dsgvo_zustimmung_am?: string | null
          email: string
          embed_site_id?: string | null
          erstellt_am?: string
          erstzulassung?: string | null
          fahrzeug_baujahr?: number | null
          fahrzeug_beschreibung?: string | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeug_farbe?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeugtyp?: string | null
          fall_id?: string | null
          fin_vin?: string | null
          ga_client_id?: string | null
          gclid?: string | null
          halter_nachname?: string | null
          halter_plz?: string | null
          halter_stadt?: string | null
          halter_strasse?: string | null
          halter_vorname?: string | null
          hsn?: string | null
          id?: string
          imagin_url?: string | null
          kanzlei_wunsch?: string | null
          kennzeichen?: string | null
          konvertiert_am?: string | null
          konvertiert_zu_fall_id?: string | null
          konvertiert_zu_lead_id?: string | null
          konvertiert_zu_user_id?: string | null
          konvertierung_fehler?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          magic_link_gesendet_am?: string | null
          matching_typ?: string | null
          nachname: string
          ocr_extrahiert_am?: string | null
          ocr_rohdaten?: Json | null
          origin_domain?: string | null
          page_url?: string | null
          regulierungs_modus?: string | null
          reservierter_slot_bis?: string | null
          reservierter_slot_von?: string | null
          reservierter_sv_id?: string | null
          sa_signatur_data_url?: string | null
          sa_unterzeichnet_am?: string | null
          schadenort?: string | null
          schadenort_lat?: number | null
          schadenort_lng?: number | null
          schadens_kurzbeschreibung?: string | null
          schadentyp: string
          schaetzung_session_id?: string | null
          schuld_einschaetzung?: string | null
          schuldfrage?: string | null
          source?: string | null
          stadt_slug?: string | null
          status?: string
          telefon?: string | null
          termin_id?: string | null
          tsn?: string | null
          unfalltyp?: string | null
          unterschrift_data_url?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variante?: string | null
          vorname: string
          vorschaden_check_payload?: Json | null
          vorschaden_check_status?: string | null
          werkstatt_id?: string | null
          whatsapp_geprueft_am?: string | null
          whatsapp_verfuegbar?: boolean | null
          wunsch_tag?: string | null
          wunsch_zeit?: string | null
          wunschtermin?: string | null
          wunschtermin_wann?: string | null
          zugeordneter_sv_id?: string | null
          zugeordneter_sv_lead_id?: string | null
        }
        Update: {
          abbruch_phase?: string | null
          abgebrochen_am?: string | null
          abgerechnet_am?: string | null
          abrechnung_id?: string | null
          abrechnung_storniert_am?: string | null
          abrechnung_storno_durch_user_id?: string | null
          abrechnung_storno_grund?: string | null
          abrechnung_sv_id?: string | null
          abrechnungs_betrag_eur?: number | null
          abrechnungs_relevant?: boolean
          abrechnungsweg?: string | null
          am_unfallort_flag?: boolean | null
          anliegen?: string | null
          aufgenommen_am?: string | null
          aufnahme_fotos?: Json | null
          besichtigungsort_adresse?: string | null
          bestaetigung_gesendet_am?: string | null
          bevorzugter_kanal?: string | null
          bewertungsgrund?: string | null
          billing_review_erstellt_am?: string | null
          billing_review_grund?: string | null
          billing_review_status?: string | null
          cluster?: string | null
          dsgvo_zustimmung_am?: string | null
          email?: string
          embed_site_id?: string | null
          erstellt_am?: string
          erstzulassung?: string | null
          fahrzeug_baujahr?: number | null
          fahrzeug_beschreibung?: string | null
          fahrzeug_fahrbereit?: boolean | null
          fahrzeug_farbe?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeugtyp?: string | null
          fall_id?: string | null
          fin_vin?: string | null
          ga_client_id?: string | null
          gclid?: string | null
          halter_nachname?: string | null
          halter_plz?: string | null
          halter_stadt?: string | null
          halter_strasse?: string | null
          halter_vorname?: string | null
          hsn?: string | null
          id?: string
          imagin_url?: string | null
          kanzlei_wunsch?: string | null
          kennzeichen?: string | null
          konvertiert_am?: string | null
          konvertiert_zu_fall_id?: string | null
          konvertiert_zu_lead_id?: string | null
          konvertiert_zu_user_id?: string | null
          konvertierung_fehler?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          magic_link_gesendet_am?: string | null
          matching_typ?: string | null
          nachname?: string
          ocr_extrahiert_am?: string | null
          ocr_rohdaten?: Json | null
          origin_domain?: string | null
          page_url?: string | null
          regulierungs_modus?: string | null
          reservierter_slot_bis?: string | null
          reservierter_slot_von?: string | null
          reservierter_sv_id?: string | null
          sa_signatur_data_url?: string | null
          sa_unterzeichnet_am?: string | null
          schadenort?: string | null
          schadenort_lat?: number | null
          schadenort_lng?: number | null
          schadens_kurzbeschreibung?: string | null
          schadentyp?: string
          schaetzung_session_id?: string | null
          schuld_einschaetzung?: string | null
          schuldfrage?: string | null
          source?: string | null
          stadt_slug?: string | null
          status?: string
          telefon?: string | null
          termin_id?: string | null
          tsn?: string | null
          unfalltyp?: string | null
          unterschrift_data_url?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variante?: string | null
          vorname?: string
          vorschaden_check_payload?: Json | null
          vorschaden_check_status?: string | null
          werkstatt_id?: string | null
          whatsapp_geprueft_am?: string | null
          whatsapp_verfuegbar?: boolean | null
          wunsch_tag?: string | null
          wunsch_zeit?: string | null
          wunschtermin?: string | null
          wunschtermin_wann?: string | null
          zugeordneter_sv_id?: string | null
          zugeordneter_sv_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_finder_anfragen_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_abrechnung_storno_durch_user_id_fkey"
            columns: ["abrechnung_storno_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_abrechnung_sv_id_fkey"
            columns: ["abrechnung_sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_abrechnung_sv_id_fkey"
            columns: ["abrechnung_sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_embed_site_id_fkey"
            columns: ["embed_site_id"]
            isOneToOne: false
            referencedRelation: "embed_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_reservierter_sv_id_fkey"
            columns: ["reservierter_sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_reservierter_sv_id_fkey"
            columns: ["reservierter_sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_schaetzung_session_id_fkey"
            columns: ["schaetzung_session_id"]
            isOneToOne: false
            referencedRelation: "anspruch_schaetzungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_zugeordneter_sv_id_fkey"
            columns: ["zugeordneter_sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_zugeordneter_sv_id_fkey"
            columns: ["zugeordneter_sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_zugeordneter_sv_lead_id_fkey"
            columns: ["zugeordneter_sv_lead_id"]
            isOneToOne: false
            referencedRelation: "sv_leads"
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
          {
            foreignKeyName: "gutachter_monatsabrechnungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
          anlage_benachrichtigt_at: string | null
          assignee_id: string | null
          assignee_typ: string | null
          auftrag_id: string | null
          besichtigung_gestartet_am: string | null
          besichtigungsort_adresse: string | null
          besichtigungsort_bestaetigt_am: string | null
          besichtigungsort_bestaetigt_von: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_notiz: string | null
          besichtigungsort_place_id: string | null
          bezahlt: boolean
          bezug_id: string | null
          bezug_typ: string | null
          caldav_event_uid: string | null
          caldav_object_url: string | null
          caldav_synced_at: string | null
          cancelled_at: string | null
          claim_id: string | null
          created_at: string | null
          durchgefuehrt_am: string | null
          end_zeit: string
          erinnerung_24h_gesendet: boolean | null
          erinnerung_2h_gesendet: boolean | null
          erinnerung_48h_docs_gesendet: boolean | null
          erinnerung_morgen_gesendet: boolean
          externer_kalender_id: string | null
          fall_id: string | null
          final_verbindlich_ab: string | null
          gegenvorschlag_grund: string | null
          gegenvorschlag_von: string | null
          gegenvorschlag_zeit: string | null
          geschaetzte_fahrdistanz_km: number | null
          geschaetzte_fahrtzeit_min: number | null
          gesehen_am: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          google_event_synced_at: string | null
          gps_lat_ankunft: number | null
          gps_lng_ankunft: number | null
          id: string
          kanal: string | null
          kb_id: string | null
          kunde_angekommen_am: string | null
          kunde_eta_letzte_berechnung: string | null
          kunde_eta_minuten: number | null
          kunde_losgefahren_am: string | null
          kunde_response_token: string | null
          kunde_response_token_expires_at: string | null
          kunde_tracking_aktiviert: boolean | null
          kunde_verspaetung_gemeldet_am: string | null
          kunden_tracking_token: string | null
          lead_id: string | null
          losfahren_erinnerung_gesendet: boolean | null
          losgefahren_am: string | null
          ms_event_id: string | null
          nachbesichtigung_angefordert_am: string | null
          nachbesichtigung_ergebnis: string | null
          nachbesichtigung_konfrontation: boolean | null
          nachbesichtigung_kunde_termin_eingereicht_am: string | null
          nachbesichtigung_kunde_termin_vorschlaege: Json | null
          nachbesichtigung_status: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am: string | null
          nachbesichtigung_termin_datum: string | null
          navigation_started_at: string | null
          no_show_gemeldet_am: string | null
          notification_5min_gesendet_am: string | null
          notification_angekommen_gesendet_am: string | null
          notification_losgefahren_gesendet_am: string | null
          notiz_kunde: string | null
          notizen_vor_ort: string | null
          quelle: string | null
          re_termin_eskalation_an_kb_am: string | null
          re_termin_token: string | null
          re_termin_token_eingelaufen_am: string | null
          reminder_15min_sent_at: string | null
          reminder_1h_sent_at: string | null
          reminder_5min_sent_at: string | null
          reminder_sent_at: string | null
          reserviert_bis: string | null
          start_zeit: string
          status: string | null
          sv_ablehnung_am: string | null
          sv_ablehnung_grund: string | null
          sv_angekommen_am: string | null
          sv_eta_letzte_berechnung: string | null
          sv_eta_minuten: number | null
          sv_lead_id: string | null
          sv_no_show_am: string | null
          sv_termin_dokument_reminder_gesendet_am: string | null
          sv_unterwegs_seit: string | null
          sv_vorgeschlagene_slots: Json | null
          termin_erinnerung_5min_gesendet: boolean | null
          typ: string
          uebersprung_grund: string | null
          uebersprungen: boolean | null
          updated_at: string
          verlegung_eskalation_an_kb_an: string | null
          verlegung_grund: string | null
          verlegung_initiator_kunde: boolean
          verlegung_kunde_benachrichtigt_an: string | null
          verlegung_quelle_id: string | null
          verspaetung_minuten: number | null
          video_link: string | null
          vorgeschlagenes_datum: string | null
          wunschtermin: string | null
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
          anlage_benachrichtigt_at?: string | null
          assignee_id?: string | null
          assignee_typ?: string | null
          auftrag_id?: string | null
          besichtigung_gestartet_am?: string | null
          besichtigungsort_adresse?: string | null
          besichtigungsort_bestaetigt_am?: string | null
          besichtigungsort_bestaetigt_von?: string | null
          besichtigungsort_lat?: number | null
          besichtigungsort_lng?: number | null
          besichtigungsort_notiz?: string | null
          besichtigungsort_place_id?: string | null
          bezahlt?: boolean
          bezug_id?: string | null
          bezug_typ?: string | null
          caldav_event_uid?: string | null
          caldav_object_url?: string | null
          caldav_synced_at?: string | null
          cancelled_at?: string | null
          claim_id?: string | null
          created_at?: string | null
          durchgefuehrt_am?: string | null
          end_zeit: string
          erinnerung_24h_gesendet?: boolean | null
          erinnerung_2h_gesendet?: boolean | null
          erinnerung_48h_docs_gesendet?: boolean | null
          erinnerung_morgen_gesendet?: boolean
          externer_kalender_id?: string | null
          fall_id?: string | null
          final_verbindlich_ab?: string | null
          gegenvorschlag_grund?: string | null
          gegenvorschlag_von?: string | null
          gegenvorschlag_zeit?: string | null
          geschaetzte_fahrdistanz_km?: number | null
          geschaetzte_fahrtzeit_min?: number | null
          gesehen_am?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_event_synced_at?: string | null
          gps_lat_ankunft?: number | null
          gps_lng_ankunft?: number | null
          id?: string
          kanal?: string | null
          kb_id?: string | null
          kunde_angekommen_am?: string | null
          kunde_eta_letzte_berechnung?: string | null
          kunde_eta_minuten?: number | null
          kunde_losgefahren_am?: string | null
          kunde_response_token?: string | null
          kunde_response_token_expires_at?: string | null
          kunde_tracking_aktiviert?: boolean | null
          kunde_verspaetung_gemeldet_am?: string | null
          kunden_tracking_token?: string | null
          lead_id?: string | null
          losfahren_erinnerung_gesendet?: boolean | null
          losgefahren_am?: string | null
          ms_event_id?: string | null
          nachbesichtigung_angefordert_am?: string | null
          nachbesichtigung_ergebnis?: string | null
          nachbesichtigung_konfrontation?: boolean | null
          nachbesichtigung_kunde_termin_eingereicht_am?: string | null
          nachbesichtigung_kunde_termin_vorschlaege?: Json | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am?: string | null
          nachbesichtigung_termin_datum?: string | null
          navigation_started_at?: string | null
          no_show_gemeldet_am?: string | null
          notification_5min_gesendet_am?: string | null
          notification_angekommen_gesendet_am?: string | null
          notification_losgefahren_gesendet_am?: string | null
          notiz_kunde?: string | null
          notizen_vor_ort?: string | null
          quelle?: string | null
          re_termin_eskalation_an_kb_am?: string | null
          re_termin_token?: string | null
          re_termin_token_eingelaufen_am?: string | null
          reminder_15min_sent_at?: string | null
          reminder_1h_sent_at?: string | null
          reminder_5min_sent_at?: string | null
          reminder_sent_at?: string | null
          reserviert_bis?: string | null
          start_zeit: string
          status?: string | null
          sv_ablehnung_am?: string | null
          sv_ablehnung_grund?: string | null
          sv_angekommen_am?: string | null
          sv_eta_letzte_berechnung?: string | null
          sv_eta_minuten?: number | null
          sv_lead_id?: string | null
          sv_no_show_am?: string | null
          sv_termin_dokument_reminder_gesendet_am?: string | null
          sv_unterwegs_seit?: string | null
          sv_vorgeschlagene_slots?: Json | null
          termin_erinnerung_5min_gesendet?: boolean | null
          typ?: string
          uebersprung_grund?: string | null
          uebersprungen?: boolean | null
          updated_at?: string
          verlegung_eskalation_an_kb_an?: string | null
          verlegung_grund?: string | null
          verlegung_initiator_kunde?: boolean
          verlegung_kunde_benachrichtigt_an?: string | null
          verlegung_quelle_id?: string | null
          verspaetung_minuten?: number | null
          video_link?: string | null
          vorgeschlagenes_datum?: string | null
          wunschtermin?: string | null
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
          anlage_benachrichtigt_at?: string | null
          assignee_id?: string | null
          assignee_typ?: string | null
          auftrag_id?: string | null
          besichtigung_gestartet_am?: string | null
          besichtigungsort_adresse?: string | null
          besichtigungsort_bestaetigt_am?: string | null
          besichtigungsort_bestaetigt_von?: string | null
          besichtigungsort_lat?: number | null
          besichtigungsort_lng?: number | null
          besichtigungsort_notiz?: string | null
          besichtigungsort_place_id?: string | null
          bezahlt?: boolean
          bezug_id?: string | null
          bezug_typ?: string | null
          caldav_event_uid?: string | null
          caldav_object_url?: string | null
          caldav_synced_at?: string | null
          cancelled_at?: string | null
          claim_id?: string | null
          created_at?: string | null
          durchgefuehrt_am?: string | null
          end_zeit?: string
          erinnerung_24h_gesendet?: boolean | null
          erinnerung_2h_gesendet?: boolean | null
          erinnerung_48h_docs_gesendet?: boolean | null
          erinnerung_morgen_gesendet?: boolean
          externer_kalender_id?: string | null
          fall_id?: string | null
          final_verbindlich_ab?: string | null
          gegenvorschlag_grund?: string | null
          gegenvorschlag_von?: string | null
          gegenvorschlag_zeit?: string | null
          geschaetzte_fahrdistanz_km?: number | null
          geschaetzte_fahrtzeit_min?: number | null
          gesehen_am?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_event_synced_at?: string | null
          gps_lat_ankunft?: number | null
          gps_lng_ankunft?: number | null
          id?: string
          kanal?: string | null
          kb_id?: string | null
          kunde_angekommen_am?: string | null
          kunde_eta_letzte_berechnung?: string | null
          kunde_eta_minuten?: number | null
          kunde_losgefahren_am?: string | null
          kunde_response_token?: string | null
          kunde_response_token_expires_at?: string | null
          kunde_tracking_aktiviert?: boolean | null
          kunde_verspaetung_gemeldet_am?: string | null
          kunden_tracking_token?: string | null
          lead_id?: string | null
          losfahren_erinnerung_gesendet?: boolean | null
          losgefahren_am?: string | null
          ms_event_id?: string | null
          nachbesichtigung_angefordert_am?: string | null
          nachbesichtigung_ergebnis?: string | null
          nachbesichtigung_konfrontation?: boolean | null
          nachbesichtigung_kunde_termin_eingereicht_am?: string | null
          nachbesichtigung_kunde_termin_vorschlaege?: Json | null
          nachbesichtigung_status?: string | null
          nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
          nachbesichtigung_sv_termin_vereinbart_am?: string | null
          nachbesichtigung_termin_datum?: string | null
          navigation_started_at?: string | null
          no_show_gemeldet_am?: string | null
          notification_5min_gesendet_am?: string | null
          notification_angekommen_gesendet_am?: string | null
          notification_losgefahren_gesendet_am?: string | null
          notiz_kunde?: string | null
          notizen_vor_ort?: string | null
          quelle?: string | null
          re_termin_eskalation_an_kb_am?: string | null
          re_termin_token?: string | null
          re_termin_token_eingelaufen_am?: string | null
          reminder_15min_sent_at?: string | null
          reminder_1h_sent_at?: string | null
          reminder_5min_sent_at?: string | null
          reminder_sent_at?: string | null
          reserviert_bis?: string | null
          start_zeit?: string
          status?: string | null
          sv_ablehnung_am?: string | null
          sv_ablehnung_grund?: string | null
          sv_angekommen_am?: string | null
          sv_eta_letzte_berechnung?: string | null
          sv_eta_minuten?: number | null
          sv_lead_id?: string | null
          sv_no_show_am?: string | null
          sv_termin_dokument_reminder_gesendet_am?: string | null
          sv_unterwegs_seit?: string | null
          sv_vorgeschlagene_slots?: Json | null
          termin_erinnerung_5min_gesendet?: boolean | null
          typ?: string
          uebersprung_grund?: string | null
          uebersprungen?: boolean | null
          updated_at?: string
          verlegung_eskalation_an_kb_an?: string | null
          verlegung_grund?: string | null
          verlegung_initiator_kunde?: boolean
          verlegung_kunde_benachrichtigt_an?: string | null
          verlegung_quelle_id?: string | null
          verspaetung_minuten?: number | null
          video_link?: string | null
          vorgeschlagenes_datum?: string | null
          wunschtermin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_termine_auftrag_id_fkey"
            columns: ["auftrag_id"]
            isOneToOne: false
            referencedRelation: "auftraege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutachter_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
            foreignKeyName: "gutachter_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "gutachter_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_sv_lead_id_fkey"
            columns: ["sv_lead_id"]
            isOneToOne: false
            referencedRelation: "sv_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_verlegung_quelle_id_fkey"
            columns: ["verlegung_quelle_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_verlegung_quelle_id_fkey"
            columns: ["verlegung_quelle_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_termine_verlegung_quelle_id_fkey"
            columns: ["verlegung_quelle_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "gutachter_termine_verlegung_quelle_id_fkey"
            columns: ["verlegung_quelle_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_termine_verlegung_quelle_id_fkey"
            columns: ["verlegung_quelle_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
        ]
      }
      gutachter_termine_intern: {
        Row: {
          honorar_betrag: number | null
          notiz_intern: string | null
          termin_id: string
          updated_at: string
        }
        Insert: {
          honorar_betrag?: number | null
          notiz_intern?: string | null
          termin_id: string
          updated_at?: string
        }
        Update: {
          honorar_betrag?: number | null
          notiz_intern?: string | null
          termin_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_termine_intern_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_termine_intern_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_termine_intern_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "gutachter_termine_intern_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_termine_intern_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
        ]
      }
      gutachter_waitlist: {
        Row: {
          aktuelle_auftraege_pro_monat: number | null
          bearbeitet_von_user_id: string | null
          bvsk_mitgliedsnummer: string | null
          dat_expert_nummer: string | null
          email: string
          erstellt_am: string
          id: string
          ihk_zertifikat_nummer: string | null
          ip_hash: string | null
          jahre_erfahrung: number | null
          konvertiert_zu_sv_id: string | null
          nachname: string
          notizen_admin: string | null
          oebuv_bestellungsnummer: string | null
          ort: string | null
          plz: string
          quelle: string | null
          schwerpunkte: string | null
          standort_lat: number | null
          standort_lng: number | null
          status: string
          telefon: string | null
          unternehmen: string | null
          user_agent: string | null
          vorname: string
          zuletzt_geaendert_am: string
        }
        Insert: {
          aktuelle_auftraege_pro_monat?: number | null
          bearbeitet_von_user_id?: string | null
          bvsk_mitgliedsnummer?: string | null
          dat_expert_nummer?: string | null
          email: string
          erstellt_am?: string
          id?: string
          ihk_zertifikat_nummer?: string | null
          ip_hash?: string | null
          jahre_erfahrung?: number | null
          konvertiert_zu_sv_id?: string | null
          nachname: string
          notizen_admin?: string | null
          oebuv_bestellungsnummer?: string | null
          ort?: string | null
          plz: string
          quelle?: string | null
          schwerpunkte?: string | null
          standort_lat?: number | null
          standort_lng?: number | null
          status?: string
          telefon?: string | null
          unternehmen?: string | null
          user_agent?: string | null
          vorname: string
          zuletzt_geaendert_am?: string
        }
        Update: {
          aktuelle_auftraege_pro_monat?: number | null
          bearbeitet_von_user_id?: string | null
          bvsk_mitgliedsnummer?: string | null
          dat_expert_nummer?: string | null
          email?: string
          erstellt_am?: string
          id?: string
          ihk_zertifikat_nummer?: string | null
          ip_hash?: string | null
          jahre_erfahrung?: number | null
          konvertiert_zu_sv_id?: string | null
          nachname?: string
          notizen_admin?: string | null
          oebuv_bestellungsnummer?: string | null
          ort?: string | null
          plz?: string
          quelle?: string | null
          schwerpunkte?: string | null
          standort_lat?: number | null
          standort_lng?: number | null
          status?: string
          telefon?: string | null
          unternehmen?: string | null
          user_agent?: string | null
          vorname?: string
          zuletzt_geaendert_am?: string
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_waitlist_konvertiert_zu_sv_id_fkey"
            columns: ["konvertiert_zu_sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_waitlist_konvertiert_zu_sv_id_fkey"
            columns: ["konvertiert_zu_sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "gutschriften_referenz_fall_id_fkey"
            columns: ["referenz_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "gutschriften_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check_runs: {
        Row: {
          alerted_at: string | null
          category: string
          check_id: string
          detail: string
          id: string
          metric: number | null
          run_at: string
          sample_ids: Json
          status: string
        }
        Insert: {
          alerted_at?: string | null
          category: string
          check_id: string
          detail?: string
          id?: string
          metric?: number | null
          run_at?: string
          sample_ids?: Json
          status: string
        }
        Update: {
          alerted_at?: string | null
          category?: string
          check_id?: string
          detail?: string
          id?: string
          metric?: number | null
          run_at?: string
          sample_ids?: Json
          status?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "individuelle_anfragen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      kalender_verbindungen: {
        Row: {
          calendar_display_name: string | null
          calendar_url: string | null
          connected_at: string | null
          erstellt_am: string
          fehler_task_id: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_sync_at: string | null
          password_encrypted: string | null
          profile_id: string
          provider: string
          provider_label: string | null
          server_url: string | null
          username: string | null
        }
        Insert: {
          calendar_display_name?: string | null
          calendar_url?: string | null
          connected_at?: string | null
          erstellt_am?: string
          fehler_task_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_at?: string | null
          password_encrypted?: string | null
          profile_id: string
          provider: string
          provider_label?: string | null
          server_url?: string | null
          username?: string | null
        }
        Update: {
          calendar_display_name?: string | null
          calendar_url?: string | null
          connected_at?: string | null
          erstellt_am?: string
          fehler_task_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_at?: string | null
          password_encrypted?: string | null
          profile_id?: string
          provider?: string
          provider_label?: string | null
          server_url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kalender_verbindungen_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzlei: {
        Row: {
          erstellt_am: string
          id: string
          name: string
        }
        Insert: {
          erstellt_am?: string
          id?: string
          name: string
        }
        Update: {
          erstellt_am?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      kanzlei_abrechnung_positionen: {
        Row: {
          betrag_netto: number
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_abrechnung_positionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
      kanzlei_admin_termine: {
        Row: {
          admin_user_id: string
          beschreibung: string | null
          claim_id: string | null
          created_at: string
          end_zeit: string
          fall_id: string | null
          google_event_id: string | null
          google_meet_link: string | null
          id: string
          kanzlei_user_id: string
          start_zeit: string
          status: string
          titel: string
          typ: string
          updated_at: string
        }
        Insert: {
          admin_user_id: string
          beschreibung?: string | null
          claim_id?: string | null
          created_at?: string
          end_zeit: string
          fall_id?: string | null
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          kanzlei_user_id: string
          start_zeit: string
          status?: string
          titel: string
          typ: string
          updated_at?: string
        }
        Update: {
          admin_user_id?: string
          beschreibung?: string | null
          claim_id?: string | null
          created_at?: string
          end_zeit?: string
          fall_id?: string | null
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          kanzlei_user_id?: string
          start_zeit?: string
          status?: string
          titel?: string
          typ?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_admin_termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzlei_faelle: {
        Row: {
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
          ausgezahlt_am: string | null
          claim_id: string
          erstellt_am: string
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
          fall_id: string
          id: string
          kanzlei_id: string | null
          klage_uebergeben_am: string | null
          kuerzungs_betrag: number | null
          lexdrive_case_id: string | null
          lexdrive_ocr_data: Json | null
          lexdrive_ocr_received_at: string | null
          mandatsnummer: string | null
          regulierung_am: string | null
          regulierung_angekuendigt_am: string | null
          regulierungsweise: string | null
          ruege_betrag: number | null
          ruege_counter: number | null
          ruege_erhalten_am: string | null
          ruege_frist_tage: number | null
          ruege_gesendet_am: string | null
          ruege_grund: string | null
          status: string
          updated_at: string
          vs_eskalationsstufe: string | null
          vs_frist_bis: string | null
          vs_kontakt_am: string | null
          vs_kuerzung_grund: string | null
          vs_kuerzungs_typ: string | null
          vs_quote_akzeptiert_am: string | null
          vs_quote_betrag_ausgezahlt: number | null
          vs_quote_grund: string | null
          vs_quote_prozent: number | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
        }
        Insert: {
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
          ausgezahlt_am?: string | null
          claim_id: string
          erstellt_am?: string
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
          fall_id: string
          id?: string
          kanzlei_id?: string | null
          klage_uebergeben_am?: string | null
          kuerzungs_betrag?: number | null
          lexdrive_case_id?: string | null
          lexdrive_ocr_data?: Json | null
          lexdrive_ocr_received_at?: string | null
          mandatsnummer?: string | null
          regulierung_am?: string | null
          regulierung_angekuendigt_am?: string | null
          regulierungsweise?: string | null
          ruege_betrag?: number | null
          ruege_counter?: number | null
          ruege_erhalten_am?: string | null
          ruege_frist_tage?: number | null
          ruege_gesendet_am?: string | null
          ruege_grund?: string | null
          status: string
          updated_at?: string
          vs_eskalationsstufe?: string | null
          vs_frist_bis?: string | null
          vs_kontakt_am?: string | null
          vs_kuerzung_grund?: string | null
          vs_kuerzungs_typ?: string | null
          vs_quote_akzeptiert_am?: string | null
          vs_quote_betrag_ausgezahlt?: number | null
          vs_quote_grund?: string | null
          vs_quote_prozent?: number | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
        }
        Update: {
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
          ausgezahlt_am?: string | null
          claim_id?: string
          erstellt_am?: string
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
          fall_id?: string
          id?: string
          kanzlei_id?: string | null
          klage_uebergeben_am?: string | null
          kuerzungs_betrag?: number | null
          lexdrive_case_id?: string | null
          lexdrive_ocr_data?: Json | null
          lexdrive_ocr_received_at?: string | null
          mandatsnummer?: string | null
          regulierung_am?: string | null
          regulierung_angekuendigt_am?: string | null
          regulierungsweise?: string | null
          ruege_betrag?: number | null
          ruege_counter?: number | null
          ruege_erhalten_am?: string | null
          ruege_frist_tage?: number | null
          ruege_gesendet_am?: string | null
          ruege_grund?: string | null
          status?: string
          updated_at?: string
          vs_eskalationsstufe?: string | null
          vs_frist_bis?: string | null
          vs_kontakt_am?: string | null
          vs_kuerzung_grund?: string | null
          vs_kuerzungs_typ?: string | null
          vs_quote_akzeptiert_am?: string | null
          vs_quote_betrag_ausgezahlt?: number | null
          vs_quote_grund?: string | null
          vs_quote_prozent?: number | null
          vs_reaktion_am?: string | null
          vs_reaktion_typ?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kanzlei_faelle_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      kanzlei_pakete: {
        Row: {
          bestaetigt_am: string | null
          claim_id: string
          created_at: string
          empfaenger_kanzlei_email: string | null
          empfaenger_kanzlei_kontaktperson: string | null
          empfaenger_kanzlei_name: string
          empfaenger_kanzlei_telefon: string | null
          empfaenger_typ: string
          id: string
          inhalt_dokumente_jsonb: Json
          notiz: string | null
          status: string
          updated_at: string
          versand_external_id: string | null
          versand_methode: string | null
          versendet_am: string | null
          versendet_durch_user_id: string | null
        }
        Insert: {
          bestaetigt_am?: string | null
          claim_id: string
          created_at?: string
          empfaenger_kanzlei_email?: string | null
          empfaenger_kanzlei_kontaktperson?: string | null
          empfaenger_kanzlei_name: string
          empfaenger_kanzlei_telefon?: string | null
          empfaenger_typ: string
          id?: string
          inhalt_dokumente_jsonb?: Json
          notiz?: string | null
          status?: string
          updated_at?: string
          versand_external_id?: string | null
          versand_methode?: string | null
          versendet_am?: string | null
          versendet_durch_user_id?: string | null
        }
        Update: {
          bestaetigt_am?: string | null
          claim_id?: string
          created_at?: string
          empfaenger_kanzlei_email?: string | null
          empfaenger_kanzlei_kontaktperson?: string | null
          empfaenger_kanzlei_name?: string
          empfaenger_kanzlei_telefon?: string | null
          empfaenger_typ?: string
          id?: string
          inhalt_dokumente_jsonb?: Json
          notiz?: string | null
          status?: string
          updated_at?: string
          versand_external_id?: string | null
          versand_methode?: string | null
          versendet_am?: string | null
          versendet_durch_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kanzlei_pakete_versendet_durch_user_id_fkey"
            columns: ["versendet_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          claim_id: string | null
          created_at: string | null
          id: string
          nachrichten: Json
          rolle: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          claim_id?: string | null
          created_at?: string | null
          id?: string
          nachrichten?: Json
          rolle: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          claim_id?: string | null
          created_at?: string | null
          id?: string
          nachrichten?: Json
          rolle?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "ki_gespraeche_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      kunde_gutachten_requests: {
        Row: {
          accessed_at: string | null
          claim_id: string | null
          created_at: string
          empfaenger_email: string
          expires_at: string
          fall_id: string
          id: string
          magic_link_token: string
        }
        Insert: {
          accessed_at?: string | null
          claim_id?: string | null
          created_at?: string
          empfaenger_email: string
          expires_at: string
          fall_id: string
          id?: string
          magic_link_token: string
        }
        Update: {
          accessed_at?: string | null
          claim_id?: string | null
          created_at?: string
          empfaenger_email?: string
          expires_at?: string
          fall_id?: string
          id?: string
          magic_link_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "kunde_gutachten_requests_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "kunde_live_position_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "kunde_live_position_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "kunde_live_position_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: true
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
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
          {
            foreignKeyName: "lead_historie_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_historie_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historie_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
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
          abrechnungsweg: string | null
          anrede: string | null
          anruf_versuche: number | null
          aufklaerung_teilschuld_bestaetigt: boolean | null
          auslandskennzeichen: boolean | null
          bedarf_confidence: number | null
          bedarf_ermittelt_am: string | null
          bedarf_kategorien: string[] | null
          bedarf_quelle: string | null
          besichtigungsort_adresse: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_notiz: string | null
          besichtigungsort_place_id: string | null
          bevorzugter_kanal: string | null
          bkat_unfallart: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          created_at: string | null
          disqualifiziert: boolean | null
          disqualifiziert_am: string | null
          disqualifiziert_grund: string | null
          disqualifiziert_grund_key: string | null
          disqualifiziert_notiz: string | null
          dsgvo_zustimmung_am: string | null
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
          fahrzeug_standort_lat: number | null
          fahrzeug_standort_lng: number | null
          fahrzeug_standort_place_id: string | null
          fahrzeug_standort_plz: string | null
          fahrzeugklasse: string | null
          fahrzeugschaden_beschreibung: string | null
          fehlende_felder_jsonb: Json | null
          fin: string | null
          finanzierung_bank: string | null
          finanzierung_leasing: string | null
          finanzierungsgeber_adresse: string | null
          finanzierungsgeber_name: string | null
          finanzierungsgeber_vertragsnr: string | null
          firma_name: string | null
          flow_link_abgeschlossen: boolean | null
          flow_link_geoeffnet: boolean | null
          freie_werkstattwahl: boolean | null
          ga_client_id: string | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_email: string | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_schadennummer: string | null
          gegner_telefon: string | null
          gegner_versicherung: string | null
          gegner_versicherung_anfrage_datum: string | null
          gegner_versicherung_id: string | null
          gegner_versicherungsnummer: string | null
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
          hat_whatsapp: boolean | null
          hsn: string | null
          id: string
          ist_fahrzeughalter: boolean | null
          kanzlei_wunsch: string | null
          kennzeichen: string | null
          kennzeichen_buchstaben: string | null
          kennzeichen_kreis: string | null
          kennzeichen_suffix: string | null
          kennzeichen_zahl: string | null
          kilometerstand: number | null
          kontaktversuche: number | null
          konvertiert_am: string | null
          konvertiert_durch_user_id: string | null
          konvertiert_zu_claim_id: string | null
          konvertiert_zu_fall_id: string | null
          kostenvoranschlag_brutto: number | null
          kostenvoranschlag_netto: number | null
          kunde_adresse: string | null
          kunde_id: string | null
          kunde_lat: number | null
          kunde_lng: number | null
          kunde_plz: string | null
          kunde_stadt: string | null
          kunde_strasse: string | null
          kunden_konstellation: string | null
          lackfarbe_code: string | null
          lead_nummer: string | null
          leasing_geber: string | null
          letzter_anruf_am: string | null
          letzter_anruf_status: string | null
          mandatstyp: string | null
          mietwagen_flag: boolean | null
          nachname: string | null
          notiz: string | null
          nutzungsausfall: boolean | null
          parkplatz_kamera: boolean | null
          personenschaden_flag: boolean | null
          polizei_aktenzeichen: string | null
          polizei_vor_ort: boolean | null
          polizeibericht_gesendet_am: string | null
          polizeibericht_hochgeladen_am: string | null
          polizeibericht_pflicht: boolean | null
          polizeibericht_status: string | null
          polizeibericht_token: string | null
          polizeibericht_url: string | null
          promotion_code_id: string | null
          qualifizierungs_phase: string | null
          reminder_1_sent_at: string | null
          reminder_2_sent_at: string | null
          reminder_3_sent_at: string | null
          reminder_4_sent_at: string | null
          reminder_token: string | null
          reparatur_vermittlung_status: string
          reparatur_werkstatt_extern: string | null
          reparatur_werkstatt_id: string | null
          reparatur_werkstatt_quelle: string | null
          reparatur_werkstatt_zugewiesen_am: string | null
          reparatur_werkstatt_zugewiesen_von: string | null
          reparatur_wunschtermin: string | null
          reparaturwunsch: string | null
          rueckruf_geplant_am: string | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sachschaden_beschreibung: string | null
          sachschaden_flag: boolean
          schaden_sichtbar: boolean | null
          schadens_art: string | null
          schadens_fall_typ: string | null
          schadens_hergang: string | null
          schadensfoto_urls: Json | null
          schadenskategorie: string | null
          schadentyp: string | null
          schadentyp_freitext: string | null
          schuldfrage: string | null
          service_typ: string
          source_channel: string | null
          source_domain: string | null
          spezifikation: string | null
          sprache: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefon: string | null
          timeline: Json | null
          tsn: string | null
          unfall_konstellation: string | null
          unfall_uhrzeit: string | null
          unfalldatum: string | null
          unfallhergang: string | null
          unfallort: string | null
          unfallort_kategorie: string | null
          unfallort_lat: number | null
          unfallort_lng: number | null
          unfallort_ort: string | null
          unfallort_place_id: string | null
          unfallort_plz: string | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          vehicle_id: string | null
          verpasste_anrufe: number | null
          vollmacht_datum: string | null
          vollmacht_signiert_am: string | null
          vorname: string | null
          vorschaeden_beschreibung: string | null
          vorsteuerabzugsberechtigt: boolean | null
          wa_gesendet: boolean | null
          werkstatt_id: string | null
          werkstatt_intake_am: string | null
          werkstatt_intake_von: string | null
          werkstatt_seit_datum: string | null
          whatsapp_geprueft_am: string | null
          whatsapp_verfuegbar: boolean | null
          winback_opt_out: boolean
          winback_sent_at: string | null
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
          zeugen: boolean | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean
          zeugenaussage_hochgeladen_am: string | null
          zeugenaussage_status: string | null
          zeugenaussage_url: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          abrechnungsweg?: string | null
          anrede?: string | null
          anruf_versuche?: number | null
          aufklaerung_teilschuld_bestaetigt?: boolean | null
          auslandskennzeichen?: boolean | null
          bedarf_confidence?: number | null
          bedarf_ermittelt_am?: string | null
          bedarf_kategorien?: string[] | null
          bedarf_quelle?: string | null
          besichtigungsort_adresse?: string | null
          besichtigungsort_lat?: number | null
          besichtigungsort_lng?: number | null
          besichtigungsort_notiz?: string | null
          besichtigungsort_place_id?: string | null
          bevorzugter_kanal?: string | null
          bkat_unfallart?: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn?: string | null
          cardentity_enriched_at?: string | null
          cardentity_report?: Json | null
          created_at?: string | null
          disqualifiziert?: boolean | null
          disqualifiziert_am?: string | null
          disqualifiziert_grund?: string | null
          disqualifiziert_grund_key?: string | null
          disqualifiziert_notiz?: string | null
          dsgvo_zustimmung_am?: string | null
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
          fahrzeug_standort_lat?: number | null
          fahrzeug_standort_lng?: number | null
          fahrzeug_standort_place_id?: string | null
          fahrzeug_standort_plz?: string | null
          fahrzeugklasse?: string | null
          fahrzeugschaden_beschreibung?: string | null
          fehlende_felder_jsonb?: Json | null
          fin?: string | null
          finanzierung_bank?: string | null
          finanzierung_leasing?: string | null
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          firma_name?: string | null
          flow_link_abgeschlossen?: boolean | null
          flow_link_geoeffnet?: boolean | null
          freie_werkstattwahl?: boolean | null
          ga_client_id?: string | null
          gegner_anzahl_beteiligte?: number | null
          gegner_bekannt?: boolean | null
          gegner_email?: string | null
          gegner_fahrzeugtyp?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_schadennummer?: string | null
          gegner_telefon?: string | null
          gegner_versicherung?: string | null
          gegner_versicherung_anfrage_datum?: string | null
          gegner_versicherung_id?: string | null
          gegner_versicherungsnummer?: string | null
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
          hat_whatsapp?: boolean | null
          hsn?: string | null
          id?: string
          ist_fahrzeughalter?: boolean | null
          kanzlei_wunsch?: string | null
          kennzeichen?: string | null
          kennzeichen_buchstaben?: string | null
          kennzeichen_kreis?: string | null
          kennzeichen_suffix?: string | null
          kennzeichen_zahl?: string | null
          kilometerstand?: number | null
          kontaktversuche?: number | null
          konvertiert_am?: string | null
          konvertiert_durch_user_id?: string | null
          konvertiert_zu_claim_id?: string | null
          konvertiert_zu_fall_id?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          kunde_adresse?: string | null
          kunde_id?: string | null
          kunde_lat?: number | null
          kunde_lng?: number | null
          kunde_plz?: string | null
          kunde_stadt?: string | null
          kunde_strasse?: string | null
          kunden_konstellation?: string | null
          lackfarbe_code?: string | null
          lead_nummer?: string | null
          leasing_geber?: string | null
          letzter_anruf_am?: string | null
          letzter_anruf_status?: string | null
          mandatstyp?: string | null
          mietwagen_flag?: boolean | null
          nachname?: string | null
          notiz?: string | null
          nutzungsausfall?: boolean | null
          parkplatz_kamera?: boolean | null
          personenschaden_flag?: boolean | null
          polizei_aktenzeichen?: string | null
          polizei_vor_ort?: boolean | null
          polizeibericht_gesendet_am?: string | null
          polizeibericht_hochgeladen_am?: string | null
          polizeibericht_pflicht?: boolean | null
          polizeibericht_status?: string | null
          polizeibericht_token?: string | null
          polizeibericht_url?: string | null
          promotion_code_id?: string | null
          qualifizierungs_phase?: string | null
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          reminder_4_sent_at?: string | null
          reminder_token?: string | null
          reparatur_vermittlung_status?: string
          reparatur_werkstatt_extern?: string | null
          reparatur_werkstatt_id?: string | null
          reparatur_werkstatt_quelle?: string | null
          reparatur_werkstatt_zugewiesen_am?: string | null
          reparatur_werkstatt_zugewiesen_von?: string | null
          reparatur_wunschtermin?: string | null
          reparaturwunsch?: string | null
          rueckruf_geplant_am?: string | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sachschaden_beschreibung?: string | null
          sachschaden_flag?: boolean
          schaden_sichtbar?: boolean | null
          schadens_art?: string | null
          schadens_fall_typ?: string | null
          schadens_hergang?: string | null
          schadensfoto_urls?: Json | null
          schadenskategorie?: string | null
          schadentyp?: string | null
          schadentyp_freitext?: string | null
          schuldfrage?: string | null
          service_typ?: string
          source_channel?: string | null
          source_domain?: string | null
          spezifikation?: string | null
          sprache?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefon?: string | null
          timeline?: Json | null
          tsn?: string | null
          unfall_konstellation?: string | null
          unfall_uhrzeit?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallort?: string | null
          unfallort_kategorie?: string | null
          unfallort_lat?: number | null
          unfallort_lng?: number | null
          unfallort_ort?: string | null
          unfallort_place_id?: string | null
          unfallort_plz?: string | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          verpasste_anrufe?: number | null
          vollmacht_datum?: string | null
          vollmacht_signiert_am?: string | null
          vorname?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean | null
          wa_gesendet?: boolean | null
          werkstatt_id?: string | null
          werkstatt_intake_am?: string | null
          werkstatt_intake_von?: string | null
          werkstatt_seit_datum?: string | null
          whatsapp_geprueft_am?: string | null
          whatsapp_verfuegbar?: boolean | null
          winback_opt_out?: boolean
          winback_sent_at?: string | null
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
          zeugen?: boolean | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
          zeugenaussage_hochgeladen_am?: string | null
          zeugenaussage_status?: string | null
          zeugenaussage_url?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          abrechnungsweg?: string | null
          anrede?: string | null
          anruf_versuche?: number | null
          aufklaerung_teilschuld_bestaetigt?: boolean | null
          auslandskennzeichen?: boolean | null
          bedarf_confidence?: number | null
          bedarf_ermittelt_am?: string | null
          bedarf_kategorien?: string[] | null
          bedarf_quelle?: string | null
          besichtigungsort_adresse?: string | null
          besichtigungsort_lat?: number | null
          besichtigungsort_lng?: number | null
          besichtigungsort_notiz?: string | null
          besichtigungsort_place_id?: string | null
          bevorzugter_kanal?: string | null
          bkat_unfallart?: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn?: string | null
          cardentity_enriched_at?: string | null
          cardentity_report?: Json | null
          created_at?: string | null
          disqualifiziert?: boolean | null
          disqualifiziert_am?: string | null
          disqualifiziert_grund?: string | null
          disqualifiziert_grund_key?: string | null
          disqualifiziert_notiz?: string | null
          dsgvo_zustimmung_am?: string | null
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
          fahrzeug_standort_lat?: number | null
          fahrzeug_standort_lng?: number | null
          fahrzeug_standort_place_id?: string | null
          fahrzeug_standort_plz?: string | null
          fahrzeugklasse?: string | null
          fahrzeugschaden_beschreibung?: string | null
          fehlende_felder_jsonb?: Json | null
          fin?: string | null
          finanzierung_bank?: string | null
          finanzierung_leasing?: string | null
          finanzierungsgeber_adresse?: string | null
          finanzierungsgeber_name?: string | null
          finanzierungsgeber_vertragsnr?: string | null
          firma_name?: string | null
          flow_link_abgeschlossen?: boolean | null
          flow_link_geoeffnet?: boolean | null
          freie_werkstattwahl?: boolean | null
          ga_client_id?: string | null
          gegner_anzahl_beteiligte?: number | null
          gegner_bekannt?: boolean | null
          gegner_email?: string | null
          gegner_fahrzeugtyp?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_schadennummer?: string | null
          gegner_telefon?: string | null
          gegner_versicherung?: string | null
          gegner_versicherung_anfrage_datum?: string | null
          gegner_versicherung_id?: string | null
          gegner_versicherungsnummer?: string | null
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
          hat_whatsapp?: boolean | null
          hsn?: string | null
          id?: string
          ist_fahrzeughalter?: boolean | null
          kanzlei_wunsch?: string | null
          kennzeichen?: string | null
          kennzeichen_buchstaben?: string | null
          kennzeichen_kreis?: string | null
          kennzeichen_suffix?: string | null
          kennzeichen_zahl?: string | null
          kilometerstand?: number | null
          kontaktversuche?: number | null
          konvertiert_am?: string | null
          konvertiert_durch_user_id?: string | null
          konvertiert_zu_claim_id?: string | null
          konvertiert_zu_fall_id?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          kunde_adresse?: string | null
          kunde_id?: string | null
          kunde_lat?: number | null
          kunde_lng?: number | null
          kunde_plz?: string | null
          kunde_stadt?: string | null
          kunde_strasse?: string | null
          kunden_konstellation?: string | null
          lackfarbe_code?: string | null
          lead_nummer?: string | null
          leasing_geber?: string | null
          letzter_anruf_am?: string | null
          letzter_anruf_status?: string | null
          mandatstyp?: string | null
          mietwagen_flag?: boolean | null
          nachname?: string | null
          notiz?: string | null
          nutzungsausfall?: boolean | null
          parkplatz_kamera?: boolean | null
          personenschaden_flag?: boolean | null
          polizei_aktenzeichen?: string | null
          polizei_vor_ort?: boolean | null
          polizeibericht_gesendet_am?: string | null
          polizeibericht_hochgeladen_am?: string | null
          polizeibericht_pflicht?: boolean | null
          polizeibericht_status?: string | null
          polizeibericht_token?: string | null
          polizeibericht_url?: string | null
          promotion_code_id?: string | null
          qualifizierungs_phase?: string | null
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          reminder_4_sent_at?: string | null
          reminder_token?: string | null
          reparatur_vermittlung_status?: string
          reparatur_werkstatt_extern?: string | null
          reparatur_werkstatt_id?: string | null
          reparatur_werkstatt_quelle?: string | null
          reparatur_werkstatt_zugewiesen_am?: string | null
          reparatur_werkstatt_zugewiesen_von?: string | null
          reparatur_wunschtermin?: string | null
          reparaturwunsch?: string | null
          rueckruf_geplant_am?: string | null
          sa_unterschrieben?: boolean | null
          sa_unterschrieben_am?: string | null
          sachschaden_beschreibung?: string | null
          sachschaden_flag?: boolean
          schaden_sichtbar?: boolean | null
          schadens_art?: string | null
          schadens_fall_typ?: string | null
          schadens_hergang?: string | null
          schadensfoto_urls?: Json | null
          schadenskategorie?: string | null
          schadentyp?: string | null
          schadentyp_freitext?: string | null
          schuldfrage?: string | null
          service_typ?: string
          source_channel?: string | null
          source_domain?: string | null
          spezifikation?: string | null
          sprache?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefon?: string | null
          timeline?: Json | null
          tsn?: string | null
          unfall_konstellation?: string | null
          unfall_uhrzeit?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallort?: string | null
          unfallort_kategorie?: string | null
          unfallort_lat?: number | null
          unfallort_lng?: number | null
          unfallort_ort?: string | null
          unfallort_place_id?: string | null
          unfallort_plz?: string | null
          unfallskizze_ablehnung_grund?: string | null
          unfallskizze_bestaetigt?: boolean | null
          unfallskizze_generiert_am?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          verpasste_anrufe?: number | null
          vollmacht_datum?: string | null
          vollmacht_signiert_am?: string | null
          vorname?: string | null
          vorschaeden_beschreibung?: string | null
          vorsteuerabzugsberechtigt?: boolean | null
          wa_gesendet?: boolean | null
          werkstatt_id?: string | null
          werkstatt_intake_am?: string | null
          werkstatt_intake_von?: string | null
          werkstatt_seit_datum?: string | null
          whatsapp_geprueft_am?: string | null
          whatsapp_verfuegbar?: boolean | null
          winback_opt_out?: boolean
          winback_sent_at?: string | null
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
          zeugen?: boolean | null
          zeugen_kontakte?: Json | null
          zeugen_vorhanden?: boolean
          zeugenaussage_hochgeladen_am?: string | null
          zeugenaussage_status?: string | null
          zeugenaussage_url?: string | null
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
            foreignKeyName: "leads_konvertiert_durch_user_id_fkey"
            columns: ["konvertiert_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "leads_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "leads_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "leads_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_zugewiesen_an_fk"
            columns: ["zugewiesen_an"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_oauth_tokens: {
        Row: {
          access_token: string
          aktualisiert_am: string
          connected_by: string | null
          erstellt_am: string
          expires_at: string
          id: string
          organization_urn: string
          refresh_token: string | null
          scope: string | null
        }
        Insert: {
          access_token: string
          aktualisiert_am?: string
          connected_by?: string | null
          erstellt_am?: string
          expires_at: string
          id?: string
          organization_urn: string
          refresh_token?: string | null
          scope?: string | null
        }
        Update: {
          access_token?: string
          aktualisiert_am?: string
          connected_by?: string | null
          erstellt_am?: string
          expires_at?: string
          id?: string
          organization_urn?: string
          refresh_token?: string | null
          scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_oauth_tokens_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_posts: {
        Row: {
          author_urn: string
          composed_text: string
          erstellt_am: string
          excerpt: string | null
          feed_guid: string
          feed_url: string
          fehler: string | null
          freigegeben_am: string | null
          freigegeben_von: string | null
          id: string
          linkedin_post_urn: string | null
          published_at: string | null
          scheduled_for: string | null
          status: string
          title: string
        }
        Insert: {
          author_urn: string
          composed_text: string
          erstellt_am?: string
          excerpt?: string | null
          feed_guid: string
          feed_url: string
          fehler?: string | null
          freigegeben_am?: string | null
          freigegeben_von?: string | null
          id?: string
          linkedin_post_urn?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          title: string
        }
        Update: {
          author_urn?: string
          composed_text?: string
          erstellt_am?: string
          excerpt?: string | null
          feed_guid?: string
          feed_url?: string
          fehler?: string | null
          freigegeben_am?: string | null
          freigegeben_von?: string | null
          id?: string
          linkedin_post_urn?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_posts_freigegeben_von_fkey"
            columns: ["freigegeben_von"]
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
          ist_kleinunternehmer: boolean | null
          maklerpool_id: string | null
          notification_preferences: Json | null
          notizen: string | null
          onboarding_abgeschlossen: boolean
          provision_aktiv: boolean
          provision_betrag_komplett_netto: number
          provision_betrag_nur_gutachter_netto: number
          rechtsform: string | null
          sponsor_makler_id: string | null
          status: string
          telefon: string | null
          user_id: string | null
          ust_id: string | null
          vermittlung_prompt_gesehen: boolean
          versicherung_id: string | null
          wochenreport_abgemeldet_am: string | null
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
          ist_kleinunternehmer?: boolean | null
          maklerpool_id?: string | null
          notification_preferences?: Json | null
          notizen?: string | null
          onboarding_abgeschlossen?: boolean
          provision_aktiv?: boolean
          provision_betrag_komplett_netto?: number
          provision_betrag_nur_gutachter_netto?: number
          rechtsform?: string | null
          sponsor_makler_id?: string | null
          status?: string
          telefon?: string | null
          user_id?: string | null
          ust_id?: string | null
          vermittlung_prompt_gesehen?: boolean
          versicherung_id?: string | null
          wochenreport_abgemeldet_am?: string | null
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
          ist_kleinunternehmer?: boolean | null
          maklerpool_id?: string | null
          notification_preferences?: Json | null
          notizen?: string | null
          onboarding_abgeschlossen?: boolean
          provision_aktiv?: boolean
          provision_betrag_komplett_netto?: number
          provision_betrag_nur_gutachter_netto?: number
          rechtsform?: string | null
          sponsor_makler_id?: string | null
          status?: string
          telefon?: string | null
          user_id?: string | null
          ust_id?: string | null
          vermittlung_prompt_gesehen?: boolean
          versicherung_id?: string | null
          wochenreport_abgemeldet_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "makler_maklerpool_id_fkey"
            columns: ["maklerpool_id"]
            isOneToOne: false
            referencedRelation: "maklerpools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_sponsor_makler_id_fkey"
            columns: ["sponsor_makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_versicherung_id_fkey"
            columns: ["versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
        ]
      }
      makler_fall_consent: {
        Row: {
          claim_id: string | null
          consent_gegeben_am: string
          consent_scope: string
          fall_id: string
          id: string
          makler_id: string
          widerrufen_am: string | null
          widerrufen_von: string | null
        }
        Insert: {
          claim_id?: string | null
          consent_gegeben_am?: string
          consent_scope?: string
          fall_id: string
          id?: string
          makler_id: string
          widerrufen_am?: string | null
          widerrufen_von?: string | null
        }
        Update: {
          claim_id?: string | null
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
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "makler_fall_consent_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
      makler_staffel_stufen: {
        Row: {
          bonus_betrag_netto: number
          created_at: string
          id: string
          makler_id: string
          schwelle: number
        }
        Insert: {
          bonus_betrag_netto: number
          created_at?: string
          id?: string
          makler_id: string
          schwelle: number
        }
        Update: {
          bonus_betrag_netto?: number
          created_at?: string
          id?: string
          makler_id?: string
          schwelle?: number
        }
        Relationships: [
          {
            foreignKeyName: "makler_staffel_stufen_makler_id_fkey"
            columns: ["makler_id"]
            isOneToOne: false
            referencedRelation: "makler"
            referencedColumns: ["id"]
          },
        ]
      }
      maklerpools: {
        Row: {
          aktiv: boolean
          erstellt_am: string
          id: string
          name: string
        }
        Insert: {
          aktiv?: boolean
          erstellt_am?: string
          id?: string
          name: string
        }
        Update: {
          aktiv?: boolean
          erstellt_am?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      marketing_content_jobs: {
        Row: {
          aktualisiert_am: string
          audio_url: string | null
          caption: string | null
          dauer_sekunden: number | null
          erstellt_am: string
          erstellt_von: string | null
          fehler_text: string | null
          format: string
          gepostet_am: string | null
          hashtags: string[] | null
          id: string
          ist_ki_generiert: boolean
          kosten_cents: number | null
          publish_status: string
          render_fortschritt: number | null
          render_phase: string | null
          skript: Json | null
          status: string
          thema: string
          video_url: string | null
        }
        Insert: {
          aktualisiert_am?: string
          audio_url?: string | null
          caption?: string | null
          dauer_sekunden?: number | null
          erstellt_am?: string
          erstellt_von?: string | null
          fehler_text?: string | null
          format?: string
          gepostet_am?: string | null
          hashtags?: string[] | null
          id?: string
          ist_ki_generiert?: boolean
          kosten_cents?: number | null
          publish_status?: string
          render_fortschritt?: number | null
          render_phase?: string | null
          skript?: Json | null
          status?: string
          thema: string
          video_url?: string | null
        }
        Update: {
          aktualisiert_am?: string
          audio_url?: string | null
          caption?: string | null
          dauer_sekunden?: number | null
          erstellt_am?: string
          erstellt_von?: string | null
          fehler_text?: string | null
          format?: string
          gepostet_am?: string | null
          hashtags?: string[] | null
          id?: string
          ist_ki_generiert?: boolean
          kosten_cents?: number | null
          publish_status?: string
          render_fortschritt?: number | null
          render_phase?: string | null
          skript?: Json | null
          status?: string
          thema?: string
          video_url?: string | null
        }
        Relationships: []
      }
      matelso_calls: {
        Row: {
          claim_id: string | null
          created_at: string | null
          direction: string
          duration: number | null
          external_call_id: string
          from_number: string | null
          id: number
          lead_id: string | null
          quelle: string | null
          raw_payload: Json | null
          started_at: string
          status: string | null
          status_raw: string | null
          to_number: string | null
          updated_at: string | null
        }
        Insert: {
          claim_id?: string | null
          created_at?: string | null
          direction?: string
          duration?: number | null
          external_call_id: string
          from_number?: string | null
          id?: number
          lead_id?: string | null
          quelle?: string | null
          raw_payload?: Json | null
          started_at?: string
          status?: string | null
          status_raw?: string | null
          to_number?: string | null
          updated_at?: string | null
        }
        Update: {
          claim_id?: string | null
          created_at?: string | null
          direction?: string
          duration?: number | null
          external_call_id?: string
          from_number?: string | null
          id?: number
          lead_id?: string | null
          quelle?: string | null
          raw_payload?: Json | null
          started_at?: string
          status?: string | null
          status_raw?: string | null
          to_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "matelso_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "matelso_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      mietwagenunternehmen: {
        Row: {
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          created_at: string
          email: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          normalized_name: string | null
          partner: boolean
          telefon: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          normalized_name?: string | null
          partner?: boolean
          telefon?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          normalized_name?: string | null
          partner?: boolean
          telefon?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
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
      mitarbeiter_verguetung: {
        Row: {
          created_at: string
          eingestellt_am: string | null
          gehalt_brutto: number | null
          gehaltsstufe: string | null
          position: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eingestellt_am?: string | null
          gehalt_brutto?: number | null
          gehaltsstufe?: string | null
          position?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eingestellt_am?: string | null
          gehalt_brutto?: number | null
          gehaltsstufe?: string | null
          position?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mitarbeiter_verguetung_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
          claim_id: string | null
          created_at: string | null
          empfaenger_id: string | null
          empfaenger_kontakt: string | null
          external_id: string | null
          external_message_id: string | null
          fall_id: string | null
          fehlermeldung: string | null
          gelesen: boolean | null
          hat_anhang: boolean | null
          id: string
          is_system: boolean
          kanal: string | null
          kb_empfaenger_id: string | null
          lead_id: string | null
          nachricht: string
          richtung: string | null
          sender_id: string | null
          sender_rolle: string | null
          status: string | null
          system_event: string | null
          template_key: string | null
          template_params: Json | null
          thread_id: string | null
          uebersetzungen: Json | null
        }
        Insert: {
          anhang_typ?: string | null
          anhang_url?: string | null
          claim_id?: string | null
          created_at?: string | null
          empfaenger_id?: string | null
          empfaenger_kontakt?: string | null
          external_id?: string | null
          external_message_id?: string | null
          fall_id?: string | null
          fehlermeldung?: string | null
          gelesen?: boolean | null
          hat_anhang?: boolean | null
          id?: string
          is_system?: boolean
          kanal?: string | null
          kb_empfaenger_id?: string | null
          lead_id?: string | null
          nachricht: string
          richtung?: string | null
          sender_id?: string | null
          sender_rolle?: string | null
          status?: string | null
          system_event?: string | null
          template_key?: string | null
          template_params?: Json | null
          thread_id?: string | null
          uebersetzungen?: Json | null
        }
        Update: {
          anhang_typ?: string | null
          anhang_url?: string | null
          claim_id?: string | null
          created_at?: string | null
          empfaenger_id?: string | null
          empfaenger_kontakt?: string | null
          external_id?: string | null
          external_message_id?: string | null
          fall_id?: string | null
          fehlermeldung?: string | null
          gelesen?: boolean | null
          hat_anhang?: boolean | null
          id?: string
          is_system?: boolean
          kanal?: string | null
          kb_empfaenger_id?: string | null
          lead_id?: string | null
          nachricht?: string
          richtung?: string | null
          sender_id?: string | null
          sender_rolle?: string | null
          status?: string | null
          system_event?: string | null
          template_key?: string | null
          template_params?: Json | null
          thread_id?: string | null
          uebersetzungen?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "nachrichten_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
            foreignKeyName: "nachrichten_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "nachrichten_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nachrichten_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      netzwerk_einladungen: {
        Row: {
          ablauf_am: string
          eingeloest_am: string | null
          eingeloest_profil_id: string | null
          einlader_id: string
          email: string
          erstellt_am: string
          id: string
          status: string
          token_hash: string
          token_lookup_prefix: string
          ziel_rolle: string
        }
        Insert: {
          ablauf_am?: string
          eingeloest_am?: string | null
          eingeloest_profil_id?: string | null
          einlader_id: string
          email: string
          erstellt_am?: string
          id?: string
          status?: string
          token_hash: string
          token_lookup_prefix: string
          ziel_rolle: string
        }
        Update: {
          ablauf_am?: string
          eingeloest_am?: string | null
          eingeloest_profil_id?: string | null
          einlader_id?: string
          email?: string
          erstellt_am?: string
          id?: string
          status?: string
          token_hash?: string
          token_lookup_prefix?: string
          ziel_rolle?: string
        }
        Relationships: [
          {
            foreignKeyName: "netzwerk_einladungen_eingeloest_profil_id_fkey"
            columns: ["eingeloest_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netzwerk_einladungen_einlader_id_fkey"
            columns: ["einlader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      netzwerk_verbindungen: {
        Row: {
          anfrager_id: string
          beantwortet_am: string | null
          empfaenger_id: string
          erstellt_am: string
          id: string
          status: string
        }
        Insert: {
          anfrager_id: string
          beantwortet_am?: string | null
          empfaenger_id: string
          erstellt_am?: string
          id?: string
          status?: string
        }
        Update: {
          anfrager_id?: string
          beantwortet_am?: string | null
          empfaenger_id?: string
          erstellt_am?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "netzwerk_verbindungen_anfrager_id_fkey"
            columns: ["anfrager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netzwerk_verbindungen_empfaenger_id_fkey"
            columns: ["empfaenger_id"]
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
      notifications_outbox: {
        Row: {
          claim_id: string | null
          created_at: string
          dedup_key: string
          empfaenger_rolle: string | null
          empfaenger_user_id: string | null
          fehler: string | null
          id: string
          kanal: string
          next_retry_at: string | null
          payload: Json
          sent_at: string | null
          status: string
          template: string
          versuche: number
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          dedup_key: string
          empfaenger_rolle?: string | null
          empfaenger_user_id?: string | null
          fehler?: string | null
          id?: string
          kanal: string
          next_retry_at?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          template: string
          versuche?: number
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          dedup_key?: string
          empfaenger_rolle?: string | null
          empfaenger_user_id?: string | null
          fehler?: string | null
          id?: string
          kanal?: string
          next_retry_at?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          template?: string
          versuche?: number
        }
        Relationships: [
          {
            foreignKeyName: "notifications_outbox_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_outbox_empfaenger_user_id_fkey"
            columns: ["empfaenger_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "notification_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
      nutzungsausfall_klasse_saetze: {
        Row: {
          beispiele: string | null
          bezeichnung: string | null
          euro_pro_tag: number
          klasse: string
        }
        Insert: {
          beispiele?: string | null
          bezeichnung?: string | null
          euro_pro_tag: number
          klasse: string
        }
        Update: {
          beispiele?: string | null
          bezeichnung?: string | null
          euro_pro_tag?: number
          klasse?: string
        }
        Relationships: []
      }
      nutzungsausfall_segment_saetze: {
        Row: {
          created_at: string
          mietwagen_max_eur: number | null
          mietwagen_min_eur: number | null
          segment: string
          tagessatz_max_eur: number
          tagessatz_min_eur: number
        }
        Insert: {
          created_at?: string
          mietwagen_max_eur?: number | null
          mietwagen_min_eur?: number | null
          segment: string
          tagessatz_max_eur: number
          tagessatz_min_eur: number
        }
        Update: {
          created_at?: string
          mietwagen_max_eur?: number | null
          mietwagen_min_eur?: number | null
          segment?: string
          tagessatz_max_eur?: number
          tagessatz_min_eur?: number
        }
        Relationships: []
      }
      ocr_runs: {
        Row: {
          ai_usage_log_id: string | null
          confidence_per_field_jsonb: Json | null
          cost_usd: number | null
          created_at: string
          engine: string
          engine_version: string
          error_jsonb: Json | null
          finished_at: string | null
          gutachten_id: string
          id: string
          overall_confidence: number | null
          parsed_fields_jsonb: Json | null
          prompt_hash: string | null
          raw_response_jsonb: Json | null
          run_nummer: number
          started_at: string
          status: string
          triggered_by: string
          triggered_by_user_id: string | null
          validation_errors_jsonb: Json | null
          validation_passed: boolean | null
        }
        Insert: {
          ai_usage_log_id?: string | null
          confidence_per_field_jsonb?: Json | null
          cost_usd?: number | null
          created_at?: string
          engine: string
          engine_version: string
          error_jsonb?: Json | null
          finished_at?: string | null
          gutachten_id: string
          id?: string
          overall_confidence?: number | null
          parsed_fields_jsonb?: Json | null
          prompt_hash?: string | null
          raw_response_jsonb?: Json | null
          run_nummer: number
          started_at?: string
          status?: string
          triggered_by: string
          triggered_by_user_id?: string | null
          validation_errors_jsonb?: Json | null
          validation_passed?: boolean | null
        }
        Update: {
          ai_usage_log_id?: string | null
          confidence_per_field_jsonb?: Json | null
          cost_usd?: number | null
          created_at?: string
          engine?: string
          engine_version?: string
          error_jsonb?: Json | null
          finished_at?: string | null
          gutachten_id?: string
          id?: string
          overall_confidence?: number | null
          parsed_fields_jsonb?: Json | null
          prompt_hash?: string | null
          raw_response_jsonb?: Json | null
          run_nummer?: number
          started_at?: string
          status?: string
          triggered_by?: string
          triggered_by_user_id?: string | null
          validation_errors_jsonb?: Json | null
          validation_passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_runs_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "gutachten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_runs_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["gutachten_id"]
          },
          {
            foreignKeyName: "ocr_runs_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_felder: {
        Row: {
          audience: string | null
          conditional_on: Json | null
          db_target: Json
          erstellt_am: string
          feld_key: string
          hint: string | null
          i18n: Json | null
          id: string
          label: string
          optionen: Json | null
          pflicht: boolean
          phase_id: string
          placeholder: string | null
          reihenfolge: number
          sektion: string | null
          typ: string
          validation: Json | null
        }
        Insert: {
          audience?: string | null
          conditional_on?: Json | null
          db_target: Json
          erstellt_am?: string
          feld_key: string
          hint?: string | null
          i18n?: Json | null
          id?: string
          label: string
          optionen?: Json | null
          pflicht?: boolean
          phase_id: string
          placeholder?: string | null
          reihenfolge: number
          sektion?: string | null
          typ: string
          validation?: Json | null
        }
        Update: {
          audience?: string | null
          conditional_on?: Json | null
          db_target?: Json
          erstellt_am?: string
          feld_key?: string
          hint?: string | null
          i18n?: Json | null
          id?: string
          label?: string
          optionen?: Json | null
          pflicht?: boolean
          phase_id?: string
          placeholder?: string | null
          reihenfolge?: number
          sektion?: string | null
          typ?: string
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_felder_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "onboarding_phasen"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_phasen: {
        Row: {
          beschreibung: string | null
          conditional_on: Json | null
          erstellt_am: string
          eyebrow: string | null
          flow_key: string
          i18n: Json | null
          id: string
          phase_key: string
          reihenfolge: number
          titel: string
        }
        Insert: {
          beschreibung?: string | null
          conditional_on?: Json | null
          erstellt_am?: string
          eyebrow?: string | null
          flow_key: string
          i18n?: Json | null
          id?: string
          phase_key: string
          reihenfolge: number
          titel: string
        }
        Update: {
          beschreibung?: string | null
          conditional_on?: Json | null
          erstellt_am?: string
          eyebrow?: string | null
          flow_key?: string
          i18n?: Json | null
          id?: string
          phase_key?: string
          reihenfolge?: number
          titel?: string
        }
        Relationships: []
      }
      orchestrator_auto_policy: {
        Row: {
          aktualisiert_am: string
          auto_revert_grund: string | null
          geflippt_am: string | null
          geflippt_von: string | null
          id: string
          mode: string
          vorschlag_typ: string
          ziel_rolle: string
        }
        Insert: {
          aktualisiert_am?: string
          auto_revert_grund?: string | null
          geflippt_am?: string | null
          geflippt_von?: string | null
          id?: string
          mode?: string
          vorschlag_typ: string
          ziel_rolle: string
        }
        Update: {
          aktualisiert_am?: string
          auto_revert_grund?: string | null
          geflippt_am?: string | null
          geflippt_von?: string | null
          id?: string
          mode?: string
          vorschlag_typ?: string
          ziel_rolle?: string
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
          {
            foreignKeyName: "paket_upgrades_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      parteien: {
        Row: {
          adresse: string | null
          anrede: string | null
          claim_id: string | null
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
          anrede?: string | null
          claim_id?: string | null
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
          anrede?: string | null
          claim_id?: string | null
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
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "parteien_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
      partner_aktivitaeten: {
        Row: {
          erstellt_am: string
          erstellt_von: string | null
          id: string
          ist_system: boolean
          meta: Json | null
          partner_id: string
          partner_typ: string
          text: string
          typ: string
        }
        Insert: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          ist_system?: boolean
          meta?: Json | null
          partner_id: string
          partner_typ: string
          text: string
          typ: string
        }
        Update: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          ist_system?: boolean
          meta?: Json | null
          partner_id?: string
          partner_typ?: string
          text?: string
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_aktivitaeten_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_gutschriften: {
        Row: {
          aussteller_snapshot: Json
          betrag_brutto: number
          betrag_netto: number
          bezug_gutschrift_id: string | null
          empfaenger_snapshot: Json
          erstellt_am: string
          gutschrift_nr: string
          id: string
          ledger_id: string
          ledger_tabelle: string
          leistung_datum: string | null
          leistung_text: string
          partner_id: string
          partner_typ: string
          pdf_storage_path: string | null
          status: string
          storno_grund: string | null
          typ: string
          ust_betrag: number | null
          ust_satz: number | null
          versendet_am: string | null
        }
        Insert: {
          aussteller_snapshot: Json
          betrag_brutto: number
          betrag_netto: number
          bezug_gutschrift_id?: string | null
          empfaenger_snapshot: Json
          erstellt_am?: string
          gutschrift_nr: string
          id?: string
          ledger_id: string
          ledger_tabelle: string
          leistung_datum?: string | null
          leistung_text: string
          partner_id: string
          partner_typ: string
          pdf_storage_path?: string | null
          status?: string
          storno_grund?: string | null
          typ?: string
          ust_betrag?: number | null
          ust_satz?: number | null
          versendet_am?: string | null
        }
        Update: {
          aussteller_snapshot?: Json
          betrag_brutto?: number
          betrag_netto?: number
          bezug_gutschrift_id?: string | null
          empfaenger_snapshot?: Json
          erstellt_am?: string
          gutschrift_nr?: string
          id?: string
          ledger_id?: string
          ledger_tabelle?: string
          leistung_datum?: string | null
          leistung_text?: string
          partner_id?: string
          partner_typ?: string
          pdf_storage_path?: string | null
          status?: string
          storno_grund?: string | null
          typ?: string
          ust_betrag?: number | null
          ust_satz?: number | null
          versendet_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_gutschriften_bezug_gutschrift_id_fkey"
            columns: ["bezug_gutschrift_id"]
            isOneToOne: false
            referencedRelation: "partner_gutschriften"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_lead_aktivitaeten: {
        Row: {
          erstellt_am: string
          erstellt_von: string | null
          id: string
          partner_lead_id: string
          text: string | null
          typ: string
        }
        Insert: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          partner_lead_id: string
          text?: string | null
          typ: string
        }
        Update: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          partner_lead_id?: string
          text?: string | null
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_lead_aktivitaeten_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_lead_aktivitaeten_partner_lead_id_fkey"
            columns: ["partner_lead_id"]
            isOneToOne: false
            referencedRelation: "partner_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_leads: {
        Row: {
          aktualisiert_am: string
          ansprechpartner_email: string | null
          ansprechpartner_nachname: string | null
          ansprechpartner_position: string | null
          ansprechpartner_telefon: string | null
          ansprechpartner_vorname: string | null
          einstufung: string | null
          email: string | null
          erstellt_am: string
          firma: string | null
          google_place_id: string | null
          id: string
          konvertiert_am: string | null
          konvertiert_durch: string | null
          konvertiert_zu_partner_id: string | null
          konvertiert_zu_user_id: string | null
          lat: number | null
          lng: number | null
          notiz: string | null
          ort: string | null
          plz: string | null
          rolle: string
          rollen_details: Json
          source_channel: string
          status: string
          strasse: string | null
          telefon: string | null
          zugewiesen_an: string | null
        }
        Insert: {
          aktualisiert_am?: string
          ansprechpartner_email?: string | null
          ansprechpartner_nachname?: string | null
          ansprechpartner_position?: string | null
          ansprechpartner_telefon?: string | null
          ansprechpartner_vorname?: string | null
          einstufung?: string | null
          email?: string | null
          erstellt_am?: string
          firma?: string | null
          google_place_id?: string | null
          id?: string
          konvertiert_am?: string | null
          konvertiert_durch?: string | null
          konvertiert_zu_partner_id?: string | null
          konvertiert_zu_user_id?: string | null
          lat?: number | null
          lng?: number | null
          notiz?: string | null
          ort?: string | null
          plz?: string | null
          rolle: string
          rollen_details?: Json
          source_channel?: string
          status?: string
          strasse?: string | null
          telefon?: string | null
          zugewiesen_an?: string | null
        }
        Update: {
          aktualisiert_am?: string
          ansprechpartner_email?: string | null
          ansprechpartner_nachname?: string | null
          ansprechpartner_position?: string | null
          ansprechpartner_telefon?: string | null
          ansprechpartner_vorname?: string | null
          einstufung?: string | null
          email?: string | null
          erstellt_am?: string
          firma?: string | null
          google_place_id?: string | null
          id?: string
          konvertiert_am?: string | null
          konvertiert_durch?: string | null
          konvertiert_zu_partner_id?: string | null
          konvertiert_zu_user_id?: string | null
          lat?: number | null
          lng?: number | null
          notiz?: string | null
          ort?: string | null
          plz?: string | null
          rolle?: string
          rollen_details?: Json
          source_channel?: string
          status?: string
          strasse?: string | null
          telefon?: string | null
          zugewiesen_an?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_leads_konvertiert_durch_fkey"
            columns: ["konvertiert_durch"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_leads_zugewiesen_an_fkey"
            columns: ["zugewiesen_an"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_provisionen: {
        Row: {
          abrechnung_id: string | null
          ausgezahlt_am: string | null
          betrag_brutto: number | null
          betrag_netto_eur: number | null
          claim_id: string | null
          claim_nummer: string | null
          erstellt_am: string
          fall_id: string | null
          hold_until: string | null
          id: string
          lead_id: string | null
          partner_id: string
          partner_typ: string
          promotion_code_id: string | null
          service_typ: string | null
          status: string | null
          storniert_am: string | null
          storno_grund: string | null
          trigger_at: string | null
          trigger_event: string | null
          ust_betrag: number | null
          ust_satz: number | null
        }
        Insert: {
          abrechnung_id?: string | null
          ausgezahlt_am?: string | null
          betrag_brutto?: number | null
          betrag_netto_eur?: number | null
          claim_id?: string | null
          claim_nummer?: string | null
          erstellt_am?: string
          fall_id?: string | null
          hold_until?: string | null
          id?: string
          lead_id?: string | null
          partner_id: string
          partner_typ: string
          promotion_code_id?: string | null
          service_typ?: string | null
          status?: string | null
          storniert_am?: string | null
          storno_grund?: string | null
          trigger_at?: string | null
          trigger_event?: string | null
          ust_betrag?: number | null
          ust_satz?: number | null
        }
        Update: {
          abrechnung_id?: string | null
          ausgezahlt_am?: string | null
          betrag_brutto?: number | null
          betrag_netto_eur?: number | null
          claim_id?: string | null
          claim_nummer?: string | null
          erstellt_am?: string
          fall_id?: string | null
          hold_until?: string | null
          id?: string
          lead_id?: string | null
          partner_id?: string
          partner_typ?: string
          promotion_code_id?: string | null
          service_typ?: string | null
          status?: string | null
          storniert_am?: string | null
          storno_grund?: string | null
          trigger_at?: string | null
          trigger_event?: string | null
          ust_betrag?: number | null
          ust_satz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_provisionen_claim_bridge_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "partner_provisionen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_provisionen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "partner_provisionen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_provisionen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_rang: {
        Row: {
          credential_score: number
          gate_cap: string | null
          gate_ok: boolean
          id: string
          partner_id: string
          partner_typ: string
          rang: string | null
          rating_score: number
          score: number
          sinnsatz: string | null
          stand: string
          volumen: number
        }
        Insert: {
          credential_score?: number
          gate_cap?: string | null
          gate_ok?: boolean
          id?: string
          partner_id: string
          partner_typ: string
          rang?: string | null
          rating_score?: number
          score?: number
          sinnsatz?: string | null
          stand?: string
          volumen?: number
        }
        Update: {
          credential_score?: number
          gate_cap?: string | null
          gate_ok?: boolean
          id?: string
          partner_id?: string
          partner_typ?: string
          rang?: string | null
          rating_score?: number
          score?: number
          sinnsatz?: string | null
          stand?: string
          volumen?: number
        }
        Relationships: []
      }
      partner_rang_config: {
        Row: {
          beschreibung: string | null
          schluessel: string
          updated_at: string
          wert: number
        }
        Insert: {
          beschreibung?: string | null
          schluessel: string
          updated_at?: string
          wert: number
        }
        Update: {
          beschreibung?: string | null
          schluessel?: string
          updated_at?: string
          wert?: number
        }
        Relationships: []
      }
      partner_rollen_policy: {
        Row: {
          aktualisiert_am: string
          auto_konvertieren: boolean
          braucht_review: boolean
          braucht_zahlung: boolean
          rolle: string
          self_signup_erlaubt: boolean
        }
        Insert: {
          aktualisiert_am?: string
          auto_konvertieren?: boolean
          braucht_review?: boolean
          braucht_zahlung?: boolean
          rolle: string
          self_signup_erlaubt?: boolean
        }
        Update: {
          aktualisiert_am?: string
          auto_konvertieren?: boolean
          braucht_review?: boolean
          braucht_zahlung?: boolean
          rolle?: string
          self_signup_erlaubt?: boolean
        }
        Relationships: []
      }
      partner_staffel_bonus: {
        Row: {
          betrag_brutto: number | null
          bonus_betrag_netto: number | null
          erstellt_am: string
          id: string
          partner_id: string
          partner_typ: string
          schwelle: number | null
          status: string | null
          stufe_id: string | null
          ust_betrag: number | null
          ust_satz: number | null
        }
        Insert: {
          betrag_brutto?: number | null
          bonus_betrag_netto?: number | null
          erstellt_am?: string
          id?: string
          partner_id: string
          partner_typ: string
          schwelle?: number | null
          status?: string | null
          stufe_id?: string | null
          ust_betrag?: number | null
          ust_satz?: number | null
        }
        Update: {
          betrag_brutto?: number | null
          bonus_betrag_netto?: number | null
          erstellt_am?: string
          id?: string
          partner_id?: string
          partner_typ?: string
          schwelle?: number | null
          status?: string | null
          stufe_id?: string | null
          ust_betrag?: number | null
          ust_satz?: number | null
        }
        Relationships: []
      }
      personen: {
        Row: {
          adresse_land: string | null
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          anonymisiert_am: string | null
          anrede: string | null
          canonical_person_id: string | null
          created_at: string
          email: string | null
          firma: string | null
          firma_id: string | null
          fuehrerscheinklassen: string | null
          fuehrerscheinnummer: string | null
          geburtsdatum: string | null
          id: string
          ist_anonymisiert: boolean
          ist_gewerbe: boolean
          mobil: string | null
          nachname: string | null
          notiz: string | null
          telefon: string | null
          titel: string | null
          updated_at: string
          user_id: string | null
          ust_id: string | null
          vorname: string | null
        }
        Insert: {
          adresse_land?: string | null
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          anonymisiert_am?: string | null
          anrede?: string | null
          canonical_person_id?: string | null
          created_at?: string
          email?: string | null
          firma?: string | null
          firma_id?: string | null
          fuehrerscheinklassen?: string | null
          fuehrerscheinnummer?: string | null
          geburtsdatum?: string | null
          id?: string
          ist_anonymisiert?: boolean
          ist_gewerbe?: boolean
          mobil?: string | null
          nachname?: string | null
          notiz?: string | null
          telefon?: string | null
          titel?: string | null
          updated_at?: string
          user_id?: string | null
          ust_id?: string | null
          vorname?: string | null
        }
        Update: {
          adresse_land?: string | null
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          anonymisiert_am?: string | null
          anrede?: string | null
          canonical_person_id?: string | null
          created_at?: string
          email?: string | null
          firma?: string | null
          firma_id?: string | null
          fuehrerscheinklassen?: string | null
          fuehrerscheinnummer?: string | null
          geburtsdatum?: string | null
          id?: string
          ist_anonymisiert?: boolean
          ist_gewerbe?: boolean
          mobil?: string | null
          nachname?: string | null
          notiz?: string | null
          telefon?: string | null
          titel?: string | null
          updated_at?: string
          user_id?: string | null
          ust_id?: string | null
          vorname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personen_canonical_person_id_fkey"
            columns: ["canonical_person_id"]
            isOneToOne: false
            referencedRelation: "personen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personen_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personen_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personenschaden_personen: {
        Row: {
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "personenschaden_personen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "personenschaden_personen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenschaden_personen_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "pflichtdokumente_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "pflichtdokumente_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_transitions: {
        Row: {
          actor_rolle: string | null
          claim_id: string | null
          created_at: string
          fall_id: string
          from_phase: string | null
          grund: string | null
          id: string
          payload: Json | null
          to_phase: string
          transition_at: string
          transitioned_by: string | null
          trigger_type: string
        }
        Insert: {
          actor_rolle?: string | null
          claim_id?: string | null
          created_at?: string
          fall_id: string
          from_phase?: string | null
          grund?: string | null
          id?: string
          payload?: Json | null
          to_phase: string
          transition_at?: string
          transitioned_by?: string | null
          trigger_type: string
        }
        Update: {
          actor_rolle?: string | null
          claim_id?: string | null
          created_at?: string
          fall_id?: string
          from_phase?: string | null
          grund?: string | null
          id?: string
          payload?: Json | null
          to_phase?: string
          transition_at?: string
          transitioned_by?: string | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "phase_transitions_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
        ]
      }
      plz_geo: {
        Row: {
          created_at: string
          lat: number
          lng: number
          ort: string | null
          plz: string
        }
        Insert: {
          created_at?: string
          lat: number
          lng: number
          ort?: string | null
          plz: string
        }
        Update: {
          created_at?: string
          lat?: number
          lng?: number
          ort?: string | null
          plz?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_typ: string
          actions_last_seen_at: string | null
          adresse: string | null
          aircall_email: string | null
          aircall_user_id: string | null
          aktiv: boolean | null
          anrede: string | null
          anzeigename: string | null
          audio_settings: Json | null
          auth_provider: string | null
          avatar_url: string | null
          community_id: string | null
          created_at: string | null
          email: string
          entstanden_aus_airdrop_id: string | null
          entstanden_aus_claim_id: string | null
          entstanden_via: string | null
          firma: string | null
          force_password_change: boolean | null
          google_connected_at: string | null
          google_email: string | null
          google_place_id: string | null
          id: string
          kanzlei_id: string | null
          kapazitaet_max: number | null
          kategorie: string | null
          ms_connected_at: string | null
          ms_email: string | null
          nachname: string | null
          netzwerk_owner_id: string | null
          netzwerk_owner_seit: string | null
          onboarding_completed_at: string | null
          ort: string | null
          plz: string | null
          profilbeschreibung: string | null
          rolle: Database["public"]["Enums"]["user_role"]
          sprache: string | null
          sv_paket: Database["public"]["Enums"]["sv_paket_typ"] | null
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
          updates_last_seen_at: string | null
          upgrade_to_voll_at: string | null
          vorname: string | null
          whatsapp_geprueft_am: string | null
          whatsapp_verfuegbar: boolean | null
          working_hours: Json | null
          zweit_email: string | null
        }
        Insert: {
          account_typ?: string
          actions_last_seen_at?: string | null
          adresse?: string | null
          aircall_email?: string | null
          aircall_user_id?: string | null
          aktiv?: boolean | null
          anrede?: string | null
          anzeigename?: string | null
          audio_settings?: Json | null
          auth_provider?: string | null
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          email: string
          entstanden_aus_airdrop_id?: string | null
          entstanden_aus_claim_id?: string | null
          entstanden_via?: string | null
          firma?: string | null
          force_password_change?: boolean | null
          google_connected_at?: string | null
          google_email?: string | null
          google_place_id?: string | null
          id: string
          kanzlei_id?: string | null
          kapazitaet_max?: number | null
          kategorie?: string | null
          ms_connected_at?: string | null
          ms_email?: string | null
          nachname?: string | null
          netzwerk_owner_id?: string | null
          netzwerk_owner_seit?: string | null
          onboarding_completed_at?: string | null
          ort?: string | null
          plz?: string | null
          profilbeschreibung?: string | null
          rolle?: Database["public"]["Enums"]["user_role"]
          sprache?: string | null
          sv_paket?: Database["public"]["Enums"]["sv_paket_typ"] | null
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
          updates_last_seen_at?: string | null
          upgrade_to_voll_at?: string | null
          vorname?: string | null
          whatsapp_geprueft_am?: string | null
          whatsapp_verfuegbar?: boolean | null
          working_hours?: Json | null
          zweit_email?: string | null
        }
        Update: {
          account_typ?: string
          actions_last_seen_at?: string | null
          adresse?: string | null
          aircall_email?: string | null
          aircall_user_id?: string | null
          aktiv?: boolean | null
          anrede?: string | null
          anzeigename?: string | null
          audio_settings?: Json | null
          auth_provider?: string | null
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          email?: string
          entstanden_aus_airdrop_id?: string | null
          entstanden_aus_claim_id?: string | null
          entstanden_via?: string | null
          firma?: string | null
          force_password_change?: boolean | null
          google_connected_at?: string | null
          google_email?: string | null
          google_place_id?: string | null
          id?: string
          kanzlei_id?: string | null
          kapazitaet_max?: number | null
          kategorie?: string | null
          ms_connected_at?: string | null
          ms_email?: string | null
          nachname?: string | null
          netzwerk_owner_id?: string | null
          netzwerk_owner_seit?: string | null
          onboarding_completed_at?: string | null
          ort?: string | null
          plz?: string | null
          profilbeschreibung?: string | null
          rolle?: Database["public"]["Enums"]["user_role"]
          sprache?: string | null
          sv_paket?: Database["public"]["Enums"]["sv_paket_typ"] | null
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
          updates_last_seen_at?: string | null
          upgrade_to_voll_at?: string | null
          vorname?: string | null
          whatsapp_geprueft_am?: string | null
          whatsapp_verfuegbar?: boolean | null
          working_hours?: Json | null
          zweit_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_airdrop_id_fkey"
            columns: ["entstanden_aus_airdrop_id"]
            isOneToOne: false
            referencedRelation: "airdrop_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_entstanden_aus_claim_id_fkey"
            columns: ["entstanden_aus_claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "profiles_kanzlei_id_fkey"
            columns: ["kanzlei_id"]
            isOneToOne: false
            referencedRelation: "kanzlei"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_netzwerk_owner_id_fkey"
            columns: ["netzwerk_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_oauth_secrets: {
        Row: {
          google_access_token: string | null
          google_refresh_token: string | null
          google_token_expires_at: string | null
          ms_access_token: string | null
          ms_refresh_token: string | null
          ms_token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          ms_access_token?: string | null
          ms_refresh_token?: string | null
          ms_token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          ms_access_token?: string | null
          ms_refresh_token?: string | null
          ms_token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_oauth_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "qc_checkliste_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          netzwerk_monat_cent: number | null
          netzwerk_setup_cent: number | null
          ort: string
          plz: string
          rechnungssteller: string
          steuernummer: string | null
          strasse: string
          ust_id: string | null
          version: number
          werkstatt_setup_cent: number | null
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
          netzwerk_monat_cent?: number | null
          netzwerk_setup_cent?: number | null
          ort: string
          plz: string
          rechnungssteller: string
          steuernummer?: string | null
          strasse: string
          ust_id?: string | null
          version?: number
          werkstatt_setup_cent?: number | null
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
          netzwerk_monat_cent?: number | null
          netzwerk_setup_cent?: number | null
          ort?: string
          plz?: string
          rechnungssteller?: string
          steuernummer?: string | null
          strasse?: string
          ust_id?: string | null
          version?: number
          werkstatt_setup_cent?: number | null
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "regulierungs_klassifizierung_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: true
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "reklamationen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "reklamationen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs: {
        Row: {
          abgeschlossen_am: string | null
          auftragsnummer: string | null
          claim_id: string | null
          created_at: string
          created_by_user_id: string | null
          geplanter_beginn: string | null
          gutachten_id: string | null
          id: string
          kostenvoranschlag: number | null
          notiz: string | null
          status: string
          tatsaechliche_kosten: number | null
          tatsaechlicher_beginn: string | null
          updated_at: string
          vehicle_id: string | null
          werkstatt_id: string | null
        }
        Insert: {
          abgeschlossen_am?: string | null
          auftragsnummer?: string | null
          claim_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          geplanter_beginn?: string | null
          gutachten_id?: string | null
          id?: string
          kostenvoranschlag?: number | null
          notiz?: string | null
          status?: string
          tatsaechliche_kosten?: number | null
          tatsaechlicher_beginn?: string | null
          updated_at?: string
          vehicle_id?: string | null
          werkstatt_id?: string | null
        }
        Update: {
          abgeschlossen_am?: string | null
          auftragsnummer?: string | null
          claim_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          geplanter_beginn?: string | null
          gutachten_id?: string | null
          id?: string
          kostenvoranschlag?: number | null
          notiz?: string | null
          status?: string
          tatsaechliche_kosten?: number | null
          tatsaechlicher_beginn?: string | null
          updated_at?: string
          vehicle_id?: string | null
          werkstatt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "repairs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "gutachten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_gutachten_id_fkey"
            columns: ["gutachten_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["gutachten_id"]
          },
          {
            foreignKeyName: "repairs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "repairs_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      reparatur_termine: {
        Row: {
          absage_grund: string | null
          bestaetigter_termin: string | null
          claim_id: string
          created_at: string
          erledigt_am: string | null
          erstellt_von: string | null
          id: string
          rueckruf_wunschzeit: string | null
          status: string
          updated_at: string
          werkstatt_id: string
          wunschtermin: string | null
        }
        Insert: {
          absage_grund?: string | null
          bestaetigter_termin?: string | null
          claim_id: string
          created_at?: string
          erledigt_am?: string | null
          erstellt_von?: string | null
          id?: string
          rueckruf_wunschzeit?: string | null
          status?: string
          updated_at?: string
          werkstatt_id: string
          wunschtermin?: string | null
        }
        Update: {
          absage_grund?: string | null
          bestaetigter_termin?: string | null
          claim_id?: string
          created_at?: string
          erledigt_am?: string | null
          erstellt_von?: string | null
          id?: string
          rueckruf_wunschzeit?: string | null
          status?: string
          updated_at?: string
          werkstatt_id?: string
          wunschtermin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "reparatur_termine_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "reparatur_termine_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
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
          arbeitet_eigenstaendig: boolean
          arbeitszeiten: Json | null
          basic_onboarding_abgeschlossen_am: string | null
          bestellungs_kammer: string | null
          blockierte_wochentage: number[]
          brand_accent: string | null
          brand_extracted_at: string | null
          brand_primary: string | null
          brand_secondary: string | null
          brand_theme: Json | null
          bvsk_mitgliedsnummer: string | null
          community_anonym: boolean
          created_at: string | null
          dat_nummer: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          firmenname: string | null
          gcal_calendar_id: string | null
          gcal_connected: boolean | null
          gebiet_plz: string[]
          geloescht_am: string | null
          gesperrt_grund: string | null
          gesperrt_seit: string | null
          gesperrt_von_user_id: string | null
          gutachter_typ: string | null
          hrb: string | null
          id: string
          ihk_zertifikat_nummer: string | null
          isochrone_polygon: Json | null
          ist_aktiv: boolean | null
          ist_parent_account: boolean | null
          ist_testaccount: boolean
          kalender_sync_aktiv: boolean | null
          kalender_sync_letzte: string | null
          kalender_typ: string | null
          kapazitaeten_jsonb: Json | null
          live_tracking_enabled: boolean | null
          logo_url: string | null
          notizen: string | null
          oebuv_bestellungsnummer: string | null
          oeffentlich_bestellt: boolean
          offene_faelle: number
          onboarding_anzahlung_betrag: number | null
          onboarding_anzahlung_faellig_am: string | null
          onboarding_quelle: string | null
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
          stripe_einzug_fehlgeschlagen_am: string | null
          unterschrift_url: string | null
          updated_at: string | null
          urlaub_bis: string | null
          urlaub_von: string | null
          use_custom_branding: boolean
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
          arbeitet_eigenstaendig?: boolean
          arbeitszeiten?: Json | null
          basic_onboarding_abgeschlossen_am?: string | null
          bestellungs_kammer?: string | null
          blockierte_wochentage?: number[]
          brand_accent?: string | null
          brand_extracted_at?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_theme?: Json | null
          bvsk_mitgliedsnummer?: string | null
          community_anonym?: boolean
          created_at?: string | null
          dat_nummer?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          firmenname?: string | null
          gcal_calendar_id?: string | null
          gcal_connected?: boolean | null
          gebiet_plz?: string[]
          geloescht_am?: string | null
          gesperrt_grund?: string | null
          gesperrt_seit?: string | null
          gesperrt_von_user_id?: string | null
          gutachter_typ?: string | null
          hrb?: string | null
          id?: string
          ihk_zertifikat_nummer?: string | null
          isochrone_polygon?: Json | null
          ist_aktiv?: boolean | null
          ist_parent_account?: boolean | null
          ist_testaccount?: boolean
          kalender_sync_aktiv?: boolean | null
          kalender_sync_letzte?: string | null
          kalender_typ?: string | null
          kapazitaeten_jsonb?: Json | null
          live_tracking_enabled?: boolean | null
          logo_url?: string | null
          notizen?: string | null
          oebuv_bestellungsnummer?: string | null
          oeffentlich_bestellt?: boolean
          offene_faelle?: number
          onboarding_anzahlung_betrag?: number | null
          onboarding_anzahlung_faellig_am?: string | null
          onboarding_quelle?: string | null
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
          stripe_einzug_fehlgeschlagen_am?: string | null
          unterschrift_url?: string | null
          updated_at?: string | null
          urlaub_bis?: string | null
          urlaub_von?: string | null
          use_custom_branding?: boolean
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
          arbeitet_eigenstaendig?: boolean
          arbeitszeiten?: Json | null
          basic_onboarding_abgeschlossen_am?: string | null
          bestellungs_kammer?: string | null
          blockierte_wochentage?: number[]
          brand_accent?: string | null
          brand_extracted_at?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_theme?: Json | null
          bvsk_mitgliedsnummer?: string | null
          community_anonym?: boolean
          created_at?: string | null
          dat_nummer?: string | null
          deaktiviert_am?: string | null
          deaktiviert_grund?: string | null
          firmenname?: string | null
          gcal_calendar_id?: string | null
          gcal_connected?: boolean | null
          gebiet_plz?: string[]
          geloescht_am?: string | null
          gesperrt_grund?: string | null
          gesperrt_seit?: string | null
          gesperrt_von_user_id?: string | null
          gutachter_typ?: string | null
          hrb?: string | null
          id?: string
          ihk_zertifikat_nummer?: string | null
          isochrone_polygon?: Json | null
          ist_aktiv?: boolean | null
          ist_parent_account?: boolean | null
          ist_testaccount?: boolean
          kalender_sync_aktiv?: boolean | null
          kalender_sync_letzte?: string | null
          kalender_typ?: string | null
          kapazitaeten_jsonb?: Json | null
          live_tracking_enabled?: boolean | null
          logo_url?: string | null
          notizen?: string | null
          oebuv_bestellungsnummer?: string | null
          oeffentlich_bestellt?: boolean
          offene_faelle?: number
          onboarding_anzahlung_betrag?: number | null
          onboarding_anzahlung_faellig_am?: string | null
          onboarding_quelle?: string | null
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
          stripe_einzug_fehlgeschlagen_am?: string | null
          unterschrift_url?: string | null
          updated_at?: string | null
          urlaub_bis?: string | null
          urlaub_von?: string | null
          use_custom_branding?: boolean
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
            foreignKeyName: "sachverstaendige_verifiziert_von_fkey"
            columns: ["verifiziert_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schadenkarten: {
        Row: {
          charge: string | null
          erstellt_am: string
          fahrzeug_id: string | null
          firma_id: string | null
          gebunden_am: string | null
          gebunden_von: string | null
          id: string
          karten_token: string
          nfc_uid: string | null
          status: string
        }
        Insert: {
          charge?: string | null
          erstellt_am?: string
          fahrzeug_id?: string | null
          firma_id?: string | null
          gebunden_am?: string | null
          gebunden_von?: string | null
          id?: string
          karten_token: string
          nfc_uid?: string | null
          status?: string
        }
        Update: {
          charge?: string | null
          erstellt_am?: string
          fahrzeug_id?: string | null
          firma_id?: string | null
          gebunden_am?: string | null
          gebunden_von?: string | null
          id?: string
          karten_token?: string
          nfc_uid?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "schadenkarten_fahrzeug_id_fkey"
            columns: ["fahrzeug_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenkarten_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
        ]
      }
      schadenspositionen: {
        Row: {
          alter_jahre: number | null
          beschreibung: string | null
          bezeichnung: string
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "schadenspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sla_tracking_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
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
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sla_tracking_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "stripe_events_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
          ticket_typ: string | null
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
          ticket_typ?: string | null
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
          ticket_typ?: string | null
          turn_count?: number
          user_id?: string
        }
        Relationships: []
      }
      sv_buero: {
        Row: {
          adresse_land: string
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          aggregierte_rechnungsstellung: boolean
          created_at: string
          email: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          name: string
          notiz: string | null
          rechtsform: string | null
          status: string
          telefon: string | null
          updated_at: string
          ust_id: string | null
        }
        Insert: {
          adresse_land?: string
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          aggregierte_rechnungsstellung?: boolean
          created_at?: string
          email?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          name: string
          notiz?: string | null
          rechtsform?: string | null
          status?: string
          telefon?: string | null
          updated_at?: string
          ust_id?: string | null
        }
        Update: {
          adresse_land?: string
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          aggregierte_rechnungsstellung?: boolean
          created_at?: string
          email?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          name?: string
          notiz?: string | null
          rechtsform?: string | null
          status?: string
          telefon?: string | null
          updated_at?: string
          ust_id?: string | null
        }
        Relationships: []
      }
      sv_buero_memberships: {
        Row: {
          buero_id: string
          created_at: string
          end_date: string | null
          id: string
          rolle: string
          start_date: string
          sv_id: string
        }
        Insert: {
          buero_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          rolle: string
          start_date?: string
          sv_id: string
        }
        Update: {
          buero_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          rolle?: string
          start_date?: string
          sv_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_buero_memberships_buero_id_fkey"
            columns: ["buero_id"]
            isOneToOne: false
            referencedRelation: "sv_buero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_buero_memberships_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_buero_memberships_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_community: {
        Row: {
          beschreibung: string | null
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sv_kalender_events_cache: {
        Row: {
          end_zeit: string
          external_event_id: string | null
          id: string
          last_synced_at: string
          profile_id: string | null
          source: string
          start_zeit: string
          sv_id: string | null
          titel: string | null
        }
        Insert: {
          end_zeit: string
          external_event_id?: string | null
          id?: string
          last_synced_at?: string
          profile_id?: string | null
          source: string
          start_zeit: string
          sv_id?: string | null
          titel?: string | null
        }
        Update: {
          end_zeit?: string
          external_event_id?: string | null
          id?: string
          last_synced_at?: string
          profile_id?: string | null
          source?: string
          start_zeit?: string
          sv_id?: string | null
          titel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sv_kalender_events_cache_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_kalender_events_cache_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_kalender_verbindungen: {
        Row: {
          calendar_display_name: string | null
          calendar_url: string | null
          connected_at: string
          created_at: string
          fehler_task_id: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_sync_at: string | null
          password_encrypted: string
          provider: string
          provider_label: string | null
          server_url: string
          sv_id: string
          updated_at: string
          username: string
        }
        Insert: {
          calendar_display_name?: string | null
          calendar_url?: string | null
          connected_at?: string
          created_at?: string
          fehler_task_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_at?: string | null
          password_encrypted: string
          provider: string
          provider_label?: string | null
          server_url: string
          sv_id: string
          updated_at?: string
          username: string
        }
        Update: {
          calendar_display_name?: string | null
          calendar_url?: string | null
          connected_at?: string
          created_at?: string
          fehler_task_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_at?: string | null
          password_encrypted?: string
          provider?: string
          provider_label?: string | null
          server_url?: string
          sv_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_kalender_verbindungen_fehler_task_id_fkey"
            columns: ["fehler_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_kalender_verbindungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_kalender_verbindungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_leads: {
        Row: {
          adresse: string
          aktualisiert_am: string
          auftraege_monat: number | null
          bvsk_nr: string | null
          claim_status: string
          dat_expert_nr: string | null
          dat_id: string | null
          dat_url: string | null
          email: string | null
          erstellt_am: string
          fachschwerpunkte: string | null
          firma: string | null
          id: string
          ihk_zertifikat: boolean | null
          isochrone_polygon: Json | null
          ist_aktiv: boolean
          jahre_erfahrung: number | null
          konvertiert_am: string | null
          konvertiert_zu_sv_id: string | null
          lat: number
          lng: number
          nachname: string | null
          name: string
          normalized_name: string | null
          notizen: string | null
          oebuv_nr: string | null
          ort: string | null
          paket_umkreis_km: number | null
          plz: string | null
          qualifikationen: string[] | null
          quelle: string
          radius_km: number | null
          telefon: string | null
          vorname: string | null
          warteliste_am: string | null
          warteliste_status: string
        }
        Insert: {
          adresse: string
          aktualisiert_am?: string
          auftraege_monat?: number | null
          bvsk_nr?: string | null
          claim_status?: string
          dat_expert_nr?: string | null
          dat_id?: string | null
          dat_url?: string | null
          email?: string | null
          erstellt_am?: string
          fachschwerpunkte?: string | null
          firma?: string | null
          id?: string
          ihk_zertifikat?: boolean | null
          isochrone_polygon?: Json | null
          ist_aktiv?: boolean
          jahre_erfahrung?: number | null
          konvertiert_am?: string | null
          konvertiert_zu_sv_id?: string | null
          lat: number
          lng: number
          nachname?: string | null
          name: string
          normalized_name?: string | null
          notizen?: string | null
          oebuv_nr?: string | null
          ort?: string | null
          paket_umkreis_km?: number | null
          plz?: string | null
          qualifikationen?: string[] | null
          quelle?: string
          radius_km?: number | null
          telefon?: string | null
          vorname?: string | null
          warteliste_am?: string | null
          warteliste_status?: string
        }
        Update: {
          adresse?: string
          aktualisiert_am?: string
          auftraege_monat?: number | null
          bvsk_nr?: string | null
          claim_status?: string
          dat_expert_nr?: string | null
          dat_id?: string | null
          dat_url?: string | null
          email?: string | null
          erstellt_am?: string
          fachschwerpunkte?: string | null
          firma?: string | null
          id?: string
          ihk_zertifikat?: boolean | null
          isochrone_polygon?: Json | null
          ist_aktiv?: boolean
          jahre_erfahrung?: number | null
          konvertiert_am?: string | null
          konvertiert_zu_sv_id?: string | null
          lat?: number
          lng?: number
          nachname?: string | null
          name?: string
          normalized_name?: string | null
          notizen?: string | null
          oebuv_nr?: string | null
          ort?: string | null
          paket_umkreis_km?: number | null
          plz?: string | null
          qualifikationen?: string[] | null
          quelle?: string
          radius_km?: number | null
          telefon?: string | null
          vorname?: string | null
          warteliste_am?: string | null
          warteliste_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_leads_konvertiert_zu_sv_id_fkey"
            columns: ["konvertiert_zu_sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_leads_konvertiert_zu_sv_id_fkey"
            columns: ["konvertiert_zu_sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_live_location: {
        Row: {
          accuracy: number | null
          claim_id: string | null
          eta_minuten: number | null
          fall_id: string | null
          lat: number
          lng: number
          sv_id: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          claim_id?: string | null
          eta_minuten?: number | null
          fall_id?: string | null
          lat: number
          lng: number
          sv_id: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          claim_id?: string | null
          eta_minuten?: number | null
          fall_id?: string | null
          lat?: number
          lng?: number
          sv_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "sv_live_location_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: true
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_live_location_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: true
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "sv_live_position_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_netzwerk_abonnements: {
        Row: {
          aktualisiert_am: string
          erstellt_am: string
          gueltig_bis: string | null
          id: string
          status: string
          stripe_subscription_id: string | null
          sv_id: string
          ueberfaellig_seit: string | null
        }
        Insert: {
          aktualisiert_am?: string
          erstellt_am?: string
          gueltig_bis?: string | null
          id?: string
          status?: string
          stripe_subscription_id?: string | null
          sv_id: string
          ueberfaellig_seit?: string | null
        }
        Update: {
          aktualisiert_am?: string
          erstellt_am?: string
          gueltig_bis?: string | null
          id?: string
          status?: string
          stripe_subscription_id?: string | null
          sv_id?: string
          ueberfaellig_seit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sv_netzwerk_abonnements_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_netzwerk_abonnements_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
          {
            foreignKeyName: "sv_onboarding_rechnungen_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
          {
            foreignKeyName: "sv_payment_reminders_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_private_stops: {
        Row: {
          address: string
          created_at: string
          datum: string
          end_zeit: string
          external_event_id: string
          id: string
          lat: number
          lng: number
          place_id: string | null
          source: string
          start_zeit: string
          sv_id: string
          titel: string | null
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          datum: string
          end_zeit: string
          external_event_id: string
          id?: string
          lat: number
          lng: number
          place_id?: string | null
          source: string
          start_zeit: string
          sv_id: string
          titel?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          datum?: string
          end_zeit?: string
          external_event_id?: string
          id?: string
          lat?: number
          lng?: number
          place_id?: string | null
          source?: string
          start_zeit?: string
          sv_id?: string
          titel?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_private_stops_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_private_stops_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "sv_tages_session_aktueller_termin_id_fkey"
            columns: ["aktueller_termin_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "sv_tages_session_aktueller_termin_id_fkey"
            columns: ["aktueller_termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "sv_tages_session_aktueller_termin_id_fkey"
            columns: ["aktueller_termin_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "sv_tages_session_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_tages_session_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
          claim_id: string | null
          created_at: string | null
          deadline: string | null
          empfaenger_rolle: string | null
          empfaenger_user_id: string | null
          entity_id: string | null
          entity_type: string | null
          erinnerung_gesendet: boolean | null
          erledigt_am: string | null
          erstellt_von_id: string | null
          eskaliert_am: string | null
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
          claim_id?: string | null
          created_at?: string | null
          deadline?: string | null
          empfaenger_rolle?: string | null
          empfaenger_user_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          erinnerung_gesendet?: boolean | null
          erledigt_am?: string | null
          erstellt_von_id?: string | null
          eskaliert_am?: string | null
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
          claim_id?: string | null
          created_at?: string | null
          deadline?: string | null
          empfaenger_rolle?: string | null
          empfaenger_user_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          erinnerung_gesendet?: boolean | null
          erledigt_am?: string | null
          erstellt_von_id?: string | null
          eskaliert_am?: string | null
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
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "tasks_empfaenger_user_id_fkey"
            columns: ["empfaenger_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "tasks_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
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
          claim_id: string | null
          erstellt_am: string | null
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
          claim_id?: string | null
          erstellt_am?: string | null
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
          claim_id?: string | null
          erstellt_am?: string | null
          id?: string
          kategorie?: string
          screenshot_url?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "technische_probleme_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "termin_reminders_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "termin_reminders_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "termin_reminders_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
        ]
      }
      termine: {
        Row: {
          betreff: string | null
          betreuer_user_id: string | null
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "termine_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "timeline_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
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
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "timeline_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          {
            foreignKeyName: "timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      twilio_status_events: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          message_sid: string
          raw: Json
          status: string
          to_phone: string | null
          was_whatsapp: boolean
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          message_sid: string
          raw?: Json
          status: string
          to_phone?: string | null
          was_whatsapp?: boolean
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          message_sid?: string
          raw?: Json
          status?: string
          to_phone?: string | null
          was_whatsapp?: boolean
        }
        Relationships: []
      }
      vehicle_ownership_history: {
        Row: {
          bis: string | null
          created_at: string
          erwerbsart: string | null
          halter_label_anon: string | null
          id: string
          kilometerstand_bei_uebernahme: number | null
          notiz: string | null
          quelle: string | null
          user_id: string | null
          vehicle_id: string
          von: string
        }
        Insert: {
          bis?: string | null
          created_at?: string
          erwerbsart?: string | null
          halter_label_anon?: string | null
          id?: string
          kilometerstand_bei_uebernahme?: number | null
          notiz?: string | null
          quelle?: string | null
          user_id?: string | null
          vehicle_id: string
          von: string
        }
        Update: {
          bis?: string | null
          created_at?: string
          erwerbsart?: string | null
          halter_label_anon?: string | null
          id?: string
          kilometerstand_bei_uebernahme?: number | null
          notiz?: string | null
          quelle?: string | null
          user_id?: string | null
          vehicle_id?: string
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_ownership_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ownership_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_scan_fotos: {
        Row: {
          erstellt_am: string
          id: string
          ist_nahaufnahme: boolean
          perspektive: string
          qualitaet_hinweis: string | null
          qualitaet_prozent: number | null
          reihenfolge: number | null
          scan_id: string
          storage_path: string
          vorschaden_id: string | null
        }
        Insert: {
          erstellt_am?: string
          id?: string
          ist_nahaufnahme?: boolean
          perspektive: string
          qualitaet_hinweis?: string | null
          qualitaet_prozent?: number | null
          reihenfolge?: number | null
          scan_id: string
          storage_path: string
          vorschaden_id?: string | null
        }
        Update: {
          erstellt_am?: string
          id?: string
          ist_nahaufnahme?: boolean
          perspektive?: string
          qualitaet_hinweis?: string | null
          qualitaet_prozent?: number | null
          reihenfolge?: number | null
          scan_id?: string
          storage_path?: string
          vorschaden_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_scan_fotos_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "vehicle_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_scan_fotos_vorschaden_id_fkey"
            columns: ["vorschaden_id"]
            isOneToOne: false
            referencedRelation: "vehicle_vorschaeden"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_scans: {
        Row: {
          erstellt_am: string
          erstellt_von: string | null
          id: string
          kilometerstand: number | null
          notiz: string | null
          status: string
          vehicle_id: string
        }
        Insert: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          kilometerstand?: number | null
          notiz?: string | null
          status?: string
          vehicle_id: string
        }
        Update: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          kilometerstand?: number | null
          notiz?: string | null
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_scans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_vorschaeden: {
        Row: {
          art: string | null
          beschreibung: string | null
          claim_id: string | null
          created_at: string
          id: string
          quelle: string
          rohdaten: Json | null
          scan_id: string | null
          schaden_datum: string | null
          schwere: string | null
          state: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          art?: string | null
          beschreibung?: string | null
          claim_id?: string | null
          created_at?: string
          id?: string
          quelle?: string
          rohdaten?: Json | null
          scan_id?: string | null
          schaden_datum?: string | null
          schwere?: string | null
          state?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          art?: string | null
          beschreibung?: string | null
          claim_id?: string | null
          created_at?: string
          id?: string
          quelle?: string
          rohdaten?: Json | null
          scan_id?: string | null
          schaden_datum?: string | null
          schwere?: string | null
          state?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "vehicle_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_vorschaeden_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          abgasnorm: string | null
          achsen: number | null
          aktueller_kilometerstand: number | null
          aktueller_kilometerstand_at: string | null
          antriebsart: string | null
          aufbau: string | null
          bauart: string | null
          baujahr_monat: string | null
          breite_mm: number | null
          cardentity_letzter_pull: string | null
          cardentity_report: Json | null
          co2_g_km: number | null
          created_at: string
          current_owner_id: string | null
          data_completeness_score: number | null
          erstzulassung: string | null
          fahrzeug_ausstattung: Json | null
          fahrzeugklasse: string | null
          farbcode: string | null
          farbe_klartext: string | null
          fin: string | null
          fin_extrahiert_am: string | null
          fin_quelle: string | null
          getriebe: string | null
          hersteller: string | null
          hoehe_mm: number | null
          hsn: string | null
          hubraum_ccm: number | null
          id: string
          ist_metallic: boolean | null
          kennzeichen_aktuell: string | null
          kennzeichen_buchstaben: string | null
          kennzeichen_normalized: string | null
          kraftstoff: string | null
          laenge_mm: number | null
          leermasse_kg: number | null
          leistung_kw: number | null
          modell_haupttyp: string | null
          modell_untertyp: string | null
          produktionszeit_bis: string | null
          produktionszeit_von: string | null
          radstand_mm: number | null
          sitze: number | null
          status: string
          tankvolumen_l: number | null
          tsn: string | null
          tuerzahl: number | null
          updated_at: string
          variante: string | null
          zb1_dokument_id: string | null
          zul_gesamtmasse_kg: number | null
          zylinder: number | null
        }
        Insert: {
          abgasnorm?: string | null
          achsen?: number | null
          aktueller_kilometerstand?: number | null
          aktueller_kilometerstand_at?: string | null
          antriebsart?: string | null
          aufbau?: string | null
          bauart?: string | null
          baujahr_monat?: string | null
          breite_mm?: number | null
          cardentity_letzter_pull?: string | null
          cardentity_report?: Json | null
          co2_g_km?: number | null
          created_at?: string
          current_owner_id?: string | null
          data_completeness_score?: number | null
          erstzulassung?: string | null
          fahrzeug_ausstattung?: Json | null
          fahrzeugklasse?: string | null
          farbcode?: string | null
          farbe_klartext?: string | null
          fin?: string | null
          fin_extrahiert_am?: string | null
          fin_quelle?: string | null
          getriebe?: string | null
          hersteller?: string | null
          hoehe_mm?: number | null
          hsn?: string | null
          hubraum_ccm?: number | null
          id?: string
          ist_metallic?: boolean | null
          kennzeichen_aktuell?: string | null
          kennzeichen_buchstaben?: string | null
          kennzeichen_normalized?: string | null
          kraftstoff?: string | null
          laenge_mm?: number | null
          leermasse_kg?: number | null
          leistung_kw?: number | null
          modell_haupttyp?: string | null
          modell_untertyp?: string | null
          produktionszeit_bis?: string | null
          produktionszeit_von?: string | null
          radstand_mm?: number | null
          sitze?: number | null
          status?: string
          tankvolumen_l?: number | null
          tsn?: string | null
          tuerzahl?: number | null
          updated_at?: string
          variante?: string | null
          zb1_dokument_id?: string | null
          zul_gesamtmasse_kg?: number | null
          zylinder?: number | null
        }
        Update: {
          abgasnorm?: string | null
          achsen?: number | null
          aktueller_kilometerstand?: number | null
          aktueller_kilometerstand_at?: string | null
          antriebsart?: string | null
          aufbau?: string | null
          bauart?: string | null
          baujahr_monat?: string | null
          breite_mm?: number | null
          cardentity_letzter_pull?: string | null
          cardentity_report?: Json | null
          co2_g_km?: number | null
          created_at?: string
          current_owner_id?: string | null
          data_completeness_score?: number | null
          erstzulassung?: string | null
          fahrzeug_ausstattung?: Json | null
          fahrzeugklasse?: string | null
          farbcode?: string | null
          farbe_klartext?: string | null
          fin?: string | null
          fin_extrahiert_am?: string | null
          fin_quelle?: string | null
          getriebe?: string | null
          hersteller?: string | null
          hoehe_mm?: number | null
          hsn?: string | null
          hubraum_ccm?: number | null
          id?: string
          ist_metallic?: boolean | null
          kennzeichen_aktuell?: string | null
          kennzeichen_buchstaben?: string | null
          kennzeichen_normalized?: string | null
          kraftstoff?: string | null
          laenge_mm?: number | null
          leermasse_kg?: number | null
          leistung_kw?: number | null
          modell_haupttyp?: string | null
          modell_untertyp?: string | null
          produktionszeit_bis?: string | null
          produktionszeit_von?: string | null
          radstand_mm?: number | null
          sitze?: number | null
          status?: string
          tankvolumen_l?: number | null
          tsn?: string | null
          tuerzahl?: number | null
          updated_at?: string
          variante?: string | null
          zb1_dokument_id?: string | null
          zul_gesamtmasse_kg?: number | null
          zylinder?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_current_owner_id_fkey"
            columns: ["current_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_zb1_dokument_id_fkey"
            columns: ["zb1_dokument_id"]
            isOneToOne: false
            referencedRelation: "fall_dokumente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_zb1_dokument_id_fkey"
            columns: ["zb1_dokument_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["dokument_id"]
          },
        ]
      }
      verfuegbarkeits_ausnahmen: {
        Row: {
          assignee_id: string
          assignee_typ: string
          bis: string
          erstellt_am: string
          grund: string | null
          id: string
          typ: string
          von: string
        }
        Insert: {
          assignee_id: string
          assignee_typ: string
          bis: string
          erstellt_am?: string
          grund?: string | null
          id?: string
          typ: string
          von: string
        }
        Update: {
          assignee_id?: string
          assignee_typ?: string
          bis?: string
          erstellt_am?: string
          grund?: string | null
          id?: string
          typ?: string
          von?: string
        }
        Relationships: []
      }
      verified_contacts: {
        Row: {
          created_at: string
          id: string
          kind: string
          person_id: string
          source: string
          source_ref: string | null
          value: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          person_id: string
          source: string
          source_ref?: string | null
          value: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          person_id?: string
          source?: string
          source_ref?: string | null
          value?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "personen"
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
          normalized_name: string | null
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
          normalized_name?: string | null
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
          normalized_name?: string | null
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
            foreignKeyName: "vertraege_unterzeichnet_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
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
      vertrieb_mail_vorlagen: {
        Row: {
          aktiv: boolean
          aktualisiert_am: string
          betreff: string
          body: string
          id: string
          typ: string
        }
        Insert: {
          aktiv?: boolean
          aktualisiert_am?: string
          betreff: string
          body: string
          id?: string
          typ: string
        }
        Update: {
          aktiv?: boolean
          aktualisiert_am?: string
          betreff?: string
          body?: string
          id?: string
          typ?: string
        }
        Relationships: []
      }
      vs_korrespondenz: {
        Row: {
          aktenzeichen: string | null
          attachment_url: string | null
          betreff: string | null
          claim_id: string
          created_at: string
          created_by_user_id: string | null
          datum: string
          id: string
          kanal: string
          naechste_frist: string | null
          notiz: string | null
          richtung: string
          status: string
          typ: string | null
          versicherung: string | null
          versicherung_id: string | null
          wartet_auf_antwort_bis: string | null
        }
        Insert: {
          aktenzeichen?: string | null
          attachment_url?: string | null
          betreff?: string | null
          claim_id: string
          created_at?: string
          created_by_user_id?: string | null
          datum?: string
          id?: string
          kanal: string
          naechste_frist?: string | null
          notiz?: string | null
          richtung: string
          status?: string
          typ?: string | null
          versicherung?: string | null
          versicherung_id?: string | null
          wartet_auf_antwort_bis?: string | null
        }
        Update: {
          aktenzeichen?: string | null
          attachment_url?: string | null
          betreff?: string | null
          claim_id?: string
          created_at?: string
          created_by_user_id?: string | null
          datum?: string
          id?: string
          kanal?: string
          naechste_frist?: string | null
          notiz?: string | null
          richtung?: string
          status?: string
          typ?: string | null
          versicherung?: string | null
          versicherung_id?: string | null
          wartet_auf_antwort_bis?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_korrespondenz_versicherung_id_fkey"
            columns: ["versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
        ]
      }
      wbw_segment_alter: {
        Row: {
          alter_bis_jahre: number
          created_at: string
          restwert_faktor: number
          segment: string
          wbw_max_eur: number
          wbw_min_eur: number
        }
        Insert: {
          alter_bis_jahre: number
          created_at?: string
          restwert_faktor: number
          segment: string
          wbw_max_eur: number
          wbw_min_eur: number
        }
        Update: {
          alter_bis_jahre?: number
          created_at?: string
          restwert_faktor?: number
          segment?: string
          wbw_max_eur?: number
          wbw_min_eur?: number
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "webhook_events_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
      werkstaetten: {
        Row: {
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          aktiviert_am: string | null
          aktiviert_von: string | null
          ansprechpartner_name: string | null
          ansprechpartner_person_id: string | null
          bank_bic: string | null
          bank_iban: string | null
          bank_kontoinhaber: string | null
          created_at: string
          email: string | null
          faehigkeiten: string[] | null
          fahrzeug_gruppen: string[] | null
          gesperrt_am: string | null
          gesperrt_grund: string | null
          google_place_id: string | null
          google_rating: number | null
          google_rating_am: string | null
          google_review_count: number | null
          id: string
          isochrone: Json | null
          ist_freie_werkstatt: boolean | null
          ist_kleinunternehmer: boolean | null
          lat: number | null
          lng: number | null
          marken: string[] | null
          name: string
          normalized_name: string | null
          notizen: string | null
          partner: boolean
          provision_aktiv: boolean
          provision_betrag_netto: number
          status: string
          telefon: string | null
          updated_at: string
          user_id: string | null
          ust_id: string | null
          verifiziert: boolean
          verifiziert_am: string | null
          verifiziert_von: string | null
          verifizierung_notiz: string | null
          website: string | null
        }
        Insert: {
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          aktiviert_am?: string | null
          aktiviert_von?: string | null
          ansprechpartner_name?: string | null
          ansprechpartner_person_id?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_kontoinhaber?: string | null
          created_at?: string
          email?: string | null
          faehigkeiten?: string[] | null
          fahrzeug_gruppen?: string[] | null
          gesperrt_am?: string | null
          gesperrt_grund?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_rating_am?: string | null
          google_review_count?: number | null
          id?: string
          isochrone?: Json | null
          ist_freie_werkstatt?: boolean | null
          ist_kleinunternehmer?: boolean | null
          lat?: number | null
          lng?: number | null
          marken?: string[] | null
          name: string
          normalized_name?: string | null
          notizen?: string | null
          partner?: boolean
          provision_aktiv?: boolean
          provision_betrag_netto?: number
          status?: string
          telefon?: string | null
          updated_at?: string
          user_id?: string | null
          ust_id?: string | null
          verifiziert?: boolean
          verifiziert_am?: string | null
          verifiziert_von?: string | null
          verifizierung_notiz?: string | null
          website?: string | null
        }
        Update: {
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          aktiviert_am?: string | null
          aktiviert_von?: string | null
          ansprechpartner_name?: string | null
          ansprechpartner_person_id?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_kontoinhaber?: string | null
          created_at?: string
          email?: string | null
          faehigkeiten?: string[] | null
          fahrzeug_gruppen?: string[] | null
          gesperrt_am?: string | null
          gesperrt_grund?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_rating_am?: string | null
          google_review_count?: number | null
          id?: string
          isochrone?: Json | null
          ist_freie_werkstatt?: boolean | null
          ist_kleinunternehmer?: boolean | null
          lat?: number | null
          lng?: number | null
          marken?: string[] | null
          name?: string
          normalized_name?: string | null
          notizen?: string | null
          partner?: boolean
          provision_aktiv?: boolean
          provision_betrag_netto?: number
          status?: string
          telefon?: string | null
          updated_at?: string
          user_id?: string | null
          ust_id?: string | null
          verifiziert?: boolean
          verifiziert_am?: string | null
          verifiziert_von?: string | null
          verifizierung_notiz?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "werkstaetten_aktiviert_von_fkey"
            columns: ["aktiviert_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkstaetten_ansprechpartner_person_id_fkey"
            columns: ["ansprechpartner_person_id"]
            isOneToOne: false
            referencedRelation: "personen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkstaetten_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      werkstatt_notizen: {
        Row: {
          autor_name: string | null
          autor_user_id: string | null
          created_at: string
          id: string
          text: string
          werkstatt_id: string
        }
        Insert: {
          autor_name?: string | null
          autor_user_id?: string | null
          created_at?: string
          id?: string
          text: string
          werkstatt_id: string
        }
        Update: {
          autor_name?: string | null
          autor_user_id?: string | null
          created_at?: string
          id?: string
          text?: string
          werkstatt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkstatt_notizen_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "werkstatt_notizen_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      werkstatt_onboarding_enrollments: {
        Row: {
          aktueller_step: number
          erstellt_am: string
          id: string
          next_send_at: string | null
          status: string
          werkstatt_id: string
        }
        Insert: {
          aktueller_step?: number
          erstellt_am?: string
          id?: string
          next_send_at?: string | null
          status?: string
          werkstatt_id: string
        }
        Update: {
          aktueller_step?: number
          erstellt_am?: string
          id?: string
          next_send_at?: string | null
          status?: string
          werkstatt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkstatt_onboarding_enrollments_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: true
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "werkstatt_onboarding_enrollments_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: true
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      werkstatt_onboarding_steps: {
        Row: {
          aktiv: boolean
          aktualisiert_am: string
          betreff: string
          copy: Json
          erstellt_am: string
          id: string
          offset_tage: number
          position: number
          preheader: string
          template_key: string
        }
        Insert: {
          aktiv?: boolean
          aktualisiert_am?: string
          betreff: string
          copy?: Json
          erstellt_am?: string
          id?: string
          offset_tage: number
          position: number
          preheader?: string
          template_key: string
        }
        Update: {
          aktiv?: boolean
          aktualisiert_am?: string
          betreff?: string
          copy?: Json
          erstellt_am?: string
          id?: string
          offset_tage?: number
          position?: number
          preheader?: string
          template_key?: string
        }
        Relationships: []
      }
      werkstatt_qr_pool: {
        Row: {
          charge: string | null
          created_at: string
          created_by: string | null
          id: string
          status: string
          token: string
          werkstatt_id: string | null
          zugewiesen_am: string | null
          zugewiesen_von: string | null
        }
        Insert: {
          charge?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          token: string
          werkstatt_id?: string | null
          zugewiesen_am?: string | null
          zugewiesen_von?: string | null
        }
        Update: {
          charge?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          token?: string
          werkstatt_id?: string | null
          zugewiesen_am?: string | null
          zugewiesen_von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "werkstatt_qr_pool_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "werkstatt_qr_pool_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      werkstatt_staffel_stufen: {
        Row: {
          bonus_betrag_netto: number
          created_at: string
          id: string
          schwelle: number
          werkstatt_id: string
        }
        Insert: {
          bonus_betrag_netto: number
          created_at?: string
          id?: string
          schwelle: number
          werkstatt_id: string
        }
        Update: {
          bonus_betrag_netto?: number
          created_at?: string
          id?: string
          schwelle?: number
          werkstatt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkstatt_staffel_stufen_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "werkstatt_staffel_stufen_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      wertminderung_alter_faktoren: {
        Row: {
          alter_bis_jahre: number
          created_at: string
          faktor_max: number
          faktor_min: number
        }
        Insert: {
          alter_bis_jahre: number
          created_at?: string
          faktor_max: number
          faktor_min: number
        }
        Update: {
          alter_bis_jahre?: number
          created_at?: string
          faktor_max?: number
          faktor_min?: number
        }
        Relationships: []
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
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_fall_id_fkey"
            columns: ["matched_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
            foreignKeyName: "whatsapp_inbound_messages_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_termin_id_fkey"
            columns: ["matched_termin_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_termin_id_fkey"
            columns: ["matched_termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_matched_termin_id_fkey"
            columns: ["matched_termin_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
        ]
      }
      wissen_artikel: {
        Row: {
          ai_generated: boolean
          ai_model: string | null
          artikel_typ: string | null
          audience: string
          author: string
          body: string
          cluster: string | null
          created_at: string
          excerpt: string | null
          id: string
          key_facts: string[]
          last_modified: string | null
          meta_description: string | null
          primary_keyword: string | null
          quelle: string
          reviewed_am: string | null
          reviewed_von: string | null
          slug: string
          source_url: string | null
          status: string
          tags: string[]
          thema_id: string | null
          title: string
          updated_at: string
          veroeffentlicht_am: string | null
        }
        Insert: {
          ai_generated?: boolean
          ai_model?: string | null
          artikel_typ?: string | null
          audience?: string
          author?: string
          body: string
          cluster?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          key_facts?: string[]
          last_modified?: string | null
          meta_description?: string | null
          primary_keyword?: string | null
          quelle?: string
          reviewed_am?: string | null
          reviewed_von?: string | null
          slug: string
          source_url?: string | null
          status?: string
          tags?: string[]
          thema_id?: string | null
          title: string
          updated_at?: string
          veroeffentlicht_am?: string | null
        }
        Update: {
          ai_generated?: boolean
          ai_model?: string | null
          artikel_typ?: string | null
          audience?: string
          author?: string
          body?: string
          cluster?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          key_facts?: string[]
          last_modified?: string | null
          meta_description?: string | null
          primary_keyword?: string | null
          quelle?: string
          reviewed_am?: string | null
          reviewed_von?: string | null
          slug?: string
          source_url?: string | null
          status?: string
          tags?: string[]
          thema_id?: string | null
          title?: string
          updated_at?: string
          veroeffentlicht_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wissen_artikel_thema_id_fkey"
            columns: ["thema_id"]
            isOneToOne: false
            referencedRelation: "wissen_themen"
            referencedColumns: ["id"]
          },
        ]
      }
      wissen_themen: {
        Row: {
          artikel_typ: string | null
          audience: string
          begruendung: string | null
          cluster: string | null
          created_at: string
          entschieden_am: string | null
          entschieden_von: string | null
          id: string
          kurzbrief: string | null
          primary_keyword: string | null
          quelle: string
          source_hash: string | null
          source_name: string | null
          source_url: string | null
          status: string
          titel: string
        }
        Insert: {
          artikel_typ?: string | null
          audience?: string
          begruendung?: string | null
          cluster?: string | null
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          id?: string
          kurzbrief?: string | null
          primary_keyword?: string | null
          quelle?: string
          source_hash?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string
          titel: string
        }
        Update: {
          artikel_typ?: string | null
          audience?: string
          begruendung?: string | null
          cluster?: string | null
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          id?: string
          kurzbrief?: string | null
          primary_keyword?: string | null
          quelle?: string
          source_hash?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string
          titel?: string
        }
        Relationships: []
      }
      zahlungseingaenge: {
        Row: {
          claim_id: string | null
          erfasst_von: string | null
          erstellt_am: string | null
          fall_id: string
          gesamtbetrag: number
          id: string
          referenz: string | null
          zahlungsdatum: string
        }
        Insert: {
          claim_id?: string | null
          erfasst_von?: string | null
          erstellt_am?: string | null
          fall_id: string
          gesamtbetrag: number
          id?: string
          referenz?: string | null
          zahlungsdatum: string
        }
        Update: {
          claim_id?: string | null
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
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "zahlungseingaenge_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          claim_id: string | null
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
          claim_id?: string | null
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
          claim_id?: string | null
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
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "zahlungspositionen_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
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
          auszahlung_kunde_betrag: number | null
          auszahlung_kunde_eingegangen_am: string | null
          auszahlung_zahlungsweg: string | null
          besichtigungsort_adresse: string | null
          claim_nummer: string | null
          eskalation_tag_14_ergebnis: string | null
          eskalation_tag_14_ergebnis_am: string | null
          eskalation_tag_21_ergebnis: string | null
          eskalation_tag_21_ergebnis_am: string | null
          eskalation_tag_28_ergebnis: string | null
          eskalation_tag_28_ergebnis_am: string | null
          fahrzeug_baujahr: number | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          id: string | null
          kennzeichen: string | null
          kunde_id: string | null
          main_phase: string | null
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
          sub_phase: string | null
          sv_id: string | null
          vs_quote_akzeptiert_am: string | null
          vs_quote_betrag_ausgezahlt: number | null
          vs_quote_grund: string | null
          vs_quote_prozent: number | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      faelle_sv_view: {
        Row: {
          auszahlung_gutachter_betrag: number | null
          auszahlung_gutachter_eingegangen_am: string | null
          besichtigungsort_adresse: string | null
          claim_nummer: string | null
          eskalation_tag_14_ergebnis: string | null
          eskalation_tag_14_ergebnis_am: string | null
          eskalation_tag_21_ergebnis: string | null
          eskalation_tag_21_ergebnis_am: string | null
          eskalation_tag_28_ergebnis: string | null
          eskalation_tag_28_ergebnis_am: string | null
          fahrzeug_baujahr: number | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          gutachter_honorar: number | null
          id: string | null
          kennzeichen: string | null
          kuerzungs_betrag: number | null
          kunde_id: string | null
          lexdrive_case_id: string | null
          main_phase: string | null
          mandatsnummer: string | null
          nachbesichtigung_kunde_termin_vorschlaege: Json | null
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
          sub_phase: string | null
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
        Relationships: [
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      v_belegung: {
        Row: {
          assignee_id: string | null
          assignee_typ: string | null
          belegung_typ: string | null
          bezug_id: string | null
          bezug_typ: string | null
          end_zeit: string | null
          quelle_id: string | null
          standort_lat: number | null
          standort_lng: number | null
          start_zeit: string | null
          status: string | null
          termin_typ: string | null
        }
        Relationships: []
      }
      v_claim_base: {
        Row: {
          abgeschlossen_am: string | null
          abrechnung_id: string | null
          abrechnungsart_besprochen: string | null
          abrechnungsart_besprochen_am: string | null
          abrechnungsart_notiz: string | null
          abrechnungsweg: string | null
          abtretung_pdf: string | null
          abtretung_signiert_am: string | null
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
          anzahl_beteiligte_total: number | null
          as_frist: string | null
          as_geforderte_summe: number | null
          as_salesforce_id: string | null
          as_vs_reaktion_text: string | null
          as_zuletzt_synced_am: string | null
          auslandskennzeichen: boolean | null
          auszahlung_gutachter_betrag: number | null
          auszahlung_gutachter_eingegangen_am: string | null
          auszahlung_kunde_betrag: number | null
          auszahlung_kunde_eingegangen_am: string | null
          auszahlung_zahlungsweg: string | null
          bankdaten_hinterlegt_am: string | null
          besichtigungsort_adresse: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_notiz: string | null
          besichtigungsort_place_id: string | null
          betreuungspaket: Database["public"]["Enums"]["betreuungspaket"] | null
          bevorzugter_kanal: string | null
          bic: string | null
          bkat_unfallart: Database["public"]["Enums"]["bkat_unfallart"] | null
          cardentity_abfrage_am: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          claim_id: string | null
          claim_nummer: string | null
          created_at: string | null
          created_by_user_id: string | null
          created_via: string | null
          datenschutz_akzeptiert: boolean | null
          datenschutz_akzeptiert_am: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          deaktiviert_notiz: string | null
          dispatch_id: string | null
          dokumente_reminder_whatsapp_letzte_sendung: string | null
          dokumente_vollstaendig_am_phase: string | null
          dokumente_vollstaendig_fuer_phase: string | null
          endzustand_gesetzt_am: string | null
          endzustand_gesetzt_durch_user_id: string | null
          endzustand_grund: string | null
          entdeckt_am: string | null
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
          fahrerflucht: boolean | null
          fahrzeug_aufbau: string | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_hersteller_raw: string | null
          fahrzeug_modell: string | null
          fahrzeug_typ: string | null
          fahrzeugschaden_beschreibung: string | null
          fall_created_at: string | null
          fall_id: string | null
          fall_status: Database["public"]["Enums"]["fall_status"] | null
          fall_typ: string | null
          fall_updated_at: string | null
          fallakte_angelegt_am: string | null
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
          gegner_aktenzeichen: string | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_schadennummer: string | null
          gegner_versicherung: string | null
          gegner_versicherung_id: string | null
          gegner_versicherung_name: string | null
          gegner_versicherungsnummer: string | null
          gegnerisches_vehicle_id: string | null
          geschaedigter_user_id: string | null
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
          halter_ungleich_fahrer: boolean | null
          halter_ungleich_fahrer_flag: boolean | null
          halter_vorname: string | null
          hat_abschleppung: boolean | null
          hat_mietwagen: boolean | null
          hat_nutzungsausfall: boolean | null
          hat_personenschaden: boolean | null
          hat_sachschaden: boolean | null
          hat_vorschaeden: boolean | null
          hergang_kunde_text: string | null
          hergang_sv_text: string | null
          hsn: string | null
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
          kanzlei_wunsch: string | null
          kanzlei_wunsch_gefragt_am: string | null
          kanzlei_wunsch_gefragt_in_phase: string | null
          kennzeichen: string | null
          kennzeichen_buchstaben: string | null
          ki_geschaetzte_kosten_max: number | null
          ki_geschaetzte_kosten_min: number | null
          ki_kalkulation: Json | null
          ki_kalkulation_am: string | null
          kilometerstand: number | null
          klage_uebergeben_am: string | null
          kontoinhaber: string | null
          konvertiert_am: string | null
          kuerzungs_betrag: number | null
          kunde_adresse: string | null
          kunde_email: string | null
          kunde_id: string | null
          kunde_lat: number | null
          kunde_lng: number | null
          kunde_nachname: string | null
          kunde_plz: string | null
          kunde_stadt: string | null
          kunde_strasse: string | null
          kunde_telefon: string | null
          kunde_vorname: string | null
          kunden_konstellation: string | null
          kundenbetreuer_fallback_flag: boolean | null
          kundenbetreuer_id: string | null
          kundenbetreuer_zugewiesen_am: string | null
          lackfarbe_code: string | null
          lead_id: string | null
          lead_preis_berechnet_am: string | null
          lead_preis_netto: number | null
          lead_preis_typ: string | null
          leasinggeber_informiert: boolean | null
          leasinggeber_name: string | null
          lexdrive_case_id: string | null
          lexdrive_ocr_data: Json | null
          lexdrive_ocr_received_at: string | null
          losfahren_erinnerung_gesendet: boolean | null
          main_phase: string | null
          makler_id: string | null
          mandatsnummer: string | null
          marketing_provision: number | null
          marketing_provision_status: string | null
          marketing_quelle: string | null
          mietwagen_argumentations_puffer: number | null
          mietwagen_flag: boolean | null
          mietwagen_hat: boolean | null
          mietwagen_kanzlei_informiert: boolean | null
          mietwagen_kanzlei_informiert_am: string | null
          mietwagen_limit_grund: string | null
          mietwagen_limit_tage: number | null
          mietwagen_rechnung_url: string | null
          mietwagen_rechnung_vorhanden: boolean | null
          mietwagen_seit_datum: string | null
          mietwagen_vermieter: string | null
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
          nutzungsausfall_tagessatz: number | null
          ocr_extrahiert_am: string | null
          ocr_rohdaten: Json | null
          onboarding_complete: boolean | null
          operative_status: string | null
          organisation_id: string | null
          personenschaden_flag: boolean | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          polizei_vor_ort: boolean | null
          polizeibericht_status: string | null
          prioritaet: string | null
          re_termin_eskalation_an_kb_am: string | null
          re_termin_token: string | null
          re_termin_token_eingelaufen_am: string | null
          regulierung_am: string | null
          regulierung_angekuendigt_am: string | null
          regulierung_betrag: number | null
          regulierungs_betrag: number | null
          regulierungsweise: string | null
          reparaturdauer_tage: number | null
          reparaturkosten: number | null
          ruege_betrag: number | null
          ruege_counter: number | null
          ruege_erhalten_am: string | null
          ruege_frist_tage: number | null
          ruege_gesendet_am: string | null
          ruege_grund: string | null
          sa_pdf_url: string | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sa_unterschrift_url: string | null
          sachschaden_beschreibung: string | null
          sachschaden_flag: boolean | null
          schadenart: string | null
          schadenort_adresse: string | null
          schadenort_kategorie: string | null
          schadenort_land: string | null
          schadenort_lat: number | null
          schadenort_lng: number | null
          schadenort_ort: string | null
          schadenort_plz: string | null
          schadens_art: string | null
          schadens_fall_typ: string | null
          schadens_hoehe_netto: number | null
          schadens_ort: string | null
          schadens_plz: string | null
          schadens_ursache: string | null
          schadentag: string | null
          schadenzeit: string | null
          schlussabrechnung_am: string | null
          service_typ: string | null
          spezifikation: string | null
          sprache: string | null
          status: string | null
          status_changed_at: string | null
          storniert_am: string | null
          storno_durch_user_id: string | null
          storno_grund: string | null
          sub_phase: string | null
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
          technische_stellungnahme_notiz_sv: string | null
          technische_stellungnahme_status: string | null
          termin_erinnerung_5min_gesendet: boolean | null
          tsn: string | null
          unfall_konstellation: string | null
          unfall_uhrzeit: string | null
          unfallmitteilung_status: string | null
          unfallort_kategorie: string | null
          unfallort_lat: number | null
          unfallort_lng: number | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          vehicle_id: string | null
          verjaehrt_am: string | null
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
          vs_ablehnungs_grund: string | null
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
          wunschtermin: string | null
          zahlungsweg: string | null
          zb1_status: string | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_endzustand_gesetzt_durch_user_id_fkey"
            columns: ["endzustand_gesetzt_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["geschaedigter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claim_dokumente: {
        Row: {
          angefordert_von_rolle: string | null
          beschreibung: string | null
          claim_id: string | null
          dokument_id: string | null
          freigeschaltet: boolean | null
          frist: string | null
          hochgeladen_am: string | null
          kategorie: string | null
          label: string | null
          original_filename: string | null
          pflicht: boolean | null
          pflicht_row_id: string | null
          quelle: string | null
          sichtbar_fuer: string[] | null
          slot_id: string | null
          sort_order: number | null
          status: string | null
          storage_path: string | null
          uploadbar_von: string[] | null
        }
        Relationships: []
      }
      v_claim_for_gast: {
        Row: {
          created_at: string | null
          fahrerflucht: boolean | null
          gegner_versicherung_id: string | null
          hat_mietwagen: boolean | null
          hat_personenschaden: boolean | null
          hergang_kunde_text: string | null
          id: string | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          schadenart: string | null
          schadenort_kategorie: string | null
          schadenort_land: string | null
          schadenort_ort: string | null
          schadenort_plz: string | null
          schadentag: string | null
          schadenzeit: string | null
          status: string | null
          unfall_konstellation: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fahrerflucht?: boolean | null
          gegner_versicherung_id?: string | null
          hat_mietwagen?: boolean | null
          hat_personenschaden?: boolean | null
          hergang_kunde_text?: string | null
          id?: string | null
          polizei_aktenzeichen?: string | null
          polizei_bericht_vorhanden?: boolean | null
          schadenart?: string | null
          schadenort_kategorie?: string | null
          schadenort_land?: string | null
          schadenort_ort?: string | null
          schadenort_plz?: string | null
          schadentag?: string | null
          schadenzeit?: string | null
          status?: string | null
          unfall_konstellation?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fahrerflucht?: boolean | null
          gegner_versicherung_id?: string | null
          hat_mietwagen?: boolean | null
          hat_personenschaden?: boolean | null
          hergang_kunde_text?: string | null
          id?: string | null
          polizei_aktenzeichen?: string | null
          polizei_bericht_vorhanden?: boolean | null
          schadenart?: string | null
          schadenort_kategorie?: string | null
          schadenort_land?: string | null
          schadenort_ort?: string | null
          schadenort_plz?: string | null
          schadentag?: string | null
          schadenzeit?: string | null
          status?: string | null
          unfall_konstellation?: string | null
          unfallskizze_svg?: string | null
          unfallskizze_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claim_full: {
        Row: {
          abgeschlossen_am: string | null
          abrechnungsweg: string | null
          anschlussschreiben_am: string | null
          anzahl_beteiligte_total: number | null
          auslandskennzeichen: boolean | null
          besichtigungsort_adresse: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_notiz: string | null
          besichtigungsort_place_id: string | null
          cardentity_abfrage_am: string | null
          claim_nummer: string | null
          created_at: string | null
          created_by_user_id: string | null
          created_via: string | null
          deaktiviert_grund: string | null
          dispatch_id: string | null
          dokumente_reminder_whatsapp_letzte_sendung: string | null
          dokumente_vollstaendig_fuer_phase: string | null
          endzustand_gesetzt_am: string | null
          endzustand_gesetzt_durch_user_id: string | null
          endzustand_grund: string | null
          entdeckt_am: string | null
          erstzulassung: string | null
          fahrerflucht: boolean | null
          fahrzeug_aufbau: string | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_typ: string | null
          fahrzeugschaden_beschreibung: string | null
          fall_created_at: string | null
          fall_id: string | null
          fall_status: Database["public"]["Enums"]["fall_status"] | null
          fall_typ: string | null
          fall_updated_at: string | null
          fin_extrahiert_am: string | null
          fin_quelle: string | null
          fin_vin: string | null
          firma_name: string | null
          gegner_aktenzeichen: string | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_versicherung: string | null
          gegner_versicherung_id: string | null
          gegner_versicherung_name: string | null
          gegner_versicherungsnummer: string | null
          gegnerisches_vehicle_id: string | null
          geschaedigter_user_id: string | null
          gutachten_betrag: number | null
          gutachten_eingegangen_am: string | null
          halter_email: string | null
          halter_geburtsdatum: string | null
          halter_nachname: string | null
          halter_name: string | null
          halter_plz: string | null
          halter_stadt: string | null
          halter_strasse: string | null
          halter_telefon: string | null
          halter_ungleich_fahrer: boolean | null
          halter_vorname: string | null
          hat_abschleppung: boolean | null
          hat_mietwagen: boolean | null
          hat_nutzungsausfall: boolean | null
          hat_personenschaden: boolean | null
          hat_sachschaden: boolean | null
          hat_vorschaeden: boolean | null
          hergang_kunde_text: string | null
          hergang_sv_text: string | null
          hsn: string | null
          id: string | null
          ist_aktiv: boolean | null
          ist_fahrzeughalter: boolean | null
          kanzlei_wunsch: string | null
          kanzlei_wunsch_gefragt_am: string | null
          kanzlei_wunsch_gefragt_in_phase: string | null
          kennzeichen: string | null
          kennzeichen_buchstaben: string | null
          kilometerstand: number | null
          kunde_email: string | null
          kunde_id: string | null
          kunde_nachname: string | null
          kunde_plz: string | null
          kunde_stadt: string | null
          kunde_strasse: string | null
          kunde_telefon: string | null
          kunde_vorname: string | null
          kunden_konstellation: string | null
          kundenbetreuer_fallback_flag: boolean | null
          kundenbetreuer_id: string | null
          lackfarbe_code: string | null
          lead_id: string | null
          main_phase: string | null
          mandatsnummer: string | null
          mietwagen: Json | null
          no_show_gemeldet_am: string | null
          notizen: string | null
          operative_status: string | null
          organisation_id: string | null
          parties: Json | null
          payments: Json | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          polizei_vor_ort: boolean | null
          polizeibericht_status: string | null
          re_termin_eskalation_an_kb_am: string | null
          re_termin_token: string | null
          re_termin_token_eingelaufen_am: string | null
          regulierung_am: string | null
          regulierung_betrag: number | null
          regulierungs_betrag: number | null
          repairs: Json | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sachschaden_beschreibung: string | null
          schadenart: string | null
          schadenort_adresse: string | null
          schadenort_kategorie: string | null
          schadenort_land: string | null
          schadenort_lat: number | null
          schadenort_lng: number | null
          schadenort_ort: string | null
          schadenort_plz: string | null
          schadens_fall_typ: string | null
          schadens_ort: string | null
          schadens_plz: string | null
          schadens_ursache: string | null
          schadentag: string | null
          schadenzeit: string | null
          service_typ: string | null
          spezifikation: string | null
          sprache: string | null
          status: string | null
          storniert_am: string | null
          sub_phase: string | null
          sv_id: string | null
          sv_zugewiesen_am: string | null
          szenario: string | null
          tsn: string | null
          unfall_konstellation: string | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          vehicle_id: string | null
          vehicle_involvements: Json | null
          verjaehrt_am: string | null
          vollmacht_signiert_am: string | null
          vorschaden_anzahl: number | null
          vorschaden_erkannt: boolean | null
          vorschaden_letzter_datum: string | null
          vorschaden_typ_b_bericht: Json | null
          vorsteuerabzugsberechtigt: boolean | null
          vs_ablehnungs_grund: string | null
          vs_eskalationsstufe: string | null
          vs_korrespondenz: Json | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_endzustand_gesetzt_durch_user_id_fkey"
            columns: ["endzustand_gesetzt_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["geschaedigter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claim_kunde_name: {
        Row: {
          claim_id: string | null
          kunde_anzeigename: string | null
          kunde_nachname: string | null
          kunde_vorname: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      v_claim_listing: {
        Row: {
          claim_id: string | null
          claim_kundenbetreuer_id: string | null
          claim_nummer: string | null
          created_at: string | null
          faelle_kundenbetreuer_id: string | null
          fall_id: string | null
          kennzeichen: string | null
          kunde_anzeigename: string | null
          kunde_nachname: string | null
          kunde_vorname: string | null
          kunden_konstellation: string | null
          main_phase: string | null
          schadentag: string | null
          service_typ: string | null
          status: string | null
          sub_phase: string | null
          sv_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["faelle_kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["claim_kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claim_parties_safe: {
        Row: {
          adresse_strasse: string | null
          claim_id: string | null
          created_at: string | null
          email: string | null
          fahrzeugtyp_klartext: string | null
          firma: string | null
          geburtsdatum: string | null
          id: string | null
          ist_aktiv: boolean | null
          ist_anonymisiert: boolean | null
          ist_fahrer: boolean | null
          ist_gewerbe: boolean | null
          ist_halter: boolean | null
          kennzeichen: string | null
          nachname: string | null
          quelle: string | null
          reihenfolge: number | null
          rolle: string | null
          telefon: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_id: string | null
          versicherung_id: string | null
          versicherungsnummer: string | null
          vorname: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_parties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_parties_versicherung_id_fkey"
            columns: ["versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claim_payments: {
        Row: {
          claim_id: string | null
          kunde_am: string | null
          kunde_ist: number | null
          kunde_soll: number | null
          kunde_status: string | null
          sv_am: string | null
          sv_ist: number | null
          sv_soll: number | null
          sv_status: string | null
          vs_am: string | null
          vs_ist: number | null
          vs_soll: number | null
          vs_status: string | null
          vs_zahlungsweg: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      v_claim_phase: {
        Row: {
          claim_id: string | null
          main_phase: string | null
          sub_phase: string | null
        }
        Relationships: []
      }
      v_claim_sv: {
        Row: {
          abgeschlossen_am: string | null
          anzahl_beteiligte_total: number | null
          auslandskennzeichen: boolean | null
          brn: string | null
          claim_nummer: string | null
          created_at: string | null
          entdeckt_am: string | null
          fahrerflucht: boolean | null
          fall_typ: string | null
          finanzierung_leasing: string | null
          gegner_aktenzeichen: string | null
          gegner_bekannt: boolean | null
          gegner_versicherung_id: string | null
          gegner_versicherungsnummer: string | null
          gegnerisches_vehicle_id: string | null
          gewerbe_flag: boolean | null
          halter_ungleich_fahrer: boolean | null
          hat_abschleppung: boolean | null
          hat_mietwagen: boolean | null
          hat_nutzungsausfall: boolean | null
          hat_personenschaden: boolean | null
          hat_sachschaden: boolean | null
          hergang_kunde_text: string | null
          hergang_sv_text: string | null
          id: string | null
          kunde_no_show_count: number | null
          kunden_konstellation: string | null
          kundenbetreuer_id: string | null
          letzter_no_show_am: string | null
          letzter_sv_no_show_am: string | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          polizei_vor_ort: boolean | null
          polizeibericht_status: string | null
          sachschaden_beschreibung: string | null
          schadenart: string | null
          schadenort_adresse: string | null
          schadenort_kategorie: string | null
          schadenort_land: string | null
          schadenort_lat: number | null
          schadenort_lng: number | null
          schadenort_ort: string | null
          schadenort_plz: string | null
          schadentag: string | null
          schadenzeit: string | null
          spezifikation: string | null
          status: string | null
          sv_id: string | null
          sv_no_show_count: number | null
          unfall_konstellation: string | null
          unfallskizze_ablehnung_grund: string | null
          unfallskizze_bestaetigt: boolean | null
          unfallskizze_generiert_am: string | null
          unfallskizze_svg: string | null
          unfallskizze_url: string | null
          updated_at: string | null
          vehicle_id: string | null
          vorschaden_mit_vs_abgerechnet: string | null
          vorsteuerabzugsberechtigt: boolean | null
          zeugen_kontakte: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_claim_timeline: {
        Row: {
          actor_rolle: string | null
          actor_user_id: string | null
          claim_id: string | null
          detail_url_path: string | null
          event_at: string | null
          event_id: string | null
          event_kategorie: string | null
          event_typ: string | null
          fall_id: string | null
          payload_jsonb: Json | null
          sichtbar_fuer_kunde: boolean | null
          sichtbar_fuer_sv: boolean | null
        }
        Relationships: []
      }
      v_claim_timeline_ungated_internal: {
        Row: {
          actor_rolle: string | null
          actor_user_id: string | null
          claim_id: string | null
          detail_url_path: string | null
          event_at: string | null
          event_id: string | null
          event_kategorie: string | null
          event_typ: string | null
          fall_id: string | null
          payload_jsonb: Json | null
          sichtbar_fuer_kunde: boolean | null
          sichtbar_fuer_sv: boolean | null
        }
        Relationships: []
      }
      v_claim_workstate: {
        Row: {
          abgeschlossen_am: string | null
          abrechnungsweg: string | null
          anschlussschreiben_am: string | null
          claim_id: string | null
          claim_nummer: string | null
          created_at: string | null
          dokumente_vollstaendig_fuer_phase: string | null
          edit_interne_notizen: string | null
          edit_notizen: string | null
          edit_schadens_hoehe_netto: number | null
          fall_id: string | null
          gutachten_eingegangen_am: string | null
          ist_aktiv: boolean | null
          kennzeichen: string | null
          kunde_name: string | null
          kundenbetreuer_id: string | null
          lead_id: string | null
          main_phase: string | null
          operative_status: string | null
          override_phase: string | null
          regulierung_am: string | null
          reparatur_erledigt_am: string | null
          reparatur_status: string | null
          reparatur_werkstatt_id: string | null
          sa_unterschrieben: boolean | null
          schadenhoehe: number | null
          status: string | null
          storniert_am: string | null
          sub_phase: string | null
          sv_id: string | null
          sv_zugewiesen_am: string | null
          updated_at: string | null
          vs_eskalationsstufe: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "claims_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      v_embed_billing_faellig: {
        Row: {
          anfrage_id: string | null
          betrag_netto: number | null
          embed_site_id: string | null
          erstellt_am: string | null
          nachname: string | null
          schadentyp: string | null
          site_name: string | null
          sv_id: string | null
          termin_end_zeit: string | null
          termin_id: string | null
          vorname: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_finder_anfragen_embed_site_id_fkey"
            columns: ["embed_site_id"]
            isOneToOne: false
            referencedRelation: "embed_sites"
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
          auslandskennzeichen: boolean | null
          auszahlung_gutachter_betrag: number | null
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
          bkat_unfallart: Database["public"]["Enums"]["bkat_unfallart"] | null
          cardentity_abfrage_am: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          claim_id: string | null
          claim_nummer: string | null
          created_at: string | null
          datenschutz_akzeptiert: boolean | null
          datenschutz_akzeptiert_am: string | null
          deaktiviert_am: string | null
          deaktiviert_grund: string | null
          deaktiviert_notiz: string | null
          dispatch_id: string | null
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
          fahrerflucht: boolean | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_typ: string | null
          fahrzeugschaden_beschreibung: string | null
          fallakte_angelegt_am: string | null
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
          hsn: string | null
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
          klage_uebergeben_am: string | null
          kontoinhaber: string | null
          konvertiert_am: string | null
          konvertiert_von_lead: string | null
          kuerzungs_betrag: number | null
          kunde_adresse: string | null
          kunde_email: string | null
          kunde_id: string | null
          kunde_lat: number | null
          kunde_lng: number | null
          kunde_nachname: string | null
          kunde_plz: string | null
          kunde_stadt: string | null
          kunde_strasse: string | null
          kunde_telefon: string | null
          kunde_vorname: string | null
          kunden_konstellation: string | null
          kundenbetreuer_fallback_flag: boolean | null
          kundenbetreuer_id: string | null
          kundenbetreuer_zugewiesen_am: string | null
          lackfarbe_code: string | null
          lead_id: string | null
          lead_preis_berechnet_am: string | null
          lead_preis_netto: number | null
          lead_preis_typ: string | null
          leasinggeber_informiert: boolean | null
          leasinggeber_name: string | null
          lexdrive_case_id: string | null
          lexdrive_ocr_data: Json | null
          lexdrive_ocr_received_at: string | null
          losfahren_erinnerung_gesendet: boolean | null
          main_phase: string | null
          makler_id: string | null
          mandatsnummer: string | null
          marketing_provision: number | null
          marketing_provision_status: string | null
          marketing_quelle: string | null
          mietwagen_argumentations_puffer: number | null
          mietwagen_flag: boolean | null
          mietwagen_hat: boolean | null
          mietwagen_kanzlei_informiert: boolean | null
          mietwagen_kanzlei_informiert_am: string | null
          mietwagen_limit_grund: string | null
          mietwagen_limit_tage: number | null
          mietwagen_rechnung_url: string | null
          mietwagen_rechnung_vorhanden: boolean | null
          mietwagen_seit_datum: string | null
          mietwagen_vermieter: string | null
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
          nutzungsausfall_tagessatz: number | null
          ocr_extrahiert_am: string | null
          ocr_rohdaten: Json | null
          onboarding_complete: boolean | null
          organisation_id: string | null
          personenschaden_flag: boolean | null
          polizei_aktenzeichen: string | null
          polizei_bericht_vorhanden: boolean | null
          polizei_vor_ort: boolean | null
          polizeibericht_status: string | null
          prioritaet: string | null
          regulierung_am: string | null
          regulierung_angekuendigt_am: string | null
          regulierung_betrag: number | null
          regulierungsweise: string | null
          reparaturdauer_tage: number | null
          reparaturkosten: number | null
          ruege_betrag: number | null
          ruege_counter: number | null
          ruege_erhalten_am: string | null
          ruege_frist_tage: number | null
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
          sub_phase: string | null
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
          technische_stellungnahme_notiz_sv: string | null
          technische_stellungnahme_status: string | null
          termin_erinnerung_5min_gesendet: boolean | null
          tsn: string | null
          unfall_konstellation: string | null
          unfall_uhrzeit: string | null
          unfalldatum: string | null
          unfallhergang: string | null
          unfallmitteilung_status: string | null
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
          ust_id: string | null
          vehicle_id: string | null
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
          vs_kuerzungs_typ: string | null
          vs_quote_akzeptiert_am: string | null
          vs_quote_betrag_ausgezahlt: number | null
          vs_quote_grund: string | null
          vs_quote_prozent: number | null
          vs_reaktion_am: string | null
          vs_reaktion_typ: string | null
          werkstatt_seit_datum: string | null
          wertminderung: number | null
          wunschtermin: string | null
          zahlung_betrag: number | null
          zahlung_eingegangen_am: string | null
          zahlung_erwartet_am: string | null
          zahlungsweg: string | null
          zb1_status: string | null
          zeugen_kontakte: Json | null
          zeugen_vorhanden: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_geschaedigter_user_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kanzlei_abrechnung_id_fkey"
            columns: ["kanzlei_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "kanzlei_abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["konvertiert_von_lead"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["konvertiert_von_lead"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["konvertiert_von_lead"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["konvertiert_von_lead"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_funnel_real: {
        Row: {
          abgeschlossen: number | null
          claims_mit_sv: number | null
          echte_claims: number | null
          externe_leads: number | null
          gutachten: number | null
          konvertiert: number | null
        }
        Relationships: []
      }
      v_gutachten_werte: {
        Row: {
          auftragsnummer: string | null
          claim_id: string | null
          fertiggestellt_am: string | null
          gesamt_schadensbetrag: number | null
          gutachten_datum: string | null
          gutachten_erstzulassung: string | null
          gutachten_fahrzeug_typ: string | null
          gutachten_farbcode: string | null
          gutachten_farbe: string | null
          gutachten_fin: string | null
          gutachten_id: string | null
          gutachten_kalkulationssystem: string | null
          gutachten_karosseriezustand: string | null
          gutachten_kennzeichen: string | null
          gutachten_kraftstoff: string | null
          gutachten_lackmaterial_eur: number | null
          gutachten_lackmesswert_max_my: number | null
          gutachten_laufleistung_km: number | null
          gutachten_lohnsatz_ak_eur: number | null
          gutachten_lohnsatz_kar_eur: number | null
          gutachten_lohnsatz_lack_eur: number | null
          gutachten_materialkosten_eur: number | null
          gutachten_mietwagen_klasse: string | null
          gutachten_mietwagen_tagessatz_eur: number | null
          gutachten_nutzungsausfall_tagessatz_eur: number | null
          gutachten_ocr_error: string | null
          gutachten_ocr_manuell_ueberschrieben: boolean | null
          gutachten_ocr_processed_at: string | null
          gutachten_ocr_raw: Json | null
          gutachten_seitenzahl: number | null
          gutachten_status: string | null
          gutachten_sv_honorar_brutto: number | null
          gutachten_sv_honorar_netto: number | null
          gutachten_tuv_bis: string | null
          gutachten_verbringung_eur: number | null
          gutachten_vorschaeden_text: string | null
          gutachten_zeit_ak_std: number | null
          gutachten_zeit_kar_std: number | null
          gutachten_zeit_lack_std: number | null
          ki_geschaetzte_kosten_max: number | null
          ki_geschaetzte_kosten_min: number | null
          ki_kalkulation: Json | null
          ki_kalkulation_am: string | null
          lead_id: string | null
          minderwert: number | null
          nutzungsausfall_tage: number | null
          ocr_finished_at: string | null
          pdf_uploaded_at: string | null
          positionen: Json | null
          reparaturkosten_brutto: number | null
          reparaturkosten_netto: number | null
          restwert: number | null
          sv_id: string | null
          totalschaden: boolean | null
          wiederbeschaffungsdauer_tage: number | null
          wiederbeschaffungswert: number | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "sachverstaendige"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachten_sv_id_fkey"
            columns: ["sv_id"]
            isOneToOne: false
            referencedRelation: "v_live_ops_sv"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lead_termin_gutachter: {
        Row: {
          gutachter_divergiert: boolean | null
          gutachter_id: string | null
          gutachter_name: string | null
          gutachter_quelle: string | null
          gutachter_typ: string | null
          hat_gutachter: boolean | null
          hat_termin: boolean | null
          kunden_pick_name: string | null
          lead_id: string | null
          termin_id: string | null
          termin_start: string | null
          termin_status: string | null
        }
        Relationships: []
      }
      v_lead_workstate: {
        Row: {
          abrechnungsweg: string | null
          aircall_contact_id: string | null
          anrede: string | null
          anruf_versuche: number | null
          ansprechpartner_beziehung: string | null
          aufklaerung_teilschuld_bestaetigt: boolean | null
          auslandskennzeichen: boolean | null
          besichtigungsort_adresse: string | null
          besichtigungsort_lat: number | null
          besichtigungsort_lng: number | null
          besichtigungsort_notiz: string | null
          besichtigungsort_place_id: string | null
          bevorzugter_kanal: string | null
          bkat_unfallart: Database["public"]["Enums"]["bkat_unfallart"] | null
          brn: string | null
          cardentity_enriched_at: string | null
          cardentity_report: Json | null
          claude_vision_analyse: Json | null
          created_at: string | null
          dat_einschaetzung: Json | null
          dat_pdf_url: string | null
          disqualifiziert: boolean | null
          disqualifiziert_am: string | null
          disqualifiziert_grund: string | null
          disqualifiziert_grund_key: string | null
          disqualifiziert_notiz: string | null
          dsgvo_zustimmung_am: string | null
          eigene_policennr: string | null
          eigene_versicherung: string | null
          email: string | null
          erstzulassung: string | null
          fahrerflucht: boolean | null
          fahrzeug_aufbau: string | null
          fahrzeug_ausstattung: Json | null
          fahrzeug_baujahr: number | null
          fahrzeug_fahrbereit: boolean | null
          fahrzeug_farbe: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_standort_adresse: string | null
          fahrzeug_standort_lat: number | null
          fahrzeug_standort_lng: number | null
          fahrzeug_standort_place_id: string | null
          fahrzeug_standort_plz: string | null
          fahrzeugschaden_beschreibung: string | null
          fehlende_felder_jsonb: Json | null
          fin: string | null
          finanzierung_bank: string | null
          finanzierung_leasing: string | null
          finanzierungsgeber_adresse: string | null
          finanzierungsgeber_name: string | null
          finanzierungsgeber_vertragsnr: string | null
          firma_name: string | null
          fl_abgeschlossen_am: string | null
          fl_fall_id: string | null
          fl_geoeffnet_am: string | null
          fl_gesendet_am: string | null
          flow_link_abgeschlossen: boolean | null
          flow_link_geoeffnet: boolean | null
          ga_client_id: string | null
          gegner_anzahl_beteiligte: number | null
          gegner_bekannt: boolean | null
          gegner_email: string | null
          gegner_fahrzeugtyp: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_schadennummer: string | null
          gegner_telefon: string | null
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
          hat_whatsapp: boolean | null
          hsn: string | null
          id: string | null
          ist_fahrzeughalter: boolean | null
          kanzlei_triggered: boolean | null
          kanzlei_wunsch: string | null
          kennzeichen: string | null
          kennzeichen_buchstaben: string | null
          kennzeichen_kreis: string | null
          kennzeichen_suffix: string | null
          kennzeichen_zahl: string | null
          kilometerstand: number | null
          kontaktversuche: number | null
          konvertiert_am: string | null
          konvertiert_durch_user_id: string | null
          konvertiert_zu_claim_id: string | null
          konvertiert_zu_fall_id: string | null
          kostenvoranschlag_brutto: number | null
          kostenvoranschlag_netto: number | null
          kunde_adresse: string | null
          kunde_id: string | null
          kunde_lat: number | null
          kunde_lng: number | null
          kunde_plz: string | null
          kunde_stadt: string | null
          kunde_strasse: string | null
          kunden_konstellation: string | null
          lackfarbe_code: string | null
          lead_nummer: string | null
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
          reminder_4_sent_at: string | null
          reminder_token: string | null
          reparatur_vermittlung_status: string | null
          reparatur_werkstatt_extern: string | null
          reparatur_werkstatt_id: string | null
          reparatur_werkstatt_quelle: string | null
          reparatur_werkstatt_zugewiesen_am: string | null
          reparatur_werkstatt_zugewiesen_von: string | null
          reparatur_wunschtermin: string | null
          reparaturwunsch: string | null
          rueckruf_geplant_am: string | null
          sa_datum: string | null
          sa_unterschrieben: boolean | null
          sa_unterschrieben_am: string | null
          sachschaden_beschreibung: string | null
          sachschaden_flag: boolean | null
          schaden_sichtbar: boolean | null
          schadens_art: string | null
          schadens_fall_typ: string | null
          schadens_hergang: string | null
          schadensfoto_urls: Json | null
          schadenskategorie: string | null
          schadentyp: string | null
          schadentyp_freitext: string | null
          schuldfrage: string | null
          service_typ: string | null
          sf_variante: string | null
          source_channel: string | null
          source_domain: string | null
          spezifikation: string | null
          sprache: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          telefon: string | null
          termin_status: string | null
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
          vehicle_id: string | null
          verpasste_anrufe: number | null
          voice_input_quelle: boolean | null
          vollmacht_datum: string | null
          vollmacht_signiert_am: string | null
          vorname: string | null
          vorschaeden_beschreibung: string | null
          vorsteuerabzugsberechtigt: boolean | null
          wa_gesendet: boolean | null
          werkstatt_id: string | null
          werkstatt_seit_datum: string | null
          whatsapp_geprueft_am: string | null
          whatsapp_verfuegbar: boolean | null
          winback_opt_out: boolean | null
          winback_sent_at: string | null
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
          zeugen_vorhanden: boolean | null
          zeugenaussage_hochgeladen_am: string | null
          zeugenaussage_status: string | null
          zeugenaussage_url: string | null
          zugewiesen_an: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_kunde_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_sv_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "flow_links_fall_id_fkey"
            columns: ["fl_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_gegner_versicherung_id_fkey"
            columns: ["gegner_versicherung_id"]
            isOneToOne: false
            referencedRelation: "versicherungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_durch_user_id_fkey"
            columns: ["konvertiert_durch_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_dokumente"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_for_gast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_phase"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_sv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_gutachten_werte"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_claim_id_fkey"
            columns: ["konvertiert_zu_claim_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "faelle_claim_bridge"
            referencedColumns: ["fall_id"]
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
            referencedRelation: "v_claim_base"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_full"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_listing"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_claim_workstate"
            referencedColumns: ["fall_id"]
          },
          {
            foreignKeyName: "leads_konvertiert_zu_fall_id_fkey"
            columns: ["konvertiert_zu_fall_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "leads_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "leads_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "leads_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_zugewiesen_an_fk"
            columns: ["zugewiesen_an"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_live_ops_sv: {
        Row: {
          avatar_url: string | null
          gesperrt_seit: string | null
          gutachter_typ: string | null
          id: string | null
          isochrone_polygon: Json | null
          live_heading: number | null
          live_lat: number | null
          live_lng: number | null
          live_tracking_enabled: boolean | null
          live_updated_at: string | null
          nachname: string | null
          paket: string | null
          paket_faelle_genutzt: number | null
          paket_faelle_gesamt: number | null
          portal_zugang_freigeschaltet: boolean | null
          standort_lat: number | null
          standort_lng: number | null
          urlaub_bis: string | null
          urlaub_von: string | null
          verifiziert: boolean | null
          vorname: string | null
        }
        Relationships: []
      }
      v_netzwerk_freunde: {
        Row: {
          freund_id: string | null
          profil_id: string | null
        }
        Relationships: []
      }
      v_offene_anfragen: {
        Row: {
          bevorzugter_kanal: string | null
          email: string | null
          embed_site_id: string | null
          erstellt_am: string | null
          herkunft: string | null
          id: string | null
          kennzeichen: string | null
          konvertiert_zu_lead_id: string | null
          nachname: string | null
          sa_unterzeichnet_am: string | null
          sa_vorhanden: boolean | null
          schadenort: string | null
          schadentyp: string | null
          source: string | null
          status: string | null
          telefon: string | null
          variante: string | null
          vorname: string | null
          wunschtermin: string | null
        }
        Insert: {
          bevorzugter_kanal?: string | null
          email?: string | null
          embed_site_id?: string | null
          erstellt_am?: string | null
          herkunft?: never
          id?: string | null
          kennzeichen?: string | null
          konvertiert_zu_lead_id?: string | null
          nachname?: string | null
          sa_unterzeichnet_am?: string | null
          sa_vorhanden?: never
          schadenort?: string | null
          schadentyp?: string | null
          source?: string | null
          status?: string | null
          telefon?: string | null
          variante?: string | null
          vorname?: string | null
          wunschtermin?: string | null
        }
        Update: {
          bevorzugter_kanal?: string | null
          email?: string | null
          embed_site_id?: string | null
          erstellt_am?: string | null
          herkunft?: never
          id?: string | null
          kennzeichen?: string | null
          konvertiert_zu_lead_id?: string | null
          nachname?: string | null
          sa_unterzeichnet_am?: string | null
          sa_vorhanden?: never
          schadenort?: string | null
          schadentyp?: string | null
          source?: string | null
          status?: string | null
          telefon?: string | null
          variante?: string | null
          vorname?: string | null
          wunschtermin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_finder_anfragen_embed_site_id_fkey"
            columns: ["embed_site_id"]
            isOneToOne: false
            referencedRelation: "embed_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ops_rollup: {
        Row: {
          anzahl: number | null
          kundenbetreuer_id: string | null
          main_phase: string | null
          stale_anzahl: number | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_kundenbetreuer_id_fkey"
            columns: ["kundenbetreuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_partner_billing: {
        Row: {
          betrag_brutto: number | null
          betrag_netto: number | null
          claim_id: string | null
          datum: string | null
          dokument_typ: string | null
          erledigt_am: string | null
          faellig_am: string | null
          fall_id: string | null
          partner_id: string | null
          partner_name: string | null
          partner_typ: string | null
          quelle_id: string | null
          quelle_tabelle: string | null
          referenz_nr: string | null
          richtung: string | null
          status_norm: string | null
          status_roh: string | null
          ust_betrag: number | null
          ust_satz: number | null
          ust_status_bekannt: boolean | null
        }
        Relationships: []
      }
      v_sv_inbox: {
        Row: {
          abrechnungs_betrag_eur: number | null
          abrechnungs_relevant: boolean | null
          bevorzugter_kanal: string | null
          email: string | null
          embed_site_id: string | null
          erstellt_am: string | null
          id: string | null
          konvertiert_zu_lead_id: string | null
          nachname: string | null
          schadenort: string | null
          schadens_kurzbeschreibung: string | null
          schadentyp: string | null
          site_name: string | null
          site_slug: string | null
          status: string | null
          telefon: string | null
          termin_id: string | null
          variante: string | null
          vorname: string | null
          wunschtermin_wann: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gutachter_finder_anfragen_embed_site_id_fkey"
            columns: ["embed_site_id"]
            isOneToOne: false
            referencedRelation: "embed_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_workstate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_konvertiert_zu_lead_id_fkey"
            columns: ["konvertiert_zu_lead_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "gutachter_termine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_claim_base"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_embed_billing_faellig"
            referencedColumns: ["termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_faelle_mit_aktuellem_termin"
            referencedColumns: ["aktueller_termin_id"]
          },
          {
            foreignKeyName: "gutachter_finder_anfragen_termin_id_fkey"
            columns: ["termin_id"]
            isOneToOne: false
            referencedRelation: "v_lead_termin_gutachter"
            referencedColumns: ["termin_id"]
          },
        ]
      }
      v_vertrieb_kontakt: {
        Row: {
          email: string | null
          erstellt_am: string | null
          id: string | null
          kind: string | null
          lat: number | null
          lng: number | null
          name: string | null
          notizen: string | null
          ort: string | null
          owner_id: string | null
          plz: string | null
          quelle: string | null
          roh_gesperrt: boolean | null
          roh_ist_aktiv: boolean | null
          roh_onboarding_offen: boolean | null
          roh_portal_zugang: boolean | null
          roh_status: string | null
          roh_verifiziert: boolean | null
          roh_warteliste: string | null
          rolle: string | null
          telefon: string | null
        }
        Relationships: []
      }
      v_werkstatt_auftrag: {
        Row: {
          abrechnungsweg: string | null
          besichtigung_ort: string | null
          besichtigung_start: string | null
          besichtigung_status: string | null
          claim_id: string | null
          claim_nummer: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fin: string | null
          gutachten_bericht_pdf_url: string | null
          gutachten_fertiggestellt_am: string | null
          gutachten_minderwert: number | null
          gutachten_reparaturkosten_brutto: number | null
          gutachten_reparaturkosten_netto: number | null
          gutachten_restwert: number | null
          gutachten_totalschaden: boolean | null
          gutachten_wiederbeschaffungswert: number | null
          gutachter_firmenname: string | null
          kennzeichen: string | null
          kostenvoranschlag_brutto: number | null
          kostenvoranschlag_netto: number | null
          kunde_name: string | null
          kva_abgelehnt_am: string | null
          kva_abgelehnt_grund: string | null
          meine_rolle: string | null
          operative_status: string | null
          provision_betrag_netto: number | null
          provision_status: string | null
          quelle: string | null
          reparatur_absage_grund: string | null
          reparatur_bestaetigter_termin: string | null
          reparatur_freigegeben_am: string | null
          reparatur_rueckruf_wunschzeit: string | null
          reparatur_termin_id: string | null
          reparatur_termin_status: string | null
          reparatur_werkstatt_id: string | null
          reparatur_wunschtermin: string | null
          reparaturdauer_tage: number | null
          reparaturdauer_tage_kva: number | null
          reparaturwunsch: string | null
          richtung: string | null
          schadenart: string | null
          unfallart: string | null
          vermittler_werkstatt_id: string | null
          vermittlung_status: string | null
          werkstatt_ansprechpartner: string | null
          werkstatt_id: string | null
          werkstatt_name: string | null
          zugewiesen_am: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "claims_reparatur_werkstatt_id_fkey"
            columns: ["reparatur_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_werkstatt_id_fkey"
            columns: ["vermittler_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "claims_werkstatt_id_fkey"
            columns: ["vermittler_werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
      v_werkstatt_lead: {
        Row: {
          created_at: string | null
          email: string | null
          erstzulassung: string | null
          fahrzeug_hersteller: string | null
          fahrzeug_modell: string | null
          fahrzeug_standort_adresse: string | null
          fahrzeug_standort_plz: string | null
          fin: string | null
          gegner_bekannt: boolean | null
          gegner_email: string | null
          gegner_kennzeichen: string | null
          gegner_name: string | null
          gegner_telefon: string | null
          gegner_versicherung: string | null
          id: string | null
          kennzeichen: string | null
          kostenvoranschlag_brutto: number | null
          kostenvoranschlag_netto: number | null
          nachname: string | null
          schadens_art: string | null
          schadens_hergang: string | null
          schadentyp: string | null
          status: string | null
          telefon: string | null
          unfall_konstellation: string | null
          unfalldatum: string | null
          unfallhergang: string | null
          unfallort: string | null
          vorname: string | null
          werkstatt_id: string | null
          werkstatt_intake_am: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          erstzulassung?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeug_standort_adresse?: string | null
          fahrzeug_standort_plz?: string | null
          fin?: string | null
          gegner_bekannt?: boolean | null
          gegner_email?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_telefon?: string | null
          gegner_versicherung?: string | null
          id?: string | null
          kennzeichen?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          nachname?: string | null
          schadens_art?: string | null
          schadens_hergang?: string | null
          schadentyp?: string | null
          status?: never
          telefon?: string | null
          unfall_konstellation?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallort?: string | null
          vorname?: string | null
          werkstatt_id?: string | null
          werkstatt_intake_am?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          erstzulassung?: string | null
          fahrzeug_hersteller?: string | null
          fahrzeug_modell?: string | null
          fahrzeug_standort_adresse?: string | null
          fahrzeug_standort_plz?: string | null
          fin?: string | null
          gegner_bekannt?: boolean | null
          gegner_email?: string | null
          gegner_kennzeichen?: string | null
          gegner_name?: string | null
          gegner_telefon?: string | null
          gegner_versicherung?: string | null
          id?: string | null
          kennzeichen?: string | null
          kostenvoranschlag_brutto?: number | null
          kostenvoranschlag_netto?: number | null
          nachname?: string | null
          schadens_art?: string | null
          schadens_hergang?: string | null
          schadentyp?: string | null
          status?: never
          telefon?: string | null
          unfall_konstellation?: string | null
          unfalldatum?: string | null
          unfallhergang?: string | null
          unfallort?: string | null
          vorname?: string | null
          werkstatt_id?: string | null
          werkstatt_intake_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "v_werkstatt_auftrag"
            referencedColumns: ["werkstatt_id"]
          },
          {
            foreignKeyName: "leads_werkstatt_id_fkey"
            columns: ["werkstatt_id"]
            isOneToOne: false
            referencedRelation: "werkstaetten"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _community_author: { Args: never; Returns: Record<string, unknown> }
      admin_person_dupe_candidates: {
        Args: { p_limit?: number }
        Returns: {
          match_value: string
          person_a_created: string
          person_a_has_account: boolean
          person_a_id: string
          person_a_name: string
          person_b_created: string
          person_b_has_account: boolean
          person_b_id: string
          person_b_name: string
          signal: string
        }[]
      }
      apply_gutachten_ocr: {
        Args: { p_claim_id: string; p_values: Json }
        Returns: undefined
      }
      audit_anon_reachable_pii: {
        Args: never
        Returns: {
          pii_columns: string[]
          policy_name: string
          qual: string
          table_name: string
        }[]
      }
      audit_anon_readable_views: {
        Args: never
        Returns: {
          is_matview: boolean
          security_invoker: boolean
          view_name: string
        }[]
      }
      audit_anon_sensitive_grants: {
        Args: never
        Returns: {
          column_name: string
          table_name: string
        }[]
      }
      audit_authenticated_write_reachable: {
        Args: never
        Returns: {
          check_expr: string
          cmd: string
          policy_name: string
          table_name: string
        }[]
      }
      audit_claim_view_gates: {
        Args: never
        Returns: {
          anon_can_select: boolean
          has_gate: boolean
          references_base: boolean
          view_name: string
        }[]
      }
      audit_claim_view_identity: {
        Args: never
        Returns: {
          befund: string
          rolle: string
          view_name: string
        }[]
      }
      audit_claim_views_leaking_to_nobody: {
        Args: never
        Returns: {
          nobody_sieht_zeilen: number
          view_name: string
        }[]
      }
      audit_claims_column_grants: {
        Args: never
        Returns: {
          befund: string
          detail: string
          spalte: string
        }[]
      }
      audit_enum_check_constraints: { Args: never; Returns: Json }
      audit_rls_function_grants: {
        Args: never
        Returns: {
          auth_exec: boolean
          fn_sig: string
          policy_refs: number
          proname: string
          svc_exec: boolean
        }[]
      }
      audit_ungated_definer_views: {
        Args: never
        Returns: {
          app_grants: string
          view_name: string
        }[]
      }
      auth_flottenmanager_firma_id: { Args: never; Returns: string }
      auth_user_firma_id: { Args: never; Returns: string }
      award_makler_staffel_boni: {
        Args: { p_makler_id: string }
        Returns: undefined
      }
      award_werkstatt_staffel_boni: {
        Args: { p_werkstatt_id: string }
        Returns: undefined
      }
      can_access_claim: { Args: { p_claim_id: string }; Returns: boolean }
      can_read_gutachter_termin_intern: {
        Args: { p_termin_id: string }
        Returns: boolean
      }
      check_gfa_rate_limit: { Args: { p_ip_hash: string }; Returns: boolean }
      claim_sichtbar_fuer_aktuellen_user: {
        Args: { p_claim_id: string }
        Returns: boolean
      }
      community_content_rang: {
        Args: { p_ids: string[]; p_kind: string }
        Returns: {
          content_id: string
          rang: string
          sinnsatz: string
        }[]
      }
      community_my_identity: { Args: never; Returns: Record<string, unknown> }
      convert_anfrage_zu_lead: {
        Args: { p_anfrage_id: string }
        Returns: string
      }
      count_unread_updates: {
        Args: { p_fall_id: string; p_since: string }
        Returns: number
      }
      create_community_comment: {
        Args: {
          p_body: string
          p_parent_id?: string
          p_target_id: string
          p_target_kind: string
        }
        Returns: string
      }
      create_community_post: {
        Args: { p_body: string; p_tags?: string[] }
        Returns: string
      }
      cron_airdrop_token_cleanup: { Args: never; Returns: undefined }
      cron_airdrop_token_expiry: { Args: never; Returns: undefined }
      cron_dsgvo_hard_delete: { Args: never; Returns: undefined }
      cron_gutachten_ocr_recovery: { Args: never; Returns: undefined }
      cron_kanzlei_paket_pending_check: { Args: never; Returns: undefined }
      cron_konsistenz_check: { Args: never; Returns: undefined }
      cron_mark_durchgefuehrt_fallback: { Args: never; Returns: undefined }
      cron_mietwagen_lange_anmietung: { Args: never; Returns: undefined }
      cron_mietwagen_sla_tracking: { Args: never; Returns: undefined }
      cron_pflicht_foto_validation: { Args: never; Returns: undefined }
      cron_rate_limit_reset: { Args: never; Returns: undefined }
      cron_reparatur_freigabe_eskalation: { Args: never; Returns: undefined }
      cron_trigger_exif_worker: { Args: never; Returns: undefined }
      cron_trigger_netzwerk_abo_dunning: { Args: never; Returns: undefined }
      cron_trigger_notification_worker: { Args: never; Returns: undefined }
      cron_trigger_release_provisionen: { Args: never; Returns: undefined }
      cron_trigger_salesforce_sync: { Args: never; Returns: undefined }
      cron_verjaehrungs_warner: { Args: never; Returns: undefined }
      cron_vs_frist_reminder: { Args: never; Returns: undefined }
      cron_vs_frist_tick: { Args: never; Returns: undefined }
      default_kanzlei_id: { Args: never; Returns: string }
      delete_fall_komplett:
        | { Args: { p_fall_id: string }; Returns: undefined }
        | {
            Args: { p_claim_id: string; p_fall_id: string }
            Returns: undefined
          }
      delete_gutachter_komplett: {
        Args: { p_sv_id: string }
        Returns: undefined
      }
      delete_lead_komplett: { Args: { p_lead_id: string }; Returns: undefined }
      derive_abrechnungsweg: {
        Args: {
          p_eigene_versicherung: string
          p_schadenart: string
          p_schuldfrage: string
          p_service_typ: string
        }
        Returns: string
      }
      dispatcher_owns_lead: { Args: { p_lead_id: string }; Returns: boolean }
      dokument_katalog_ctx: { Args: { p_claim_id: string }; Returns: Json }
      dokument_regel_equals: { Args: { a: Json; b: Json }; Returns: boolean }
      dokument_regel_num: { Args: { v: Json }; Returns: number }
      dokument_regel_trifft: {
        Args: { ctx: Json; regel: Json }
        Returns: boolean
      }
      dokument_regel_truthy: { Args: { v: Json }; Returns: boolean }
      dsgvo_anonymize_user_data: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      expire_geblockte_termine_ohne_sa: { Args: never; Returns: number }
      get_aktueller_gt_termin_id: {
        Args: { p_claim_id: string }
        Returns: string
      }
      get_makler_empfehlung_uebersicht: {
        Args: { p_makler_id: string }
        Returns: Json
      }
      get_sv_id: { Args: never; Returns: string }
      get_updates_action: {
        Args: { p_rolle: string }
        Returns: {
          created_at: string
          id: string
          inhalt: string
          kontext_id: string
          kontext_typ: string
          modus: string
          prioritaet: string
          source: string
          titel: string
          typ: string
        }[]
      }
      get_user_rolle: { Args: never; Returns: string }
      get_werkstatt_reparatur_auftraege: {
        Args: never
        Returns: {
          claim_id: string
          fahrzeug: string
          kennzeichen: string
          kunde_name: string
          ort: string
          quelle: string
          zugewiesen_am: string
        }[]
      }
      get_werkstatt_vermittlungen: {
        Args: never
        Returns: {
          claim_id: string
          erstellt_am: string
          fahrzeug: string
          kennzeichen: string
          kunde_name: string
          kva_betrag: number
          lead_id: string
          reparatur_freigegeben_am: string
          status: string
        }[]
      }
      golden_path_claim_visible_for: {
        Args: { p_claim_id: string; p_user_id: string }
        Returns: boolean
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      increment_offene_faelle: {
        Args: { sv_id_param: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_buero_admin: { Args: { p_buero_id: string }; Returns: boolean }
      is_claim_user_party: { Args: { p_claim_id: string }; Returns: boolean }
      is_dispatcher: { Args: never; Returns: boolean }
      is_kanzlei: { Args: never; Returns: boolean }
      is_kanzlei_mandat: { Args: { p_claim_id: string }; Returns: boolean }
      is_kanzlei_member: { Args: { p_kanzlei_id: string }; Returns: boolean }
      is_kundenbetreuer: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_sv: { Args: never; Returns: boolean }
      is_sv_for_claim: { Args: { p_claim_id: string }; Returns: boolean }
      is_test_lead: { Args: { p_email: string }; Returns: boolean }
      is_werkstatt_for_claim: { Args: { p_claim_id: string }; Returns: boolean }
      ist_chat_teilnehmer: { Args: { p_thread_id: string }; Returns: boolean }
      ist_interne_email: { Args: { p_email: string }; Returns: boolean }
      link_lead_data_to_fall: {
        Args: { p_fall_id: string; p_lead_id: string }
        Returns: Json
      }
      log_cron_job_run: {
        Args: {
          p_error?: string
          p_job_name: string
          p_metadata?: Json
          p_rows?: number
          p_status?: string
        }
        Returns: string
      }
      mark_expired_leads: { Args: never; Returns: undefined }
      match_person_candidates: {
        Args: {
          p_email?: string
          p_exclude_person_id?: string
          p_geburtsdatum?: string
          p_limit?: number
          p_min_score?: number
          p_nachname?: string
          p_phone?: string
          p_vorname?: string
        }
        Returns: {
          person_id: string
          score: number
          signals: string[]
          tier: string
        }[]
      }
      merge_stub_vehicle: {
        Args: { p_stub: string; p_target: string }
        Returns: undefined
      }
      my_werkstatt_ids: { Args: never; Returns: string[] }
      netzwerk_verzeichnis_suche: {
        Args: { q: string; ziel_rolle?: string }
        Returns: {
          anzeige_name: string
          avatar_url: string
          ort: string
          profil_id: string
          rolle: string
        }[]
      }
      next_rechnungs_nr: {
        Args: { p_jahr: number; p_serie: string }
        Returns: number
      }
      notify_admins: {
        Args: { p_link?: string; p_nachricht?: string; p_titel: string }
        Returns: undefined
      }
      record_verified_contact: {
        Args: {
          p_kind: string
          p_person_id: string
          p_source: string
          p_source_ref?: string
          p_value: string
          p_verified_at?: string
        }
        Returns: string
      }
      report_comment: { Args: { p_comment_id: string }; Returns: undefined }
      report_target: {
        Args: { p_id: string; p_kind: string }
        Returns: undefined
      }
      rolle_sieht_bankdaten: { Args: never; Returns: boolean }
      rolle_sieht_fallnotizen: { Args: never; Returns: boolean }
      rolle_sieht_gutachtenwerte: { Args: never; Returns: boolean }
      rolle_sieht_margen: { Args: never; Returns: boolean }
      rolle_sieht_regulierung: { Args: never; Returns: boolean }
      safe_to_date: { Args: { p_text: string }; Returns: string }
      safe_to_time: { Args: { p_text: string }; Returns: string }
      search_global: {
        Args: { limit_per_type?: number; q: string }
        Returns: {
          entity_type: string
          id: string
          label: string
          score: number
          status: string
          sub: string
        }[]
      }
      search_makler: {
        Args: { limit_per_type?: number; q: string }
        Returns: {
          entity_type: string
          id: string
          label: string
          score: number
          status: string
          sub: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sv_lead_upsert: { Args: { p: Json }; Returns: string }
      toggle_like: {
        Args: { p_target_id: string; p_target_kind: string }
        Returns: boolean
      }
      touch_claim_recency: { Args: { p_claim_id: string }; Returns: undefined }
      upsert_vehicle_by_fin: {
        Args: {
          p_fin: string
          p_hersteller?: string
          p_hsn?: string
          p_kennzeichen?: string
          p_kilometerstand?: number
          p_modell?: string
          p_owner_id?: string
          p_quelle?: string
          p_tsn?: string
        }
        Returns: string
      }
    }
    Enums: {
      betreuungspaket: "vollservice" | "sv-only"
      bkat_schuldindiz:
        | "gegner_klar"
        | "gegner_wahrscheinlich"
        | "geteilt"
        | "kunde_verdacht"
        | "neutral"
      bkat_unfallart:
        | "auffahrunfall"
        | "vorfahrt"
        | "kreuzung_rotlicht"
        | "spurwechsel"
        | "ueberholen"
        | "abbiegen"
        | "rueckwaerts_parken"
        | "einfahren_anfahren"
        | "dooring"
        | "fussgaenger"
        | "geschwindigkeit"
        | "fahrerflucht"
        | "alkohol_drogen"
        | "grundregeln"
        | "sonstiges"
      comment_status: "pending" | "approved" | "rejected" | "hidden"
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
        | "reparatur-werkstatt-suche"
        | "reparatur-angefragt"
        | "reparatur-laeuft"
        | "reparatur-erledigt"
        | "vs-kuerzt"
        | "klage"
        | "in_kommunikation_vs"
        | "abgelehnt"
        | "an_externe_kanzlei_uebergeben"
        | "reguliert_vollstaendig"
        | "klage_rechtsstreit"
        | "verjaehrt"
        | "abgelehnt_final"
        | "termin_durchgefuehrt"
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
      sv_paket_typ:
        | "solo"
        | "buero_inhaber"
        | "sub_buero"
        | "akademie_verwalter"
        | "akademie_sub"
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
        | "werkstatt"
        | "flottenmanager"
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
      bkat_schuldindiz: [
        "gegner_klar",
        "gegner_wahrscheinlich",
        "geteilt",
        "kunde_verdacht",
        "neutral",
      ],
      bkat_unfallart: [
        "auffahrunfall",
        "vorfahrt",
        "kreuzung_rotlicht",
        "spurwechsel",
        "ueberholen",
        "abbiegen",
        "rueckwaerts_parken",
        "einfahren_anfahren",
        "dooring",
        "fussgaenger",
        "geschwindigkeit",
        "fahrerflucht",
        "alkohol_drogen",
        "grundregeln",
        "sonstiges",
      ],
      comment_status: ["pending", "approved", "rejected", "hidden"],
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
        "reparatur-werkstatt-suche",
        "reparatur-angefragt",
        "reparatur-laeuft",
        "reparatur-erledigt",
        "vs-kuerzt",
        "klage",
        "in_kommunikation_vs",
        "abgelehnt",
        "an_externe_kanzlei_uebergeben",
        "reguliert_vollstaendig",
        "klage_rechtsstreit",
        "verjaehrt",
        "abgelehnt_final",
        "termin_durchgefuehrt",
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
      sv_paket_typ: [
        "solo",
        "buero_inhaber",
        "sub_buero",
        "akademie_verwalter",
        "akademie_sub",
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
        "werkstatt",
        "flottenmanager",
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
