export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // TODO: process WhatsApp webhook events
  console.log('Received WhatsApp webhook event', req.body);

  return res.status(200).json({ received: true });
}
