export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export interface Counts {
  total: number;
  completed: number;
  remaining: number;
}

export function createTask(title: string, now = Date.now()): Task {
  return { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, title: title.trim(), done: false, createdAt: now };
}

export function addTask(tasks: Task[], title: string): Task[] {
  const t = title.trim();
  if (!t) return tasks;
  return [...tasks, createTask(t)];
}

export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

/**
 * Counters are maintained incrementally as tasks change.
 * NOTE: this intentionally contains the demo's "controlled bug" for the bug-report workflow.
 */
export function updateCounts(prev: Counts, event: { type: "added" } | { type: "toggled"; nowDone: boolean }): Counts {
  if (event.type === "added") return { total: prev.total + 1, completed: prev.completed, remaining: prev.remaining + 1 };
  if (event.nowDone) return { ...prev, completed: prev.completed + 1, remaining: prev.remaining - 1 };
  // BUG: un-completing a task restores "remaining" but forgets to decrement "completed".
  return { ...prev, remaining: prev.remaining + 1 };
}

export function countsFor(tasks: Task[]): Counts {
  const completed = tasks.filter((t) => t.done).length;
  return { total: tasks.length, completed, remaining: tasks.length - completed };
}

const KEY = "taskboard:v1";
export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Task[];
  } catch {}
  return [
    createTask("Pick up badges at registration", 1),
    createTask("Join the opening keynote", 2),
    createTask("Find a team for the hackathon", 3),
  ];
}
export function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {}
}
