import os from 'node:os';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getScenario } from '../shared/scenarios.js';

interface ChatMessage {
  role: 'customer' | 'employee';
  text: string;
}

const MAX_MESSAGE_CHARS = 1200;
const MAX_MESSAGES = 12;

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
  return `You are ${s.name}, a customer in a hardware store. You came in for one thing: ${s.item}. A store employee is practicing customer service with you. Your opening line is in the transcript.

ABOUT YOUR PROJECT (use this to answer questions; share it plainly when asked, never as a riddle): ${s.facts}

You respond with a JSON object, nothing else:
{"line": "<your next spoken line>", "offer_made": true|false}

offer_made is true if the employee has AT ANY POINT in the conversation offered, suggested, or asked about an additional product beyond ${s.item} itself. Pointing you toward related supplies counts. Asking questions about your project does NOT count by itself.

Rules for "line":
- 1-2 short sentences, matching the voice of your opening line: if it was plain, stay plain and ordinary; if it was playful, stay playful.
- If offer_made is false: react naturally and stay in the conversation. Answer their questions from your project facts. Do not hint that you want more suggestions and do not suggest products to yourself.
- If offer_made is true: react to the offer like a real person (take it, wave it off, or make a small remark), then wrap up naturally, you are heading off.
- Never use em dashes or en dashes. Use commas, periods, or ellipses.
- No stage directions, no name prefix.
- Never coach the employee and never mention being an AI.
- If the employee was rude, inappropriate, or nonsensical, react the way a real customer would: put off, confused, or asking for a manager. Stay in character. Do not produce inappropriate content yourself.`;
}

export function evaluatorSystemPrompt(scenarioId: string): string {
  const s = getScenario(scenarioId)!;
  return `You are a friendly, sharp retail coach. A hardware store employee is practicing ONE simple rep: a customer asks for a product, the employee says where to find it and suggests one complementary item that naturally goes with it. That is the entire exercise.

THE CUSTOMER ASKED FOR: ${s.item}.

Judge the employee's response on exactly two things:
1. Did they help with ${s.item} itself (directions, availability, or an honest handoff)?
2. Did they offer anything else that makes sense alongside ${s.item}?

BE GENEROUS. This is not a sales pitch exercise. The employee just has to offer something related; if the customer says no, that is completely fine. Any item a normal person would connect to ${s.item} counts fully: a specific item, a couple of items, or even a general point toward related supplies ("we've got brushes and everything else you'll need right over here") all count as a full, successful offer. Do NOT judge framing, specificity, phrasing, salesmanship, or how the customer reacted. Do NOT manufacture criticism. The ONLY failure is offering something with no sensible connection to ${s.item} (like carburetor cleaner to someone buying paint), or offering nothing at all.

RULES:
- The conversation may run several turns. Asking the customer questions about their project before offering is a perfectly good approach; judge the offer whenever it came, and never penalize taking a turn or two to get there.
- There is no answer key. If the connection is plausible, it counts.
- Never say what they "should have" offered. The other_ideas list is just friendly extra ammo for next time, options, not corrections.
- If the response was good, say so plainly and stop. A one-line "keep doing exactly this" is a complete coach's note. When torn between two ratings, ALWAYS pick the higher one.

SCORING, pick exactly one:
- "nailed_it": helped with ${s.item} and offered something (specific or general) that sensibly goes with it. This should be the common result.
- "solid": helped with ${s.item} and clearly tried to offer something, but it is genuinely hard to tell what they were pointing at.
- "missed": helped with ${s.item} but offered nothing at all, or the offer had no sensible connection to it.
- "off_track": rude, inappropriate, or clearly not taking the practice seriously. Be direct that this is not acceptable with a real customer, say plainly what was wrong, and tell them to run it again properly. Do not soften it, and do not repeat or quote offensive language.

TONE: like a good store manager. Brief, warm, straight. No corporate fluff, no nitpicking. Never use em dashes or en dashes anywhere; use commas, periods, or colons.

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
      const raw = await runClaude(
        personaSystemPrompt(scenario.id),
        `Here is the conversation so far:\n\n${transcript}\n\nRespond with your JSON object.`,
      );
      let text = raw;
      let offerMade = false;
      try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const j = JSON.parse(cleaned.slice(start, end + 1)) as { line?: string; offer_made?: boolean };
        if (typeof j.line === 'string' && j.line.trim()) text = j.line.trim();
        offerMade = j.offer_made === true;
      } catch {
        // Fall back to treating the raw output as the spoken line; the turn cap ends the scene.
      }
      res.status(200).json({ text, offerMade });
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
