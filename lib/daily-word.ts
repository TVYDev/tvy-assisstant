import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { words } from "./db/schema";
import { todayInPhnomPenh } from "./fitness-log";
import { getConfigOptional, setConfig } from "./youtube-subscription";

const DAILY_WORD_KEY = "daily_word_lesson";

export type DailyWordLesson = {
  id: number;
  word: string;
  definition: string;
  pronounciationRegion: string | null;
  pronounciation: string | null;
  hasAudio: boolean;
  pronounciationAudio: Buffer | null;
};

type StoredPick = { date: string; id: number };

function wordColumns() {
  return {
    id: words.id,
    word: words.word,
    definition: words.definition,
    pronounciationRegion: words.pronounciationRegion,
    pronounciation: words.pronounciation,
    hasAudio: sql<boolean>`${words.pronounciationAudio} IS NOT NULL`.as(
      "has_audio",
    ),
    pronounciationAudio: words.pronounciationAudio,
  };
}

function parsePick(raw: string | null): StoredPick | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPick;
    if (typeof parsed.date === "string" && typeof parsed.id === "number") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function loadWord(id: number): Promise<DailyWordLesson | null> {
  const [row] = await getDb()
    .select(wordColumns())
    .from(words)
    .where(eq(words.id, id))
    .limit(1);
  return row ?? null;
}

/** The word the 08:19 lesson will send. Chosen once per Phnom Penh day. */
export async function getTodaysLessonWord(): Promise<DailyWordLesson | null> {
  const today = todayInPhnomPenh();
  const stored = parsePick(await getConfigOptional(DAILY_WORD_KEY));
  if (stored?.date === today) {
    const existing = await loadWord(stored.id);
    if (existing) return existing;
  }

  const db = getDb();
  const [picked] = await db
    .select(wordColumns())
    .from(words)
    .orderBy(sql`RANDOM()`)
    .limit(1);
  if (!picked) return null;

  await setConfig(
    DAILY_WORD_KEY,
    JSON.stringify({ date: today, id: picked.id } satisfies StoredPick),
  );
  return picked;
}
