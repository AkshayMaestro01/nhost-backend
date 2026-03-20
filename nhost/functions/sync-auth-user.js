export default async function handler(req, res) {
  try {
    const authUrl = process.env.NHOST_AUTH_URL;

    const { event } = req.body;

    const type = event.op; // INSERT / UPDATE / DELETE
    const newRow = event.data.new;
    const oldRow = event.data.old;

    if (type === 'INSERT') {

      const response = await fetch(
        `${authUrl}/signup/email-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: newRow.email,
            password: "Temp@1234",
            options: {
              displayName: newRow.full_name
            }
          })
        }
      );

      const data = await response.json();

      const userId =
        data?.session?.user?.id ||
        data?.user?.id;

      if (!userId) {
        return res.status(200).json({
          message: "User created but no ID returned"
        });
      }

      await fetch(process.env.NHOST_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET
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
            id: newRow.id,
            user_id: userId
          }
        })
      });

      return res.status(200).json({ success: true });
    }

    if (type === 'UPDATE') {

      if (!newRow.user_id) {
        return res.status(200).json({ skipped: true });
      }

      await fetch(
        `${authUrl}/user`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.NHOST_ADMIN_SECRET}`
          },
          body: JSON.stringify({
            userId: newRow.user_id,
            email: newRow.email,
            displayName: newRow.full_name
          })
        }
      );

      return res.status(200).json({ success: true });
    }

    if (type === 'DELETE') {

      if (!oldRow.user_id) {
        return res.status(200).json({ skipped: true });
      }

      await fetch(
        `${authUrl}/admin/users/${oldRow.user_id}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${process.env.NHOST_ADMIN_SECRET}`
          }
        }
      );

      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ message: "No action" });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}