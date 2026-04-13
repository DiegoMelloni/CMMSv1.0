// supabase/functions/validate-session/index.ts
import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const { session_token, user_id } = await req.json();
  
  // Verifica sessão ativa
  const { data: activeSession, error } = await supabase
    .from("active_sessions")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (!activeSession || activeSession.session_token !== session_token) {
    return new Response(JSON.stringify({ valid: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ valid: true }), {
    headers: { "Content-Type": "application/json" },
  });
});