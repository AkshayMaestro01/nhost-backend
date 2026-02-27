export default async function handler(req, res) {
    try {
        const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
        const authUrl = process.env.NHOST_AUTH_URL;
        const adminSecret = process.env.NHOST_ADMIN_SECRET;

        if (!graphqlUrl || !authUrl || !adminSecret) {
            return res.status(500).json({ error: "Missing environment variables" });
        }

        // Fetch users
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

            // Create user using signup
            const signupResponse = await fetch(
                `${authUrl}/signup/email-password`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email: user.email,
                        password: "Temp@1234",
                        options: {
                            displayName: user.full_name
                        }
                    })
                }
            );

            const responseText = await signupResponse.text();

            let signupResult;

            try {
                signupResult = JSON.parse(responseText);
            } catch (e) {
                return res.status(500).json({
                    error: "Signup did not return JSON",
                    raw: responseText
                });
            }

            if (!signupResponse.ok || !signupResult.session?.user?.id) {
                skipped++;
                continue;
            }

            const userId = signupResult.session.user.id;

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
                    variables: { id: user.id, user_id: userId }
                })
            });

            migrated++;
        }

        return res.json({ success: true, migrated, skipped });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}