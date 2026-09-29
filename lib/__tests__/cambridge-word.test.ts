import { describe, expect, it } from "vitest";
import {
  formatWordLesson,
  formatWordOfTheDayReport,
  parseCambridgeWordOfTheDay,
} from "../cambridge-word";

const fixture = `
<p class="fs12 tcu lmb-0">Word of the Day</p>
<p class="fs36 lmt-5 feature-w-big wotd-hw">
    <a href="/dictionary/english/equinox#cald4-1">equinox</a>
</p>
<div class="hdib">
    <span class="region dreg">UK</span>
    <source type="audio/mpeg" src="/media/english/uk_pron/u/uke/ukepi/ukepito028.mp3"/>
    <span class="ipa dipa lpr-2 lpl-1">/ˈek.wɪ.nɒks/</span>
</div>
<div class="hdib">
    <span class="region dreg">US</span>
    <span class="ipa dipa lpr-2 lpl-1">/ˈek.wə.nɑːks/</span>
</div>
<div class="hoh lp-20">
    <p class="lmt-0 lmb-20">either of the two occasions in the year when day &amp; night are equal</p>
</div>
`;

describe("parseCambridgeWordOfTheDay", () => {
  it("reads the word, first pronunciation, and definition", () => {
    expect(parseCambridgeWordOfTheDay(fixture)).toEqual({
      word: "equinox",
      definition: "either of the two occasions in the year when day & night are equal",
      pronounciationRegion: "UK",
      pronounciation: "/ˈek.wɪ.nɒks/",
      audioUrl:
        "https://dictionary.cambridge.org/media/english/uk_pron/u/uke/ukepi/ukepito028.mp3",
      audio: null,
    });
  });

  it("returns null when the word of the day block is missing", () => {
    expect(parseCambridgeWordOfTheDay("<html></html>")).toBeNull();
  });
});

describe("formatWordOfTheDayReport", () => {
  const entry = {
    word: "equinox",
    definition: "when day & night are equal",
    pronounciationRegion: "UK",
    pronounciation: "/ˈek/",
  };

  it("reports a saved word", () => {
    const text = formatWordOfTheDayReport({ ok: true, entry });
    expect(text).toContain("✅ <b>Word of the day</b>\nSaved");
    expect(text).toContain("equinox");
    expect(text).toContain("day &amp; night");
  });

  it("reports a failure with no word", () => {
    const text = formatWordOfTheDayReport({
      ok: false,
      error: "Cambridge returned <500>",
    });
    expect(text).toContain("❌ <b>Word of the day</b>\nFailed");
    expect(text).toContain("Cambridge returned &lt;500&gt;");
    expect(text).not.toContain("🔠");
  });
});

describe("formatWordLesson", () => {
  it("formats the lesson with emoji sections and escapes HTML", () => {
    const text = formatWordLesson({
      word: "a < b",
      definition: "fish & chips",
      pronounciationRegion: "UK",
      pronounciation: "/eɪ/",
      audioUrl: null,
      audio: null,
    });
    expect(text).toBe(
      [
        "🔠",
        "a &lt; b",
        "",
        "📣",
        "UK · /eɪ/",
        "",
        "📋",
        "fish &amp; chips",
      ].join("\n"),
    );
  });

  it("omits pronunciation when the word has none", () => {
    const text = formatWordLesson({
      word: "equinox",
      definition: "when day and night are equal",
      pronounciationRegion: null,
      pronounciation: null,
      audioUrl: null,
      audio: null,
    });
    expect(text).toBe(
      ["🔠", "equinox", "", "📋", "when day and night are equal"].join("\n"),
    );
  });
});
