import type { ClientLanguage } from "../i18n/ClientLocaleContext";

const REQUEST_TYPE_LABELS: Record<string, Record<ClientLanguage, string>> = {
  prescription: {
    en: "Prescription",
    ar: "\u0648\u0635\u0641\u0629 \u0637\u0628\u064a\u0629",
    de: "Rezept",
  },
  sick_leave: {
    en: "Sick note",
    ar: "\u0625\u062c\u0627\u0632\u0629 \u0645\u0631\u0636\u064a\u0629",
    de: "Krankschreibung",
  },
  blood_draw: {
    en: "Blood draw",
    ar: "\u0633\u062d\u0628 \u062f\u0645",
    de: "Blutabnahme",
  },
  referral: {
    en: "Referral",
    ar: "\u062a\u062d\u0648\u064a\u0644 \u0637\u0628\u064a",
    de: "\u00dcberweisung",
  },
  blood_draw_result: {
    en: "Blood draw result",
    ar: "\u0646\u062a\u064a\u062c\u0629 \u0633\u062d\u0628 \u0627\u0644\u062f\u0645",
    de: "Blutabnahme-Ergebnis",
  },
  medical_documents_only: {
    en: "Medical documents only",
    ar: "\u0641\u0642\u0637 \u0625\u0631\u0633\u0627\u0644 \u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0637\u0628\u064a\u0629",
    de: "Nur medizinische Unterlagen",
  },
  medical_appointment: {
    en: "Medical appointment",
    ar: "\u0645\u0648\u0639\u062f \u0637\u0628\u064a",
    de: "Medizinischer Termin",
  },
  clinic_whatsapp_intake: {
    en: "Online service",
    ar: "\u062e\u062f\u0645\u0629 \u0623\u0648\u0646\u0644\u0627\u064a\u0646",
    de: "Online-Service",
  },
};

const REQUEST_TYPE_ALIASES: Record<string, string> = {
  prescription: "prescription",
  "medical prescription": "prescription",
  "\u0648\u0635\u0641\u0629 \u0637\u0628\u064a\u0629": "prescription",
  rezept: "prescription",
  sick_leave: "sick_leave",
  "sick leave": "sick_leave",
  "sick note": "sick_leave",
  "\u0625\u062c\u0627\u0632\u0629 \u0645\u0631\u0636\u064a\u0629": "sick_leave",
  krankschreibung: "sick_leave",
  blood_draw: "blood_draw",
  "blood draw": "blood_draw",
  "\u0633\u062d\u0628 \u062f\u0645": "blood_draw",
  blutabnahme: "blood_draw",
  referral: "referral",
  "\u062a\u062d\u0648\u064a\u0644 \u0637\u0628\u064a": "referral",
  "\u00fcberweisung": "referral",
  blood_draw_result: "blood_draw_result",
  "blood draw result": "blood_draw_result",
  "\u0646\u062a\u064a\u062c\u0629 \u0633\u062d\u0628 \u0627\u0644\u062f\u0645": "blood_draw_result",
  "blutabnahme-ergebnis": "blood_draw_result",
  medical_documents_only: "medical_documents_only",
  "medical documents only": "medical_documents_only",
  "\u0641\u0642\u0637 \u0625\u0631\u0633\u0627\u0644 \u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0637\u0628\u064a\u0629": "medical_documents_only",
  "nur medizinische unterlagen": "medical_documents_only",
  medical_appointment: "medical_appointment",
  "medical appointment": "medical_appointment",
  "\u0645\u0648\u0639\u062f \u0637\u0628\u064a": "medical_appointment",
  "medizinischer termin": "medical_appointment",
  clinic_whatsapp_intake: "clinic_whatsapp_intake",
  "clinic whatsapp intake": "clinic_whatsapp_intake",
  "online service": "clinic_whatsapp_intake",
  "\u062e\u062f\u0645\u0629 \u0623\u0648\u0646\u0644\u0627\u064a\u0646": "clinic_whatsapp_intake",
  "online-service": "clinic_whatsapp_intake",
};

const SERVICE_AREA_LABELS: Record<string, Record<ClientLanguage, string>> = {
  medical_requests: {
    en: "Medical requests",
    ar: "\u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0637\u0628\u064a\u0629",
    de: "Medizinische Anfragen",
  },
};

const SERVICE_AREA_ALIASES: Record<string, string> = {
  medical_requests: "medical_requests",
  "medical requests": "medical_requests",
  "\u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0637\u0628\u064a\u0629": "medical_requests",
  "medizinische anfragen": "medical_requests",
};

function normalizeLabelKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, "_");
  return normalized ? normalized : undefined;
}

function normalizeLabelText(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function getLocalizedRequestTypeLabel(options: {
  code?: string;
  label?: string;
  language: ClientLanguage;
}): string {
  const labelKey = normalizeLabelKey(options.label);
  const labelText = normalizeLabelText(options.label);
  const codeKey = normalizeLabelKey(options.code);
  const resolvedKey =
    (labelKey ? REQUEST_TYPE_ALIASES[labelKey] : undefined) ??
    (labelText ? REQUEST_TYPE_ALIASES[labelText] : undefined) ??
    (codeKey ? REQUEST_TYPE_ALIASES[codeKey] : undefined);

  if (resolvedKey && REQUEST_TYPE_LABELS[resolvedKey]) {
    return REQUEST_TYPE_LABELS[resolvedKey][options.language];
  }

  return options.label || options.code || "-";
}

export function getLocalizedServiceAreaLabel(
  label: string | undefined,
  language: ClientLanguage
): string {
  const labelKey = normalizeLabelKey(label);
  const labelText = normalizeLabelText(label);
  const resolvedKey =
    (labelKey ? SERVICE_AREA_ALIASES[labelKey] : undefined) ??
    (labelText ? SERVICE_AREA_ALIASES[labelText] : undefined);

  if (resolvedKey && SERVICE_AREA_LABELS[resolvedKey]) {
    return SERVICE_AREA_LABELS[resolvedKey][language];
  }

  return label || "-";
}
