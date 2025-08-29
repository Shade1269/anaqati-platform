export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // TODO: handle webhook from Zoho Inventory
  console.log('Received Zoho webhook:', req.body);
  return res.status(200).json({ success: true });
}
