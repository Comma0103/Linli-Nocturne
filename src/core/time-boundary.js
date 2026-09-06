export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

// 额度按配置时区的自然日计算，数据库时间仍统一保存为 UTC。
export function createDayBoundary(timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone, calendar: 'iso8601', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const dateKey = date => {
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  let cached;
  const firstInstant = key => {
    const midnight = Date.parse(`${key}T00:00:00.000Z`);
    let low = midnight - 36 * 60 * 60 * 1000;
    let high = midnight + 36 * 60 * 60 * 1000;
    // 查找日期切换的实际瞬间，不假定夏令时切换日一定有 24 小时或 00:00。
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (dateKey(new Date(middle)) < key) low = middle + 1;
      else high = middle;
    }
    return new Date(low).toISOString();
  };
  return now => {
    const key = dateKey(now);
    if (cached?.dateKey !== key) {
      const nextDate = new Date(`${key}T00:00:00.000Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      cached = { dateKey: key, startIso: firstInstant(key), endIso: firstInstant(nextDate.toISOString().slice(0, 10)) };
    }
    return { ...cached };
  };
}
