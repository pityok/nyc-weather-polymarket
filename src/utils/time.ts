const MSK_TIMEZONE = "Europe/Moscow";

export function formatUtcMskTimestamps(date = new Date()) {
  const utc = date.toISOString();
  const msk = new Intl.DateTimeFormat("sv-SE", {
    timeZone: MSK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  return { utc, msk: `${msk} MSK` };
}

export function logWithTime(scope: string, message: string) {
  const { utc, msk } = formatUtcMskTimestamps();
  console.log(`[${scope}] ${message} | utc=${utc} | msk=${msk}`);
}
