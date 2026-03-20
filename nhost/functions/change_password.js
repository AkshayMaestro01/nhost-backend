import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req) => {
  try {
    const { email, currentPassword, newPassword } = await req.json();

    // 🔐 Step 1: Verify current password
    const loginRes = await fetch(
      `${process.env.NHOST_AUTH_URL}/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: currentPassword,
        }),
      }
    );

    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Current password is incorrect' }),
        { status: 401 }
      );
    }

    const userId = loginData.user.id;

    // 🔐 Step 2: Update password using admin secret
    const updateRes = await fetch(
      `${process.env.NHOST_AUTH_URL}/user`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET,
        },
        body: JSON.stringify({
          id: userId,
          password: newPassword,
        }),
      }
    );

    if (!updateRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to update password' }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500 }
    );
  }
});