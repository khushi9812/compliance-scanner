// Sample label references for the "try it" gallery on the consumer portal.
// These are deterministic synthetic labels — the pipeline classifies them
// exactly like an upload.

export interface LabelSample {
  id: string;
  name: string;
  category: string;
  emoji: string;
  // Deterministic pseudo dimensions used by the simulator.
  width: number;
  height: number;
}

export const LABEL_SAMPLES: LabelSample[] = [
  {
    id: "muesli",
    name: "Crunchy Muesli 500g",
    category: "Breakfast cereal",
    emoji: "🥣",
    width: 1200,
    height: 1600,
  },
  {
    id: "shampoo",
    name: "Herbal Shampoo 340ml",
    category: "Personal care",
    emoji: "🧴",
    width: 1000,
    height: 1400,
  },
  {
    id: "chips",
    name: "Masala Chips 80g",
    category: "Snacks",
    emoji: "🍟",
    width: 1400,
    height: 900,
  },
  {
    id: "water",
    name: "Mineral Water 1L",
    category: "Beverages",
    emoji: "💧",
    width: 900,
    height: 1500,
  },
];
