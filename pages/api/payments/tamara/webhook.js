export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // TODO: handle Tamara payment webhook event
  console.log('Received Tamara webhook event', req.body);

  return res.status(200).json({ received: true });
}
