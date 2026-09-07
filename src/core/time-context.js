const TIME_OF_DAY_RANGES = [
  [5, 12, '清晨'],
  [12, 17, '午后'],
  [17, 20, '傍晚'],
  [20, 29, '深夜'],
];

export function localTimeContext(now = new Date(), timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hour = Number(values.hour);
  const timeOfDay = TIME_OF_DAY_RANGES.find(([start, end]) => hour >= start && hour < end)?.[2] ?? '深夜';
  return {
    timeZone,
    localDateTime: `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`,
    localHour: hour,
    timeOfDay,
  };
}
