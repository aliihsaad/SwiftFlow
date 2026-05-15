export interface AssistantBriefingMetric {
  label: string
  value: string
}

export interface AssistantBriefingSection {
  title: string
  items: string[]
}

export interface AssistantBriefing {
  kind: "analysis" | "general"
  title: string
  summary?: string
  metrics: AssistantBriefingMetric[]
  sections: AssistantBriefingSection[]
  paragraphs: string[]
}

const METRIC_ALIASES: Array<{ label: string; aliases: string[] }> = [
  { label: "Views", aliases: ["Total Views", "Views", "Reach"] },
  { label: "Likes", aliases: ["Total Likes", "Likes"] },
  { label: "Comments", aliases: ["Total Comments", "Comments"] },
  { label: "Shares", aliases: ["Total Shares", "Shares"] },
  { label: "Saves", aliases: ["Total Saves", "Saves"] },
  { label: "Posts", aliases: ["Published Posts", "Posts"] },
  { label: "Growth", aliases: ["Growth Rate", "Growth"] },
]

const SECTION_TITLE_MAP: Array<{ match: RegExp; title: string | null }> = [
  { match: /performance|metric|summary/i, title: null },
  { match: /engagement|insight|reach|what worked|what happened/i, title: "What happened" },
  { match: /content suggestion|post next|what to post|next posts?|ideas?/i, title: "Post next" },
  { match: /timing|time|schedule/i, title: "Timing" },
  { match: /frequency|cadence/i, title: "Cadence" },
  { match: /hashtag/i, title: "Hashtags" },
  { match: /cross.?promotion|distribution|channel/i, title: "Distribution" },
  { match: /action|next step|recommendation/i, title: "Actions" },
]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function stripAssistantMarkdown(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeAssistantText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s*(#{2,6}\s+)/g, "\n$1")
    .replace(/[ \t]+$/gm, "")
    .trim()
}

function extractMetrics(text: string): AssistantBriefingMetric[] {
  const cleanText = stripAssistantMarkdown(text)
  const metrics: AssistantBriefingMetric[] = []
  const seen = new Set<string>()

  for (const metric of METRIC_ALIASES) {
    for (const alias of metric.aliases) {
      const pattern = new RegExp(`(?:^|\\s)${escapeRegex(alias)}\\s*[:=]\\s*([\\d,.]+\\s*(?:k|m|b|%)?)`, "i")
      const match = cleanText.match(pattern)
      if (match?.[1] && !seen.has(metric.label)) {
        metrics.push({ label: metric.label, value: match[1].replace(/\s+/g, "").replace(/[,.;:]$/, "").trim() })
        seen.add(metric.label)
        break
      }
    }
  }

  return metrics
}

function headingToTitle(rawHeading: string): string | null {
  const cleanHeading = stripAssistantMarkdown(rawHeading).replace(/:$/, "").trim()
  if (!cleanHeading) return null

  for (const section of SECTION_TITLE_MAP) {
    if (section.match.test(cleanHeading)) return section.title
  }

  return cleanHeading.length <= 44 ? cleanHeading : null
}

function isMetricLine(line: string): boolean {
  const cleanLine = stripAssistantMarkdown(line)
  return METRIC_ALIASES.some((metric) =>
    metric.aliases.some((alias) => new RegExp(`^${escapeRegex(alias)}\\s*:`, "i").test(cleanLine)),
  )
}

function splitIntoItems(value: string): string[] {
  const clean = stripAssistantMarkdown(value)
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim()

  if (!clean) return []

  const sentenceMatches = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  const items = sentenceMatches?.map((item) => item.trim()).filter(Boolean) || [clean]

  return items.length > 1 ? items : [clean]
}

function mergeSection(sections: AssistantBriefingSection[], title: string, items: string[]) {
  const cleanItems = items.map((item) => stripAssistantMarkdown(item)).filter(Boolean).slice(0, 5)
  if (!cleanItems.length) return

  const existing = sections.find((section) => section.title === title)
  if (existing) {
    existing.items = [...existing.items, ...cleanItems].slice(0, 5)
    return
  }

  sections.push({ title, items: cleanItems })
}

function extractSections(text: string): AssistantBriefingSection[] {
  const sections: AssistantBriefingSection[] = []
  let activeTitle: string | null = null
  let activeItems: string[] = []

  const flush = () => {
    if (activeTitle) mergeSection(sections, activeTitle, activeItems)
    activeTitle = null
    activeItems = []
  }

  const lines = normalizeAssistantText(text).split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || isMetricLine(trimmed)) continue

    const markdownHeading = trimmed.match(/^#{1,6}\s+(.+?)\s*$/)
    const plainHeading = !markdownHeading && trimmed.length <= 72 && /:$/.test(stripAssistantMarkdown(trimmed))
      ? stripAssistantMarkdown(trimmed)
      : null
    const headingTitle = markdownHeading
      ? headingToTitle(markdownHeading[1])
      : plainHeading
        ? headingToTitle(plainHeading)
        : undefined

    if (headingTitle !== undefined) {
      flush()
      activeTitle = headingTitle
      continue
    }

    if (!activeTitle) continue
    activeItems.push(...splitIntoItems(trimmed))
  }

  flush()
  return sections.slice(0, 5)
}

function extractParagraphs(text: string): string[] {
  return normalizeAssistantText(text)
    .split(/\n{2,}|\n[-*•]\s*/)
    .map((item) => stripAssistantMarkdown(item))
    .filter((item) => item && !isMetricLine(item))
    .slice(0, 4)
}

function extractBriefSummary(text: string): string | undefined {
  const match = normalizeAssistantText(text).match(/^BRIEF\s*:\s*(.+)$/im)
  return match?.[1] ? stripAssistantMarkdown(match[1]) : undefined
}

export function buildAssistantBriefing(content: string): AssistantBriefing {
  const text = normalizeAssistantText(content)
  const metrics = extractMetrics(text)
  const sections = extractSections(text)
  const paragraphs = extractParagraphs(text)
  const briefSummary = extractBriefSummary(text)
  const kind: AssistantBriefing["kind"] = metrics.length || sections.some((section) =>
    ["What happened", "Post next", "Timing", "Actions"].includes(section.title),
  )
    ? "analysis"
    : "general"

  const summary = briefSummary || sections[0]?.items[0] || paragraphs[0]

  return {
    kind,
    title: kind === "analysis" ? "Performance briefing" : "Assistant response",
    summary,
    metrics,
    sections,
    paragraphs,
  }
}
