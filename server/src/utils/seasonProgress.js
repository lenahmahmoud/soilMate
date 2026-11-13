const DAY_MS = 86_400_000;
const utcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// durations = typicalDays of the 3 crops, in slot order.
export function seasonProgress({ startDate, durations, today = new Date() }) {
  const elapsed = Math.round((utcDay(today) - utcDay(new Date(startDate))) / DAY_MS);

  if (elapsed < 0) {
    return { state: 'not_started', currentIndex: 0, dayOfSeason: 0, totalDays: durations[0] ?? 0, percent: 0 };
  }

  let rest = elapsed;
  for (let i = 0; i < durations.length; i += 1) {
    if (rest < durations[i]) {
      const day = rest + 1;
      return {
        state: 'in_progress',
        currentIndex: i,
        dayOfSeason: day,
        totalDays: durations[i],
        percent: Math.round((100 * day) / durations[i]),
      };
    }
    rest -= durations[i];
  }

  const last = durations.length - 1;
  return {
    state: 'completed',
    currentIndex: last,
    dayOfSeason: durations[last] ?? 0,
    totalDays: durations[last] ?? 0,
    percent: 100,
  };
}

// State of each crop card: done | in_progress | upcoming_next | scheduled.
export function itemStates(progress, count) {
  return Array.from({ length: count }, (_, i) => {
    if (progress.state === 'completed') return 'done';
    if (progress.state === 'not_started') return i === 0 ? 'upcoming_next' : 'scheduled';
    if (i < progress.currentIndex) return 'done';
    if (i === progress.currentIndex) return 'in_progress';
    if (i === progress.currentIndex + 1) return 'upcoming_next';
    return 'scheduled';
  });
}