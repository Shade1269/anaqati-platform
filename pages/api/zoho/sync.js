export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // TODO: call Zoho Inventory API to synchronize products and inventory
  console.log('Syncing Zoho inventory...');
  return res.status(200).json({ success: true });
}
