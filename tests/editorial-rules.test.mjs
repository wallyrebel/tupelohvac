import test from "node:test";
import assert from "node:assert/strict";
import {
  currentSeason,
  feedbackForFailures,
  hasFaqSection,
  isInSeason,
  nextSeason,
  outOfSeasonInTitle,
  pickSeasonTag,
  seasonInstruction
} from "../scripts/editorial-rules.mjs";

test("season follows the calendar in Tupelo's time zone", () => {
  assert.equal(currentSeason(new Date("2026-11-10T15:00:00Z")), "fall");
  assert.equal(currentSeason(new Date("2026-01-15T15:00:00Z")), "winter");
  assert.equal(currentSeason(new Date("2026-04-15T15:00:00Z")), "spring");
  assert.equal(currentSeason(new Date("2026-07-15T15:00:00Z")), "summer");
  // 03:00 UTC on Dec. 1 is still Nov. 30 in Tupelo.
  assert.equal(currentSeason(new Date("2026-12-01T03:00:00Z")), "fall");
  assert.equal(nextSeason("fall"), "winter");
  assert.equal(nextSeason("winter"), "spring");
});

test("the season tag is the current season, never a random one", () => {
  assert.equal(pickSeasonTag(["spring", "summer", "fall", "all-season"], "fall"), "fall");
  assert.equal(pickSeasonTag(["summer", "all-season"], "fall"), "all-season");
  assert.equal(pickSeasonTag(["summer"], "fall"), "fall");
  assert.equal(isInSeason(["summer", "all-season"], "fall"), true);
  assert.equal(isInSeason(["summer"], "fall"), false);
  assert.equal(isInSeason(undefined, "fall"), false);
});

test("published November titles that named spring and summer are caught", () => {
  assert.equal(
    outOfSeasonInTitle("Follow the Cool Air: A Tupelo Summer Guide to Better Airflow", "fall"),
    "summer"
  );
  assert.equal(
    outOfSeasonInTitle("Spring Humidity Has a Filter Story: AC Service Tupelo Homeowners Can Plan", "fall"),
    "spring"
  );
});

test("current and upcoming seasons are allowed, and ordinary verbs are not seasons", () => {
  assert.equal(outOfSeasonInTitle("Fall Tune-Up Checklist for Tupelo HVAC", "fall"), null);
  assert.equal(outOfSeasonInTitle("Get Your Furnace Ready for Winter in Tupelo", "fall"), null);
  assert.equal(outOfSeasonInTitle("When Temperatures Fall Fast: Tupelo HVAC Tips", "spring"), null);
  assert.equal(outOfSeasonInTitle("Spring Into Action on Tupelo HVAC Filters", "fall"), null);
  assert.equal(outOfSeasonInTitle("Fall Maintenance for Tupelo HVAC", "spring"), "fall");
  assert.equal(outOfSeasonInTitle("", "fall"), null);
});

test("FAQ heading accepts the forms the model actually writes", () => {
  assert.equal(hasFaqSection("intro\n\n## FAQ\n\nQ: ..."), true);
  assert.equal(hasFaqSection("intro\n\n### FAQ\n"), true);
  assert.equal(hasFaqSection("intro\n\n## Frequently Asked Questions\n"), true);
  assert.equal(hasFaqSection("intro\n\n## FAQs\n"), true);
  assert.equal(hasFaqSection("We answer a FAQ below."), false);
  assert.equal(hasFaqSection("## Final thoughts"), false);
});

test("retry feedback names each failed check with a concrete fix", () => {
  const feedback = feedbackForFailures([
    "Word count out of range (517).",
    "Missing FAQ section.",
    "Contains prohibited guarantee language.",
    "Title names a different season (summer) than the current one (fall)."
  ]);
  assert.match(feedback, /was 517 words\. Cut it to between 350 and 450/);
  assert.match(feedback, /headed exactly "## FAQ"/);
  assert.match(feedback, /"always"/);
  assert.match(feedback, /Do not mention summer in the title/);
  assert.equal(feedback.split("\n").length, 5);
  assert.match(feedbackForFailures(["Word count out of range (212)."]), /only 212 words/);
});

test("unknown or empty failures add nothing to the retry prompt", () => {
  assert.equal(feedbackForFailures([]), "");
  assert.equal(feedbackForFailures(undefined), "");
  assert.equal(feedbackForFailures(["Some future check."]), "");
});

test("the prompt is told the real date and season", () => {
  const note = seasonInstruction(new Date("2026-11-10T15:00:00Z"), "fall");
  assert.match(note, /Today is November 10, 2026/);
  assert.match(note, /it is fall; winter comes next/);
});
