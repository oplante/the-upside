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

// The whole edition renders at once so the page reaches its ending;
// "Load more" only appears if a day ever runs past this.
const PAGE_SIZE = 40;

// Publisher images are off by default (no hotlinking; rights-safe text cards).
// Images are shown only when a story carries a free-licence image with a
// credit (see licensedImage). Publisher photos (`image`) are never shown.
// Set to false to make every card text-only.
const SHOW_IMAGES = true;

// The email signup appears after this many cards, and once more at the end.
const SIGNUP_AFTER = 6;

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
};

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
  state.visible = PAGE_SIZE;
  if (push) {
    const url = new URL(window.location.href);
    if (category === "All") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    history.pushState({ category }, "", url);
  }
  renderFilters();
  renderFeed();
}

function categoryCounts(data) {
  const counts = Object.fromEntries(TAXONOMY.map((c) => [c, 0]));
  for (const story of data?.stories || []) {
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

function statedImpact(story) {
  const impact = story.impact;
  if (!impact || typeof impact !== "object") return null;
  const value = String(impact.value || "").trim();
  const label = String(impact.label || "").trim();
  if (!value || !label) return null;
  // Guard: never render an invented blank or a label that is just the value
  if (value.length > 24) return null;
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

function previewHref(story) {
  const id = String(story?.id ?? "").trim();
  if (!id) return "";
  return `go.html?id=${encodeURIComponent(id)}`;
}

// variant: "lead" | "rail" | "second" | "river". A boolean still works
// (true = lead) so older callers and tests keep their meaning.
function cardHtml(story, variant, opts = {}) {
  if (variant === true) variant = "lead";
  if (!variant) variant = "river";
  const isLead = variant === "lead";
  const impact = statedImpact(story);
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
  const preview = previewHref(story);
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
  const headlineHtml = preview
    ? `<a ${href}>${escapeHtml(story.headline)}</a>`
    : escapeHtml(story.headline);
  const readHtml = preview
    ? `<a class="read" ${href}>Read at ${source}&nbsp;<svg class="read-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8M7 3l3 3-3 3"/></svg></a>`
    : "";
  const reason = escapeHtml(whyGood(story));
  return `
    <article class="card${leadClass}" data-testid="story-card" data-category="${escapeHtml(
      story.category
    )}" data-sample="${
      story.is_sample ? "true" : "false"
    }" data-impact="${impact ? "true" : "false"}" data-image="${
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
        <h2>${headlineHtml}</h2>
        ${impactHtml}
        <p class="summary">${escapeHtml(story.summary || "")}</p>
        <p class="why-note" id="${reasonId}"><span class="visually-hidden">Why it's good: </span>${reason}</p>
        <div class="card-foot">
          ${readHtml}
        </div>
      </div>
    </article>
  `;
}

// Front-page layout: lead + 2-story rail, a second row of 3, the mid-feed
// signup slot (after story SIGNUP_AFTER), then a dense river of the rest.
function layoutHtml(stories) {
  const lead = stories.slice(0, 1);
  const rail = stories.slice(1, 3);
  const second = stories.slice(3, SIGNUP_AFTER);
  const river = stories.slice(SIGNUP_AFTER);
  const parts = [];
  parts.push(
    `<div class="front${rail.length ? "" : " solo"}">` +
      lead.map((s) => cardHtml(s, "lead")).join("") +
      (rail.length ? `<div class="rail">${rail.map((s) => cardHtml(s, "rail")).join("")}</div>` : "") +
      `</div>`
  );
  if (second.length) {
    parts.push(
      `<div class="second count-${second.length}">${second.map((s) => cardHtml(s, "second")).join("")}</div>`
    );
  }
  if (river.length) {
    parts.push(`<div class="signup-mid-slot" data-signup-slot="mid"></div>`);
    // Thumbnail on every other river story that has an image.
    let previousHadImage = false;
    const riverHtml = river.map((s) => {
      const image = !previousHadImage && Boolean(imageUrl(s));
      previousHadImage = image;
      return cardHtml(s, "river", { image });
    });
    parts.push(`<div class="river">${riverHtml.join("")}</div>`);
  }
  return parts.join("");
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
  const moreWrap = $("more-wrap");
  const data = state.data;
  if (!data) return;

  if (ensureNonEmptyCategory()) renderFilters();
  const all = visibleStories();
  const shown = all.slice(0, state.visible);
  banner.hidden = !data.is_sample;

  if (!all.length) {
    feed.innerHTML = "";
    empty.hidden = false;
    const cat = state.category === "All" ? "today" : state.category;
    empty.textContent =
      state.category === "All"
        ? "Nothing new in the feed yet today. Check back this afternoon."
        : `Nothing new in ${cat} yet today. Check back this afternoon.`;
    moreWrap.hidden = true;
  } else {
    empty.hidden = true;
    // No more "That's the latest" dividers: the layout sections pace the page.
    feed.innerHTML = layoutHtml(shown);
    moreWrap.hidden = shown.length >= all.length;
  }
  placeSignups(feed, all.length > 0, shown.length >= all.length);

  status.textContent = `${editionLabel(data.generated_at)} · ${all.length} ${
    all.length === 1 ? "story" : "stories"
  } · ${state.category === "All" ? "all categories" : state.category}`;
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

// Signup copies are built once from <template id="signup-template"> and moved
// into place after every render, so typed input and the confirmation message
// survive filter changes. Ids get a per-copy suffix and stay unique.
const signups = { mid: null, end: null };

function buildSignup(slot, suffix) {
  const tpl = $("signup-template");
  if (!tpl || typeof tpl.innerHTML !== "string" || !tpl.innerHTML.includes("__S__")) return null;
  if (typeof document.createElement !== "function") return null;
  const holder = document.createElement("div");
  holder.innerHTML = tpl.innerHTML.replaceAll("__S__", suffix).replaceAll("__SLOT__", slot).trim();
  return holder.firstElementChild || null;
}

function placeSignups(feed, hasStories, atEnd) {
  if (!signups.mid) signups.mid = buildSignup("mid", "");
  if (!signups.end) signups.end = buildSignup("end", "-end");
  const midSlot = feed.querySelector ? feed.querySelector('[data-signup-slot="mid"]') : null;
  if (signups.mid && midSlot && midSlot.replaceWith) midSlot.replaceWith(signups.mid);
  const end = $("feed-end");
  const endSlot = $("signup-end-slot");
  if (end) end.hidden = !hasStories;
  if (signups.end && endSlot && endSlot.appendChild && signups.end.parentNode !== endSlot) {
    endSlot.appendChild(signups.end);
  }
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
  $("load-more").addEventListener("click", () => {
    state.visible += PAGE_SIZE;
    renderFeed();
  });
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
  try {
    const res = await fetch("data/stories.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load data/stories.json");
    state.data = await res.json();
    const total = (state.data.stories || []).length;
    $("edition-label").textContent = state.data.is_sample
      ? "Sample feed, not live news."
      : editionLabel(state.data.generated_at).replace(
          " · ",
          ` · ${total} ${total === 1 ? "story" : "stories"} · `
        );
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
  ensureNonEmptyCategory();
  renderFilters();
  renderFeed();
});

init();
