import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    const hex = String(value).replace(/^\\x/, "");
    return Buffer.from(hex, "hex");
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
};

export const telegramUsers = pgTable("telegram_users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  telegramUsername: text("telegram_username"),
  shortcode: text("shortcode").unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  ...timestamps,
});

export const debtRecords = pgTable("debt_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  shortcode: text("shortcode")
    .notNull()
    .unique()
    .references(() => telegramUsers.shortcode, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  owesMe: numeric("owes_me", { precision: 10, scale: 2, mode: "number" })
    .notNull()
    .default(0),
  iOwe: numeric("i_owe", { precision: 10, scale: 2, mode: "number" })
    .notNull()
    .default(0),
  ...timestamps,
});

export const debtItems = pgTable("debt_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  debtRecordId: bigint("debt_record_id", { mode: "number" })
    .notNull()
    .references(() => debtRecords.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  paid: boolean("paid").notNull().default(false),
  ...timestamps,
});

export const depositBalances = pgTable("deposit_balances", {
  shortcode: text("shortcode")
    .primaryKey()
    .references(() => telegramUsers.shortcode, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  balance: numeric("balance", { precision: 10, scale: 2, mode: "number" })
    .notNull()
    .default(0),
  ...timestamps,
});

export const depositTransactions = pgTable("deposit_transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  shortcode: text("shortcode")
    .notNull()
    .references(() => telegramUsers.shortcode, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
  balanceAfter: numeric("balance_after", {
    precision: 10,
    scale: 2,
    mode: "number",
  }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const youtubeSubscriptionMembers = pgTable(
  "youtube_subscription_members",
  {
    id: text("id").primaryKey(),
    ...timestamps,
  },
);

export const youtubeSubscriptionMonths = pgTable(
  "youtube_subscription_months",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    shortcode: text("shortcode").notNull(),
    month: date("month", { mode: "string" }).notNull(),
    paid: boolean("paid").notNull().default(false),
    ...timestamps,
  },
  (table) => [unique("youtube_subscription_months_shortcode_month").on(table.shortcode, table.month)],
);

export const youtubeFeeSchedules = pgTable("youtube_fee_schedules", {
  id: serial("id").primaryKey(),
  fee: numeric("fee", { precision: 10, scale: 2, mode: "number" }).notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  effectiveTo: date("effective_to", { mode: "string" }),
  ...timestamps,
});

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  ...timestamps,
});

export const dailyFitnessLogs = pgTable("daily_fitness_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  logDate: date("log_date", { mode: "string" }).notNull().unique(),
  weightKg: numeric("weight_kg", { precision: 5, scale: 2, mode: "number" }).notNull(),
  gymStatus: text("gym_status").notNull(),
  gymSession: text("gym_session"),
  gymMinutes: integer("gym_minutes"),
  ...timestamps,
});

export const fitnessLogSessions = pgTable("fitness_log_sessions", {
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).primaryKey(),
  step: text("step").notNull(),
  weightKg: numeric("weight_kg", { precision: 5, scale: 2, mode: "number" }),
  gymSession: text("gym_session"),
  targetLogDate: date("target_log_date", { mode: "string" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  ...timestamps,
});

export const todoLists = pgTable("todo_lists", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  ...timestamps,
});

export const todos = pgTable(
  "todos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listId: bigint("list_id", { mode: "number" })
      .notNull()
      .references(() => todoLists.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }),
    reminderId: bigint("reminder_id", { mode: "number" }),
    ...timestamps,
  },
  (table) => [
    index("idx_todos_list_id_done").on(table.listId, table.done),
    index("idx_todos_due_at").on(table.dueAt),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true, mode: "string" }).notNull(),
    recurrence: text("recurrence"),
    targetChatId: bigint("target_chat_id", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    todoId: bigint("todo_id", { mode: "number" }).references(() => todos.id, {
      onDelete: "set null",
    }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "string" }),
    ...timestamps,
  },
  (table) => [index("idx_reminders_status_remind_at").on(table.status, table.remindAt)],
);

export const words = pgTable("words", {
  id: serial("id").primaryKey(),
  word: varchar("word", { length: 250 }).notNull(),
  definition: varchar("definition", { length: 500 }).notNull(),
  pronounciationRegion: varchar("pronounciation_region", { length: 50 }),
  pronounciation: varchar("pronounciation", { length: 250 }),
  pronounciationAudio: bytea("pronounciation_audio"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const taskWizardSessions = pgTable("task_wizard_sessions", {
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).primaryKey(),
  kind: text("kind").notNull(),
  step: text("step").notNull(),
  payload: text("payload").notNull().default("{}"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  ...timestamps,
});

export const telegramUsersRelations = relations(telegramUsers, ({ one }) => ({
  debtRecord: one(debtRecords, {
    fields: [telegramUsers.shortcode],
    references: [debtRecords.shortcode],
  }),
}));

export const debtRecordsRelations = relations(debtRecords, ({ many, one }) => ({
  items: many(debtItems),
  user: one(telegramUsers, {
    fields: [debtRecords.shortcode],
    references: [telegramUsers.shortcode],
  }),
}));

export const debtItemsRelations = relations(debtItems, ({ one }) => ({
  record: one(debtRecords, {
    fields: [debtItems.debtRecordId],
    references: [debtRecords.id],
  }),
}));

export const todoListsRelations = relations(todoLists, ({ many }) => ({
  todos: many(todos),
}));

export const todosRelations = relations(todos, ({ one }) => ({
  list: one(todoLists, {
    fields: [todos.listId],
    references: [todoLists.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  todo: one(todos, {
    fields: [reminders.todoId],
    references: [todos.id],
  }),
}));
