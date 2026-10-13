/**
 * Typy bazy w formacie `supabase gen types typescript` (pisane ręcznie: generator CLI wymaga Dockera).
 * Muszą odpowiadać supabase/migrations/*.sql — pilnuje tego tests/db/schema.test.ts.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          brand_name: string | null;
          logo_path: string | null;
          plan: Database['public']['Enums']['plan_t'];
          plan_renews_at: string | null;
          stripe_customer_id: string | null;
          created_at: string;
        };
        Insert: { [_ in never]: never };
        Update: { display_name?: string | null; brand_name?: string | null };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          industry: Database['public']['Enums']['industry_t'];
          included_in_free: boolean;
          archived_at: string | null;
          created_at: string;
        };
        Insert: { name: string; industry?: Database['public']['Enums']['industry_t'] };
        Update: {
          name?: string;
          industry?: Database['public']['Enums']['industry_t'];
          archived_at?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          owner_id: string;
          client_id: string;
          /** 'YYYY-MM-01' */
          period: string;
          status: Database['public']['Enums']['report_status_t'];
          data: Json;
          unlocked: boolean;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          period: string;
          data: Json;
          status?: Database['public']['Enums']['report_status_t'];
          sent_at?: string | null;
        };
        Update: {
          status?: Database['public']['Enums']['report_status_t'];
          data?: Json;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_client_id_owner_id_fkey';
            columns: ['client_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'owner_id'];
          },
        ];
      };
      share_links: {
        Row: {
          token: string;
          report_id: string;
          owner_id: string;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
          views: number;
        };
        Insert: { token: string; report_id: string };
        Update: { revoked_at?: string | null };
        Relationships: [
          {
            foreignKeyName: 'share_links_report_id_owner_id_fkey';
            columns: ['report_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id', 'owner_id'];
          },
        ];
      };
      waitlist: {
        Row: { id: string; email: string; plan: string; consent_at: string; created_at: string };
        Insert: { email: string; plan?: string; consent_at: string };
        Update: { [_ in never]: never };
        Relationships: [];
      };
      events: {
        Row: {
          id: number;
          name: string;
          anon_id: string | null;
          owner_id: string | null;
          props: Json;
          created_at: string;
        };
        Insert: { name: string; anon_id?: string | null; owner_id?: string | null; props?: Json };
        Update: { [_ in never]: never };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_shared_report: {
        Args: { p_token: string };
        Returns: Json;
      };
    };
    Enums: {
      plan_t: 'free' | 'solo';
      industry_t: 'salon' | 'restauracja' | 'gabinet' | 'sklep' | 'inne';
      report_status_t: 'draft' | 'ready' | 'sent';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
