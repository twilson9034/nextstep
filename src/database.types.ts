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
  public: {
    Tables: {
      ns_brain_items: {
        Row: {
          body: string
          created_at: string
          creator_id: string
          done: boolean
          household_id: string | null
          id: string
        }
        Insert: {
          body: string
          created_at?: string
          creator_id?: string
          done?: boolean
          household_id?: string | null
          id?: string
        }
        Update: {
          body?: string
          created_at?: string
          creator_id?: string
          done?: boolean
          household_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ns_brain_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "ns_households"
            referencedColumns: ["id"]
          },
        ]
      }
      ns_children: {
        Row: {
          adventure_avatar: string
          adventure_color: string
          adventure_revision: number
          adventure_theme: string
          age_group: string
          allow_adventure_customization: boolean
          allow_family_challenges: boolean
          archived: boolean
          avatar_design: Json
          display_name: string
          gamification_enabled: boolean
          household_id: string
          id: string
          invite_email: string | null
          invite_expires: string | null
          linked_user: string | null
          may_edit_setup: boolean
          require_reward_approval: boolean
          rewards_enabled: boolean
          show_completed_tasks: boolean
          show_support: boolean
          world_design: Json
        }
        Insert: {
          adventure_avatar?: string
          adventure_color?: string
          adventure_revision?: number
          adventure_theme?: string
          age_group?: string
          allow_adventure_customization?: boolean
          allow_family_challenges?: boolean
          archived?: boolean
          avatar_design?: Json
          display_name: string
          gamification_enabled?: boolean
          household_id: string
          id?: string
          invite_email?: string | null
          invite_expires?: string | null
          linked_user?: string | null
          may_edit_setup?: boolean
          require_reward_approval?: boolean
          rewards_enabled?: boolean
          show_completed_tasks?: boolean
          show_support?: boolean
          world_design?: Json
        }
        Update: {
          adventure_avatar?: string
          adventure_color?: string
          adventure_revision?: number
          adventure_theme?: string
          age_group?: string
          allow_adventure_customization?: boolean
          allow_family_challenges?: boolean
          archived?: boolean
          avatar_design?: Json
          display_name?: string
          gamification_enabled?: boolean
          household_id?: string
          id?: string
          invite_email?: string | null
          invite_expires?: string | null
          linked_user?: string | null
          may_edit_setup?: boolean
          require_reward_approval?: boolean
          rewards_enabled?: boolean
          show_completed_tasks?: boolean
          show_support?: boolean
          world_design?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ns_children_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "ns_households"
            referencedColumns: ["id"]
          },
        ]
      }
      ns_households: {
        Row: {
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      ns_invites: {
        Row: {
          email: string
          expires_at: string
          household_id: string
          id: string
          revoked: boolean
        }
        Insert: {
          email: string
          expires_at?: string
          household_id: string
          id?: string
          revoked?: boolean
        }
        Update: {
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          revoked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ns_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "ns_households"
            referencedColumns: ["id"]
          },
        ]
      }
      ns_memberships: {
        Row: {
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ns_memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "ns_households"
            referencedColumns: ["id"]
          },
        ]
      }
      ns_personalization: {
        Row: {
          preferences: Json
          revision: number
          user_id: string
        }
        Insert: {
          preferences: Json
          revision?: number
          user_id: string
        }
        Update: {
          preferences?: Json
          revision?: number
          user_id?: string
        }
        Relationships: []
      }
      ns_profiles: {
        Row: {
          display_name: string
          onboarded: boolean
          user_id: string
        }
        Insert: {
          display_name: string
          onboarded?: boolean
          user_id: string
        }
        Update: {
          display_name?: string
          onboarded?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ns_state: {
        Row: {
          modules: Json
          notes: Json
          revision: number
          theme: string
          user_id: string
        }
        Insert: {
          modules: Json
          notes: Json
          revision?: number
          theme: string
          user_id: string
        }
        Update: {
          modules?: Json
          notes?: Json
          revision?: number
          theme?: string
          user_id?: string
        }
        Relationships: []
      }
      ns_tasks: {
        Row: {
          assignee_child: string | null
          assignee_user: string | null
          created_at: string
          creator_id: string
          definition_of_done: string
          done: boolean
          due_date: string | null
          effort: string | null
          household_id: string | null
          id: string
          priority: string
          revision: number
          reward_points: number
          subtasks: Json
          title: string
        }
        Insert: {
          assignee_child?: string | null
          assignee_user?: string | null
          created_at?: string
          creator_id: string
          definition_of_done?: string
          done?: boolean
          due_date?: string | null
          effort?: string | null
          household_id?: string | null
          id: string
          priority?: string
          revision?: number
          reward_points?: number
          subtasks?: Json
          title: string
        }
        Update: {
          assignee_child?: string | null
          assignee_user?: string | null
          created_at?: string
          creator_id?: string
          definition_of_done?: string
          done?: boolean
          due_date?: string | null
          effort?: string | null
          household_id?: string | null
          id?: string
          priority?: string
          revision?: number
          reward_points?: number
          subtasks?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ns_tasks_assignee_child_fkey"
            columns: ["assignee_child"]
            isOneToOne: false
            referencedRelation: "ns_children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ns_tasks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "ns_households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ns_accept_child_invite: { Args: { profile: string }; Returns: undefined }
      ns_child_adventure: {
        Args: {
          avatar: string
          color: string
          expected_revision: number
          theme: string
          token?: string
        }
        Returns: Json
      }
      ns_child_avatar_studio: {
        Args: {
          avatar: string
          color: string
          design: Json
          expected_revision: number
          theme: string
          token?: string
        }
        Returns: Json
      }
      ns_child_connections: {
        Args: never
        Returns: {
          archived: boolean
          child_name: string
          household_name: string
          linked: boolean
          profile: string
        }[]
      }
      ns_child_invite: {
        Args: { address: string | null; profile: string }
        Returns: undefined
      }
      ns_child_progress: {
        Args: {
          changes?: Json
          expected_revision?: number
          step_done?: boolean
          step_id?: string
          task_id?: string
          task_revision?: number
          token?: string
        }
        Returns: Json
      }
      ns_child_rewards: {
        Args: {
          action?: string
          expected_cost?: number
          request?: string
          reward?: string
          token?: string
        }
        Returns: Json
      }
      ns_child_workspace: {
        Args: {
          changes?: Json
          expected_revision?: number
          task_id?: string
          task_revision?: number
          token?: string
        }
        Returns: Json
      }
      ns_child_world_studio: {
        Args: {
          avatar: string
          color: string
          design: Json
          expected_revision: number
          theme: string
          token?: string
          world: Json
        }
        Returns: Json
      }
      ns_device_workspace: {
        Args: { changes?: Json; expected_revision?: number; token: string }
        Returns: Json
      }
      ns_leave_device: {
        Args: { pin: string; token: string }
        Returns: boolean
      }
      ns_manage_device: {
        Args: {
          action: string
          device_id?: string
          label?: string
          pin?: string
          profile_id: string
        }
        Returns: Json
      }
      ns_manage_household: {
        Args: { action: string; h: string; value: string }
        Returns: undefined
      }
      ns_pair_device: { Args: { code: string }; Returns: string }
      ns_parent_challenges: {
        Args: {
          action?: string
          celebration?: string
          challenge?: string
          description?: string
          expected_revision?: number
          house: string
          include_adults?: boolean
          participants?: string[]
          target?: number
          title?: string
        }
        Returns: Json
      }
      ns_parent_child_preview: { Args: { profile: string }; Returns: Json }
      ns_parent_child_setup: {
        Args: { changes?: Json; expected_revision?: number; profile: string }
        Returns: Json
      }
      ns_parent_engagement: { Args: { profile: string }; Returns: Json }
      ns_parent_rewards: {
        Args: {
          action?: string
          cost?: number
          description?: string
          expected_revision?: number
          profile: string
          request?: string
          reward?: string
          title?: string
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
