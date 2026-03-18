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

    console.log(users);

    let migrated = 0;
    let skipped = 0;
    const errors = [];

    for (const user of users) {

      // Skip if already linked
      if (user.user_id || !user.email) {
        skipped++;
        continue;
      }

      try {
        const response = await fetch(
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

        const text = await response.text();
        let data = {};

        try {
          data = JSON.parse(text);
        } catch {
          errors.push({ email: user.email, raw: text });
          skipped++;
          continue;
        }

        // Handle duplicate user
        if (!response.ok) {
          skipped++;
          continue;
        }

        const userId =
          data?.session?.user?.id ||
          data?.user?.id;

        if (!userId) {
          skipped++;
          continue;
        }

        // Link to your table
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

        // 🔥 IMPORTANT: prevent rate limit / failures
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        errors.push({
          email: user.email,
          message: err.message
        });
        skipped++;
      }
    }

    return res.json({
      success: true,
      total: users.length,
      migrated,
      skipped,
      errors: errors.slice(0, 5)
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}