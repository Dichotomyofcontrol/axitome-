import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.query.key;
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const all = await kv.hgetall('likes') || {};
    const sorted = Object.entries(all)
      .map(([idx, count]) => ({ idx: parseInt(idx), count }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({ total_likes: sorted.reduce((s, e) => s + e.count, 0), quotes: sorted });
  } catch (e) {
    console.error('Admin API error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
