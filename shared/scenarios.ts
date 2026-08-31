// The three practice customers. Deliberately minimal: a name, a face, one opener,
// and the product they want. Most people ask plainly; some have a little color.
// `facts` is not a puzzle, it is just what the customer says if asked about their
// project, so that asking questions is a workable path to a good suggestion.

export interface Scenario {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  /** The product they came in for. The whole exercise hangs on this. */
  item: string;
  /** Scripted opening line. */
  opener: string;
  /** What they'll say if the employee asks about the project. Plain answers, no secrets. */
  facts: string;
}

/** Tutorial-only customer. Fully scripted in the UI; never used for live practice. */
export const TUTORIAL_CUSTOMER: Scenario = {
  id: 'rita',
  name: 'Rita',
  initials: 'R',
  avatarColor: '#7B4B94',
  item: 'paint',
  opener: "I finally lost the argument about the kitchen color. Where's your paint?",
  facts: 'Scripted tutorial; not used.',
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'gus',
    name: 'Gus',
    initials: 'G',
    avatarColor: '#2F5D50',
    item: 'a garden hose',
    opener: 'Hey, where do you keep your garden hoses?',
    facts: 'Your old hose split. You need about fifty feet to reach the flower beds out back. Your spray nozzle is fine, but your hose just lies in a pile on the patio.',
  },
  {
    id: 'sam',
    name: 'Sam',
    initials: 'S',
    avatarColor: '#B05A1E',
    item: 'drill bits',
    opener: "I'm looking for drill bits.",
    facts: "You're hanging shelves on a brick wall, and the bits you have at home barely scratched it. You haven't bought anchors or screws yet.",
  },
  {
    id: 'dana',
    name: 'Dana',
    initials: 'D',
    avatarColor: '#4A6FA5',
    item: 'grass seed',
    opener: 'My backyard has more dirt patches than grass at this point. Do you guys sell grass seed?',
    facts: "You're reseeding bare patches all over your backyard. You have a hose and nothing else: no spreader, no fertilizer, no topsoil.",
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
