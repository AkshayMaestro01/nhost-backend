//const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Define the GraphQL endpoint
const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL || 'http://graphql-engine:8080/v1/graphql';

// GraphQL query and variables
function getUserDetails(contact) {
  const query = `
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
  `;
  const variables = { contact };
  return { query, variables };
}

module.exports = async (req, res) => {
  try {
    const contactNumber = req.query.contact_number;
    const password = req.query.password;

    if (!contactNumber || !password) {
      return res.status(400).send('Contact number and password are required');
    }
	
	res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Execute GraphQL query
    const { query, variables } = getUserDetails(contactNumber);
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
      return res.status(404).send(error.message);
    }

    const userDetails = result.data.master_employee[0];

    // Compare the provided password with the stored hashed password
    const isPasswordValid = bcrypt.compareSync(password, userDetails.password);

    if (!isPasswordValid) {
      return res.status(401).send('Invalid password');
    }
	
	const payload = {
      id: userDetails.id,
      full_name: userDetails.full_name,
    };
	
	const token = jwt.sign(payload, 'MINhost');
	
	const data = {
		accessToken: token,
		department_id: userDetails.department_id,
		email: userDetails.email,
		full_name: userDetails.full_name,
		id: userDetails.id,
		role: userDetails.master_designation.designation_name,
	}
	

    // Send user details in response
    res.status(200).json({data});
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send(error.message);
  }
};
