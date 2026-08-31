import type { VercelRequest, VercelResponse } from '@vercel/node';

// Records a training completion. Currently writes a structured line to the
// function logs; in production this would post to the LMS or a manager
// dashboard. The endpoint and payload shape are the contract either way.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { name, results } = req.body as {
    name?: string;
    results?: { customer?: string; rating?: string }[];
  };
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (!cleanName || !Array.isArray(results) || results.length > 10) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const record = {
    type: 'training_completion',
    name: cleanName,
    completedAt: new Date().toISOString(),
    results: results.map((r) => ({
      customer: String(r?.customer ?? '').slice(0, 40),
      rating: String(r?.rating ?? '').slice(0, 40),
    })),
  };
  console.log(JSON.stringify(record));
  res.status(200).json({ ok: true });
}
