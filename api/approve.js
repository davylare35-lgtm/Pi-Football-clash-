export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { paymentId } = req.body;
  const PI_API_KEY = process.env.PI_API_KEY;

  if (!paymentId || !PI_API_KEY) {
    return res.status(400).json({ error: 'Missing paymentId or PI_API_KEY' });
  }

  try {
    const response = await fetch(`https://minepi.com{paymentId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to approve payment' });
  }
}
