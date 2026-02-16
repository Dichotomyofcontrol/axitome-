import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const all = await kv.hgetall('likes') || {};
      return res.status(200).json(all);
    }

    if (req.method === 'POST') {
      const { idx, action } = req.body;
      if (idx === undefined || !['like', 'unlike'].includes(action)) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      const key = String(idx);
      if (action === 'like') {
        const newVal = await kv.hincrby('likes', key, 1);
        return res.status(200).json({ idx: key, count: newVal });
      } else {
        const current = (await kv.hget('likes', key)) || 0;
        if (current > 0) {
          const newVal = await kv.hincrby('likes', key, -1);
          return res.status(200).json({ idx: key, count: newVal });
        }
        return res.status(200).json({ idx: key, count: 0 });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Likes API error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
