# The Upside — plan

A local, good-news-only news site. Ground News is a **structure and feature benchmark only**. This project does not copy Ground News branding, text, logo, design assets, or name.

Observed on Ground News public pages on 13 Nov 2026 (not guessed):

- **Homepage feed** ([ground.news](https://ground.news/)): a list of story headlines, some with images and dates (e.g. “Nov 13, 2026”). The page also showed an aggregate line in the form “8 stories • 583 articles • 8m read”.
- **Story clustering and source count**: the FAQ states that Ground News “identifies every news articles written about a recent event.” The [media-bias page](https://ground.news/media-bias) says it processes “over 30,000 news articles each day” and that “Articles from different news outlets covering the same news event are merged into a single story.” Cards on the homepage showed a source count next to a bias split, e.g. “46% Center coverage: 211 sources” and “47% Center coverage: 298 sources.”
- **Bias and source metadata** (not copied here): reporting is categorised by political bias, factuality, ownership, geographic location, and chronology; a “Ground Summary” highlights key points from left, right, and center ([FAQ](https://ground.news/frequently-asked-questions)). Bias/factuality ratings are averaged from AllSides, Ad Fontes Media, and Media Bias Fact Check. Seven bias labels are listed on the media-bias page.
- **Feeds and navigation**: the FAQ describes a **Top Stories** tab (the same for every user of an edition — International or US) and a personalised **My Feed**. Public nav and related pages also showed **Search**, **Local** (`/local`), **Blindspot** (`/blindspot`, described on the homepage as “Stories disproportionately covered by one side of the political spectrum”), **Discover**, **Custom Feeds**, **Saved Stories**, and **Citations**. Regional links included International, North America, South America, Europe, Asia, Australia, and Africa.
- **Topics, not a fixed category bar**: help docs describe followable “topics or interests” (topics, locations, sources) via Discover or search, which then populate My Feed ([help article](https://help.ground.news/en/articles/950017)). Public interest pages exist (for example `/interest/tech`, `/interest/us-politics_3c3c3c`, `/interest/music`). Trending interest chips visible on My Feed included Artificial Intelligence, Basketball, Stock Markets, and others. A single homepage strip of standard news categories (Business, Politics, etc.) was **not** observed; that taxonomy below is ours.
- **Publisher stance**: the FAQ says Ground News is not a news publisher, does not editorialize, and links out to original articles. It cites “over 50,000” publications plus some trending social media / blogs.

We borrow only the *ideas* of a clustered story feed, a visible source count, topic/category filtering, and cards that link out. We do not implement bias meters, Blindspot, My News Bias, or anything that resembles their branding.

## Site structure

Local static site, one folder, no public deploy.

| Page / view | Role |
| --- | --- |
| `index.html` — Home feed | Default “All” good-news feed, newest first. Story cards. |
| Category filter | Same page; chips for the taxonomy below (plus All). Deep-link: `?category=Science`. |
| Story card | Headline, short summary, source name(s), source count, relative time, category, positivity score and reason, link to the original article. Clustered stories list each source. |
| Method / about (on the same page) | How stories are sourced and filtered; reminder that we show headline + short summary + link only. |
| (Later, not in this prototype) | Per-story cluster page, search, a local/community edition, saved stories, a human-review queue UI. |

## Sourcing

- Ingest **official public RSS/Atom feeds** only, from reputable general outlets and dedicated solutions / good-news outlets. No scraping of article bodies, no paywalled text, no social-media firehoses in v1.
- Respect terms: store and display **headline, short summary/snippet, source name, timestamp, and a link to the original**. Do **not** republish full text.
- Polite `User-Agent`, timeouts, and a short pause between feed requests.
- Current feed list (all tried; Positive News has returned HTTP 403 and is skipped when it does):
  - Dedicated: [Good News Network](https://www.goodnewsnetwork.org/feed/), [Reasons to be Cheerful](https://reasonstobecheerful.world/feed/), [Fix the News](https://fixthenews.com/feed), and [Positive News](https://www.positive.news/feed/) when allowed.
  - General / science: BBC News, BBC Science & Environment, BBC Health; NPR News, NPR Science; NASA news releases; The Guardian Science and Environment; Smithsonian Science & Nature; The Conversation (UK); PBS NewsHour headlines.
  - Desk feeds (added so Business, Politics and Sports can fill from official public RSS, still free): BBC Business, Politics and Sport; The Guardian Business, Politics and Sport; NPR Business.
- If every live fetch fails, the site loads `data/sample-stories.json` and labels the feed **Sample**.

## “Good news” filter

A story must clear all four stages. The prototype uses **rules + a transparent lexicon score** (no paid model). An optional later LLM pass is listed under cost and needs Olivier’s yes.

1. **Hard exclude (event is the harm).** Drop crime, violence, war/conflict-as-event, terrorism, disasters-as-event, fatal accidents, abuse, outbreaks-as-event, and scandal/corruption-as-event. This is phrase-based, not a single dirty word: “homicide rate falls” or “peace deal ends the war” can still pass via **improvement-framing exceptions**. Mixed or unclear cases go to review, not the public feed.

2. **Positive-outcome score (0–100) and threshold.** Start from a base (slightly higher if the item comes from a dedicated solutions outlet). Add points for concrete outcomes (restored habitat, treatment approved, poverty/emissions/deaths *down*, school opened, ceasefire reached, species rebound, and similar). Subtract for risk, fear, unresolved crisis language, and **toxic positivity / fluff** (“melt your heart”, “you won’t believe”, pure clickbait, vague inspiration with no fact).  
   - **Accept** if score ≥ 56, there is a concrete outcome cue (not just a solutions-source bonus), and no hard exclude. Soft teasers, podcast notes, question headlines without an outcome, and roundups are never auto-accepted.  
   - **Needs review** if score is 48–55, or an exception fired on a grim topic, or the score is high but the item is soft or lacks a concrete cue: recorded in the ingest log and `data/review-queue.json`, **not** shown on the public feed until a human accepts it.  
   - **Reject** below 48, and reject hard-exclude harm-as-event items even if the summary also opens grim.  
   Each accepted card shows the numeric score and a short plain-English reason (e.g. “Conservation milestone; solutions-focused source”).

3. **Avoid fluff and false comfort.** A “good” story should describe a verifiable outcome or genuine progress, not a vibe. Celebrity gossip, listicles, and empty uplift are penalised or dropped even if the tone is cheerful.

4. **Dedupe and cluster.** Titles are normalised (lowercase, punctuation stripped, stopwords removed, light stemming so “doubles/doubled” match). Items merge when token Jaccard ≥ 0.34, or when at least three tokens overlap with overlap-coefficient ≥ 0.70, provided at least two shared stems are content words; near-identical openings also merge. The card then shows a **source count**, each source name, and one primary outbound link. This is title-overlap clustering only — much weaker than a production event-clusterer.

Category is assigned with keyword rules plus a hint from the feed (e.g. NASA → Science).

## Category taxonomy

Standard news desk labels, used as filters (ours, not a Ground News copy):

- Business
- Politics
- World
- Science
- Tech
- Health
- Environment
- Sports
- Culture
- Community (covers local / community)

## Tech stack

**Now (zero spend, local only):**

- A scheduled-friendly **Python 3 ingest** (`ingest.py`, standard library only) that writes `data/stories.json`.
- A **static front end** (`index.html`, `styles.css`, `app.js`) that reads the JSON file. Serve the folder with `python3 -m http.server`.
- No accounts, domains, APIs, or public hosting.

**Later, only with Olivier’s yes (cost flags):**

- A custom domain and any paid DNS or email.
- Public hosting beyond a free static tier (Cloudflare Pages / GitHub Pages / Netlify free tiers may be enough at first; bandwidth or a build runner could eventually cost money).
- A paid LLM or sentiment API to replace or sit on top of the lexicon score.
- Any paid news wire, Ground News-like firehose, or commercial RSS aggregator.
- Analytics, error monitoring, or email/push notification services.

A reasonable next architecture, still cheap if kept on a free tier: keep the static front end, run `ingest.py` on a schedule (GitHub Actions or a cron job on a machine already paid for), and add a thin review checklist before publish. Scale like Ground News (tens of thousands of articles a day, bias data, personalised feeds) would need substantial infrastructure and licensing — not in scope, and not something to stand up without a separate decision.
