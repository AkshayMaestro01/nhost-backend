export default async function handler(req, res) {
  try {
    const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
    const adminSecret = process.env.NHOST_ADMIN_SECRET;

    if (!graphqlUrl || !adminSecret) {
      return res.status(500).json({
        error: "Missing required environment variables"
      });
    }

    // Convert GraphQL URL to backend base URL
    // From:
    // https://xyz.graphql.ap-south-1.nhost.run/v1
    // To:
    // https://xyz.nhost.run
    const backendUrl = graphqlUrl.replace(
      ".graphql.ap-south-1.nhost.run/v1",
      ".nhost.run"
    );

    // Fetch employees
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
              password
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

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        migrated: 0,
        message: "No master_employee records found"
      });
    }

    let migratedCount = 0;
    let skipped = 0;

    // Loop users
    for (const user of users) {

      if (!user.email || !user.password) {
        skipped++;
        continue;
      }

      // Create Auth user
      const createUserResponse = await fetch(
        `${backendUrl}/v1/auth/admin/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret": adminSecret
          },
          body: JSON.stringify({
            email: user.email,
            passwordHash: user.password, // existing bcrypt hash
            emailVerified: true,
            displayName: user.full_name,
            defaultRole: "user"
          })
        }
      );

      const createdUser = await createUserResponse.json();

      // If email already exists, fetch auth user manually
      if (!createUserResponse.ok) {
        skipped++;
        continue;
      }

      if (!createdUser.id) {
        skipped++;
        continue;
      }

      // Link user_id to master_employee
      await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": adminSecret
        },
        body: JSON.stringify({
          query: `
            mutation LinkUser($id: Int!, $user_id: uuid!) {
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

      migratedCount++;
    }

    return res.status(200).json({
      success: true,
      migrated: migratedCount,
      skipped: skipped
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}