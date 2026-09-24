const CAMBRIDGE_ORIGIN = "https://dictionary.cambridge.org";
const WORD_OF_THE_DAY_URL = `${CAMBRIDGE_ORIGIN}/dictionary/english/a`;

export interface CambridgeWordOfTheDay {
  word: string;
  definition: string;
  pronounciationRegion: string | null;
  pronounciation: string | null;
  audioUrl: string | null;
  audio: Buffer | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatWordLesson(entry: CambridgeWordOfTheDay): string {
  const spoken = [entry.pronounciationRegion, entry.pronounciation]
    .filter(Boolean)
    .join(" ");
  const pronunciation = spoken ? `\n${escapeHtml(spoken)}` : "";
  return `📖 <b>${escapeHtml(entry.word)}</b>${pronunciation}\n\n${escapeHtml(entry.definition)}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCambridgeWordOfTheDay(
  html: string,
): CambridgeWordOfTheDay | null {
  const marker = html.indexOf(">Word of the Day<");
  if (marker === -1) return null;

  const block = html.slice(marker, marker + 5000);
  const wordMatch = block.match(
    /class="[^"]*\bwotd-hw\b[^"]*">\s*<a[^>]*>([^<]+)<\/a>/,
  );
  const definitionMatch = block.match(
    /<div class="hoh[^"]*">\s*<p[^>]*>([^<]+)<\/p>/,
  );
  if (!wordMatch || !definitionMatch) return null;

  const regionMatch = block.match(/class="region[^"]*">([^<]+)</);
  const ipaMatch = block.match(/class="ipa[^"]*">([^<]+)</);
  const audioMatch = block.match(
    /<source[^>]*type="audio\/mpeg"[^>]*src="([^"]+)"/,
  );

  return {
    word: decodeHtml(wordMatch[1]),
    definition: decodeHtml(definitionMatch[1]),
    pronounciationRegion: regionMatch ? decodeHtml(regionMatch[1]) : null,
    pronounciation: ipaMatch ? decodeHtml(ipaMatch[1]) : null,
    audioUrl: audioMatch ? new URL(audioMatch[1], CAMBRIDGE_ORIGIN).href : null,
    audio: null,
  };
}

async function fetchPronunciationAudio(audioUrl: string): Promise<Buffer | null> {
  const response = await fetch(audioUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; tvy-assistant/1.0; +https://dictionary.cambridge.org)",
      Referer: WORD_OF_THE_DAY_URL,
      Accept: "audio/mpeg",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length > 0 ? bytes : null;
}

export async function fetchCambridgeWordOfTheDay(): Promise<CambridgeWordOfTheDay> {
  const response = await fetch(WORD_OF_THE_DAY_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; tvy-assistant/1.0; +https://dictionary.cambridge.org)",
      Accept: "text/html",
      "Accept-Language": "en",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Cambridge Dictionary returned ${response.status} ${response.statusText}`,
    );
  }

  const parsed = parseCambridgeWordOfTheDay(await response.text());
  if (!parsed) {
    throw new Error("Cambridge word of the day markup was not found.");
  }
  if (parsed.audioUrl) {
    parsed.audio = await fetchPronunciationAudio(parsed.audioUrl);
  }
  return parsed;
}
