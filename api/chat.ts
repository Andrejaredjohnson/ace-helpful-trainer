import os from 'node:os';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getScenario } from '../shared/scenarios.js';

interface ChatMessage {
  role: 'customer' | 'employee';
  text: string;
}

const MAX_MESSAGE_CHARS = 1200;
const MAX_MESSAGES = 8;

// --- usage caps (in-memory; resets on cold start, which is fine for this demo's threat model) ---
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PER_VISITOR_LIMIT = 45; // AI calls per visitor per hour
const GLOBAL_LIMIT = 250; // AI calls per hour across all visitors
const visitorHits = new Map<string, number[]>();
let globalHits: number[] = [];

function overLimit(ip: string): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  const mine = (visitorHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (globalHits.length >= GLOBAL_LIMIT || mine.length >= PER_VISITOR_LIMIT) return true;
  mine.push(now);
  globalHits.push(now);
  visitorHits.set(ip, mine);
  if (visitorHits.size > 500) visitorHits.clear(); // don't grow unbounded
  return false;
}

/** Run a single, tool-less Claude turn via the Agent SDK (subscription auth). */
export async function runClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  let out = '';
  const q = query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      model: 'sonnet',
      maxTurns: 1,
      allowedTools: [],
      cwd: os.tmpdir(),
      persistSession: false,
      env: {
        ...process.env,
        // Tokens pasted from a terminal sometimes arrive wrapped across lines. Strip all whitespace.
        ...(process.env.CLAUDE_CODE_OAUTH_TOKEN
          ? { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN.replace(/\s+/g, '') }
          : {}),
        // Vercel's serverless filesystem is read-only outside /tmp; the CLI needs a writable HOME.
        ...(process.env.VERCEL ? { HOME: '/tmp' } : {}),
      },
    } as never,
  });
  for await (const message of q) {
    const m = message as { type?: string; result?: string; text?: string };
    if (m.type === 'result') {
      out = m.result ?? m.text ?? '';
    }
  }
  return out.trim();
}

export function transcriptText(messages: ChatMessage[], customerName: string): string {
  return messages
    .map((m) => `${m.role === 'customer' ? customerName.toUpperCase() : 'EMPLOYEE'}: ${m.text}`)
    .join('\n');
}

export function personaSystemPrompt(scenarioId: string): string {
  const s = getScenario(scenarioId)!;
  return `You are ${s.name}, a customer in a hardware store. You came in for one thing: ${s.item}. A store employee is practicing customer service with you. You already asked where to find ${s.item} (your opening line is in the transcript).

Reply with your ONE follow-up line reacting to what the employee said, then you are leaving the store. Rules:
- 1-2 short sentences, light and a little funny, matching the voice of your opening line.
- If they told you where the item is, take it in stride. If they suggested another item, react like a real person: accept it, wave it off, or crack a small joke about it. Then wrap up (thanks, and you are off).
- Never use em dashes or en dashes. Use commas, periods, or ellipses.
- No stage directions, no quotation marks, no name prefix. Just the spoken line.
- Never coach the employee, never mention being an AI, never suggest products to yourself.
- If the employee was rude, inappropriate, or nonsensical, react the way a real customer would: put off, confused, or asking for a manager. Stay in character. Do not produce inappropriate content yourself.`;
}

export function evaluatorSystemPrompt(scenarioId: string): string {
  const s = getScenario(scenarioId)!;
  return `You are a friendly, sharp retail coach. A hardware store employee is practicing ONE simple rep: a customer asks for a product, the employee says where to find it and suggests one complementary item that naturally goes with it. That is the entire exercise.

THE CUSTOMER ASKED FOR: ${s.item}.

Judge the employee's response on exactly two things:
1. Did they help with ${s.item} itself (directions, availability, or an honest handoff)?
2. Did they suggest a complementary item, and was it a GOOD FIT or FORCED? A good fit is something a person buying ${s.item} would plausibly need for the same job and be glad they did not forget. Forced is an item with no natural connection, or a pushy pile of add-ons. Framing matters: tying the item to how it gets used ("grab a tray liner so cleanup is one step") beats naming a product off a shelf.

RULES:
- There is no single right answer. MANY items pair well with ${s.item}. Judge the suggestion actually made on its own merits. Never grade against a specific item you had in mind, and never say what they "should have" suggested. The other_ideas list is where alternatives go, offered as options, not corrections.
- ONE good suggestion is enough for the top rating. Never mark down for not suggesting more.
- Suggesting or asking about an obvious companion the customer almost certainly has covered (like a drill for drill bits) is a fair attempt but rarely saves a trip: that rates "solid", never "missed".
- HARD RULE: "missed" is ONLY for no suggestion attempt at all, or a suggestion with zero connection to ${s.item}. Any genuine attempt rates at least "solid". When torn between two ratings, pick the higher one.

SCORING, pick exactly one:
- "nailed_it": helped with ${s.item} and made one genuinely fitting, well-framed suggestion.
- "solid": helped, and attempted a suggestion, but it was weak, generic, or thinly framed.
- "missed": helped with ${s.item} but suggested nothing, or the suggestion had no connection to it.
- "off_track": rude, inappropriate, or clearly not taking the practice seriously. Be direct that this is not acceptable with a real customer, say plainly what was wrong, and tell them to run it again properly. Do not soften it, and do not repeat or quote offensive language.

TONE: like a good store manager. Brief, concrete, encouraging when deserved, straight when not. Quote the employee's own words when it helps (except in off_track). No corporate fluff. Never use em dashes or en dashes anywhere; use commas, periods, or colons.

OUTPUT: ONLY a valid JSON object, no markdown fences, exactly this shape:
{
  "rating": "nailed_it" | "solid" | "missed" | "off_track",
  "headline": "<one short punchy sentence>",
  "what_worked": "<1-2 sentences on what they did well; empty string if nothing did>",
  "coaching": "<1-2 sentences: the single most useful improvement, concrete>",
  "other_ideas": ["<up to 3 other items that pair well with ${s.item}, each with a few words on why>"]
}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : '') || 'unknown';
  if (overLimit(ip)) {
    res.status(429).json({
      error: "You've been putting in serious reps. The trainer needs an hour to catch its breath, come back then.",
    });
    return;
  }

  try {
    const { scenarioId, messages, mode } = req.body as {
      scenarioId?: string;
      messages?: ChatMessage[];
      mode?: string;
    };

    const scenario = scenarioId ? getScenario(scenarioId) : undefined;
    if (!scenario || !Array.isArray(messages) || (mode !== 'reply' && mode !== 'evaluate')) {
      res.status(400).json({ error: 'Bad request' });
      return;
    }
    if (
      messages.length === 0 ||
      messages.length > MAX_MESSAGES ||
      messages.some(
        (m) =>
          !m ||
          (m.role !== 'customer' && m.role !== 'employee') ||
          typeof m.text !== 'string' ||
          m.text.length > MAX_MESSAGE_CHARS,
      )
    ) {
      res.status(400).json({ error: 'Bad transcript' });
      return;
    }

    const transcript = transcriptText(messages, scenario.name);

    if (mode === 'reply') {
      const text = await runClaude(
        personaSystemPrompt(scenario.id),
        `Here is the conversation:\n\n${transcript}\n\nGive your one follow-up line.`,
      );
      res.status(200).json({ text });
      return;
    }

    // mode === 'evaluate'
    const raw = await runClaude(
      evaluatorSystemPrompt(scenario.id),
      `Here is the practice exchange:\n\n${transcript}\n\nEvaluate the EMPLOYEE's response. JSON only.`,
    );

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      parsed = {
        rating: 'solid',
        headline: 'Feedback ran into a hiccup. Here it is in plain text.',
        what_worked: '',
        coaching: raw.slice(0, 600),
        other_ideas: [],
      };
    }
    res.status(200).json({ evaluation: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'The coach stepped away for a second. Try that again.' });
  }
}
