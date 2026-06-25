import { useClientLocale, type ClientLanguage } from "../i18n/ClientLocaleContext";

const LANGUAGE_OPTIONS: Array<{ value: ClientLanguage; shortLabel: string; labelKey: string }> = [
  { value: "en", shortLabel: "EN", labelKey: "language.english" },
  { value: "ar", shortLabel: "AR", labelKey: "language.arabic" },
];

function LanguageToggle() {
  const { language, setLanguage, t } = useClientLocale();

  return (
    <div className="language-toggle" aria-label={t("language.label")}>
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            language === option.value
              ? "language-toggle-button language-toggle-button-active"
              : "language-toggle-button"
          }
          onClick={() => setLanguage(option.value)}
          title={t(option.labelKey)}
        >
          {option.shortLabel}
        </button>
      ))}
    </div>
  );
}

export default LanguageToggle;
