const bcrypt = require('bcryptjs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Define the GraphQL endpoint
const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL || 'http://graphql-engine:8080/v1/graphql';

function getUserDetails(id) {
  const query = `
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
  `;
  const variables = { id };
  return { query, variables };
}

function updatePassword(id, new_password) {
  const query = `mutation UpdateUserFullName($id: Int!, $new_password: String!) {
    update_master_employee_by_pk(pk_columns: { id: $id }, _set: { password: $new_password }) {
      id
      password
    }
  }`;
  const variables = { id, new_password };
  return { query, variables };
}

module.exports = async (req, res) => {
  try {
	const { id, old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).send('Old password and new password are required');
    }

    const { query, variables } = getUserDetails(id);
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET || 'MINhost', // Replace with your actual admin secret
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    // Check if the response contains errors
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      return res.status(500).send(result.errors);
    }

    // Check if the data is null or master_employee is null
    if (!result.data || !result.data.master_employee || result.data.master_employee.length === 0) {
      console.error('No data returned from GraphQL query:', result);
      return res.status(404).send('User not found');
    }

    const userDetails = result.data.master_employee[0];

    // Compare the provided password with the stored hashed password
    const isPasswordValid = bcrypt.compareSync(old_password, userDetails.password);

    if (!isPasswordValid) {
      return res.status(401).send('Invalid old password');
    }

    const hashedPassword = bcrypt.hashSync(new_password, 15);

    const { query: updateQuery, variables: updateVariables } = updatePassword(userDetails.id, hashedPassword);
    const updateResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET || 'MINhost', // Replace with your actual admin secret
      },
      body: JSON.stringify({ query: updateQuery, variables: updateVariables }),
    });

    const updateResult = await updateResponse.json();

    // Check if the response contains errors
    if (updateResult.errors) {
      console.error('GraphQL errors:', updateResult.errors);
      return res.status(500).send(updateResult.errors);
    }

    res.status(200).send('Password updated successfully');

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send(error.message);
  }
};
