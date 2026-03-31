import { createClient } from "@supabase/supabase-js";

export type Database = {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          user_id: string;
          domain: string;
          created_at: string;
          last_checked: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          domain: string;
          created_at?: string;
          last_checked?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          domain?: string;
          created_at?: string;
          last_checked?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_subscription_id: string;
          stripe_customer_id: string;
          status: string;
          site_count: number;
          current_period_end: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_subscription_id: string;
          stripe_customer_id: string;
          status: string;
          site_count: number;
          current_period_end: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_subscription_id?: string;
          stripe_customer_id?: string;
          status?: string;
          site_count?: number;
          current_period_end?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      prompts: {
        Row: {
          id: string;
          site_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          text?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompts_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          }
        ];
      };
      prompt_results: {
        Row: {
          id: string;
          prompt_id: string;
          provider: string;
          response: string;
          mentions_domain: boolean;
          rank: number | null;
          competitor_domains: string[];
          checked_at: string;
        };
        Insert: {
          id?: string;
          prompt_id: string;
          provider: string;
          response: string;
          mentions_domain: boolean;
          rank?: number | null;
          competitor_domains?: string[];
          checked_at: string;
        };
        Update: {
          id?: string;
          prompt_id?: string;
          provider?: string;
          response?: string;
          mentions_domain?: boolean;
          rank?: number | null;
          competitor_domains?: string[];
          checked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_results_prompt_id_fkey";
            columns: ["prompt_id"];
            referencedRelation: "prompts";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_stale_paid_sites: {
        Args: { cutoff: string };
        Returns: { site_id: string; domain: string; email: string }[];
      };
    };
  };
};

// Server-side admin client (bypasses RLS) — lazy to avoid build-time init errors
let _adminDb: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminDb() {
  if (!_adminDb) {
    _adminDb = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminDb;
}

// Named export alias for convenience in route handlers
export const adminDb = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_, prop) {
    return (getAdminDb() as unknown as Record<string, unknown>)[prop as string];
  },
});

// Anon client for browser use
export const createBrowserClient = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
