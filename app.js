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

const PAGE_SIZE = 12;

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

function ymdInLondon(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
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
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(d) + " UK";
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return ymdInLondon(d) === ymdInLondon(new Date());
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

function renderFilters() {
  const nav = $("filters");
  nav.innerHTML = "";
  for (const cat of ["All", ...TAXONOMY]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cat;
    btn.setAttribute("aria-pressed", cat === state.category ? "true" : "false");
    btn.dataset.category = cat;
    btn.addEventListener("click", () => setCategory(cat, true));
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

function cardHtml(story, isLead) {
  const impact = statedImpact(story);
  const sample = story.is_sample
    ? `<span class="pill-sample">Sample</span>`
    : "";
  const newToday = isToday(story.published_at)
    ? `<span class="new-dot" title="New today" aria-label="New today"></span>`
    : "";
  const timeTitle = formatExact(story.published_at);
  const link = safeUrl(story.link);
  const href = link
    ? `href="${escapeHtml(link)}" rel="noopener noreferrer" target="_blank"`
    : "";
  const source = escapeHtml(primarySourceName(story));
  const reasonId = `reason-${escapeHtml(story.id)}`;
  const impactHtml = impact
    ? `<p class="impact"><span class="impact-value">${escapeHtml(
        impact.value
      )}</span><span class="impact-label">${escapeHtml(impact.label)}</span></p>`
    : "";
  const leadClass = isLead ? " lead" : "";
  const headlineHtml = link
    ? `<a ${href}>${escapeHtml(story.headline)}</a>`
    : escapeHtml(story.headline);
  const readHtml = link
    ? `<a class="read" ${href}>Read at ${source} <svg class="read-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8M7 3l3 3-3 3"/></svg></a>`
    : "";
  return `
    <article class="card${leadClass}" data-testid="story-card" data-category="${escapeHtml(
      story.category
    )}" data-score="${escapeHtml(story.positivity_score)}" data-sample="${
      story.is_sample ? "true" : "false"
    }" data-impact="${impact ? "true" : "false"}">
      <ul class="meta">
        <li class="cat">${escapeHtml(story.category || "World")}${sample}</li>
        <li>${escapeHtml(sourceLine(story))}</li>
        <li>
          <time datetime="${escapeHtml(story.published_at || "")}" title="${escapeHtml(
            timeTitle
          )}">${escapeHtml(relativeTime(story.published_at))}</time>${newToday}
        </li>
      </ul>
      <h2>${headlineHtml}</h2>
      ${impactHtml}
      <p class="summary">${escapeHtml(story.summary || "")}</p>
      <div class="card-foot">
        ${readHtml}
        <button type="button" class="why" aria-expanded="false" aria-controls="${reasonId}">Why it's good</button>
      </div>
      <p class="reason" id="${reasonId}" hidden>Score ${escapeHtml(
        story.positivity_score
      )}. ${escapeHtml(story.positivity_reason || "")}</p>
    </article>
  `;
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
    const parts = [];
    shown.forEach((story, index) => {
      parts.push(cardHtml(story, index === 0));
      if ((index + 1) % 6 === 0 && index !== shown.length - 1) {
        const label =
          state.category === "All"
            ? "That's the latest in today's feed"
            : `That's the latest in ${state.category}`;
        parts.push(`<p class="pace">${escapeHtml(label)}</p>`);
      }
    });
    feed.innerHTML = parts.join("");
    moreWrap.hidden = shown.length >= all.length;
  }

  const when = data.generated_at ? formatExact(data.generated_at) : "";
  const kind = data.is_sample ? "sample feed" : "live ingest";
  const filter = state.category === "All" ? "all categories" : state.category;
  status.textContent = `${all.length} ${
    all.length === 1 ? "story" : "stories"
  } · ${filter} · ${kind}${when ? " · updated " + when : ""}`;
}

function setDateline() {
  const el = $("dateline");
  el.textContent = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
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
  $("feed").addEventListener("click", (event) => {
    const btn = event.target.closest(".why");
    if (!btn) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    if (panel) panel.hidden = open;
  });
  $("filters").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = [...$("filters").querySelectorAll("button")];
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
    $("edition-label").textContent = state.data.is_sample
      ? "Local prototype. Sample data."
      : "Local prototype. Live RSS ingest.";
    renderFeed();
  } catch (err) {
    $("status").textContent =
      "The feed file is missing. Run python3 ingest.py, then serve this folder.";
    $("empty").hidden = false;
    $("empty").textContent = String(err.message || err);
  }
}

window.addEventListener("popstate", () => {
  state.category = currentCategoryFromUrl();
  state.visible = PAGE_SIZE;
  renderFilters();
  renderFeed();
});

init();
