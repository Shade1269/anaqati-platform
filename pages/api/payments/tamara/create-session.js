export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // TODO: Integrate with Tamara to create a payment session
  console.log('Creating Tamara session...', req.body);
  return res.status(200).json({ sessionUrl: '' });
}
