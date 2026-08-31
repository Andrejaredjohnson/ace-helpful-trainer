import os from 'node:os';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getScenario } from '../shared/scenarios.js';

interface ChatMessage {
  role: 'customer' | 'employee';
  text: string;
}

const MAX_MESSAGE_CHARS = 1200;
const MAX_MESSAGES = 24;

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
        // Tokens pasted from a terminal sometimes arrive wrapped across lines, strip all whitespace.
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
  return `You are role-playing a customer in a hardware store, as a live training partner for a retail employee practicing customer service. Stay in character at all times. Never break character, never mention being an AI, never give the employee feedback or coaching, you are only the customer.

YOUR CHARACTER:
${s.persona}

WHY YOU ARE HERE: ${s.project}. You came in asking for: ${s.item}.

RULES:
- Reply with ONLY your character's next spoken line. 1-3 sentences. No stage directions, no quotation marks, no name prefix.
- Never use em dashes or en dashes in your reply. Use commas, periods, or ellipses instead.
- React naturally to what the employee says, in your character's voice.
- If the employee gives directions to the item and makes (or declines to make) a suggestion, and the conversation feels complete, wrap up naturally (thank them in character and head off).
- If the employee says something rude, inappropriate, or bizarre, react the way a real customer would: confused, put off, or asking for a manager. Stay in character. Do not lecture about appropriateness and do not produce inappropriate content yourself.
- If the employee asks you a reasonable question about your project, answer it honestly from your character's facts.
- You only know what your character knows. Never diagnose your own problem or suggest products to yourself; that is the employee's job.`;
}

export function evaluatorSystemPrompt(scenarioId: string): string {
  const s = getScenario(scenarioId)!;
  return `You are a friendly, sharp retail-training coach evaluating ONE practice conversation. A hardware store employee just practiced with a role-played customer. The skill being trained: answer the customer's actual question, then suggest a complementary item that serves their real project, helpfully, not pushily.

THE CUSTOMER: ${s.name}, who came in asking for: ${s.item}.

WHAT GOOD LOOKS LIKE HERE: ${s.evalNotes}

THE RUBRIC (helping vs. selling):
1. ANSWERED FIRST: did they actually help with the item that was asked for (directions, availability, or an honest handoff) before anything else?
2. RELEVANT: did the suggestion serve the customer's PROJECT, not just the product? The acid test: without this item, would the customer have had to make a second trip?
3. FRAMED AROUND THE CUSTOMER: "you'll want tape so you're not cutting in around the trim freehand" beats "we also sell tape."
4. EASY TO DECLINE: an offer, not a push. Piling on many items or pressuring counts against them, even if the items are relevant.

IMPORTANT, read carefully:
- There is no single right answer. Many different complementary items fit any customer, including reasonable ones not in the scenario notes. Judge the suggestion the employee actually made on its own merits using the rubric above.
- ONE genuinely relevant, well-framed suggestion is enough for the top rating. Never mark someone down for not suggesting more items.
- This tool practices exactly one rep: answer the question, suggest a complementary item, frame it helpfully. Do NOT penalize the employee for not asking diagnostic questions, not investigating the customer's story, or not noticing details the customer mentioned in passing. Diagnosing the customer's deeper problem is a different, more advanced skill and is out of scope here.
- Never tell them what they "should have" suggested instead. The other_ideas list is where alternatives belong, offered as options rather than corrections.

SCORING, pick exactly one rating:
- "nailed_it": answered the question and made at least one genuinely relevant, well-framed suggestion.
- "solid": helped the customer and attempted a suggestion, but the suggestion was weak, generic, or poorly framed.
- "missed": answered the question but suggested nothing, or the suggestion was irrelevant / pure upsell with no connection to the project.
- "off_track": the employee was rude, inappropriate, nonsensical, or clearly not taking the practice seriously. Be direct and unambiguous that this is not acceptable with a real customer, state plainly what was wrong, and tell them to run it again properly. Do not soften this one, and do not repeat or quote any offensive language.

TONE: like a good store manager. Brief, concrete, encouraging when deserved, straight when not. Quote the employee's own words back when it helps (except in off_track). No corporate fluff. Never use em dashes or en dashes anywhere in your output; use commas, periods, or colons instead.

OUTPUT: respond with ONLY a valid JSON object, no markdown fences, exactly this shape:
{
  "rating": "nailed_it" | "solid" | "missed" | "off_track",
  "headline": "<one short punchy sentence>",
  "what_worked": "<1-2 sentences on what they did well; empty string if nothing did>",
  "coaching": "<2-3 sentences: the single most useful improvement, concrete>",
  "other_ideas": ["<up to 3 other complementary items that fit this customer, each with a few words on why>"]
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

    const transcript = transcriptText(messages, scenario.name.split(' ')[0]);

    if (mode === 'reply') {
      const text = await runClaude(
        personaSystemPrompt(scenario.id),
        `Here is the conversation so far:\n\n${transcript}\n\nGive your character's next line.`,
      );
      res.status(200).json({ text });
      return;
    }

    // mode === 'evaluate'
    const raw = await runClaude(
      evaluatorSystemPrompt(scenario.id),
      `Here is the full practice conversation:\n\n${transcript}\n\nEvaluate the EMPLOYEE's performance. JSON only.`,
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
