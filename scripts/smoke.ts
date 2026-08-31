// Local smoke test: one persona reply + one evaluation per run.
// Usage: npx tsx scripts/smoke.ts
import { runClaude, personaSystemPrompt, evaluatorSystemPrompt, transcriptText } from '../api/chat';

const messages = [
  {
    role: 'customer' as const,
    text: "Well hi there, sweetheart! My granddaughter is staying with me this summer, so I am FINALLY painting that guest room. It's had the same wallpaper since Reagan was in office. Anyway, where do you keep your paint rollers?",
  },
  {
    role: 'employee' as const,
    text: "Rollers are in aisle 9, right side, I'll walk you over. Quick thing though: if that wallpaper's staying up, you'll want a coat of primer first so the paint sticks, and grab some painter's tape so you're not freehanding around the trim.",
  },
];

const transcript = transcriptText(messages, 'Peggy');

console.log('--- PERSONA REPLY ---');
const reply = await runClaude(
  personaSystemPrompt('peggy'),
  `Here is the conversation so far:\n\n${transcript}\n\nGive your character's next line.`,
);
console.log(reply);

console.log('\n--- EVALUATION ---');
const evalRaw = await runClaude(
  evaluatorSystemPrompt('peggy'),
  `Here is the full practice conversation:\n\n${transcript}\n\nEvaluate the EMPLOYEE's performance. JSON only.`,
);
console.log(evalRaw);
