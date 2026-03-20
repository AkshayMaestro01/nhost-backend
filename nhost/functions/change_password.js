import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

function parseJwt(token) {
  const base64Payload = token.split('.')[1];
  const decodedPayload = atob(base64Payload);
  return JSON.parse(decodedPayload);
}

serve(async (req) => {
  try {
    const { newPassword } = await req.json();

    const adminSecret = process.env.NHOST_ADMIN_SECRET;

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

    const updateRes = await fetch(`https://scgzirnzbgwyoztigudo.auth.ap-south-1.nhost.run/v1/user/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        userId,
        newPassword,
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