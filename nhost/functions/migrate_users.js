export default async function handler(req, res) {
  try {
    const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
    const authUrl = process.env.NHOST_AUTH_URL;
    const adminSecret = process.env.NHOST_ADMIN_SECRET;

    if (!graphqlUrl || !authUrl || !adminSecret) {
      return res.status(500).json({
        error: "Missing environment variables"
      });
    }

    // Ensure correct base (remove trailing /v1 if present)
    const baseAuthUrl = authUrl.replace(/\/v1$/, "");

    // 1️⃣ Fetch employees
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

    for (const user of users) {

      if (!user.email) {
        skipped++;
        continue;
      }

      // 2️⃣ Create Auth user via Admin API
      const createUserResponse = await fetch(
        `${baseAuthUrl}/v1/admin/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminSecret}`
          },
          body: JSON.stringify({
            email: user.email,
            password: "Temp@1234", // Temporary password
            emailVerified: true,
            displayName: user.full_name,
            defaultRole: "user"
          })
        }
      );

      const responseText = await createUserResponse.text();

      let createdUser;

      try {
        createdUser = JSON.parse(responseText);
      } catch (e) {
        skipped++;
        continue;
      }

      if (!createUserResponse.ok || !createdUser.id) {
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
            user_id: createdUser.id
          }
        })
      });

      migrated++;
    }

    return res.json({
      success: true,
      migrated,
      skipped
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}