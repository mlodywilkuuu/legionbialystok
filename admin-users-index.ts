import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const ALL_PERMISSIONS = [
  "articles","stories","team1","team2","academy","people","gallery",
  "table","seasons","matches","documents","contact"
];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function cleanPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(v => ALL_PERMISSIONS.includes(v)))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return response({ error: "Brak konfiguracji Edge Function." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return response({ error: "Brak sesji." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (userError || !caller) return response({ error: "Nieprawidłowa sesja." }, 401);

  const { data: callerProfile, error: profileError } = await admin
    .from("admin_profiles")
    .select("user_id,email,permissions,is_full_admin")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (profileError) return response({ error: profileError.message }, 500);
  if (!callerProfile) return response({ error: "To konto nie ma dostępu do panelu." }, 403);

  const url = new URL(req.url);
  const queryAction = url.searchParams.get("action") || "me";

  if (req.method === "GET" && queryAction === "me") {
    return response({
      id: caller.id,
      email: caller.email || callerProfile.email || "",
      permissions: callerProfile.permissions || [],
      is_full_admin: callerProfile.is_full_admin === true
    });
  }

  if (callerProfile.is_full_admin !== true) {
    return response({ error: "Tylko pełny administrator może zarządzać kontami." }, 403);
  }

  if (req.method === "GET" && queryAction === "list") {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return response({ error: listError.message }, 500);

    const { data: profiles, error: profilesError } = await admin
      .from("admin_profiles")
      .select("user_id,email,permissions,is_full_admin,created_at,updated_at");
    if (profilesError) return response({ error: profilesError.message }, 500);

    const map = new Map((profiles || []).map(p => [p.user_id, p]));
    const users = (listData.users || [])
      .filter(u => map.has(u.id))
      .map(u => {
        const p = map.get(u.id)!;
        return {
          id: u.id,
          email: u.email || p.email || "",
          permissions: p.permissions || [],
          is_full_admin: p.is_full_admin === true,
          created_at: u.created_at
        };
      });

    return response({ users });
  }

  if (req.method !== "POST") return response({ error: "Nieobsługiwana metoda." }, 405);

  let payload: any = {};
  try { payload = await req.json(); }
  catch { return response({ error: "Nieprawidłowy JSON." }, 400); }

  const action = String(payload.action || "");

  if (action === "create") {
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const isFullAdmin = payload.is_full_admin === true;
    const permissions = isFullAdmin ? ALL_PERMISSIONS : cleanPermissions(payload.permissions);

    if (!email || !email.includes("@")) return response({ error: "Podaj prawidłowy e-mail." }, 400);
    if (password.length < 8) return response({ error: "Hasło musi mieć co najmniej 8 znaków." }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { permissions, is_full_admin: isFullAdmin }
    });
    if (createError || !created.user) return response({ error: createError?.message || "Nie utworzono użytkownika." }, 400);

    const { error: upsertError } = await admin.from("admin_profiles").upsert({
      user_id: created.user.id,
      email,
      permissions,
      is_full_admin: isFullAdmin,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (upsertError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return response({ error: upsertError.message }, 500);
    }

    return response({ ok: true, id: created.user.id });
  }

  if (action === "update") {
    const id = String(payload.id || "");
    if (!id) return response({ error: "Brak ID użytkownika." }, 400);

    const email = String(payload.email || "").trim().toLowerCase();
    const password = payload.password ? String(payload.password) : "";
    const isFullAdmin = payload.is_full_admin === true;
    const permissions = isFullAdmin ? ALL_PERMISSIONS : cleanPermissions(payload.permissions);

    const attrs: Record<string, unknown> = {
      app_metadata: { permissions, is_full_admin: isFullAdmin }
    };
    if (email) attrs.email = email;
    if (password) {
      if (password.length < 8) return response({ error: "Hasło musi mieć co najmniej 8 znaków." }, 400);
      attrs.password = password;
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(id, attrs);
    if (updateError || !updated.user) return response({ error: updateError?.message || "Nie zaktualizowano użytkownika." }, 400);

    const { error: profileUpdateError } = await admin.from("admin_profiles").upsert({
      user_id: id,
      email: updated.user.email || email,
      permissions,
      is_full_admin: isFullAdmin,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (profileUpdateError) return response({ error: profileUpdateError.message }, 500);

    return response({ ok: true });
  }

  if (action === "delete") {
    const id = String(payload.id || "");
    if (!id) return response({ error: "Brak ID użytkownika." }, 400);
    if (id === caller.id) return response({ error: "Nie możesz usunąć własnego konta podczas zalogowania." }, 400);

    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) return response({ error: deleteError.message }, 400);
    return response({ ok: true });
  }

  return response({ error: "Nieobsługiwana akcja." }, 400);
});
