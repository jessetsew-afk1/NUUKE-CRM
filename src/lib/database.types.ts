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
          query: string | null
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
          query?: string | null
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
          query?: string | null
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
          created_at: string
          deal_id: number | null
          duration_minutes: number
          id: number
          lead_id: number | null
          location: string | null
          notes: string | null
          owner_id: string
          reminded_at: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id?: number | null
          duration_minutes?: number
          id?: never
          lead_id?: number | null
          location?: string | null
          notes?: string | null
          owner_id?: string
          reminded_at?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: number | null
          duration_minutes?: number
          id?: never
          lead_id?: number | null
          location?: string | null
          notes?: string | null
          owner_id?: string
          reminded_at?: string | null
          starts_at?: string
          status?: string
          title?: string
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
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          absent_alert_minutes: number
          attendance_starts_on: string | null
          break_allowance_minutes: number
          commission_rate: number
          company_name: string
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
          break_allowance_minutes?: number
          commission_rate?: number
          company_name?: string
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
          break_allowance_minutes?: number
          commission_rate?: number
          company_name?: string
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
          reduced_half_days?: number
          short_day_max_minutes?: number
          signout_grace_minutes?: number
          timezone?: string
          updated_at?: string
          usd_to_pkr?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      import_leads: {
        Args: { p_import_id: number; p_rows: Json }
        Returns: Json
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_staff: {
        Args: Record<PropertyKey, never>
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
          p_meeting_at?: string
          p_meeting_minutes?: number
          p_outcome?: string
        }
        Returns: Json
      }
      mark_notifications_read: {
        Args: { p_ids?: number[] }
        Returns: undefined
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
          query: string | null
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
      queue_summary: {
        Args: {
          p_from?: string
          p_platforms?: string[]
          p_services?: string[]
          p_to?: string
        }
        Returns: Json
      }
      record_login: {
        Args: { p_kind: string; p_user_agent?: string }
        Returns: undefined
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
          query: string | null
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

