"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeWeeklySchedule = sanitizeWeeklySchedule;
exports.generateAppointmentDateOptions = generateAppointmentDateOptions;
exports.generateAppointmentTimeOptions = generateAppointmentTimeOptions;
exports.formatAppointmentSlotForMessage = formatAppointmentSlotForMessage;
const WEEKDAY_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toWeekdayKey(date, timezone) {
    const weekdayName = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: timezone,
    }).format(date);
    return weekdayName.trim().toLowerCase();
}
function toDateParts(date, timezone) {
    const formattedParts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: timezone,
    }).formatToParts(date);
    const year = Number(formattedParts.find((part) => part.type === "year")?.value);
    const month = Number(formattedParts.find((part) => part.type === "month")?.value);
    const day = Number(formattedParts.find((part) => part.type === "day")?.value);
    return { year, month, day };
}
function formatIsoDate(parts) {
    const paddedMonth = String(parts.month).padStart(2, "0");
    const paddedDay = String(parts.day).padStart(2, "0");
    return `${parts.year}-${paddedMonth}-${paddedDay}`;
}
function formatDisplayDate(date, language, timezone) {
    const locale = language.startsWith("ar") ? "ar-EG" : language.startsWith("de") ? "de-DE" : "en-US";
    return new Intl.DateTimeFormat(locale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: timezone,
    }).format(date);
}
function formatDisplayTime(time24) {
    const [hoursText, minutesText] = time24.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return time24;
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function isValidTime24(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function time24ToMinutes(value) {
    if (!isValidTime24(value)) {
        return null;
    }
    const [hoursText, minutesText] = value.split(":");
    return Number(hoursText) * 60 + Number(minutesText);
}
function minutesToTime24(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function expandScheduleEntry(entry) {
    if (typeof entry === "string") {
        return isValidTime24(entry.trim()) ? [entry.trim()] : [];
    }
    const start = isNonEmptyString(entry.start) ? entry.start.trim() : "";
    const end = isNonEmptyString(entry.end) ? entry.end.trim() : "";
    const intervalMinutes = typeof entry.intervalMinutes === "number" && entry.intervalMinutes > 0
        ? Math.floor(entry.intervalMinutes)
        : 30;
    const startMinutes = time24ToMinutes(start);
    const endMinutes = time24ToMinutes(end);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return [];
    }
    const slots = [];
    for (let currentMinutes = startMinutes; currentMinutes < endMinutes; currentMinutes += intervalMinutes) {
        slots.push(minutesToTime24(currentMinutes));
    }
    return slots;
}
function expandDaySchedule(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }
    const uniqueSlots = new Set();
    for (const entry of entries) {
        for (const slot of expandScheduleEntry(entry)) {
            uniqueSlots.add(slot);
        }
    }
    return Array.from(uniqueSlots).sort();
}
function sanitizeWeeklySchedule(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const nextSchedule = {};
    for (const weekday of WEEKDAY_KEYS) {
        const rawEntries = value[weekday];
        if (!Array.isArray(rawEntries)) {
            continue;
        }
        const entries = rawEntries
            .map((entry) => {
            if (isNonEmptyString(entry)) {
                return entry.trim();
            }
            if (!isPlainObject(entry)) {
                return null;
            }
            const start = isNonEmptyString(entry.start) ? entry.start.trim() : "";
            const end = isNonEmptyString(entry.end) ? entry.end.trim() : "";
            const intervalMinutes = typeof entry.intervalMinutes === "number" && entry.intervalMinutes > 0
                ? Math.floor(entry.intervalMinutes)
                : undefined;
            if (!start || !end) {
                return null;
            }
            return {
                start,
                end,
                ...(intervalMinutes ? { intervalMinutes } : {}),
            };
        })
            .filter((entry) => entry !== null);
        if (entries.length > 0 && expandDaySchedule(entries).length > 0) {
            nextSchedule[weekday] = entries;
        }
    }
    return Object.keys(nextSchedule).length > 0 ? nextSchedule : null;
}
function generateAppointmentDateOptions(options) {
    const timezone = options.schedule.timezone?.trim() || "UTC";
    const daysAhead = typeof options.schedule.daysAhead === "number" && options.schedule.daysAhead > 0
        ? Math.floor(options.schedule.daysAhead)
        : 21;
    const maxDateOptions = typeof options.schedule.maxDateOptions === "number" &&
        options.schedule.maxDateOptions > 0
        ? Math.floor(options.schedule.maxDateOptions)
        : 10;
    const startDate = options.fromDate ?? new Date();
    const results = [];
    for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset += 1) {
        const candidateDate = new Date(startDate);
        candidateDate.setDate(startDate.getDate() + dayOffset);
        const weekdayKey = toWeekdayKey(candidateDate, timezone);
        const daySlots = expandDaySchedule(options.schedule.weeklySchedule[weekdayKey]);
        if (daySlots.length === 0) {
            continue;
        }
        const dateParts = toDateParts(candidateDate, timezone);
        results.push({
            input: String(results.length + 1),
            value: formatIsoDate(dateParts),
            label: formatDisplayDate(candidateDate, options.language, timezone),
        });
        if (results.length >= maxDateOptions) {
            break;
        }
    }
    return results;
}
function generateAppointmentTimeOptions(options) {
    if (!isNonEmptyString(options.selectedDate)) {
        return [];
    }
    const timezone = options.schedule.timezone?.trim() || "UTC";
    const candidateDate = new Date(`${options.selectedDate}T12:00:00.000Z`);
    if (Number.isNaN(candidateDate.getTime())) {
        return [];
    }
    const weekdayKey = toWeekdayKey(candidateDate, timezone);
    const daySlots = expandDaySchedule(options.schedule.weeklySchedule[weekdayKey]);
    if (daySlots.length === 0) {
        return [];
    }
    return daySlots.map((slot, index) => ({
        input: String(index + 1),
        value: slot,
        label: formatDisplayTime(slot),
    }));
}
function formatAppointmentSlotForMessage(options) {
    const timezone = options.timezone?.trim() || "UTC";
    const date = new Date(`${options.date}T12:00:00.000Z`);
    const dateLabel = Number.isNaN(date.getTime())
        ? options.date
        : formatDisplayDate(date, options.language, timezone);
    return {
        dateLabel,
        timeLabel: formatDisplayTime(options.time),
    };
}
