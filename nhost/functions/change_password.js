import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

serve(async (req) => {
  try {
    const { newPassword } = await req.json();

    const authHeader = req.headers.get("authorization");
    const backendUrl = Deno.env.get("NHOST_BACKEND_URL");
    const adminSecret = Deno.env.get("NHOST_ADMIN_SECRET") ?? "";

    console.log("=== DEBUG START ===");
    console.log("authHeader present:", !!authHeader);
    console.log("backendUrl:", backendUrl);
    console.log("adminSecret present:", !!adminSecret);

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Step 1: validate token and get user
    const meRes = await fetch(`${backendUrl}/v1/auth/user`, {
      headers: { Authorization: authHeader },
    });

    const meText = await meRes.text();
    console.log("meRes status:", meRes.status);
    console.log("meRes body:", meText);

    if (!meRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid token", detail: meText }), { status: 401 });
    }

    const meData = JSON.parse(meText);
    const userId = meData.id;
    console.log("userId:", userId);

    // Step 2: hash password
    const hashed = await bcrypt.hash(newPassword);
    console.log("hashed password generated:", !!hashed);

    // Step 3: GraphQL update
    const gqlRes = await fetch(`${backendUrl}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query: `
          mutation UpdatePassword($userId: uuid!, $passwordHash: String!) {
            updateUser(
              pk_columns: { id: $userId },
              _set: { passwordHash: $passwordHash }
            ) {
              id
            }
          }
        `,
        variables: { userId, passwordHash: hashed },
      }),
    });

    const gqlText = await gqlRes.text();
    console.log("gqlRes status:", gqlRes.status);
    console.log("gqlRes body:", gqlText);

    const gqlData = JSON.parse(gqlText);

    if (gqlData.errors) {
      return new Response(JSON.stringify({ error: "GraphQL failed", detail: gqlData.errors }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    console.error("FUNCTION ERROR:", err);
    return new Response(JSON.stringify({ error: "Server error", detail: String(err) }), { status: 500 });
  }
});