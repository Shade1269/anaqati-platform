export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // TODO: handle Tabby payment webhook
  console.log('Received Tabby webhook:', req.body);
  return res.status(200).json({ success: true });
}
