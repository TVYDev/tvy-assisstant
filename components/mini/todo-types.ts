export type TasksView =
  | { kind: "today" }
  | { kind: "anytime" }
  | { kind: "list"; slug: string }
  | { kind: "reminders" };
