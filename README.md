# Helpful Trainer

A 5-minute practice rep for hardware store associates: three AI customers walk in, each asking for
one item. Answer their question, suggest the one complementary item they'll be glad they didn't
forget, and get honest coach feedback scored on a helping-vs-selling rubric.

A personal curriculum-design sample by Andre Johnson, Ace Hardware store manager. Not an official
Ace Hardware product.

## Stack

- React + TypeScript (Vite)
- Vercel serverless function (`api/chat.ts`) powered by the
  [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript) — authenticates with a
  Claude subscription via `CLAUDE_CODE_OAUTH_TOKEN`, no API key.
- The same endpoint plays the customer personas (in character, guarded) and runs the evaluation
  (structured JSON against the rubric in `api/chat.ts`).

## Run it

```
npm install
vercel dev
```

Requires a `CLAUDE_CODE_OAUTH_TOKEN` environment variable — generate one with `claude setup-token`
(Claude Pro/Max plan). In Vercel, add it under Project → Settings → Environment Variables.

## Layout

- `shared/scenarios.ts` — the three customers: personas, the "standout catch" in each scenario, and
  evaluation notes. Add a scenario here and it appears everywhere.
- `api/chat.ts` — persona replies + evaluation rubric.
- `src/App.tsx` — the whole UI: landing, chat, feedback, wrap-up, design notes.
