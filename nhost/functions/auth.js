import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Use global fetch (Node 18+ in Nhost)
const graphqlEndpoint =
  process.env.NHOST_GRAPHQL_URL ||
  "http://graphql-engine:8080/v1/graphql";

function getUserDetails(contact) {
  return {
    query: `
      query GetUserDetails($contact: String!) {
        master_employee(where: {contact_number: {_eq: $contact}}) {
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
    variables: { contact }
  };
}

export default async function handler(req, res) {
  try {
    const contactNumber = req.query.contact_number;
    const password = req.query.password;

    if (!contactNumber || !password) {
      return res.status(400).json({
        error: "Contact number and password are required"
      });
    }

    const { query, variables } = getUserDetails(contactNumber);

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

    if (
      !result.data ||
      !result.data.master_employee ||
      result.data.master_employee.length === 0
    ) {
      return res.status(404).json({ error: "User not found" });
    }

    const userDetails = result.data.master_employee[0];

    const isPasswordValid = bcrypt.compareSync(
      password,
      userDetails.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const payload = {
      id: userDetails.id,
      full_name: userDetails.full_name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-secret");

    const data = {
      accessToken: token,
      department_id: userDetails.department_id,
      email: userDetails.email,
      full_name: userDetails.full_name,
      id: userDetails.id,
      role: userDetails.master_designation.designation_name
    };

    return res.status(200).json({ data });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}