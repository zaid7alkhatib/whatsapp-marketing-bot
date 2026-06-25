"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMessageTextFormatting = normalizeMessageTextFormatting;
const REPLY_MARKERS = ["Reply with:", "\u0623\u0631\u0633\u0644:", "Antworten Sie mit:"];
const OPTION_MARKER_SOURCE = "(?:[0-9]{1,2}(?:\\uFE0F?\\u20E3)?)";
function normalizeLineBreakTokens(value) {
    return value
        .replace(/\r\n/g, "\n")
        .replace(/\s*(?:\\n|\/n)\s*/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
}
function compactBlankLines(value) {
    return value
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
function findReplyMarker(text) {
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
function hasNumberedChoiceOptions(text) {
    return /(^|\s)1(?:\uFE0F?\u20E3)?\s+\S+/u.test(text) && /(^|\s)2(?:\uFE0F?\u20E3)?\s+\S+/u.test(text);
}
function applyVisibleChoiceMarkers(text) {
    return text
        .split("\n")
        .map((line) => line.replace(/^([0-9]{1,2})(?:\uFE0F?\u20E3)?\s+/u, (_match, digits) => {
        const visibleMarker = digits
            .split("")
            .map((digit) => `${digit}\uFE0F\u20E3`)
            .join("");
        return `${visibleMarker} `;
    }))
        .map((line) => line.replace(/^0\s+/u, "0\uFE0F\u20E3 "))
        .join("\n");
}
function formatNumberedChoicePrompt(text) {
    if (text.includes("\n")) {
        return compactBlankLines(applyVisibleChoiceMarkers(text));
    }
    let formatted = text;
    const optionMarkerAhead = new RegExp(`(?=${OPTION_MARKER_SOURCE}\\s+)`, "u");
    formatted = formatted.replace(new RegExp(`:\\s*${optionMarkerAhead.source}`, "u"), ":\n");
    formatted = formatted.replace(new RegExp(`([\\u061F?])\\s*${optionMarkerAhead.source}`, "u"), "$1\n");
    return compactBlankLines(applyVisibleChoiceMarkers(formatted));
}
function normalizeMessageTextFormatting(value) {
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
