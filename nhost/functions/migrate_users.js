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

    // Step 1: Fetch master_employee
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

    const usersText = await usersResponse.text();

    let usersResult;
    try {
      usersResult = JSON.parse(usersText);
    } catch (e) {
      return res.status(500).json({
        error: "GraphQL did not return JSON",
        raw: usersText
      });
    }

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

      const signupResponse = await fetch(
        `${authUrl}/signup/email-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        console.log("Signup response:", signupText);
        signupResult = JSON.parse(signupText);
      } catch (e) {
        console.log("Signup JSON parse error:", e);
        errors.push({
          email: user.email,
          raw: signupText
        });
        skipped++;
        continue;
      }

      if (!signupResponse.ok || !signupResult.user?.id) {
        errors.push({
          email: user.email,
          response: signupResult
        });
        skipped++;
        continue;
      }

      const userId = signupResult.user.id;

      // Link user_id
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