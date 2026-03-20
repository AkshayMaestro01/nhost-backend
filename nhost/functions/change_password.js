import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

serve(async (req) => {
  try {
    const { newPassword } = await req.json();

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const backendUrl = Deno.env.get("NHOST_BACKEND_URL");
    const adminSecret = Deno.env.get("NHOST_ADMIN_SECRET");

    // 1. Get the user ID from the token by calling /v1/auth/user
    const meRes = await fetch(`${backendUrl}/v1/auth/user`, {
      headers: { Authorization: authHeader },
    });

    if (!meRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const meData = await meRes.json();
    const userId = meData.id;

    // 2. Hash the new password
    const hashed = await bcrypt.hash(newPassword);

    // 3. Update password via GraphQL using admin secret
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

    const gqlData = await gqlRes.json();

    if (gqlData.errors) {
      console.error("GraphQL error:", gqlData.errors);
      return new Response(JSON.stringify({ error: "Failed to update password" }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    console.error("FUNCTION ERROR:", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
  }
});