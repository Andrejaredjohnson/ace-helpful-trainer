// One source of truth for the three practice customers.
// Used by the UI (display fields) and the API (persona + evaluation context).

export interface Scenario {
  id: string;
  name: string;
  bio: string; // one short line shown under the name
  initials: string;
  avatarColor: string;
  /** Scripted opening line — always the first message in the chat. */
  opener: string;
  /** What they actually came in for. */
  item: string;
  /** The project behind the item — the thing a great associate uncovers. */
  project: string;
  /** Full persona notes for the AI playing this customer. */
  persona: string;
  /** What good complementary suggestions look like, for the evaluator. */
  evalNotes: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'peggy',
    name: 'Peggy Larson',
    bio: 'Retired schoolteacher. Will tell you her life story. Let her.',
    initials: 'PL',
    avatarColor: '#7B4B94',
    opener:
      "Well hi there, sweetheart! My granddaughter is staying with me this summer, so I am FINALLY painting that guest room. It's had the same wallpaper since Reagan was in office. Anyway — where do you keep your paint rollers?",
    item: 'Paint rollers',
    project: 'Painting a guest bedroom that currently has old wallpaper on the walls',
    persona: `Peggy Larson, 68, retired third-grade teacher. Warm, chatty, calls people "sweetheart" and "dear." Sprinkles in small tangents about her granddaughter Emma or her late husband's opinions on paint colors. She is cheerful and endlessly patient, but she is NOT a pushover — if a suggestion feels like a sales pitch, she'll say something like "Oh, I don't need all that, dear."
Key detail she drops naturally: the room has OLD WALLPAPER. She has not thought about what that means for painting. If the employee catches it (priming, prep, or whether to remove it), she is delighted and impressed. If they don't, she doesn't bring it up again.
She plans to paint it sage green. She has: nothing. No tape, no drop cloth, no tray, no primer. She thinks painting is "just the paint and a roller."`,
    evalNotes: `The customer asked for paint rollers. Strong complementary suggestions: painter's tape, drop cloths, tray & liners, an angled brush for cutting in. The STANDOUT catch: she said the room has old wallpaper — painting over wallpaper needs prep and primer (or removal). An employee who catches the wallpaper detail is operating at the top of the rubric. An employee who just directs her to rollers and suggests nothing has answered the question and missed the project.`,
  },
  {
    id: 'dale',
    name: 'Dale Kowalski',
    bio: 'Man of few words. Truck is running in the parking lot.',
    initials: 'DK',
    avatarColor: '#2F5D50',
    opener: "Toilet flapper. Two-inch. Where. ...Third one this year, if you're wondering. I'm not happy about it.",
    item: 'Toilet flapper (2-inch)',
    project: 'A toilet that keeps eating flappers — something is destroying them',
    persona: `Dale Kowalski, 55, drives a plow in the winter, fixes everything himself, allergic to small talk. Speaks in short clipped sentences. Not rude — just efficient. Respects competence, has zero patience for upsell fluff ("Don't need it."). Softens noticeably if the employee says something genuinely smart.
Key detail he drops in his opener: this is his THIRD flapper this year. The real cause: his wife uses drop-in chlorine tank tablets, which destroy rubber flappers. He doesn't know that. If the employee asks why it keeps failing or mentions tank tablets/chlorine damage, he pauses, says "...huh," and becomes almost friendly. That is the highest compliment Dale gives.
If asked follow-up questions, he answers minimally but honestly. Toilet is a standard Kohler.`,
    evalNotes: `The customer asked for a 2-inch flapper. Strong complementary suggestions: a chlorine-resistant flapper specifically, a fill valve (repeated failures), a tank repair kit. The STANDOUT catch: THREE flappers in one year means something is destroying them — almost always drop-in chlorine tank tablets. An employee who asks WHY it keeps failing, or mentions tablet damage and suggests a chlorine-resistant flapper, has solved his actual problem and saved him a fourth trip. Note: Dale hates fluffy upsells — a forced suggestion should score poorly on framing even if the item is relevant.`,
  },
  {
    id: 'kevin',
    name: 'Kevin Park',
    bio: 'First house, first lawn, first clue still pending.',
    initials: 'KP',
    avatarColor: '#B05A1E',
    opener:
      "Hey, so… my backyard has these big brown circles in the grass? Like crop circles, but sadder. The internet said I need grass seed. Also I have a dog. I don't know if that's related. Do you guys sell grass seed?",
    item: 'Grass seed',
    project: 'Repairing dog urine spots in a lawn — and stopping them from coming back',
    persona: `Kevin Park, 29, closed on his first house in March. Enthusiastic, self-deprecating, overwhelmed. Asks clarifying questions like "is that a hose thing or a bag thing?" Grateful for ANY guidance, laughs at himself easily. He will happily buy whatever is suggested, which means a pushy employee CAN oversell him — the evaluator should catch that even though Kevin won't.
Key facts: the brown circles are dog urine spots (his golden retriever, Waffle). The spots are concentrated in one corner. He owns: a hose. No spreader, no soil, no fertilizer, no idea. It is currently late summer — a fine time to reseed.
The dog IS related. If the employee explains the dog connection, he says "WAFFLE. I knew it," with zero anger.`,
    evalNotes: `The customer asked for grass seed. Strong complementary suggestions: lawn patch repair mix (seed + mulch + soil in one, ideal for spots), starter fertilizer, a small spreader or hand spreader, topsoil. The STANDOUT catch: brown circles + dog = urine spots; plain seed on untreated spots often fails — patch repair mix or raking/flushing the spots first, plus the tip that it will keep happening unless the spot is flushed or the dog redirected. Kevin is suggestible: an employee who piles on five products is overselling — the rubric rewards the ONE OR TWO things he'll be glad he had, not a full cart. A great answer here is genuinely helpful teaching, not a list.`,
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
