export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // TODO: integrate with WhatsApp API to send template message
  console.log('Sending WhatsApp template message...', req.body);

  return res.status(200).json({ success: true });
}
