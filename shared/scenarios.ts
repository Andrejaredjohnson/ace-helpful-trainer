// The three practice customers. Deliberately minimal: a name, a face, one funny
// opener, and the product they want. No backstories. The product IS the scenario.

export interface Scenario {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  /** The product they came in for. The whole exercise hangs on this. */
  item: string;
  /** Scripted opening line. Personality lives here and only here. */
  opener: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'rita',
    name: 'Rita',
    initials: 'R',
    avatarColor: '#7B4B94',
    item: 'paint',
    opener: "I finally lost the argument about the kitchen color. Where's your paint?",
  },
  {
    id: 'gus',
    name: 'Gus',
    initials: 'G',
    avatarColor: '#2F5D50',
    item: 'a garden hose',
    opener: 'Hey, where do you keep your garden hoses?',
  },
  {
    id: 'sam',
    name: 'Sam',
    initials: 'S',
    avatarColor: '#B05A1E',
    item: 'drill bits',
    opener: "I'm looking for drill bits.",
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
