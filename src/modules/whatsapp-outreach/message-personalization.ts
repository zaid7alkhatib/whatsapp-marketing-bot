const DEFAULT_ENGLISH_GREETING_NAME = "there";
const DEFAULT_ARABIC_GREETING_NAME = "عميلنا الكريم";

export interface MarketingMessageTemplate {
  englishGreeting?: string;
  arabicGreeting?: string;
  englishResponseInstruction?: string;
  arabicResponseInstruction?: string;
}

export const DEFAULT_MARKETING_MESSAGE_TEMPLATE: Required<MarketingMessageTemplate> = {
  englishGreeting: "Hello {name},",
  arabicGreeting: "مرحباً {name}،",
  englishResponseInstruction:
    "To let our team follow up with you, reply with 1 or write Interested.",
  arabicResponseInstruction: "للمتابعة مع فريقنا، أرسل 1 أو اكتب مهتم.",
};

function normalizeDisplayName(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.replace(/\s+/g, " ").trim();
  return normalizedValue ? normalizedValue.slice(0, 140) : undefined;
}

export function buildPersonalizedMarketingMessage(options: {
  message: string;
  displayName?: string;
  template?: MarketingMessageTemplate;
}): string {
  const message = options.message.trim();
  const displayName = normalizeDisplayName(options.displayName);
  const englishGreetingName = displayName ?? DEFAULT_ENGLISH_GREETING_NAME;
  const arabicGreetingName = displayName ?? DEFAULT_ARABIC_GREETING_NAME;
  const template = {
    ...DEFAULT_MARKETING_MESSAGE_TEMPLATE,
    ...options.template,
  };
  const lines: string[] = [];

  const englishGreeting = renderTemplateLine(template.englishGreeting, englishGreetingName);
  const arabicGreeting = renderTemplateLine(template.arabicGreeting, arabicGreetingName);
  const englishInstruction = renderTemplateLine(
    template.englishResponseInstruction,
    englishGreetingName
  );
  const arabicInstruction = renderTemplateLine(
    template.arabicResponseInstruction,
    arabicGreetingName
  );

  if (englishGreeting) {
    lines.push(englishGreeting);
  }
  if (arabicGreeting) {
    lines.push(arabicGreeting);
  }
  if (lines.length > 0) {
    lines.push("");
  }

  lines.push(message);

  const instructionLines = [englishInstruction, arabicInstruction].filter(
    (line): line is string => typeof line === "string"
  );
  if (instructionLines.length > 0) {
    lines.push("", ...instructionLines);
  }

  return lines.join("\n").trim();
}

function renderTemplateLine(value: string | undefined, name: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.replace(/\s+/g, " ").trim();
  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue.replace(/\{name\}/g, name);
}
