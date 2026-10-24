import type { Complexity } from "@crowdship/shared";

export interface SeedProposal {
  title: string;
  description: string;
  requirements: string[];
  acceptanceCriteria: string[];
  complexity: Complexity;
}

/** Pre-approved proposals for the event task board demo app. */
export const DEMO_SEED_PROPOSALS: SeedProposal[] = [
  {
    title: "Show a progress bar",
    description: "Show how much of the board is done as a progress bar above the task list.",
    requirements: [
      "Display a progress bar showing completed tasks / total tasks",
      "Show the percentage as text next to the bar",
      "Update immediately when a task is added or toggled",
      "Hide the bar when there are no tasks",
    ],
    acceptanceCriteria: [
      "With 4 tasks and 1 complete, the bar shows 25%",
      "Completing a task updates the bar without reload",
      "The bar has data-testid=\"progress-bar\" and an accessible progressbar role",
    ],
    complexity: "small",
  },
  {
    title: "Implement dark mode",
    description: "Add a dark theme to the task board.",
    requirements: [
      "Provide a light/dark toggle",
      "Persist the user's preference",
      "Respect the system preference by default",
    ],
    acceptanceCriteria: ["Users can change themes", "Preference survives refresh", "Text remains readable in both themes"],
    complexity: "small",
  },
  {
    title: "Sort tasks",
    description: "Let people sort the task list.",
    requirements: ["Sort by newest, oldest and alphabetical", "Option to show incomplete tasks first"],
    acceptanceCriteria: ["Choosing a sort reorders tasks immediately", "Completed tasks move below incomplete ones when enabled"],
    complexity: "small",
  },
  {
    title: "Task categories",
    description: "Tag tasks with a category and filter by it.",
    requirements: ["Choose a category when adding a task", "Show the category as a colored chip", "Filter the list by category"],
    acceptanceCriteria: ["New tasks can be given a category", "Filtering shows only matching tasks"],
    complexity: "medium",
  },
  {
    title: "Keyboard shortcuts",
    description: "Speed up the board with keyboard shortcuts.",
    requirements: ["N focuses the new-task input", "? shows a shortcut help panel", "Shortcuts are ignored while typing"],
    acceptanceCriteria: ["Pressing N focuses the input", "Pressing ? opens the help panel"],
    complexity: "small",
  },
];
