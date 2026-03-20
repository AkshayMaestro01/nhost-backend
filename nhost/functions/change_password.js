const bcrypt = require("bcryptjs");

module.exports = async (req, res) => {
  try {
    const { newPassword } = req.body;

    const authHeader = req.headers["authorization"];
    const authUrl = "https://scgzirnzbgwyoztigudo.auth.ap-south-1.nhost.run/v1";
    const hasuraUrl = "https://scgzirnzbgwyoztigudo.hasura.ap-south-1.nhost.run/v1";
    const adminSecret = process.env.NHOST_ADMIN_SECRET;

    console.log("authHeader present:", !!authHeader);
    console.log("backendUrl:", backendUrl);
    console.log("adminSecret present:", !!adminSecret);

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Step 1: Get user from token
    const meRes = await fetch(`${authUrl}/user`, {
      headers: { Authorization: authHeader },
    });

    const meText = await meRes.text();
    console.log("meRes status:", meRes.status);
    console.log("meRes body:", meText);

    if (!meRes.ok) {
      return res.status(401).json({ error: "Invalid token", detail: meText });
    }

    const meData = JSON.parse(meText);
    const userId = meData.id;
    console.log("userId:", userId);

    // Step 2: Hash password
    const hashed = await bcrypt.hash(newPassword, 10);
    console.log("hashed password generated:", !!hashed);

    // Step 3: Update via GraphQL
    const gqlRes = await fetch(`${hasuraUrl}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query: `
          mutation UpdatePassword($userId: uuid!, $passwordHash: String!) {
            updateUser(
              pk_columns: { id: $userId },
              _set: { passwordHash: $passwordHash }
            ) {
              id
            }
          }
        `,
        variables: { userId, passwordHash: hashed },
      }),
    });

    const gqlText = await gqlRes.text();
    console.log("gqlRes status:", gqlRes.status);
    console.log("gqlRes body:", gqlText);

    const gqlData = JSON.parse(gqlText);

    if (gqlData.errors) {
      return res.status(500).json({ error: "GraphQL failed", detail: gqlData.errors });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("FUNCTION ERROR:", err);
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
};