// Pure editorial helpers for the blog generator: no network, no file access.
// Kept apart from generate-blog-post.mjs so they can be unit tested.

const SEASONS = ["winter", "spring", "summer", "fall"];

// Meteorological seasons for North Mississippi, by calendar month (1-12).
const SEASON_BY_MONTH = {
  12: "winter", 1: "winter", 2: "winter",
  3: "spring", 4: "spring", 5: "spring",
  6: "summer", 7: "summer", 8: "summer",
  9: "fall", 10: "fall", 11: "fall"
};

export function currentSeason(date = new Date(), timeZone = "America/Chicago") {
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" }).format(date)
  );
  return SEASON_BY_MONTH[month];
}

export function nextSeason(season) {
  return SEASONS[(SEASONS.indexOf(season) + 1) % SEASONS.length];
}

// A category is in season when it lists the current season or is all-season.
export function isInSeason(seasonTags, season) {
  const tags = Array.isArray(seasonTags) ? seasonTags : [];
  return tags.includes(season) || tags.includes("all-season");
}

// The season tag used to be picked at random, which produced "summer guide"
// posts in November. Always write for the season the reader is actually in.
export function pickSeasonTag(seasonTags, season) {
  const tags = Array.isArray(seasonTags) ? seasonTags : [];
  if (tags.includes(season)) return season;
  if (tags.includes("all-season")) return "all-season";
  return season;
}

const SEASON_PATTERNS = {
  winter: /\bwinter\b/i,
  spring: /\bspring(?:time)?\b(?!\s+(?:into|back|up|for)\b)/i,
  summer: /\bsummer(?:time)?\b/i,
  // "fall" is also a verb ("temperatures fall"), so require seasonal wording.
  fall: /\bautumn\b|\bthis fall\b|\bin (?:the )?fall\b|\bfall (?:season|weather|maintenance|tune-?up|checklist|prep|hvac|comfort|guide)\b/i
};

// A title may name the current season or the one coming next ("get ready for
// winter" in November). Naming either of the other two reads as out of date.
export function outOfSeasonInTitle(title, season) {
  const allowed = new Set([season, nextSeason(season)]);
  for (const name of SEASONS) {
    if (!allowed.has(name) && SEASON_PATTERNS[name].test(title || "")) return name;
  }
  return null;
}

export function hasFaqSection(body) {
  return /^#{2,3}\s*(?:FAQs?|Frequently Asked Questions)\b/im.test(body || "");
}

export function seasonInstruction(date, season, timeZone = "America/Chicago") {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone, month: "long", day: "numeric", year: "numeric"
  }).format(date);
  return [
    `Today is ${today}. In Tupelo it is ${season}; ${nextSeason(season)} comes next.`,
    `Write for what homeowners are dealing with now or preparing for next.`,
    `If the topic seed mentions a different season, adapt the advice to ${season}.`,
    `Never describe another season as the current one, and do not name another season in the title.`
  ].join(" ");
}

// The retry used to send the same generic instruction whatever had failed, so
// a draft that was 17 words too long was simply rolled again. Tell the model
// exactly which checks failed and what each one needs.
const FIXES = [
  [/^Word count out of range \((\d+)\)/, (m) => {
    const count = Number(m[1]);
    return count > 500
      ? `The body was ${count} words. Cut it to between 350 and 450 words.`
      : `The body was only ${count} words. Expand it to between 350 and 450 words with practical detail.`;
  }],
  [/^Missing FAQ section/, () => 'Add a section headed exactly "## FAQ" with 2 or 3 questions and answers.'],
  [/^Contains prohibited guarantee language/, () =>
    'Remove every use of "always", "guarantee", "guaranteed" and "will fix". Use "often", "usually" or "can help" instead.'],
  [/^Title too similar to a recent post/, () =>
    "Write a completely different title: a new angle, different opening words and a different structure from every recent title listed above."],
  [/^Title length out of range/, () => "Make the title between 30 and 85 characters."],
  [/^Title names a different season \((\w+)\)/, (m) =>
    `Do not mention ${m[1]} in the title. Write for the current season.`],
  [/^Description exceeds 160 characters/, () => "Keep the DESCRIPTION line under 155 characters."],
  [/^Missing local hook/, () => "Mention Tupelo or North Mississippi conditions specifically in the body."],
  [/^Needs at least two H2 subheadings/, () => 'Use at least two "## " subheadings.'],
  [/^Needs numbered or bulleted list/, () => "Include one numbered or bulleted checklist."],
  [/^Missing actionable checklist\/steps language/, () =>
    'Introduce the list with the word "checklist" or "steps".'],
  [/^Contains pricing claim/, () => "Remove every price, dollar amount and cost figure."],
  [/^Contains business name formatting/, () => "Remove company names and LLC/Inc./Corp. wording."]
];

export function feedbackForFailures(failed) {
  const fixes = [];
  for (const reason of Array.isArray(failed) ? failed : []) {
    for (const [pattern, fix] of FIXES) {
      const match = String(reason).match(pattern);
      if (match) {
        fixes.push(`- ${fix(match)}`);
        break;
      }
    }
  }
  if (!fixes.length) return "";
  return `Your previous draft failed these automated checks. Fix every one:\n${fixes.join("\n")}`;
}
