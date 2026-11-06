// Intro cutscene timing – shared so server & clients agree on the timeline length.
export function introTiming(entrants, mode = 'full') {
  if (mode === 'off') return { open: 0, per: 0, outro: 0, total: 0 };
  if (mode === 'short') {
    const per = 2.2;
    return { open: 4, per, outro: 4, total: 4 + per * entrants + 4 };
  }
  const open = 9, outro = 6;
  const per = Math.max(3, Math.min(4, (60 - open - outro) / Math.max(1, entrants)));
  return { open, per, outro, total: open + per * entrants + outro };
}
