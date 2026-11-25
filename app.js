const TAXONOMY = [
  "Business",
  "Politics",
  "World",
  "Science",
  "Tech",
  "Health",
  "Environment",
  "Sports",
  "Culture",
  "Community",
];

// Legacy page size (kept for old callers); editions are capped by EDITION_CAP.
const PAGE_SIZE = 60;

// Daily editions (21 Nov 2026, Olivier): an edition is the stories released
// on one London day (story.edition from ingest; Pacific until 25 Nov 2026). Each edition shows at
// most EDITION_CAP stories, grouped under category headings. A cap, never a
// quota: an edition only holds what was released. "Load more" adds the next
// older edition still in the public feed; the feed itself only carries
// stories inside the 72-hour window, so nothing stays up longer.
const EDITION_CAP = 15;

// Publisher images are off by default (no hotlinking; rights-safe text cards).
// Images are shown only when a story carries a free-licence image with a
// credit (see licensedImage). Publisher photos (`image`) are never shown.
// Set to false to make every card text-only.
// Keep in sync with ingest.IMAGES_ENABLED. Off until SA Design signs off.
const SHOW_IMAGES = false;

// The email signup appears once, after this many cards (or after the last
// card when there are fewer). D5/G1, 20 Nov 2026.
const SIGNUP_AFTER = 3;
// D4: a short edition gets a calm note.
const SHORT_EDITION_UNDER = 10;
const SHORT_EDITION_NOTE =
  "A short edition today. We only share good news we can back up. Stories stay up for 72 hours.";
// Edition day and "updated" time (25 Nov 2026, PM): Europe/London. The zone
// label (GMT or BST) is computed from the date, never hardcoded.
const SITE_TZ = "Europe/London";
// Why-line on site cards (PM, 20 Nov 2026): hidden on every card. This is the
// one-line switch: set to true to show it again. Even when true, a why-line
// that repeats the card's summary sentence is never shown.
const SHOW_WHY_ON_CARDS = false;

// Preview image sizing. Grid cards render ~290px wide on desktop, so 640px
// covers 2x screens; only the full-width lead card may use a larger rendition.
const IMG_CARD_MAX = 640;
const IMG_LEAD_MAX = 1100;
const SIZES_CARD = "(min-width: 1024px) 380px, calc(100vw - 40px)";
const SIZES_THUMB = "(min-width: 1024px) 120px, (min-width: 720px) 104px, 80px";
const SIZES_LEAD = "(min-width: 1024px) 740px, calc(100vw - 40px)";

const state = {
  data: null,
  category: "All",
  visible: PAGE_SIZE,
  editionsShown: 1,
  // Archived editions (25 Nov 2026): fetched only when Load more gets past
  // the 72-hour feed. archiveShown = archived editions on the page.
  archive: null,
  archiveShown: 0,
  archiveError: false,
};

// Archived editions (25 Nov 2026, Olivier via PM): after the editions in the
// 72-hour feed, Load more goes on into older editions from
// data/archive-editions.json, written by ingest from stories that were
// released and are still released (never pending, failed or pulled), capped
// at 30 days. They sit under an "Earlier editions" divider, each headed
// "Edition · {date}". Same cards; the edition bar never counts them.
const ARCHIVE_URL = "data/archive-editions.json";
const ARCHIVE_DIVIDER = "Earlier editions";

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? ""), window.location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    /* ignore invalid */
  }
  return "";
}

// Reader's local calendar date (masthead, "new today"). Was Europe/London.
function ymdLocal(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function relativeTime(iso) {
  if (!iso) return "Date unknown";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Date unknown";
  const diffSec = Math.round((then.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (abs >= size || unit === "minute") {
      return rtf.format(Math.round(diffSec / size), unit);
    }
  }
  return rtf.format(0, "minute");
}

function formatExact(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return ymdLocal(d) === ymdLocal(new Date());
}

function currentCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("category");
  if (!raw || raw.toLowerCase() === "all") return "All";
  return TAXONOMY.find((c) => c.toLowerCase() === raw.toLowerCase()) || "All";
}

function setCategory(category, push) {
  state.category = category;
  state.archiveShown = 0;
  state.visible = PAGE_SIZE;
  state.editionsShown = 1;
  if (push) {
    const url = new URL(window.location.href);
    if (category === "All") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    history.pushState({ category }, "", url);
  }
  renderFilters();
  renderFeed();
}

// ---------- Daily editions ----------
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD of a moment in London time (the edition day).
function siteDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

// A story's edition day. Ingest sets story.edition (release day, London). A feed
// without it (older ingest) is treated as one edition, the generated day.
function editionKeyOf(story, data) {
  const k = String(story?.edition || "");
  if (DAY_KEY.test(k)) return k;
  const d = new Date(data?.generated_at);
  return Number.isNaN(d.getTime()) ? "latest" : siteDay(d);
}

// Newest edition first; feed order (ranking) kept inside each; capped.
function buildEditions(data) {
  const byKey = new Map();
  for (const story of data?.stories || []) {
    if (!story) continue;
    const key = editionKeyOf(story, data);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(story);
  }
  return [...byKey.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({ key, stories: byKey.get(key).slice(0, EDITION_CAP) }));
}

// Every story the page can show (all editions, after the cap).
function editionStories(data) {
  return buildEditions(data).flatMap((e) => e.stories);
}

function dayFromKey(key) {
  const d = new Date(`${key}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Today's edition", "Yesterday's edition", "Thursday's edition".
// "Today's" only when the edition is today's London date, i.e. stories were
// released today (25 Nov 2026, PM). An undated edition is "Latest edition".
function editionName(key, now = new Date()) {
  if (!DAY_KEY.test(key)) return "Latest edition";
  if (key === siteDay(now)) return "Today's edition";
  if (key === siteDay(new Date(now.getTime() - 86400000))) return "Yesterday's edition";
  const d = dayFromKey(key);
  const wd = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d);
  return `${wd}'s edition`;
}

// "Fri 20 Nov"
function editionDate(key) {
  const d = DAY_KEY.test(key) ? dayFromKey(key) : null;
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function categoryCounts(data) {
  const counts = Object.fromEntries(TAXONOMY.map((c) => [c, 0]));
  for (const story of editionStories(data)) {
    if (story && Object.prototype.hasOwnProperty.call(counts, story.category)) {
      counts[story.category] += 1;
    }
  }
  return counts;
}

function isEmptyCategory(category) {
  if (!state.data || category === "All") return false;
  return (categoryCounts(state.data)[category] || 0) === 0;
}

// Never leave a visitor on an empty category view (e.g. an old ?category= link).
function ensureNonEmptyCategory() {
  if (!isEmptyCategory(state.category)) return false;
  state.category = "All";
  state.visible = PAGE_SIZE;
  state.editionsShown = 1;
  state.archiveShown = 0;
  const url = new URL(window.location.href);
  url.searchParams.delete("category");
  history.replaceState({ category: "All" }, "", url);
  return true;
}

function renderFilters() {
  const nav = $("filters");
  nav.innerHTML = "";
  const counts = state.data ? categoryCounts(state.data) : null;
  for (const cat of ["All", ...TAXONOMY]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cat;
    btn.setAttribute("aria-pressed", cat === state.category ? "true" : "false");
    btn.dataset.category = cat;
    const empty = Boolean(counts) && cat !== "All" && counts[cat] === 0;
    if (empty) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.setAttribute("aria-label", `${cat}, no stories yet`);
      btn.title = "No stories yet";
      btn.dataset.empty = "true";
      // PM decision 15 Nov: tabs with no stories are hidden, not shown greyed.
      // Kept in the DOM (disabled) so old ?category= links still fall back to All.
      btn.hidden = true;
    } else {
      btn.addEventListener("click", () => setCategory(cat, true));
    }
    nav.appendChild(btn);
  }
}

function uniqueSources(story) {
  const names = [];
  for (const src of story.sources || []) {
    if (src.name && !names.includes(src.name)) names.push(src.name);
  }
  if (!names.length && story.sources?.[0]?.name) names.push(story.sources[0].name);
  return names;
}

function sourceLine(story) {
  const names = uniqueSources(story);
  const count = story.source_count || names.length || 1;
  if (count > 1) return `${count} sources`;
  return names[0] || "Unknown source";
}

function primarySourceName(story) {
  return uniqueSources(story)[0] || "source";
}

const FIGURE_DANGLING = new Set(("while nearly almost about around roughly approximately than and but or nor as " +
  "with of to in on for the a an which that who whom whose when where after before since because more less up " +
  "over under only just some all each by from into at so yet if though although whereas its their his her our " +
  "is are was were be been being has have had not very also even per among between").split(" "));

// Label opens on a bare verb with no subject ("£11m receive in new funding"):
// no figure line (25 Nov 2026, PM). Keep in sync with ingest.FIGURE_BARE_VERB_START.
const FIGURE_BARE_VERB_START = new Set(("receive get give help make take become provide allow enable see reach save protect keep bring build create join serve feed restore attract deliver improve reduce develop").split(" "));

function statedImpact(story) {
  const impact = story.impact;
  if (!impact || typeof impact !== "object") return null;
  const value = String(impact.value || "").trim();
  const label = String(impact.label || "").trim();
  if (!value || !label) return null;
  // Guard: never render an invented blank or a label that is just the value
  if (value.length > 24) return null;
  // Incomplete label (ends on a connective or hedge): no figure line (20 Nov 2026).
  const last = (label.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).pop() || "";
  if (FIGURE_DANGLING.has(last.toLowerCase())) return null;
  const first = (label.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || [""])[0];
  if (FIGURE_BARE_VERB_START.has(first.toLowerCase())) return null;
  return { value, label };
}

function imageSrcset(story, isLead) {
  // Optional renditions of the licensed image: [{ url, width }].
  const list = Array.isArray(story.image_url_srcset) ? story.image_url_srcset : [];
  const max = isLead ? IMG_LEAD_MAX : IMG_CARD_MAX;
  const seen = new Set();
  const parts = [];
  for (const entry of list) {
    const url = safeUrl(entry?.url);
    const width = Number(entry?.width);
    if (!url || !Number.isInteger(width) || width <= 0 || width > max || seen.has(width)) continue;
    seen.add(width);
    // Commas and spaces would split a srcset candidate.
    parts.push(`${url.replaceAll(",", "%2C").replaceAll(" ", "%20")} ${width}w`);
  }
  return parts.length >= 2 ? parts.join(", ") : "";
}

// Images: the lead, the rail and the second row get a 16:9 image; the river
// gets a small square thumbnail on roughly every other story (see layoutHtml).
// Licences we may show. No NC (non-commercial) or ND (no-derivatives) terms.
const LICENCE_OK = /^(cc0( 1\.0)?|public domain( mark)?( 1\.0)?|pdm( 1\.0)?|cc by( \d\.\d)?|cc by-sa( \d\.\d)?)$/i;

function text(value) {
  return String(value ?? "").trim();
}

// Contract with ingest: image_url, image_credit, image_licence, and ideally
// image_source_url (+ optional image_provider). Anything missing = no image.
// The old publisher `image` / `image_srcset` fields are ignored on purpose.
function licensedImage(story) {
  const raw = text(story?.image_url);
  const url = raw ? safeUrl(raw) : ""; // an empty string would resolve to the page URL
  const credit = text(story?.image_credit);
  const licence = text(story?.image_licence);
  if (!url || !credit || !LICENCE_OK.test(licence)) return null;
  const sourceRaw = text(story?.image_source_url);
  return {
    url,
    credit,
    licence,
    provider: text(story?.image_provider),
    sourceUrl: sourceRaw ? safeUrl(sourceRaw) : "",
  };
}

function imageUrl(story) {
  return licensedImage(story)?.url || "";
}

// "Illustrative photo: Author / Wikimedia Commons, CC BY-SA 4.0", linked to the source page.
function creditHtml(story) {
  const img = licensedImage(story);
  if (!img) return "";
  const who = escapeHtml(img.provider ? `${img.credit} / ${img.provider}` : img.credit);
  const body = `Illustrative photo: ${who}, ${escapeHtml(img.licence)}`;
  const inner = img.sourceUrl
    ? `<a href="${escapeHtml(img.sourceUrl)}" rel="noopener noreferrer">${body}</a>`
    : body;
  return `<p class="credit">${inner}</p>`;
}

function cardImage(story, isLead, sizes) {
  const src = imageUrl(story);
  if (!src) return "";
  const srcset = imageSrcset(story, isLead);
  const responsive = srcset
    ? ` srcset="${escapeHtml(srcset)}" sizes="${sizes || (isLead ? SIZES_LEAD : SIZES_CARD)}"`
    : "";
  return `<div class="thumb"><img class="thumb-img" src="${escapeHtml(
    src
  )}"${responsive} alt="" width="640" height="360" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>${creditHtml(story)}`;
}

// Reader-facing sentence written at ingest (why_good). Internal keyword
// lists (positivity_reason) are never shown on the card.
const WHY_FALLBACK = "It reports a concrete, positive outcome from the original source.";
function whyGood(story) {
  const text = String(story.why_good || "").trim();
  return text || WHY_FALLBACK;
}

// Same sentence after normalising case, whitespace and punctuation.
function sameSentence(a, b) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return norm(a) !== "" && norm(a) === norm(b);
}

function whyNoteHtml(story, reasonId) {
  if (!SHOW_WHY_ON_CARDS) return "";
  const text = String(story.why_good || "").trim();
  if (!text || sameSentence(text, story.summary)) return "";
  return `<p class="why-note" id="${reasonId}"><span class="visually-hidden">Why it's good: </span>${escapeHtml(text)}</p>`;
}

// The card's one destination: the publisher's own article (16 Nov 2026: the
// go.html middle page was removed). Absolute http(s) URLs only; otherwise the
// card has no link at all and the title stays plain text. Clicks on the site
// are not counted (the site runs no analytics); email clicks are counted by
// MailerLite's own click tracking.
function absoluteHttpUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    /* ignore invalid */
  }
  return "";
}

function storyHref(story) {
  return absoluteHttpUrl(story?.link) || absoluteHttpUrl(story?.sources?.[0]?.url);
}

// variant: "lead" | "rail" | "second" | "river". A boolean still works
// (true = lead) so older callers and tests keep their meaning.
function cardHtml(story, variant, opts = {}) {
  if (variant === true) variant = "lead";
  if (!variant) variant = "river";
  const isLead = variant === "lead";
  // Headline-only card (Council, 21 Nov 2026): no clean publisher sentence,
  // so no summary slot and no figure; topic, source, headline, Read at.
  const headlineOnly = !hasSentence(story);
  const impact = headlineOnly ? null : statedImpact(story);
  const sample = story.is_sample
    ? `<span class="pill-sample">Sample</span>`
    : "";
  // Forward-compatible: ingest may add a new_today boolean later. When the
  // field is absent, keep the existing small dot for stories published today.
  const hasNewFlag = typeof story.new_today === "boolean";
  const newTag = story.new_today === true ? `<li class="tag-new">New today</li>` : "";
  const newToday = !hasNewFlag && isToday(story.published_at)
    ? `<span class="new-dot" role="img" title="New today" aria-label="New today"></span>`
    : "";
  const wantsImage = opts.image ?? (variant !== "river");
  const showImage = SHOW_IMAGES && wantsImage && Boolean(imageUrl(story));
  const timeTitle = formatExact(story.published_at);
  const preview = storyHref(story);
  const href = preview ? `href="${escapeHtml(preview)}"` : "";
  const source = escapeHtml(primarySourceName(story));
  const reasonId = `reason-${escapeHtml(story.id)}`;
  // Fixed figure slot: always directly under the headline. With no stated
  // figure nothing is rendered, so there is no empty gap.
  const impactHtml = impact
    ? `<p class="impact figure-slot"><span class="impact-value">${escapeHtml(
        impact.value
      )}</span><span class="impact-label">${escapeHtml(impact.label)}</span></p>`
    : "";
  const leadClass = ` is-${variant}${isLead ? " lead" : ""}`;
  // Title and "Read at" share exactly the same href (and neither sets a
  // target or rel), so clicking either opens the source the same way.
  const headlineHtml = preview
    ? `<a class="title-link" ${href}>${escapeHtml(story.headline)}</a>`
    : escapeHtml(story.headline);
  const readHtml = preview
    ? `<a class="read" ${href}>Read at ${source}&nbsp;<svg class="read-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8M7 3l3 3-3 3"/></svg></a>`
    : "";
  const whyHtml = whyNoteHtml(story, reasonId);
  return `
    <article class="card${leadClass}" data-testid="story-card" data-category="${escapeHtml(
      story.category
    )}" data-sample="${
      story.is_sample ? "true" : "false"
    }" data-impact="${impact ? "true" : "false"}" data-headline-only="${headlineOnly ? "true" : "false"}" data-image="${
      showImage ? "true" : "false"
    }">
      ${showImage ? cardImage(story, isLead, variant === "river" ? SIZES_THUMB : variant === "rail" ? "(min-width: 1024px) 340px, (min-width: 720px) calc(100vw - 64px), 80px" : "") : ""}
      <ul class="meta">
        <li class="cat">${escapeHtml(story.category || "World")}${sample}</li>
        <li class="src">${escapeHtml(sourceLine(story))}</li>
        <li class="when">
          <time datetime="${escapeHtml(story.published_at || "")}" title="${escapeHtml(
            timeTitle
          )}">${escapeHtml(relativeTime(story.published_at))}</time>${newToday}
        </li>${newTag}
      </ul>
      <div class="body">
        <h4>${headlineHtml}</h4>
        ${impactHtml}
        ${headlineOnly ? "" : `<p class="summary">${escapeHtml(story.summary)}</p>`}
        ${whyHtml}
        <div class="card-foot">
          ${readHtml}
        </div>
      </div>
    </article>
  `;
}

// Front-page layout: lead + 2-story rail, a second row of 3, the mid-feed
// signup slot (after story SIGNUP_AFTER), then a dense river of the rest.
function hasSentence(story) {
  return String(story.summary || "").trim() !== "";
}

// Lead slot: the highest-ranked card that has a sentence; a headline-only card
// leads only when no card has one. The rest keep their order.
function leadFirst(stories) {
  // no_lead: one-off exclusion from data/lead-exclude.json (still shown, never lead).
  let i = stories.findIndex((s) => hasSentence(s) && !s.no_lead);
  if (i < 0) i = stories.findIndex(hasSentence);
  if (i <= 0) return stories;
  return [stories[i], ...stories.slice(0, i), ...stories.slice(i + 1)];
}

// Category sections: the lead's category first (so the lead stays at the
// top), then the fixed TAXONOMY order, then anything unknown A-Z.
function categorySections(stories) {
  const groups = new Map();
  for (const s of stories) {
    const cat = TAXONOMY.includes(s.category) ? s.category : String(s.category || "World");
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(s);
  }
  const first = stories.length ? (TAXONOMY.includes(stories[0].category) ? stories[0].category : String(stories[0].category || "World")) : null;
  const rest = [...groups.keys()].filter((c) => c !== first).sort((a, b) => {
    const ia = TAXONOMY.indexOf(a), ib = TAXONOMY.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
  return (first ? [first, ...rest] : rest).map((cat) => ({ cat, stories: groups.get(cat) }));
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// One edition: cards grouped under category headings (h3; card titles h4).
// opts.lead (default true): the top card with a sentence gets the lead style.
// opts.signup (default true): the one signup slot right after card
// SIGNUP_AFTER, or after the last card when there are fewer.
// opts.key: edition key, used for unique heading ids.
function layoutHtml(stories, opts = {}) {
  const withLead = opts.lead !== false;
  const withSignup = opts.signup !== false;
  const key = slug(opts.key || "latest") || "latest";
  if (withLead) stories = leadFirst(stories);
  const total = stories.length;
  const signupAt = withSignup && total ? Math.min(SIGNUP_AFTER, total) : -1;
  const slot = `<div class="signup-mid-slot" data-signup-slot="mid"></div>`;
  let seen = 0;
  const parts = [];
  for (const section of categorySections(stories)) {
    const id = `cat-${key}-${slug(section.cat)}`;
    const inner = [];
    let river = [];
    const flush = () => {
      if (river.length) inner.push(`<div class="river">${river.join("")}</div>`);
      river = [];
    };
    for (const s of section.stories) {
      seen += 1;
      if (withLead && seen === 1) {
        inner.push(`<div class="front solo">${cardHtml(s, "lead")}</div>`);
      } else {
        river.push(cardHtml(s, "river", { image: false }));
      }
      if (seen === signupAt) {
        flush();
        inner.push(slot);
      }
    }
    flush();
    parts.push(
      `<section class="cat-section" data-category="${escapeHtml(section.cat)}" aria-labelledby="${id}">` +
        `<h3 class="cat-heading" id="${id}">${escapeHtml(section.cat)}</h3>` +
        inner.join("") +
        `</section>`
    );
  }
  return parts.join("");
}

function editionSectionHtml(edition, index, count) {
  const key = slug(edition.key) || "latest";
  const id = `edition-${key}`;
  const name = editionName(edition.key);
  const date = editionDate(edition.key);
  const n = edition.stories.length;
  const label = `${name}${date && name !== "Today's edition" ? ` · ${date}` : ""}`;
  // The top edition's heading is for screen readers (the edition bar shows
  // it); older editions get a visible divider. tabindex lets Load more move
  // focus to the edition it added.
  const heading =
    index === 0
      ? `<h2 class="edition-heading visually-hidden" id="${id}">${escapeHtml(label)}</h2>`
      : `<h2 class="edition-heading" id="${id}" tabindex="-1">${escapeHtml(label)}<span class="edition-heading-count"> · ${n} ${n === 1 ? "story" : "stories"}</span></h2>`;
  return (
    `<section class="edition-block${index === 0 ? " is-latest" : " is-older"}" data-edition="${escapeHtml(edition.key)}" aria-labelledby="${id}">` +
    heading +
    layoutHtml(edition.stories, { lead: index === 0, signup: index === 0, key: edition.key }) +
    `</section>`
  );
}

// Editions for the current category view (editions with nothing in the
// chosen category are skipped).
function visibleEditions() {
  const all = buildEditions(state.data);
  if (state.category === "All") return all;
  return all
    .map((e) => ({ key: e.key, stories: e.stories.filter((s) => s.category === state.category) }))
    .filter((e) => e.stories.length);
}

// ---------- Archived editions ----------
// The feed says how many archived editions exist (data.archive), so Load more
// can show before the archive file is fetched. A sample feed has no archive.
function hasArchive(data = state.data) {
  return Boolean(data && !data.is_sample && data.archive && Number(data.archive.editions) > 0);
}

function archiveEditions() {
  const all = (state.archive?.editions || [])
    .filter((e) => e && DAY_KEY.test(String(e.key || "")) && Array.isArray(e.stories))
    .map((e) => ({ key: e.key, stories: e.stories.filter(Boolean).slice(0, EDITION_CAP) }))
    .filter((e) => e.stories.length);
  if (state.category === "All") return all;
  return all
    .map((e) => ({ key: e.key, stories: e.stories.filter((s) => s.category === state.category) }))
    .filter((e) => e.stories.length);
}

// More archive to show: unknown until fetched (then it is counted).
function archiveRemaining() {
  if (!hasArchive()) return false;
  if (!state.archive) return true;
  return state.archiveShown < archiveEditions().length;
}

function archiveHeadingId(key) {
  return `archive-${slug(key) || "edition"}`;
}

// "Edition · Sun 22 Nov · 3 stories". Facts only: no checked/passed wording.
function archiveSectionHtml(edition) {
  const id = archiveHeadingId(edition.key);
  const n = edition.stories.length;
  return (
    `<section class="edition-block is-older is-archive" data-edition="${escapeHtml(edition.key)}" data-archive="true" aria-labelledby="${id}">` +
    `<h2 class="edition-heading" id="${id}" tabindex="-1">Edition · ${escapeHtml(editionDate(edition.key))}<span class="edition-heading-count"> · ${n} ${n === 1 ? "story" : "stories"}</span></h2>` +
    layoutHtml(edition.stories, { lead: false, signup: false, key: `archive-${edition.key}` }) +
    `</section>`
  );
}

function archiveHtml() {
  if (!state.archiveShown) return "";
  const shown = archiveEditions().slice(0, state.archiveShown);
  if (!shown.length) return "";
  return (
    `<div class="archive-divider" id="archive-divider" data-testid="archive-divider" tabindex="-1"><h2 class="archive-divider-text">${ARCHIVE_DIVIDER}</h2></div>` +
    shown.map(archiveSectionHtml).join("")
  );
}

async function fetchArchive() {
  const res = await fetch(ARCHIVE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load archived editions");
  const data = await res.json();
  return data && Array.isArray(data.editions) ? data : { editions: [] };
}

function renderLoadMore(editions, shownCount) {
  const wrap = $("more-wrap");
  const btn = $("load-more");
  if (!wrap || !btn) return;
  const next = editions[shownCount];
  if (next) {
    wrap.hidden = false;
    const date = editionDate(next.key);
    const name = editionName(next.key);
    btn.textContent = `Load more · ${name}${date ? `, ${date}` : ""}`;
    return;
  }
  if (state.archiveError) {
    wrap.hidden = false;
    btn.textContent = "Load more · Earlier editions (try again)";
    return;
  }
  wrap.hidden = !archiveRemaining();
  if (wrap.hidden) return;
  const nextArchived = state.archive ? archiveEditions()[state.archiveShown] : null;
  btn.textContent = nextArchived
    ? `Load more · Edition, ${editionDate(nextArchived.key)}`
    : `Load more · ${ARCHIVE_DIVIDER}`;
}

async function loadMore() {
  const editions = visibleEditions();
  if (state.editionsShown < editions.length) {
    state.editionsShown += 1;
    const added = editions[state.editionsShown - 1];
    renderFeed();
    const heading = $(`edition-${slug(added.key) || "latest"}`);
    if (heading && typeof heading.focus === "function") heading.focus();
    return;
  }
  if (!archiveRemaining() && !state.archiveError) return;
  if (!state.archive) {
    try {
      state.archive = await fetchArchive();
      state.archiveError = false;
    } catch {
      state.archiveError = true;
      renderFeed();
      return;
    }
  }
  const archived = archiveEditions();
  if (state.archiveShown >= archived.length) {
    renderFeed();
    return;
  }
  state.archiveShown += 1;
  const added = archived[state.archiveShown - 1];
  renderFeed();
  const heading = $(archiveHeadingId(added.key));
  if (heading && typeof heading.focus === "function") heading.focus();
}

function visibleStories() {
  const all = state.data?.stories || [];
  if (state.category === "All") return all;
  return all.filter((s) => s.category === state.category);
}

function renderFeed() {
  const feed = $("feed");
  const empty = $("empty");
  const status = $("status");
  const banner = $("sample-banner");
  const data = state.data;
  if (!data) return;

  if (ensureNonEmptyCategory()) renderFilters();
  const editions = visibleEditions();
  state.editionsShown = Math.max(1, Math.min(state.editionsShown, editions.length || 1));
  const shownEditions = editions.slice(0, state.editionsShown);
  const archivedShown = state.archiveShown ? archiveEditions().slice(0, state.archiveShown) : [];
  const shownCount = shownEditions.reduce((n, e) => n + e.stories.length, 0) +
    archivedShown.reduce((n, e) => n + e.stories.length, 0);
  banner.hidden = !data.is_sample;

  if (!editions.length) {
    feed.innerHTML = "";
    empty.hidden = false;
    const cat = state.category === "All" ? "today" : state.category;
    empty.textContent =
      state.category === "All"
        ? "Nothing new in the feed yet today. Check back this afternoon."
        : `Nothing new in ${cat} yet today. Check back this afternoon.`;
    // With archived editions open, the note moves above them (same text).
    const older = archiveHtml();
    if (older) {
      feed.innerHTML = `<p class="empty empty-inline">${escapeHtml(empty.textContent)}</p>` + older;
      empty.hidden = true;
    }
  } else {
    empty.hidden = true;
    feed.innerHTML = shownEditions.map((e, i) => editionSectionHtml(e, i, editions.length)).join("") + archiveHtml();
  }
  renderEditionBar(data);
  renderLoadMore(editions, shownEditions.length);
  placeSignups(feed, shownCount > 0, shownEditions.length >= editions.length && !archiveRemaining());

  // Screen-reader status only; the visible count lives in the edition bar.
  status.textContent = `Showing ${shownCount} ${shownCount === 1 ? "story" : "stories"} · ${
    state.category === "All" ? "all categories" : state.category
  }`;
  bindThumbFallbacks(feed);
}

// "Today's edition · updated 3:30 PM", in the reader's own time zone.
// An older feed says "Latest edition" and keeps its date.
function editionLabel(iso) {
  if (!iso) return "Today's edition";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Today's edition";
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
  if (isToday(iso)) return `Today's edition · updated ${time}`;
  return `Latest edition · updated ${formatExact(iso)}`;
}

// D4 edition bar: "Today's edition · N stories · updated 8:55 AM GMT".
// Facts only. It never claims that stories were checked or passed: no such
// wording exists in this file's output (20 Nov 2026, PM / Roast Room).
// London time; the zone is "GMT" or "BST" for that date (25 Nov 2026, PM).
function siteParts(date) {
  const fmt = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: SITE_TZ, ...opts }).format(date);
  return {
    day: fmt({ year: "numeric", month: "2-digit", day: "2-digit" }),
    time: fmt({ hour: "numeric", minute: "2-digit" }),
    date: fmt({ weekday: "short", day: "numeric", month: "short" }),
    zone: siteZone(date),
  };
}

// "GMT" in winter, "BST" in summer, from the date itself.
function siteZone(date) {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: SITE_TZ, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  const z = part ? part.value : "";
  if (z === "GMT" || z === "BST") return z;
  // Engines without the BST abbreviation say "GMT+1".
  return /^(GMT|UTC)\+0?1(:00)?$/.test(z) ? "BST" : "GMT";
}

function latestEditionCount(data) {
  const first = buildEditions(data)[0];
  return first ? first.stories.length : 0;
}

// The top edition's name, count and the feed's update time, as parts:
// { head: "Today's edition · 3 stories · updated ", time: "8:55 AM GMT", tail: "" }.
function editionBarParts(data, now = new Date()) {
  const n = latestEditionCount(data);
  const count = `${n} ${n === 1 ? "story" : "stories"}`;
  const d = new Date(data && data.generated_at);
  if (!data || Number.isNaN(d.getTime())) return { head: `Latest edition · ${count}`, time: "", tail: "" };
  const latest = buildEditions(data)[0];
  // No stories: no edition to name, so never "Today's" (25 Nov 2026, PM).
  if (!latest) {
    const p = siteParts(d);
    const when = p.day === siteParts(now).day ? "" : `${p.date}, `;
    return { head: `Latest edition · ${count} · updated ${when}`, time: `${p.time} ${p.zone}`, tail: "" };
  }
  const key = latest.key;
  const name = editionName(key, now);
  const label = name === "Today's edition" ? name : `${name}${DAY_KEY.test(key) ? ` · ${editionDate(key)}` : ""}`;
  const p = siteParts(d);
  const when = p.day === siteParts(now).day ? "" : `${p.date}, `;
  return { head: `${label} · ${count} · updated ${when}`, time: `${p.time} ${p.zone}`, tail: "" };
}

// Plain text (screen readers, tests).
function editionBarText(data, now = new Date()) {
  const p = editionBarParts(data, now);
  return `${p.head}${p.time}${p.tail}`;
}

// The time and its zone sit in one no-wrap span, so "AM GMT" never breaks
// onto a line of its own. No copy change.
function editionBarHtml(data, now = new Date()) {
  const p = editionBarParts(data, now);
  const time = p.time ? `<span class="nowrap">${escapeHtml(p.time)}</span>` : "";
  return `${escapeHtml(p.head)}${time}${escapeHtml(p.tail)}`;
}

function editionNote(data) {
  const n = latestEditionCount(data);
  return n > 0 && n < SHORT_EDITION_UNDER ? SHORT_EDITION_NOTE : "";
}

function renderEditionBar(data) {
  const bar = $("edition-bar");
  const note = $("edition-note");
  if (bar) {
    if (data && data.is_sample) bar.textContent = "Sample feed, not live news.";
    else bar.innerHTML = editionBarHtml(data);
  }
  if (note) {
    const t = data && !data.is_sample ? editionNote(data) : "";
    note.textContent = t;
    note.hidden = !t;
  }
}

// Signup copies are built once from <template id="signup-template"> and moved
// into place after every render, so typed input and the confirmation message
// survive filter changes. Ids get a per-copy suffix and stay unique.
const signups = { mid: null };

function buildSignup(slot, suffix) {
  const tpl = $("signup-template");
  if (!tpl || typeof tpl.innerHTML !== "string" || !tpl.innerHTML.includes("__S__")) return null;
  if (typeof document.createElement !== "function") return null;
  const holder = document.createElement("div");
  holder.innerHTML = tpl.innerHTML.replaceAll("__S__", suffix).replaceAll("__SLOT__", slot).trim();
  return holder.firstElementChild || null;
}

function placeSignups(feed, hasStories, atEnd) {
  // One form only, id "signup-end" (the masthead and footer link to it).
  if (!signups.mid) signups.mid = buildSignup("end", "-end");
  const midSlot = feed.querySelector ? feed.querySelector('[data-signup-slot="mid"]') : null;
  if (signups.mid && midSlot && midSlot.replaceWith) midSlot.replaceWith(signups.mid);
  const end = $("feed-end");
  if (end) end.hidden = !hasStories;
  const note = $("feed-end-note");
  if (note) note.hidden = !(hasStories && atEnd);
}

function bindThumbFallbacks(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  root.querySelectorAll("img.thumb-img").forEach((img) => {
    // A missing or broken image is removed so the card falls back to its
    // text layout with no empty box.
    const fail = () => {
      const thumb = img.closest(".thumb");
      const card = img.closest(".card");
      if (thumb) thumb.classList.add("is-fallback");
      const credit = card && card.querySelector(".credit");
      if (credit) credit.remove();
      if (card) card.dataset.image = "false";
    };
    img.addEventListener("error", fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });
}

function setDateline() {
  const el = $("dateline");
  // Reader's local date (no fixed time zone).
  el.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

async function init() {
  setDateline();
  state.category = currentCategoryFromUrl();
  renderFilters();
  $("filters").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = [...$("filters").querySelectorAll("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % buttons.length
        : (index - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  const more = $("load-more");
  if (more && typeof more.addEventListener === "function") more.addEventListener("click", loadMore);
  try {
    const res = await fetch("data/stories.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load data/stories.json");
    state.data = await res.json();
    // The masthead keeps its static label; the count lives in the edition bar.
    if (state.data.is_sample) $("edition-label").textContent = "Sample feed, not live news.";
    ensureNonEmptyCategory();
    renderFilters();
    renderFeed();
  } catch (err) {
    $("status").textContent = "The feed is temporarily unavailable. Please try again soon.";
    $("empty").hidden = false;
    $("empty").textContent = "Stories could not be loaded just now.";
  }
}

window.addEventListener("popstate", () => {
  state.category = currentCategoryFromUrl();
  state.visible = PAGE_SIZE;
  state.editionsShown = 1;
  state.archiveShown = 0;
  ensureNonEmptyCategory();
  renderFilters();
  renderFeed();
});

init();
