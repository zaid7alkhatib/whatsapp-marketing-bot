const REPLY_MARKERS = ["Reply with:", "\u0623\u0631\u0633\u0644:", "Antworten Sie mit:"];
const OPTION_MARKER_SOURCE = "[1-9](?:\\uFE0F?\\u20E3)?";

function normalizeLineBreakTokens(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\s*(?:\\n|\/n)\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function compactBlankLines(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findReplyMarker(text: string): { marker: string; index: number } | null {
  const matches = REPLY_MARKERS.map((marker) => ({
    marker,
    index: text.indexOf(marker),
  })).filter((match) => match.index >= 0);

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => left.index - right.index);
  return matches[0] ?? null;
}

function hasNumberedChoiceOptions(text: string): boolean {
  return /(^|\s)1(?:\uFE0F?\u20E3)?\s+\S+/u.test(text) && /(^|\s)2(?:\uFE0F?\u20E3)?\s+\S+/u.test(text);
}

function formatNumberedChoicePrompt(text: string): string {
  let formatted = text;
  const optionMarkerAhead = new RegExp(`(?=${OPTION_MARKER_SOURCE}\\s+)`, "u");
  const optionMarkerWithLeadingSpace = new RegExp(`\\s+(?=${OPTION_MARKER_SOURCE}\\s+)`, "gu");

  formatted = formatted.replace(new RegExp(`:\\s*${optionMarkerAhead.source}`, "u"), ":\n");
  formatted = formatted.replace(new RegExp(`([\\u061F?])\\s*${optionMarkerAhead.source}`, "u"), "$1\n");
  formatted = formatted.replace(optionMarkerWithLeadingSpace, "\n");

  return compactBlankLines(formatted);
}

export function normalizeMessageTextFormatting(value: string): string {
  if (!value || !value.trim()) {
    return value;
  }

  const normalized = compactBlankLines(normalizeLineBreakTokens(value));
  const replyMarker = findReplyMarker(normalized);

  let beforeReply = normalized;
  let replyLine = "";

  if (replyMarker) {
    beforeReply = normalized.slice(0, replyMarker.index).trim();
    replyLine = normalized.slice(replyMarker.index).trim();
  }

  if (hasNumberedChoiceOptions(beforeReply)) {
    beforeReply = formatNumberedChoicePrompt(beforeReply);
  }

  return compactBlankLines([beforeReply, replyLine].filter(Boolean).join("\n"));
}
