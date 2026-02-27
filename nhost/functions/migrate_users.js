export default async function handler(req, res) {
  try {
    const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
    const authUrl = process.env.NHOST_AUTH_URL;
    const adminSecret = process.env.NHOST_ADMIN_SECRET;

    if (!graphqlUrl || !authUrl || !adminSecret) {
      return res.status(500).json({
        error: "Missing environment variables",
        graphqlUrl,
        authUrl,
        adminSecretExists: !!adminSecret
      });
    }

    // 1️⃣ Fetch employees from master_employee
    const usersResponse = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret
      },
      body: JSON.stringify({
        query: `
          query {
            master_employee {
              id
              email
              full_name
            }
          }
        `
      })
    });

    const usersResult = await usersResponse.json();

    if (usersResult.errors) {
      return res.status(500).json(usersResult.errors);
    }

    const users = usersResult.data?.master_employee || [];

    let migrated = 0;
    let skipped = 0;
    const errors = [];

    for (const user of users) {

      if (!user.email) {
        skipped++;
        continue;
      }

      // 2️⃣ Call Nhost Auth Signup (THIS IS THE CORRECT ENDPOINT)
      const signupResponse = await fetch(
        `${authUrl}/signup/email-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: user.email,
            password: "Temp@1234",
            options: {
              displayName: user.full_name
            }
          })
        }
      );

      const signupText = await signupResponse.text();

      let signupResult;
      try {
        signupResult = JSON.parse(signupText);
      } catch {
        errors.push({
          email: user.email,
          raw: signupText
        });
        skipped++;
        continue;
      }

      // If email already exists OR other error — skip safely
      if (!signupResponse.ok) {
        skipped++;
        continue;
      }

      // Nhost may return either structure depending on config
      const userId =
        signupResult?.session?.user?.id ||
        signupResult?.user?.id;

      if (!userId) {
        skipped++;
        continue;
      }

      // 3️⃣ Link user_id in master_employee
      await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": adminSecret
        },
        body: JSON.stringify({
          query: `
            mutation ($id: Int!, $user_id: uuid!) {
              update_master_employee_by_pk(
                pk_columns: { id: $id },
                _set: { user_id: $user_id }
              ) {
                id
              }
            }
          `,
          variables: {
            id: user.id,
            user_id: userId
          }
        })
      });

      migrated++;
    }

    return res.json({
      success: true,
      totalUsers: users.length,
      migrated,
      skipped,
      errorCount: errors.length,
      sampleErrors: errors.slice(0, 3)
    });

  } catch (err) {
    return res.status(500).json({
      error: "Unhandled exception",
      message: err?.message,
      stack: err?.stack
    });
  }
}