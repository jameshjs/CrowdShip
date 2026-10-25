import type { Complexity } from "@crowdship/shared";

export interface SeedProposal {
  title: string;
  description: string;
  requirements: string[];
  acceptanceCriteria: string[];
  complexity: Complexity;
}

/** Pre-approved proposals for the Harbour Café demo app (johntestrun123-bot/crowdship-demo-cafe). */
export const DEMO_SEED_PROPOSALS: SeedProposal[] = [
  {
    title: "Dietary filters",
    description: "Let people filter the menu by dietary needs, like vegan or gluten-free.",
    requirements: [
      "Show Vegan and Gluten-free filter chips above the menu",
      "Filters combine: selecting both shows only items with both tags",
      "Show how many items match while a filter is on",
      "Show a friendly message when nothing matches",
    ],
    acceptanceCriteria: [
      "Selecting Vegan hides the butter croissant and shows the banana bread",
      "Vegan + Gluten-free shows exactly 3 items",
      "Chips have data-testid=\"filter-vegan\" and \"filter-gluten-free\" and expose aria-pressed",
    ],
    complexity: "small",
  },
  {
    title: "Search the menu",
    description: "Find a drink or bake by typing its name.",
    requirements: ["A search box above the menu", "Matches item names and descriptions as you type", "Clear button resets the search"],
    acceptanceCriteria: ["Typing 'latte' shows only the lattes", "Clearing the search shows the full menu again"],
    complexity: "small",
  },
  {
    title: "Favourite drinks",
    description: "Star your usual order and find it in one tap.",
    requirements: ["Star any item as a favourite", "A Favourites tab lists starred items", "Favourites persist after refresh"],
    acceptanceCriteria: ["A starred item appears under Favourites", "Stars survive a page reload"],
    complexity: "small",
  },
  {
    title: "Implement dark mode",
    description: "Add a dark theme to the café app.",
    requirements: ["Provide a light/dark toggle", "Persist the user's preference", "Respect the system preference by default"],
    acceptanceCriteria: ["Users can change themes", "Preference survives refresh", "Text remains readable in both themes"],
    complexity: "small",
  },
  {
    title: "Order notes for the barista",
    description: "Add a note to an order, like extra hot or no sugar.",
    requirements: ["A notes field above Place order", "The note appears on the order confirmation", "Notes are limited to 140 characters"],
    acceptanceCriteria: ["The confirmation shows the note that was entered", "Long notes are cut at 140 characters"],
    complexity: "small",
  },
];
