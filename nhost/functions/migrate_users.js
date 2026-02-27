export default async function handler(req, res) {
    try {
        const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
        const authUrl = process.env.NHOST_AUTH_URL;
        const adminSecret = process.env.NHOST_ADMIN_SECRET;

        if (!graphqlUrl || !authUrl || !adminSecret) {
            return res.status(500).json({
                error: "Missing required environment variables",
                graphqlUrl,
                authUrl
            });
        }

        // 1️⃣ Fetch users from master_employee
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

        // 2️⃣ Create Auth users
        for (const user of users) {

            if (!user.email || !user.password) {
                skipped++;
                continue;
            }

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
                        passwordHash: user.password,
                        emailVerified: true,
                        displayName: user.full_name,
                        defaultRole: "user"
                    })
                }
            );

            // Read as text first (safer)
            const responseText = await createUserResponse.text();

            let createdUser;

            try {
                createdUser = JSON.parse(responseText);
            } catch (e) {
                return res.status(500).json({
                    error: "Auth API did not return JSON",
                    raw: responseText
                });
            }

            if (!createUserResponse.ok || !createdUser.id) {
                console.log("Auth error:", responseText)
                skipped++;
                continue;
            }

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