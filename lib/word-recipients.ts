import { getConfigOptional, setConfig } from "./youtube-subscription";

const KEY = "daily_word_recipients";

export type WordRecipients = {
  userIds: number[];
  groupIds: string[];
};

const EMPTY: WordRecipients = { userIds: [], groupIds: [] };

function uniqueNumbers(values: unknown[]): number[] {
  const ids = new Set<number>();
  for (const value of values) {
    const id = typeof value === "number" ? value : Number(value);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

function uniqueChatIds(values: unknown[]): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    const id = String(value).trim();
    if (/^-?\d{5,20}$/.test(id)) ids.add(id);
  }
  return [...ids];
}

export function parseWordRecipients(raw: string | null): WordRecipients {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as { userIds?: unknown; groupIds?: unknown };
    return {
      userIds: uniqueNumbers(Array.isArray(parsed.userIds) ? parsed.userIds : []),
      groupIds: uniqueChatIds(Array.isArray(parsed.groupIds) ? parsed.groupIds : []),
    };
  } catch {
    return EMPTY;
  }
}

export function parseGroupChatId(raw: string): string | null {
  const id = raw.trim();
  return /^-?\d{5,20}$/.test(id) ? id : null;
}

/** Owner is always included. Extra users and group chats are opt-in. */
export function lessonChatIds(
  ownerId: string | undefined,
  recipients: WordRecipients,
): string[] {
  const ids = new Set<string>();
  if (ownerId && /^-?\d+$/.test(ownerId)) ids.add(ownerId);
  for (const id of recipients.userIds) ids.add(String(id));
  for (const id of recipients.groupIds) {
    if (id !== ownerId) ids.add(id);
  }
  return [...ids];
}

export async function getWordRecipients(): Promise<WordRecipients> {
  return parseWordRecipients(await getConfigOptional(KEY));
}

export async function saveWordRecipients(
  recipients: WordRecipients,
): Promise<WordRecipients> {
  const next = {
    userIds: uniqueNumbers(recipients.userIds),
    groupIds: uniqueChatIds(recipients.groupIds).filter(
      (id) => id !== process.env.OWNER_TELEGRAM_ID,
    ),
  };
  await setConfig(KEY, JSON.stringify(next));
  return next;
}

export async function toggleWordRecipientUser(userId: number): Promise<WordRecipients> {
  const ownerId = Number(process.env.OWNER_TELEGRAM_ID);
  const current = await getWordRecipients();
  if (!Number.isSafeInteger(userId) || userId <= 0 || userId === ownerId) {
    return current;
  }
  const userIds = current.userIds.includes(userId)
    ? current.userIds.filter((id) => id !== userId)
    : [...current.userIds, userId];
  return saveWordRecipients({ ...current, userIds });
}

export async function addWordGroup(chatId: string): Promise<WordRecipients> {
  const id = parseGroupChatId(chatId);
  if (!id) throw new Error("Chat id must be a number, like -1001234567890.");
  const current = await getWordRecipients();
  if (current.groupIds.includes(id)) return current;
  return saveWordRecipients({ ...current, groupIds: [...current.groupIds, id] });
}

export async function removeWordGroup(chatId: string): Promise<WordRecipients> {
  const current = await getWordRecipients();
  return saveWordRecipients({
    ...current,
    groupIds: current.groupIds.filter((id) => id !== chatId.trim()),
  });
}
