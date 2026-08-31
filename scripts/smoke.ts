// Local smoke test: one persona bounce + one evaluation per run.
// Usage: npx tsx scripts/smoke.ts
import { runClaude, personaSystemPrompt, evaluatorSystemPrompt, transcriptText } from '../api/chat';

const messages = [
  {
    role: 'customer' as const,
    text: "I finally lost the argument about the kitchen color. Where's your paint?",
  },
  {
    role: 'employee' as const,
    text: "Paint counter is straight back, they'll mix whatever color you lost to. Grab some painter's tape on the way so your edges come out clean.",
  },
];

const transcript = transcriptText(messages, 'Rita');

console.log('--- PERSONA BOUNCE ---');
const reply = await runClaude(
  personaSystemPrompt('rita'),
  `Here is the conversation:\n\n${transcript}\n\nGive your one follow-up line.`,
);
console.log(reply);

console.log('\n--- EVALUATION ---');
const evalRaw = await runClaude(
  evaluatorSystemPrompt('rita'),
  `Here is the practice exchange:\n\n${transcript}\n\nEvaluate the EMPLOYEE's response. JSON only.`,
);
console.log(evalRaw);
