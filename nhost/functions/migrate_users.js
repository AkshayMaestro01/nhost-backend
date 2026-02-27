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
              user_id
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

      // Skip already linked
      if (user.user_id) {
        skipped++;
        continue;
      }

      if (!user.email) {
        skipped++;
        continue;
      }

      try {
        // 2️⃣ Create user via Admin API (CORRECT WAY)
        const createUserResponse = await fetch(
          `${authUrl}/admin/users`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${adminSecret}`
            },
            body: JSON.stringify({
              email: user.email,
              password: "Temp@1234",
              emailVerified: true,
              displayName: user.full_name,
              defaultRole: "user"
            })
          }
        );

        const responseText = await createUserResponse.text();

        let createUserResult;
        try {
          createUserResult = JSON.parse(responseText);
        } catch {
          errors.push({ email: user.email, raw: responseText });
          skipped++;
          continue;
        }

        if (!createUserResponse.ok || !createUserResult.id) {
          errors.push({ email: user.email, response: createUserResult });
          skipped++;
          continue;
        }

        const userId = createUserResult.id;

        // 3️⃣ Link user_id back to master_employee
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
      error: "Unhandled exception",
      message: err?.message,
      stack: err?.stack
    });
  }
}