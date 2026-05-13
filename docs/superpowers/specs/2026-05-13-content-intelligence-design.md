# Content Intelligence Design

Date: 2026-05-13
Status: Draft for user review
Project: Social-Media-Manager-AI-Tool / SwiftFlow

## Goal

Build SwiftFlow's content intelligence system: an evidence-backed strategist inside the post creator, calendar, and analytics pages that helps users create stronger posts, choose better posting times, discover relevant topics, and understand what is helping their account grow.

This is not a generic AI caption helper. Recommendations must be grounded in the best available evidence:

1. Connected Meta/account data.
2. The user's historical posts and analytics.
3. Grounded web/search/trend research.
4. Provider-neutral AI synthesis.

SwiftFlow should never recommend a hashtag, topic, or posting time without showing why, confidence, and the source tier used.

## Competitive Research Summary

The strongest competing products combine multiple signal classes rather than relying on plain LLM output.

- Sprout Social's Optimal Send Times and ViralPost position best-time recommendations as account-specific AI/ML based on audience engagement patterns and publishing history. Their public benchmark research is directional, but they still recommend users test against their own profiles. Source: https://sproutsocial.com/insights/best-times-to-post-on-social-media/
- Metricool displays best posting times as heatmaps. For Instagram, it prefers data from Meta's API when the account is connected through Facebook; otherwise it falls back to broader behavioral studies. It also exposes platform requirements such as minimum audience thresholds. Source: https://help.metricool.com/en/article/hj3rgj/
- Hootsuite's OwlyWriter/OwlyGPT combines AI writing, hashtag generation, analytics, scheduling recommendations, social listening, and current trend discovery. Source: https://www.hootsuite.com/platform/owly-writer-ai
- Buffer's AI Assistant focuses on idea generation, repurposing, platform-aware rewriting, and practical creator workflows. Buffer also publishes benchmark data from large post datasets. Sources: https://buffer.com/ai-assistant/ and https://buffer.com/resources/buffer-data/
- Later supports saved captions/hashtag groups and notes that Instagram currently limits/recommends far fewer hashtags than older playbooks. Source: https://help.later.com/hc/en-us/articles/360043245093-Using-Saved-Captions-Hashtags

SwiftFlow's advantage should be clarity and trust: use the user's real account data where available, show evidence, keep provider choice open, and make recommendations actionable inside the existing creation workflow.

## Product Principles

1. Evidence first.
   Every recommendation includes source type, freshness, confidence, and a plain-language reason.

2. Provider neutral.
   Users can bring OpenRouter, Gemini, OpenAI, or another supported provider. The UI can recommend OpenRouter because it gives broad model choice and web-search tooling, but the architecture must not depend on one vendor.

3. Meta data before public guessing.
   If Meta permissions and synced analytics can answer a question, use that before web research or benchmark fallback.

4. Clear fallback states.
   If account-specific data is weak, say so. Example: "Limited account history, using industry benchmark + research fallback."

5. Human-in-control.
   First release should be advisory. It suggests, explains, and offers apply buttons. It should not auto-schedule or auto-publish without explicit user action.

6. Subscription aware.
   Free users should get lightweight scoring and limited internal-history insights. Paid tiers unlock deeper research, higher cache limits, trend-provider calls, and richer analytics explanations.

## User-Facing Experience

### Post Creator

Add a compact Content Intelligence panel to the existing create-post modal.

Desktop layout:

- Main composer remains the primary workspace.
- Intelligence panel appears on the right or below the composer depending on available modal width.
- Panel sections:
  - Post Strength score.
  - Top fixes.
  - Recommended hashtags.
  - Best time suggestions.
  - Content angle / hook suggestions.
  - Evidence drawer.

Mobile layout:

- Keep the modal usable and uncluttered.
- Show a compact score row first: score, confidence, and top issue.
- Use collapsible sections for hashtags, best time, and research evidence.
- No dense charts in the mobile composer.

Expected controls:

- `Analyze` button when content changes enough to justify a new call.
- `Apply` buttons for hashtags, hook rewrites, and scheduled time.
- `Refresh research` button, gated by tier/rate limits.
- Clear disabled states when provider keys, permissions, or subscription tier are insufficient.

### Calendar

Add recommended-time visibility without turning the calendar into a noisy dashboard.

- Calendar month view keeps scheduled posts as-is.
- Add optional heatmap overlay for recommended posting windows.
- Clicking a recommended slot opens Create Post with that date/time prefilled.
- Existing drag/drop rescheduling should display whether the new slot is strong, okay, or weak.

### Analytics

Add an intelligence section that explains performance patterns.

Sections:

- What is working:
  - best-performing topics
  - caption traits
  - hashtag patterns
  - posting windows
  - format/media patterns

- What to try next:
  - trend-backed content ideas
  - experiments to run
  - content gaps based on brand profile and historical content

- Evidence:
  - top posts used
  - metrics used
  - research sources
  - confidence/fallback state

## Architecture

Create a shared Content Intelligence domain instead of adding one-off AI calls to individual components.

Proposed module boundaries:

- `lib/content-intelligence/types.ts`
  Shared request/response types, source/evidence types, score categories, confidence values, provider metadata.

- `lib/content-intelligence/internal-signals.ts`
  Reads and normalizes local account/post/analytics data into model-free signal objects.

- `lib/content-intelligence/meta-signals.ts`
  Maps existing Meta-derived data and capabilities into content intelligence signals. It should use already-synced tables first and only call live Meta APIs in later phases if needed.

- `lib/content-intelligence/research-providers/*`
  Provider adapters for web/trend research. All adapters return a common `ResearchFinding[]`.

- `lib/content-intelligence/ai-providers/*`
  Provider-neutral structured generation adapter. Existing workspace AI settings should choose model/provider.

- `lib/content-intelligence/scoring.ts`
  Deterministic scoring where possible. AI can explain and enrich scores but should not be the only judge.

- `lib/content-intelligence/recommendations.ts`
  Combines internal signals, research findings, and scoring into final suggestions.

- `app/api/content-intelligence/analyze-post/route.ts`
  Main API for post creator analysis.

- `app/api/content-intelligence/recommend-slots/route.ts`
  Replaces the current simple `/api/recommend-next-slot` logic.

- `app/api/content-intelligence/analytics-insights/route.ts`
  Provides the analytics-page "what is working / what to try next" payload.

The existing `/api/ai/generate-caption`, `/api/ai/generate-ideas`, and Supabase Edge functions should not be deleted in the first pass. The new system should reuse or wrap them where useful, then gradually move shared logic into the new domain.

## Data Source Priority

### Tier 1: Meta and Synced Account Data

Use currently approved/granted capabilities where available:

- `instagram_manage_insights`
  Instagram account/post insights, follower counts, reach, saves, views, and related metrics where synced.

- `pages_read_engagement`
  Facebook Page content reads, Page counts, native Page posts, and engagement reads where available.

- `instagram_basic`
  Linked Instagram account and media metadata.

- `instagram_content_publish` and `pages_manage_posts`
  Publishing capability and schedule/publish context.

- `instagram_manage_comments`, `instagram_manage_messages`, `pages_messaging`, and Facebook comment capabilities
  Later-phase audience mining from real comments, FAQs, objections, and inbound message themes, only where explicitly granted and policy-safe.

The current app already has capability derivation in `lib/meta-account.ts` and `_shared/meta-account.ts`. The intelligence engine should consume those derived capabilities rather than duplicating scope logic.

### Tier 2: Internal Analytics

Use local tables already populated by sync flows:

- `posts`
- `published_posts`
- `post_analytics`
- `account_analytics`
- `social_accounts`
- `workspace_brand_profiles`

Initial computed signals:

- Best historical posting windows by platform.
- Top posts by engagement, views, comments, shares, saves, and reach where available.
- Caption length bands that performed well.
- Hashtag count and hashtag families that correlate with better outcomes.
- Topic/content-theme clusters from captions.
- Media presence/type where available.
- Recent growth or decline periods.

### Tier 3: Grounded Research

Use web/search research for current trends, topical freshness, content ideas, and public benchmark context.

Provider adapters should include:

- OpenRouter `openrouter:web_search` server tool as the recommended path.
- Gemini grounded Google Search as an existing fallback path.
- OpenAI web search as an optional direct provider.
- External search/trend providers in Phase 4 after legal, cost, and data-quality review.

Provider docs:

- OpenRouter web search server tool: https://openrouter.ai/docs/guides/features/server-tools/web-search
- OpenRouter web-search plugin notes and deprecation path: https://openrouter.ai/docs/guides/features/plugins/web-search
- OpenAI web search: https://platform.openai.com/docs/guides/tools-web-search
- Gemini grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search

### Tier 4: Benchmarks and External Trend Providers

Optional integrations:

- DataForSEO or SerpApi for Google Trends-style keyword demand.
- Google Trends official API alpha when accessible.
- Social intelligence APIs such as NIXUS, SociaVault, EnsembleData, or similar providers after legal/cost review.
- `pytrends` only as an experimental/local option, not as a production backbone, because it is unofficial and fragile.

## Recommendation Evidence Model

Every recommendation should include evidence objects.

```ts
type EvidenceSourceType =
  | "meta_insights"
  | "internal_analytics"
  | "brand_profile"
  | "grounded_web"
  | "trend_provider"
  | "benchmark"
  | "ai_inference"
  | "fallback";

type IntelligenceEvidence = {
  sourceType: EvidenceSourceType;
  provider?: "openrouter" | "gemini" | "openai" | "meta" | "dataforseo" | "serpapi" | "internal";
  title: string;
  url?: string;
  observedAt: string;
  freshness: "live" | "last_24h" | "last_7d" | "last_30d" | "historical" | "unknown";
  confidence: "high" | "medium" | "low";
  summary: string;
  metricBasis?: {
    metric: string;
    value: number | string;
    sampleSize?: number;
  };
};
```

AI-only claims are not enough for high-confidence recommendations. If an output is mostly AI inference, confidence should be medium or low unless supported by internal metrics or grounded sources.

## Post Strength Score

The score is a 0-100 value with sub-scores. It should be explainable and stable.

Initial sub-scores:

- Hook strength: first sentence clarity, specificity, scroll-stopping quality.
- Brand fit: alignment with brand voice, services, target audience, language, content themes.
- Platform fit: caption length, format expectations, selected platform constraints.
- Hashtag quality: relevance, count, specificity, risk/spam filtering.
- Timing confidence: selected time compared to historical and benchmark windows.
- Trend relevance: match to fresh research or known current topics.
- Performance similarity: similarity to past posts that performed well.
- Completeness: media present where needed, CTA clarity, no obvious publishing blockers.

Score bands:

- 85-100: Strong
- 70-84: Good
- 50-69: Needs work
- 0-49: Weak

The UI should show the top 3 fixes, not every sub-score by default.

## Best Time Logic

The current `/api/recommend-next-slot` returns the next hour and should be replaced.

Algorithm hierarchy:

1. If Meta audience activity data is available and synced, use it as strongest signal.
2. If enough published-post history exists, compute account-specific engagement by day/hour/platform.
3. If limited history exists, combine sparse account data with platform benchmark research.
4. If no account data exists, use benchmark/research fallback and mark confidence low.

Output should include multiple slots, not one:

```ts
type RecommendedSlot = {
  startsAt: string;
  platform: "instagram" | "facebook" | "all";
  score: number;
  confidence: "high" | "medium" | "low";
  reason: string;
  evidence: IntelligenceEvidence[];
};
```

The calendar should render these as a heatmap. The post creator should show the top 2-3 slots with apply buttons.

## Hashtag Logic

Hashtags should be generated from:

- Caption/topic extraction.
- Brand profile themes and services.
- Historical hashtag performance when available.
- Grounded trend/search research.
- Platform policy and UX constraints.

Rules:

- Default to up to 5 Instagram hashtags unless a later platform policy decision changes this.
- Prefer relevance over volume.
- Avoid spammy, banned, unrelated, or overly generic tags.
- Group tags by purpose:
  - niche
  - audience
  - topic
  - brand
  - trend
- Show why each tag was suggested.

## Content Ideas Logic

Content ideas should be generated from:

- Brand profile.
- Existing high-performing posts.
- Underused brand themes.
- Current research/trends.
- Audience comments/messages in Phase 5, only where permissions and policy allow.

Each idea should include:

- title/hook
- platform fit
- suggested format
- why it fits the brand
- evidence
- confidence
- optional caption outline

The first implementation can include ideas inside the Intelligence panel or Analytics page, but it should not overwhelm the composer. If scope needs reduction, ship post scoring/time/hashtags first and add full trend idea generation in the next milestone.

## Provider Strategy

### AI Provider Choice

Use existing workspace AI settings. UI copy should recommend OpenRouter for flexibility, but not require it.

Provider behavior:

- OpenRouter: recommended default for users who want broad model choice and web-search server tools.
- Gemini: supported, including grounded search where configured.
- OpenAI: supported, including direct web search where configured.
- Other providers: supported only if they can satisfy the structured-output adapter contract.

### Research Provider Choice

The research adapter should choose a provider through this order:

1. Workspace-selected research provider, if configured.
2. OpenRouter web search, if OpenRouter key/settings are present.
3. Gemini grounded search, if Gemini key/settings are present.
4. OpenAI web search, if OpenAI key/settings are present.
5. Cached prior research.
6. Internal analytics + benchmark fallback with low confidence.

## Caching and Cost Control

Research must not run on every keystroke.

Cache keys:

- workspace id
- platform
- normalized topic cluster
- brand profile version/update timestamp
- research provider
- locale/language
- time bucket

Suggested TTLs:

- live trend research: 6-24 hours depending on tier
- benchmark research: 30-90 days
- internal analytics summaries: refresh after analytics sync or daily
- post draft analysis: cache per draft/content hash for a short period

Subscription controls:

- Free:
  - local post strength
  - basic brand fit
  - limited hashtag suggestions
  - internal best-time if analytics exists
  - low research quota or no live deep research

- Pro:
  - grounded web research
  - trend-backed ideas
  - richer evidence drawer
  - calendar heatmap
  - higher refresh limits

- Team/Agency:
  - deeper analytics insights
  - multi-account comparisons
  - external trend provider integrations
  - saved intelligence reports
  - audience comment/message mining where permitted

## Data Persistence

Add storage for reusable research and analysis results, but avoid over-collecting sensitive data.

Candidate tables:

- `content_intelligence_research_cache`
  Stores normalized research findings, sources, provider metadata, workspace, platform, topic hash, locale, and TTL.

- `content_intelligence_post_scores`
  Stores score snapshots for drafts/scheduled posts so the UI can show prior analysis without recomputing.

- `content_intelligence_insight_runs`
  Stores analytics-page insight summaries, source ranges, and evidence metadata.

Do not store raw external pages or unnecessary personal data. Store source URLs, summaries, timestamps, and provider metadata.

## Privacy and Policy

- Use official Meta APIs and already granted capabilities.
- Do not scrape private profiles or claim access to data Meta does not provide.
- Do not use comments/messages for trend mining unless the workspace has the needed permission, user intent is clear, and the use is within the approved product purpose.
- Keep citations visible when grounded web search affects recommendations.
- Make fallback states explicit so users understand when advice is based on benchmarks instead of their account.

## Error and Empty-State Behavior

Common states:

- No AI provider configured:
  Show local/internal analysis only. Prompt user to configure AI provider, recommending OpenRouter as flexible option.

- Provider key invalid:
  Keep internal scoring available. Show provider-specific error.

- Research unavailable:
  Use internal analytics and cached research if available. Mark research confidence as low or stale.

- No connected Meta account:
  Use brand profile and benchmark fallback. Explain that connecting accounts unlocks personalized timing/performance recommendations.

- Missing analytics permission:
  Use available posts and generic benchmarks. Show reconnect/permission guidance when the connected account metadata shows missing `instagram_manage_insights` or `pages_read_engagement`.

- New account or too little history:
  Use benchmark + research fallback and recommend running experiments.

## Implementation Phases

### Phase 1: Post Creator Intelligence Foundation

Deliver:

- Content intelligence domain types.
- Internal analytics signal builder.
- Provider-neutral AI structured output adapter.
- Research adapter with OpenRouter recommended and Gemini fallback.
- `/api/content-intelligence/analyze-post`.
- Post Strength score UI.
- Hashtag recommendations with reasons.
- Top best-time suggestions using existing local analytics plus fallback.
- Evidence drawer.

This phase should replace the static hashtag list and simple next-slot logic for the post creator, but keep existing caption generation working.

### Phase 2: Calendar Intelligence

Deliver:

- `/api/content-intelligence/recommend-slots`.
- Calendar heatmap overlay.
- Slot confidence labels.
- Apply recommended time from calendar into create modal.
- Reschedule feedback when dragging posts.

### Phase 3: Analytics Intelligence

Deliver:

- `/api/content-intelligence/analytics-insights`.
- What is working section.
- What to try next section.
- Top pattern cards by topic, format, time, caption, hashtag.
- Evidence-backed growth insights.

### Phase 4: External Trend Providers and Advanced Research

Deliver:

- Optional DataForSEO/SerpApi/Google Trends provider adapter.
- Optional social intelligence provider adapter after legal/cost review.
- Subscription-gated deeper trend reports.
- Research source quality controls.

### Phase 5: Audience Mining

Deliver only after permission and policy review:

- Comment theme mining.
- Message FAQ/opportunity mining.
- Suggested content based on real audience questions.
- Clear controls and privacy-safe summaries.

## Testing Strategy

Unit tests:

- Scoring deterministic behavior.
- Fallback priority.
- Evidence confidence assignment.
- Hashtag parsing/filtering.
- Time-slot ranking.
- Provider adapter response normalization.

API tests:

- Unauthorized workspace rejection.
- Missing provider fallback.
- Missing analytics fallback.
- Rate-limit behavior.
- Cache hit/miss behavior.
- Subscription gating.

Frontend tests:

- Desktop post creator panel.
- Mobile collapsed panel.
- Apply hashtag.
- Apply recommended time.
- Evidence drawer visibility.
- Empty/error states.

Manual verification:

- Workspace with rich analytics.
- Workspace with no analytics.
- Workspace with connected Meta but missing insights.
- Workspace with OpenRouter only.
- Workspace with Gemini only.
- Workspace with no AI provider.

## Open Decisions Before Implementation Plan

1. Whether Phase 1 includes full trend-backed content ideas, or only scoring/time/hashtags.
2. Whether to store post score snapshots immediately or keep Phase 1 analysis cache-only.
3. Which subscription gates map to the current billing model.
4. Whether external trend providers should be designed as dormant adapters now or added only in Phase 4.
5. Whether the first UI should be embedded in the current create modal or split into a larger composer redesign.

## Recommended Scope For First Implementation

Ship Phase 1 as a focused, high-quality release:

- Post strength score.
- Explainable top fixes.
- Evidence-backed hashtag recommendations.
- Best-time recommendations using internal/Meta-derived data first and benchmark/research fallback.
- Provider-neutral research adapter with OpenRouter recommended, Gemini fallback, and OpenAI-ready interface.
- Mobile-safe intelligence panel.

Defer full trend idea reports, external trend providers, and audience comment/message mining until the foundation is stable.
