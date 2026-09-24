import { describe, expect, it } from "vitest";
import { formatWordLesson, parseCambridgeWordOfTheDay } from "../cambridge-word";

const fixture = `
<p class="fs12 tcu lmb-0">Word of the Day</p>
<p class="fs36 lmt-5 feature-w-big wotd-hw">
    <a href="/dictionary/english/equinox#cald4-1">equinox</a>
</p>
<div class="hdib">
    <span class="region dreg">UK</span>
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
    });
  });

  it("returns null when the word of the day block is missing", () => {
    expect(parseCambridgeWordOfTheDay("<html></html>")).toBeNull();
  });
});

describe("formatWordLesson", () => {
  it("escapes HTML in the lesson sent to Telegram", () => {
    const text = formatWordLesson({
      word: "a < b",
      definition: "fish & chips",
      pronounciationRegion: "UK",
      pronounciation: "/eɪ/",
    });
    expect(text).toContain("<b>a &lt; b</b>");
    expect(text).toContain("UK /eɪ/");
    expect(text).toContain("fish &amp; chips");
  });
});
