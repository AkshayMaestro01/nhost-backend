import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const { newPassword } = await req.json();

    const backendUrl = Deno.env.get("NHOST_BACKEND_URL");

    const authHeader = req.headers.get("authorization");

    console.log("authHeader", authHeader);
    console.log("backendUrl", backendUrl);

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    // ✅ Call Nhost Auth directly with user token
    const updateRes = await fetch(`${backendUrl}/v1/auth/user/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader, // ✅ VERY IMPORTANT
      },
      body: JSON.stringify({
        newPassword: newPassword,
      }),
    });

    const text = await updateRes.text();

    console.log("text", text);

    if (!updateRes.ok) {
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
    console.error("FUNCTION ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500 }
    );
  }
});