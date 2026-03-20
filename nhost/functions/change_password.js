import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req) => {
  try {
    const { newPassword } = await req.json();

    const backendUrl = Deno.env.get("NHOST_BACKEND_URL");
    const adminSecret = Deno.env.get("NHOST_ADMIN_SECRET");

    if (!backendUrl || !adminSecret) {
      return new Response(
        JSON.stringify({ error: "Missing env variables" }),
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

    // ✅ Get user from token
    const userRes = await fetch(`${backendUrl}/v1/auth/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const userData = await userRes.json();

    const userId = userData.id; // ✅ THIS IS UUID

    // ✅ Update password
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
      const text = await updateRes.text();
      return new Response(
        JSON.stringify({ error: text }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500 }
    );
  }
});