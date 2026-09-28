const SUPABASE_URL = "https://gvfncverdqgmbblxdzbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lO1mRm7E2DHrcXsKpOdSIw_RAfhu7WF";

if (window.supabase) {
    const supabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    window.novaSupabase = supabase;
}
