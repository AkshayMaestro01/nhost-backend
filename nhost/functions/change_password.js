import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

function parseJwt(token) {
  const base64Payload = token.split('.')[1];
  const decodedPayload = atob(base64Payload);
  return JSON.parse(decodedPayload);
}

serve(async (req) => {
  try {
    const { newPassword } = await req.json();

    const backendUrl = Deno.env.get("NHOST_BACKEND_URL");
    const adminSecret = Deno.env.get("NHOST_ADMIN_SECRET");

    if (!backendUrl || !adminSecret) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500 }
      );
    }

    // ✅ Get token from request
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // ✅ Decode JWT to get user ID
    const decoded = parseJwt(token);

    const userId =
      decoded["https://hasura.io/jwt/claims"]["x-hasura-user-id"];

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401 }
      );
    }

    // ✅ Update password using admin API
    const updateRes = await fetch(`${backendUrl}/v1/auth/user`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        id: userId,
        password: newPassword,
      }),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();

      return new Response(
        JSON.stringify({ error: errorText }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );

  } catch (err) {
    console.error("FUNCTION ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500 }
    );
  }
});