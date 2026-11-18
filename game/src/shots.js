// The screenshot scenes behind ?shot=chase|plaza|mission|night. Each one stages
// the real game — same city, same rules, same HUD — into a busy moment and lets
// it run forward a couple of seconds, so the frame is what a short session
// really looks like and the same seed always gives the same frame.
export const SHOT_NAMES = ['chase', 'plaza', 'mission', 'night'];

/**
 * Stage `game` into the named scene (any unknown name stages the plaza) and
 * return a short description of what the frame shows, for the screenshot log.
 */
export function stageShot(name, game) {
  const known = SHOT_NAMES.includes(name) ? name : 'plaza';
  game.stageShot(known);
  const snap = game.snapshot();
  return {
    name: known,
    screen: snap.screen,
    wanted: snap.wanted,
    mission: snap.mission,
    cops: snap.cops,
    inCar: snap.inCar,
    speed: snap.speed,
  };
}
