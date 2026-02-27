import bcrypt from "bcryptjs";

// Use built-in fetch (Node 18+)
const graphqlEndpoint =
  process.env.NHOST_GRAPHQL_URL ||
  "http://graphql-engine:8080/v1/graphql";

function getUserDetails(id) {
  return {
    query: `
      query GetUserDetails($id: Int!) {
        master_employee(where: {id: {_eq: $id}}) {
          id
          full_name
          email
          designation_id
          master_designation {
            designation_name
          }
          department_id
          password
        }
      }
    `,
    variables: { id }
  };
}

function updatePassword(id, new_password) {
  return {
    query: `
      mutation UpdatePassword($id: Int!, $new_password: String!) {
        update_master_employee_by_pk(
          pk_columns: { id: $id },
          _set: { password: $new_password }
        ) {
          id
        }
      }
    `,
    variables: { id, new_password }
  };
}

export default async function handler(req, res) {
  try {
    const { id, old_password, new_password } = req.body;

    if (!id || !old_password || !new_password) {
      return res.status(400).json({
        error: "id, old_password and new_password are required"
      });
    }

    // 1️⃣ Get existing user
    const { query, variables } = getUserDetails(id);

    const response = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if (result.errors) {
      return res.status(500).json(result.errors);
    }

    if (!result.data?.master_employee?.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const userDetails = result.data.master_employee[0];

    // 2️⃣ Verify old password
    const isPasswordValid = bcrypt.compareSync(
      old_password,
      userDetails.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid old password"
      });
    }

    // 3️⃣ Hash new password
    const hashedPassword = bcrypt.hashSync(new_password, 10);

    const {
      query: updateQuery,
      variables: updateVariables
    } = updatePassword(userDetails.id, hashedPassword);

    const updateResponse = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET
      },
      body: JSON.stringify({
        query: updateQuery,
        variables: updateVariables
      })
    });

    const updateResult = await updateResponse.json();

    if (updateResult.errors) {
      return res.status(500).json(updateResult.errors);
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}