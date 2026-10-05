export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_locked_items: {
        Row: {
          hint: string
          item_key: string
          label: string
          rule: string
          threshold: number
        }
        Insert: {
          hint: string
          item_key: string
          label: string
          rule: string
          threshold: number
        }
        Update: {
          hint?: string
          item_key?: string
          label?: string
          rule?: string
          threshold?: number
        }
        Relationships: []
      }
      agent_unlocks: {
        Row: {
          item_key: string
          profile_id: string
          unlocked_at: string
        }
        Insert: {
          item_key: string
          profile_id: string
          unlocked_at?: string
        }
        Update: {
          item_key?: string
          profile_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_unlocks_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "agent_locked_items"
            referencedColumns: ["item_key"]
          },
          {
            foreignKeyName: "agent_unlocks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_alerts: {
        Row: {
          created_at: string
          kind: string
          profile_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          kind: string
          profile_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          kind?: string
          profile_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_breaks: {
        Row: {
          day_id: number
          ended_at: string | null
          id: number
          profile_id: string
          session_id: number
          started_at: string
        }
        Insert: {
          day_id: number
          ended_at?: string | null
          id?: never
          profile_id: string
          session_id: number
          started_at?: string
        }
        Update: {
          day_id?: number
          ended_at?: string | null
          id?: never
          profile_id?: string
          session_id?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_breaks_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_breaks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_breaks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_days: {
        Row: {
          arrival: string
          auto_signed_out: boolean
          created_at: string
          first_in: string | null
          id: number
          last_out: string | null
          late_minutes: number
          overridden_by: string | null
          override_note: string | null
          override_status: string | null
          profile_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          signout_reminded_at: string | null
          work_date: string
        }
        Insert: {
          arrival?: string
          auto_signed_out?: boolean
          created_at?: string
          first_in?: string | null
          id?: never
          last_out?: string | null
          late_minutes?: number
          overridden_by?: string | null
          override_note?: string | null
          override_status?: string | null
          profile_id: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          signout_reminded_at?: string | null
          work_date: string
        }
        Update: {
          arrival?: string
          auto_signed_out?: boolean
          created_at?: string
          first_in?: string | null
          id?: never
          last_out?: string | null
          late_minutes?: number
          overridden_by?: string | null
          override_note?: string | null
          override_status?: string | null
          profile_id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          signout_reminded_at?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          day_id: number
          end_reason: string | null
          ended_at: string | null
          id: number
          profile_id: string
          started_at: string
        }
        Insert: {
          day_id: number
          end_reason?: string | null
          ended_at?: string | null
          id?: never
          profile_id: string
          started_at?: string
        }
        Update: {
          day_id?: number
          end_reason?: string | null
          ended_at?: string | null
          id?: never
          profile_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          caption: string | null
          client_visible: boolean
          created_at: string
          file_id: number | null
          id: number
          owner_id: string | null
          platform: string
          project_id: number
          scheduled_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          client_visible?: boolean
          created_at?: string
          file_id?: number | null
          id?: never
          owner_id?: string | null
          platform?: string
          project_id: number
          scheduled_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          client_visible?: boolean
          created_at?: string
          file_id?: number | null
          id?: never
          owner_id?: string | null
          platform?: string
          project_id?: number
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount_usd: number
          company: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          expected_close: string | null
          id: number
          lead_id: number | null
          lost_reason: string | null
          next_step: string | null
          next_step_at: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          position: number
          probability: number
          service: string | null
          stage: string
          title: string
          updated_at: string
          won_on: string | null
        }
        Insert: {
          amount_usd?: number
          company?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          expected_close?: string | null
          id?: never
          lead_id?: number | null
          lost_reason?: string | null
          next_step?: string | null
          next_step_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          position?: number
          probability?: number
          service?: string | null
          stage?: string
          title: string
          updated_at?: string
          won_on?: string | null
        }
        Update: {
          amount_usd?: number
          company?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          expected_close?: string | null
          id?: never
          lead_id?: number | null
          lost_reason?: string | null
          next_step?: string | null
          next_step_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          position?: number
          probability?: number
          service?: string | null
          stage?: string
          title?: string
          updated_at?: string
          won_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employment: {
        Row: {
          daily_dial_target: number
          joined_on: string | null
          monthly_salary_pkr: number
          monthly_target_usd: number
          profile_id: string
          shift_minutes: number
          shift_start: string
          tracks_attendance: boolean
          updated_at: string
          work_days: number[]
        }
        Insert: {
          daily_dial_target?: number
          joined_on?: string | null
          monthly_salary_pkr?: number
          monthly_target_usd?: number
          profile_id: string
          shift_minutes?: number
          shift_start?: string
          tracks_attendance?: boolean
          updated_at?: string
          work_days?: number[]
        }
        Update: {
          daily_dial_target?: number
          joined_on?: string | null
          monthly_salary_pkr?: number
          monthly_target_usd?: number
          profile_id?: string
          shift_minutes?: number
          shift_start?: string
          tracks_attendance?: boolean
          updated_at?: string
          work_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employment_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          file_id: number
          id: number
          pin_x: number | null
          pin_y: number | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          file_id: number
          id?: never
          pin_x?: number | null
          pin_y?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          file_id?: number
          id?: never
          pin_x?: number | null
          pin_y?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          game_id: number
          invited_at: string
          responded_at: string | null
          seat: number
          status: string
          user_id: string
        }
        Insert: {
          game_id: number
          invited_at?: string
          responded_at?: string | null
          seat: number
          status?: string
          user_id: string
        }
        Update: {
          game_id?: number
          invited_at?: string
          responded_at?: string | null
          seat?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: number
          kind: string
          last_roll: number | null
          result: string | null
          started_at: string | null
          state: Json
          status: string
          turn_user: string | null
          updated_at: string
          version: number
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          host_id: string
          id?: never
          kind: string
          last_roll?: number | null
          result?: string | null
          started_at?: string | null
          state?: Json
          status?: string
          turn_user?: string | null
          updated_at?: string
          version?: number
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          host_id?: string
          id?: never
          kind?: string
          last_roll?: number | null
          result?: string | null
          started_at?: string | null
          state?: Json
          status?: string
          turn_user?: string | null
          updated_at?: string
          version?: number
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_turn_user_fkey"
            columns: ["turn_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          day: string
          name: string
        }
        Insert: {
          day: string
          name: string
        }
        Update: {
          day?: string
          name?: string
        }
        Relationships: []
      }
      lead_attempts: {
        Row: {
          action: string
          attempt_no: number | null
          comment: string | null
          created_at: string
          followup_at: string | null
          id: number
          lead_id: number
          outcome: string | null
          rep_id: string | null
          work_date: string
        }
        Insert: {
          action: string
          attempt_no?: number | null
          comment?: string | null
          created_at?: string
          followup_at?: string | null
          id?: never
          lead_id: number
          outcome?: string | null
          rep_id?: string | null
          work_date: string
        }
        Update: {
          action?: string
          attempt_no?: number | null
          comment?: string | null
          created_at?: string
          followup_at?: string | null
          id?: never
          lead_id?: number
          outcome?: string | null
          rep_id?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_attempts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attempts_outcome_fkey"
            columns: ["outcome"]
            isOneToOne: false
            referencedRelation: "lead_outcomes"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "lead_attempts_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_imports: {
        Row: {
          created_at: string
          duplicates: number
          file_name: string
          id: number
          imported_by: string | null
          inserted: number
          invalid: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          duplicates?: number
          file_name: string
          id?: never
          imported_by?: string | null
          inserted?: number
          invalid?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          duplicates?: number
          file_name?: string
          id?: never
          imported_by?: string | null
          inserted?: number
          invalid?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_outcomes: {
        Row: {
          connected: boolean
          effect: string
          key: string
          label: string
          pipeline_stage: string | null
          short_label: string
          sort: number
          tone: string
        }
        Insert: {
          connected: boolean
          effect: string
          key: string
          label: string
          pipeline_stage?: string | null
          short_label: string
          sort: number
          tone?: string
        }
        Update: {
          connected?: boolean
          effect?: string
          key?: string
          label?: string
          pipeline_stage?: string | null
          short_label?: string
          sort?: number
          tone?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          attempts: number
          closed_at: string | null
          closed_reason: string | null
          connected: boolean
          country: string | null
          created_at: string
          deal_id: number | null
          id: number
          import_id: number | null
          last_attempt_at: string | null
          last_comment: string | null
          lead_date: string | null
          legacy: Json | null
          name: string
          next_action_at: string | null
          personal_email: string | null
          phone: string | null
          phone_key: string | null
          platform: string | null
          post_link: string | null
          previous_round: Json | null
          query: string | null
          recycle_count: number
          service: string | null
          skipped_at: string | null
          stage: string
          status: string
          updated_at: string
          work_email: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          attempts?: number
          closed_at?: string | null
          closed_reason?: string | null
          connected?: boolean
          country?: string | null
          created_at?: string
          deal_id?: number | null
          id?: never
          import_id?: number | null
          last_attempt_at?: string | null
          last_comment?: string | null
          lead_date?: string | null
          legacy?: Json | null
          name?: string
          next_action_at?: string | null
          personal_email?: string | null
          phone?: string | null
          phone_key?: string | null
          platform?: string | null
          post_link?: string | null
          previous_round?: Json | null
          query?: string | null
          recycle_count?: number
          service?: string | null
          skipped_at?: string | null
          stage?: string
          status?: string
          updated_at?: string
          work_email?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          attempts?: number
          closed_at?: string | null
          closed_reason?: string | null
          connected?: boolean
          country?: string | null
          created_at?: string
          deal_id?: number | null
          id?: never
          import_id?: number | null
          last_attempt_at?: string | null
          last_comment?: string | null
          lead_date?: string | null
          legacy?: Json | null
          name?: string
          next_action_at?: string | null
          personal_email?: string | null
          phone?: string | null
          phone_key?: string | null
          platform?: string | null
          post_link?: string | null
          previous_round?: Json | null
          query?: string | null
          recycle_count?: number
          service?: string | null
          skipped_at?: string | null
          stage?: string
          status?: string
          updated_at?: string
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deal_fk"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          client_links: string | null
          client_website: string | null
          created_at: string
          deal_id: number | null
          duration_minutes: number
          id: number
          lead_id: number | null
          location: string | null
          notes: string | null
          owner_id: string
          prep_notes: string | null
          reminded_at: string | null
          starts_at: string
          status: string
          technical_manager_id: string | null
          timezone: string | null
          title: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          client_links?: string | null
          client_website?: string | null
          created_at?: string
          deal_id?: number | null
          duration_minutes?: number
          id?: never
          lead_id?: number | null
          location?: string | null
          notes?: string | null
          owner_id?: string
          prep_notes?: string | null
          reminded_at?: string | null
          starts_at: string
          status?: string
          technical_manager_id?: string | null
          timezone?: string | null
          title: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          client_links?: string | null
          client_website?: string | null
          created_at?: string
          deal_id?: number | null
          duration_minutes?: number
          id?: never
          lead_id?: number | null
          location?: string | null
          notes?: string | null
          owner_id?: string
          prep_notes?: string | null
          reminded_at?: string | null
          starts_at?: string
          status?: string
          technical_manager_id?: string | null
          timezone?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_technical_manager_id_fkey"
            columns: ["technical_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: number
          kind: string
          link: string | null
          read_at: string | null
          title: string
          tone: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: never
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          tone?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: never
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          tone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_releases: {
        Row: {
          period_start: string
          profile_id: string
          released_at: string
          released_by: string | null
          snapshot: Json
        }
        Insert: {
          period_start: string
          profile_id: string
          released_at?: string
          released_by?: string | null
          snapshot: Json
        }
        Update: {
          period_start?: string
          profile_id?: string
          released_at?: string
          released_by?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payroll_releases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_releases_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: Json
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_technical_manager: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar?: Json
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_technical_manager?: boolean
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar?: Json
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_technical_manager?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          actor_id: string | null
          client_visible: boolean
          created_at: string
          id: number
          kind: string
          link: string | null
          project_id: number
          summary: string
        }
        Insert: {
          actor_id?: string | null
          client_visible?: boolean
          created_at?: string
          id?: never
          kind: string
          link?: string | null
          project_id: number
          summary: string
        }
        Update: {
          actor_id?: string | null
          client_visible?: boolean
          created_at?: string
          id?: never
          kind?: string
          link?: string | null
          project_id?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_events: {
        Row: {
          client_visible: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: number
          kind: string
          location: string | null
          notes: string | null
          project_id: number
          starts_at: string
          title: string
        }
        Insert: {
          client_visible?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: never
          kind?: string
          location?: string | null
          notes?: string | null
          project_id: number
          starts_at: string
          title: string
        }
        Update: {
          client_visible?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: never
          kind?: string
          location?: string | null
          notes?: string | null
          project_id?: number
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          client_visible: boolean
          created_at: string
          description: string | null
          external_url: string | null
          from_client: boolean
          group_id: number | null
          id: number
          kind: string
          mime_type: string | null
          project_id: number
          review_note: string | null
          review_reminded_at: string | null
          review_requested_at: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          storage_path: string | null
          title: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          client_visible?: boolean
          created_at?: string
          description?: string | null
          external_url?: string | null
          from_client?: boolean
          group_id?: number | null
          id?: never
          kind?: string
          mime_type?: string | null
          project_id: number
          review_note?: string | null
          review_reminded_at?: string | null
          review_requested_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          title: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          client_visible?: boolean
          created_at?: string
          description?: string | null
          external_url?: string | null
          from_client?: boolean
          group_id?: number | null
          id?: never
          kind?: string
          mime_type?: string | null
          project_id?: number
          review_note?: string | null
          review_reminded_at?: string | null
          review_requested_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          title?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          is_lead: boolean
          profile_id: string
          project_id: number
        }
        Insert: {
          added_at?: string
          is_lead?: boolean
          profile_id: string
          project_id: number
        }
        Update: {
          added_at?: string
          is_lead?: boolean
          profile_id?: string
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: number
          project_id: number
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: never
          project_id: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: never
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_reads: {
        Row: {
          messages_seen_at: string
          profile_id: string
          project_id: number
        }
        Insert: {
          messages_seen_at?: string
          profile_id?: string
          project_id: number
        }
        Update: {
          messages_seen_at?: string
          profile_id?: string
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          client_name: string | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          due_on: string | null
          id: number
          name: string
          service: string | null
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_name?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: never
          name: string
          service?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_name?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: never
          name?: string
          service?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_messages: {
        Row: {
          body: string
          created_at: string
          id: number
          position: number
          title: string
          updated_at: string
          user_id: string
          uses: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
          uses?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "quick_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          absent_alert_minutes: number
          attendance_starts_on: string | null
          booking_link: string | null
          break_allowance_minutes: number
          commission_rate: number
          company_name: string
          company_pitch: string
          company_website: string | null
          daily_rate_basis: string
          default_daily_dials: number
          followup_gap_days: number
          free_short_days: number
          grace_minutes: number
          half_day_max_minutes: number
          id: boolean
          low_performance_ratio: number
          low_performance_salary_factor: number
          max_attempts: number
          payroll_cutoff_day: number
          recycle_after_days: number
          reduced_half_days: number
          short_day_max_minutes: number
          signout_grace_minutes: number
          timezone: string
          updated_at: string
          usd_to_pkr: number
        }
        Insert: {
          absent_alert_minutes?: number
          attendance_starts_on?: string | null
          booking_link?: string | null
          break_allowance_minutes?: number
          commission_rate?: number
          company_name?: string
          company_pitch?: string
          company_website?: string | null
          daily_rate_basis?: string
          default_daily_dials?: number
          followup_gap_days?: number
          free_short_days?: number
          grace_minutes?: number
          half_day_max_minutes?: number
          id?: boolean
          low_performance_ratio?: number
          low_performance_salary_factor?: number
          max_attempts?: number
          payroll_cutoff_day?: number
          recycle_after_days?: number
          reduced_half_days?: number
          short_day_max_minutes?: number
          signout_grace_minutes?: number
          timezone?: string
          updated_at?: string
          usd_to_pkr?: number
        }
        Update: {
          absent_alert_minutes?: number
          attendance_starts_on?: string | null
          booking_link?: string | null
          break_allowance_minutes?: number
          commission_rate?: number
          company_name?: string
          company_pitch?: string
          company_website?: string | null
          daily_rate_basis?: string
          default_daily_dials?: number
          followup_gap_days?: number
          free_short_days?: number
          grace_minutes?: number
          half_day_max_minutes?: number
          id?: boolean
          low_performance_ratio?: number
          low_performance_salary_factor?: number
          max_attempts?: number
          payroll_cutoff_day?: number
          recycle_after_days?: number
          reduced_half_days?: number
          short_day_max_minutes?: number
          signout_grace_minutes?: number
          timezone?: string
          updated_at?: string
          usd_to_pkr?: number
        }
        Relationships: []
      }
      sprints: {
        Row: {
          completed_at: string | null
          created_at: string
          ends_on: string
          goal: string | null
          id: number
          name: string
          project_id: number
          starts_on: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          ends_on: string
          goal?: string | null
          id?: never
          name: string
          project_id: number
          starts_on: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          ends_on?: string
          goal?: string | null
          id?: never
          name?: string
          project_id?: number
          starts_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: number
          task_id: number
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: never
          task_id: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: never
          task_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          client_visible: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_on: string | null
          id: number
          labels: string[]
          position: number
          priority: string
          project_id: number
          reminded_on: string | null
          sprint_id: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_visible?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: never
          labels?: string[]
          position?: number
          priority?: string
          project_id: number
          reminded_on?: string | null
          sprint_id?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_visible?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: never
          labels?: string[]
          position?: number
          priority?: string
          project_id?: number
          reminded_on?: string | null
          sprint_id?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actor_name: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      admin_lead_facets: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_lead_ids: {
        Args: { p_filter: Json; p_limit?: number }
        Returns: number[]
      }
      agent_progress: {
        Args: { p_profile?: string }
        Returns: {
          hint: string
          item_key: string
          label: string
          progress: number
          threshold: number
          unlocked: boolean
        }[]
      }
      app_tz: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      assign_leads: {
        Args: { p_lead_ids: number[]; p_reps: string[] }
        Returns: number
      }
      attendance_board: {
        Args: { p_date?: string }
        Returns: {
          arrival: string
          auto_signed_out: boolean
          avatar: Json
          break_seconds: number
          department: string
          first_in: string
          full_name: string
          last_out: string
          late_minutes: number
          override_status: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          scheduled_end: string
          scheduled_start: string
          state: string
          title: string
          work_date: string
          worked_seconds: number
        }[]
      }
      attendance_sweep: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      audit: {
        Args: {
          p_action: string
          p_changes?: Json
          p_entity: string
          p_entity_id: string
          p_summary: string
        }
        Returns: undefined
      }
      bootstrap_admin: {
        Args: { p_email: string; p_full_name: string }
        Returns: string
      }
      can_play: {
        Args: { p_user?: string }
        Returns: boolean
      }
      can_read_project_object: {
        Args: { p_name: string }
        Returns: boolean
      }
      can_see_project: {
        Args: { p_project: number }
        Returns: boolean
      }
      can_work_project: {
        Args: { p_project: number }
        Returns: boolean
      }
      check_agent_unlocks: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      classify_arrival: {
        Args: { p_late_minutes: number }
        Returns: string
      }
      clock_in: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      clock_out: {
        Args: { p_reason?: string }
        Returns: Json
      }
      complete_sprint: {
        Args: { p_move_to?: number; p_sprint: number }
        Returns: number
      }
      day_break_seconds: {
        Args: { p_day_id: number }
        Returns: number
      }
      day_worked_seconds: {
        Args: { p_day_id: number }
        Returns: number
      }
      deal_default_probability: {
        Args: { p_stage: string }
        Returns: number
      }
      deal_stage_rank: {
        Args: { p_stage: string }
        Returns: number
      }
      end_break: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      finish_lead_import: {
        Args: { p_import_id: number }
        Returns: Json
      }
      first_name: {
        Args: { p_user: string }
        Returns: string
      }
      game_create: {
        Args: { p_invitees: string[]; p_kind: string; p_state?: Json }
        Returns: number
      }
      game_label: {
        Args: { p_kind: string }
        Returns: string
      }
      game_leave: {
        Args: { p_game_id: number }
        Returns: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: number
          kind: string
          last_roll: number | null
          result: string | null
          started_at: string | null
          state: Json
          status: string
          turn_user: string | null
          updated_at: string
          version: number
          winner_id: string | null
        }
      }
      game_move: {
        Args: {
          p_game_id: number
          p_next_user: string
          p_result?: string
          p_state: Json
          p_version: number
          p_winner?: string
        }
        Returns: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: number
          kind: string
          last_roll: number | null
          result: string | null
          started_at: string | null
          state: Json
          status: string
          turn_user: string | null
          updated_at: string
          version: number
          winner_id: string | null
        }
      }
      game_respond: {
        Args: { p_accept: boolean; p_game_id: number }
        Returns: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: number
          kind: string
          last_roll: number | null
          result: string | null
          started_at: string | null
          state: Json
          status: string
          turn_user: string | null
          updated_at: string
          version: number
          winner_id: string | null
        }
      }
      game_roll: {
        Args: { p_game_id: number }
        Returns: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: number
          kind: string
          last_roll: number | null
          result: string | null
          started_at: string | null
          state: Json
          status: string
          turn_user: string | null
          updated_at: string
          version: number
          winner_id: string | null
        }
      }
      game_start: {
        Args: { p_game_id: number; p_state: Json }
        Returns: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: number
          kind: string
          last_roll: number | null
          result: string | null
          started_at: string | null
          state: Json
          status: string
          turn_user: string | null
          updated_at: string
          version: number
          winner_id: string | null
        }
      }
      game_sweep: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      import_leads: {
        Args: { p_import_id: number; p_rows: Json; p_skip_duplicates?: boolean }
        Returns: Json
      }
      in_game: {
        Args: { p_game: number }
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_project_client: {
        Args: { p_project: number }
        Returns: boolean
      }
      is_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_tm_for_lead: {
        Args: { p_lead: number }
        Returns: boolean
      }
      is_work_day: {
        Args: { p_date: string; p_profile: string }
        Returns: boolean
      }
      lead_filter_options: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      lead_recycle_sweep: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      local_today: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      log_lead_action: {
        Args: {
          p_action: string
          p_comment?: string
          p_deal_amount?: number
          p_followup_at?: string
          p_lead_id: number
          p_meeting?: Json
          p_meeting_at?: string
          p_meeting_minutes?: number
          p_outcome?: string
        }
        Returns: Json
      }
      log_project: {
        Args: {
          p_client_visible?: boolean
          p_kind: string
          p_link?: string
          p_project: number
          p_summary: string
        }
        Returns: undefined
      }
      mark_notifications_read: {
        Args: { p_ids?: number[] }
        Returns: undefined
      }
      mark_project_read: {
        Args: { p_project: number }
        Returns: undefined
      }
      meeting_when: {
        Args: { p_at: string; p_tz: string }
        Returns: string
      }
      my_attendance: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      my_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      my_today: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      next_followup_at: {
        Args: { p_profile: string; p_work_date: string }
        Returns: string
      }
      next_leads: {
        Args: {
          p_from?: string
          p_limit?: number
          p_platforms?: string[]
          p_services?: string[]
          p_to?: string
        }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          attempts: number
          closed_at: string | null
          closed_reason: string | null
          connected: boolean
          country: string | null
          created_at: string
          deal_id: number | null
          id: number
          import_id: number | null
          last_attempt_at: string | null
          last_comment: string | null
          lead_date: string | null
          legacy: Json | null
          name: string
          next_action_at: string | null
          personal_email: string | null
          phone: string | null
          phone_key: string | null
          platform: string | null
          post_link: string | null
          previous_round: Json | null
          query: string | null
          recycle_count: number
          service: string | null
          skipped_at: string | null
          stage: string
          status: string
          updated_at: string
          work_email: string | null
        }[]
      }
      notify: {
        Args: {
          p_body?: string
          p_data?: Json
          p_kind: string
          p_link?: string
          p_title: string
          p_tone?: string
          p_user: string
        }
        Returns: undefined
      }
      notify_admins: {
        Args: {
          p_body?: string
          p_data?: Json
          p_kind: string
          p_link?: string
          p_title: string
          p_tone?: string
        }
        Returns: undefined
      }
      notify_project: {
        Args: {
          p_body?: string
          p_data?: Json
          p_kind: string
          p_link?: string
          p_project: number
          p_title: string
          p_tone?: string
          p_who: string
        }
        Returns: undefined
      }
      payroll_compute: {
        Args: { p_period_start?: string; p_profile: string }
        Returns: Json
      }
      payroll_overview: {
        Args: { p_period_start?: string }
        Returns: Json
      }
      payroll_period_end: {
        Args: { p_start: string }
        Returns: string
      }
      payroll_period_start: {
        Args: { p_date: string }
        Returns: string
      }
      players_on_break: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      project_access: {
        Args: { p_project: number }
        Returns: string
      }
      project_name: {
        Args: { p_project: number }
        Returns: string
      }
      project_sweep: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      project_unread: {
        Args: Record<PropertyKey, never>
        Returns: {
          last_at: string
          project_id: number
          unread: number
        }[]
      }
      queue_summary: {
        Args: {
          p_from?: string
          p_platforms?: string[]
          p_services?: string[]
          p_to?: string
        }
        Returns: Json
      }
      quick_message_used: {
        Args: { p_id: number }
        Returns: undefined
      }
      record_login: {
        Args: { p_kind: string; p_user_agent?: string }
        Returns: undefined
      }
      recycle_lead_ids: {
        Args: { p_ids: number[] }
        Returns: number
      }
      recycle_leads: {
        Args: { p_lead_ids: number[] }
        Returns: number
      }
      release_payroll: {
        Args: { p_period_start: string }
        Returns: number
      }
      resolve_work_date: {
        Args: { p_at: string; p_profile: string }
        Returns: string
      }
      review_file: {
        Args: { p_decision: string; p_file: number; p_note?: string }
        Returns: {
          client_visible: boolean
          created_at: string
          description: string | null
          external_url: string | null
          from_client: boolean
          group_id: number | null
          id: number
          kind: string
          mime_type: string | null
          project_id: number
          review_note: string | null
          review_reminded_at: string | null
          review_requested_at: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          storage_path: string | null
          title: string
          uploaded_by: string | null
          version: number
        }
      }
      run_sweeps: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      sales_leaderboard: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avatar: Json
          connected: number
          dials: number
          full_name: string
          meetings: number
          profile_id: string
          prospects: number
          won_count: number
          won_usd: number
        }[]
      }
      sales_stats: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: Json
      }
      sales_sweep: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      sales_team_overview: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avatar: Json
          connected: number
          daily_target: number
          dials: number
          full_name: string
          leads_open: number
          leads_total: number
          meetings: number
          open_pipeline_usd: number
          profile_id: string
          prospects: number
          target_usd: number
          won_count: number
          won_usd: number
        }[]
      }
      set_attendance_override: {
        Args: {
          p_date: string
          p_note?: string
          p_profile: string
          p_status: string
        }
        Returns: undefined
      }
      shares_project_with: {
        Args: { p_profile: string }
        Returns: boolean
      }
      shift_start_at: {
        Args: { p_date: string; p_profile: string }
        Returns: string
      }
      start_break: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      start_lead_import: {
        Args: { p_file_name: string; p_total: number }
        Returns: number
      }
      start_sprint: {
        Args: { p_sprint: number }
        Returns: {
          completed_at: string | null
          created_at: string
          ends_on: string
          goal: string | null
          id: number
          name: string
          project_id: number
          starts_on: string
          status: string
        }
      }
      storage_project: {
        Args: { p_name: string }
        Returns: number
      }
      tz_label: {
        Args: { p_tz: string }
        Returns: string
      }
      update_lead_contact: {
        Args: {
          p_lead_id: number
          p_name: string
          p_personal_email: string
          p_phone: string
          p_work_email: string
        }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          attempts: number
          closed_at: string | null
          closed_reason: string | null
          connected: boolean
          country: string | null
          created_at: string
          deal_id: number | null
          id: number
          import_id: number | null
          last_attempt_at: string | null
          last_comment: string | null
          lead_date: string | null
          legacy: Json | null
          name: string
          next_action_at: string | null
          personal_email: string | null
          phone: string | null
          phone_key: string | null
          platform: string | null
          post_link: string | null
          previous_round: Json | null
          query: string | null
          recycle_count: number
          service: string | null
          skipped_at: string | null
          stage: string
          status: string
          updated_at: string
          work_email: string | null
        }
      }
      update_lead_details: {
        Args: { p_fields: Json; p_lead_id: number }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          attempts: number
          closed_at: string | null
          closed_reason: string | null
          connected: boolean
          country: string | null
          created_at: string
          deal_id: number | null
          id: number
          import_id: number | null
          last_attempt_at: string | null
          last_comment: string | null
          lead_date: string | null
          legacy: Json | null
          name: string
          next_action_at: string | null
          personal_email: string | null
          phone: string | null
          phone_key: string | null
          platform: string | null
          post_link: string | null
          previous_round: Json | null
          query: string | null
          recycle_count: number
          service: string | null
          skipped_at: string | null
          stage: string
          status: string
          updated_at: string
          work_email: string | null
        }
      }
    }
    Enums: {
      app_role: "admin" | "sales" | "production" | "client"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "sales", "production", "client"],
    },
  },
} as const

