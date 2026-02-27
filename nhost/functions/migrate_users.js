export default async function handler(req, res) {
  try {
    return res.json({
      graphqlUrl: process.env.NHOST_GRAPHQL_URL,
      adminSecretExists: !!process.env.NHOST_ADMIN_SECRET
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}