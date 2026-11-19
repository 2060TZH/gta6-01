// The screenshot scenes behind ?shot=chase|plaza|mission|night. Each one stages
// the real game — same city, same rules, same HUD — into a busy moment and lets
// it run forward a couple of seconds, so the frame is what a short session
// really looks like and the same seed always gives the same frame.
export const SHOT_NAMES = ['chase', 'plaza', 'mission', 'night'];

// One line per scene for the screenshot log, so a bad frame can be told apart
// from a good one without opening the image.
export const SHOT_CAPTIONS = {
  chase: '3-star police chase at speed through downtown, pursuit cars flanking',
  plaza: 'On foot at the plaza, mission 1 beacon pointing at the garage',
  mission: 'Dock shootout at dusk, four armed crew, 2 stars, pistol ready',
  night: 'Night drive through neon downtown, 1 star, hideout beacon ahead',
};

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
    caption: SHOT_CAPTIONS[known],
    screen: snap.screen,
    wanted: snap.wanted,
    mission: snap.mission,
    cops: snap.cops,
    inCar: snap.inCar,
    speed: snap.speed,
    timeOfDay: snap.timeOfDay,
  };
}
