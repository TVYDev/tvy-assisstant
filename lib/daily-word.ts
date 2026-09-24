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

/** A random row from the whole words table. Saved so the home page can show what was sent today. */
export async function pickRandomLessonWord(): Promise<DailyWordLesson | null> {
  const [picked] = await getDb()
    .select(wordColumns())
    .from(words)
    .orderBy(sql`RANDOM()`)
    .limit(1);
  if (!picked) return null;

  await setConfig(
    DAILY_WORD_KEY,
    JSON.stringify({ date: todayInPhnomPenh(), id: picked.id } satisfies StoredPick),
  );
  return picked;
}

/** The lesson already chosen today. Opening the home page does not pick a new word. */
export async function getStoredLessonWord(): Promise<DailyWordLesson | null> {
  const stored = parsePick(await getConfigOptional(DAILY_WORD_KEY));
  if (stored?.date !== todayInPhnomPenh()) return null;
  return loadWord(stored.id);
}
