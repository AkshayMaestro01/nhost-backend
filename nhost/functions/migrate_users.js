export default async function handler(req, res) {
  try {
    const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
    const authUrl = process.env.NHOST_AUTH_URL;
    const adminSecret = process.env.NHOST_ADMIN_SECRET;

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
              user_id
            }
          }
        `
      })
    });

    const usersResult = await usersResponse.json();
    const users = usersResult.data?.master_employee || [];

    let migrated = 0;
    let skipped = 0;
    let errors = [];

    for (const user of users) {

      // Skip already linked users
      if (user.user_id) {
        skipped++;
        continue;
      }

      if (!user.email) {
        skipped++;
        continue;
      }

      try {

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

        let signupResult = {};
        try {
          signupResult = JSON.parse(signupText);
        } catch {
          errors.push({ email: user.email, raw: signupText });
          skipped++;
          continue;
        }

        if (!signupResponse.ok) {
          skipped++;
          continue;
        }

        const userId =
          signupResult?.session?.user?.id ||
          signupResult?.user?.id;

        if (!userId) {
          skipped++;
          continue;
        }

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

      } catch (loopError) {
        errors.push({
          email: user.email,
          message: loopError.message
        });
        skipped++;
        continue;
      }
    }

    return res.json({
      success: true,
      totalUsers: users.length,
      migrated,
      skipped,
      errorCount: errors.length,
      sampleErrors: errors.slice(0, 5)
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
}