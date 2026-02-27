export default async function handler(req, res) {
    try {
        const adminSecret = process.env.NHOST_ADMIN_SECRET;
        const graphqlUrl = process.env.NHOST_GRAPHQL_URL ||
            "http://graphql-engine:8080/v1/graphql";

        if (!adminSecret || !graphqlUrl) {
            return res.status(500).json({
                error: "Missing environment variables"
            });
        }

        // Extract project subdomain safely
        const url = new URL(graphqlUrl);
        const subdomain = url.hostname.split(".")[0];

        const backendUrl = `https://${subdomain}.nhost.run`;
        console.log("backendUrl", backendUrl)

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

        let migrated = 0;
        let skipped = 0;

        for (const user of users) {

            if (!user.email || !user.password) {
                skipped++;
                continue;
            }

            const createUserResponse = await fetch(
                `https://scgzirnzbgwyoztigudo.auth.ap-south-1.nhost.run/v1/v1/auth/admin/users`,
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
            );

            const createdUser = await createUserResponse.json();

            if (!createUserResponse.ok || !createdUser.id) {
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