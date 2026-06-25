import { useDashboardCursor, type DashboardCursorId } from "../cursor/DashboardCursorContext";
import { useClientLocale } from "../i18n/ClientLocaleContext";

function CursorPicker() {
  const { cursorId, cursorOptions, setCursorId } = useDashboardCursor();
  const { t } = useClientLocale();

  return (
    <label className="cursor-picker">
      <span>{t("cursor.label")}</span>
      <select
        className="cursor-picker-select"
        value={cursorId}
        onChange={(event) => setCursorId(event.target.value as DashboardCursorId)}
      >
        {cursorOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default CursorPicker;
