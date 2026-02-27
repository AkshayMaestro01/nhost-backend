export default async function handler(req, res) {
  try {
    const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
    const adminSecret = process.env.NHOST_ADMIN_SECRET;

    if (!graphqlUrl || !adminSecret) {
      return res.status(500).json({
        error: "Missing environment variables"
      });
    }

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

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {

      if (!user.email || !user.password) {
        skipped++;
        continue;
      }

      // 2️⃣ Insert into auth.users via GraphQL
      const createUserResponse = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": adminSecret
        },
        body: JSON.stringify({
          query: `
            mutation CreateUser(
              $email: String!
              $passwordHash: String!
              $displayName: String
            ) {
              insert_auth_users_one(object: {
                email: $email
                passwordHash: $passwordHash
                displayName: $displayName
                defaultRole: "user"
                emailVerified: true
              }) {
                id
              }
            }
          `,
          variables: {
            email: user.email,
            passwordHash: user.password,
            displayName: user.full_name
          }
        })
      });

      const createUserResult = await createUserResponse.json();

      if (createUserResult.errors || !createUserResult.data?.insert_auth_users_one?.id) {
        skipped++;
        continue;
      }

      const userId = createUserResult.data.insert_auth_users_one.id;

      // 3️⃣ Link user_id to master_employee
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
            user_id: userId
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