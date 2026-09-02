/**
 * Malaysian Date & Time Formatting Utilities
 * Standard format: DD/MM/YYYY
 * Timezone: Asia/Kuala_Lumpur (UTC+8)
 */

/**
 * Format any date or timestamp string to Malaysian standard date format: DD/MM/YYYY
 * Examples:
 * - "2026-09-02" -> "02/09/2026"
 * - "2026-09-02T08:30:00Z" -> "02/09/2026"
 * - Date object -> "02/09/2026"
 */
export function formatMalaysiaDate(dateInput?: string | Date | null, fallback = ""): string {
  if (!dateInput) return fallback;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return fallback;

    // Already in DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Direct YYYY-MM-DD match (e.g. from HTML5 <input type="date" />)
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return `${day}/${month}/${year}`;
    }
  }

  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) {
      return String(dateInput);
    }

    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return String(dateInput);
  }
}

/**
 * Format timestamp to Malaysian standard date & time: DD/MM/YYYY, HH:MM:SS
 * Timezone: Asia/Kuala_Lumpur (UTC+8, 24-hour clock)
 */
export function formatMalaysiaDateTime(dateInput?: string | Date | null, fallback = "—"): string {
  if (!dateInput) return fallback;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return fallback;
    // If it's already DD/MM/YYYY with time
    if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
      return trimmed;
    }
  }

  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) {
      return fallback;
    }

    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return fallback;
  }
}

/**
 * Format date to formal Malaysian business letter format: e.g. "2nd September 2026" or "02 September 2026"
 */
export function formatMalaysiaDateFormal(dateInput?: string | Date | null): string {
  if (!dateInput) return "";

  try {
    let d: Date;
    if (typeof dateInput === "string") {
      const ymd = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (ymd) {
        d = new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
      } else {
        d = new Date(dateInput);
      }
    } else {
      d = dateInput;
    }

    if (isNaN(d.getTime())) return String(dateInput);

    const day = d.getDate();
    let suffix = "th";
    if (day < 11 || day > 13) {
      switch (day % 10) {
        case 1:
          suffix = "st";
          break;
        case 2:
          suffix = "nd";
          break;
        case 3:
          suffix = "rd";
          break;
      }
    }
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return String(dateInput);
  }
}
