// supabase/functions/force-logout/index.ts
import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const { user_id } = await req.json();
  
  await supabase
    .from("active_sessions")
    .delete()
    .eq("user_id", user_id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});