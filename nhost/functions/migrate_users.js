export default async function handler(req, res) {
  try {

    const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL
    const adminSecret = process.env.NHOST_ADMIN_SECRET
    const authUrl = process.env.NHOST_AUTH_URL

    // Fetch employees
    const usersResponse = await fetch(graphqlEndpoint, {
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
    })

    const usersResult = await usersResponse.json()

    if (usersResult.errors) {
      return res.status(500).json(usersResult.errors)
    }

    const users = usersResult.data.master_employee
    let migratedCount = 0

    for (const user of users) {

      if (!user.email || !user.password) continue

      // Create auth user
      const createUserResponse = await fetch(
        `${authUrl}/admin/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hasura-admin-secret": adminSecret
          },
          body: JSON.stringify({
            email: user.email,
            passwordHash: user.password, // Existing bcrypt hash
            emailVerified: true,
            displayName: user.full_name,
            defaultRole: "user"
          })
        }
      )

      const createdUser = await createUserResponse.json()

      if (!createdUser.id) continue

      // Link to master_employee
      await fetch(graphqlEndpoint, {
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
      })

      migratedCount++
    }

    return res.status(200).json({
      success: true,
      migrated: migratedCount
    })

  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}