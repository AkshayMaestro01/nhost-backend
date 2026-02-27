export default async function handler(req, res) {
    try {

        const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL
        const adminSecret = process.env.NHOST_ADMIN_SECRET

        const backendUrl = graphqlEndpoint.replace("/v1/graphql", "")

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

        console.log("usersResult", await usersResponse.json())

        const usersResult = await usersResponse.json()

        if (usersResult.errors) {
            return res.status(500).json(usersResult.errors)
        }

        

        const users = usersResult.data.master_employee
        let migratedCount = 0

        for (const user of users) {

            if (!user.email || !user.password) continue

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
                        passwordHash: user.password,
                        emailVerified: true,
                        displayName: user.full_name,
                        defaultRole: "user"
                    })
                }
            )

            const createdUser = await createUserResponse.json()

            console.log("Auth API response:", createdUser)

            if (!createdUser.id) continue

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