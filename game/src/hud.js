// The HUD: DOM stats, banners and the canvas minimap (roads, beach, player,
// mission target, police, traffic and packages), all drawn every frame.
import { CITY, PACKAGE_COUNT } from './config.js';

export function createHud(documentRef) {
  const $ = (id) => documentRef.getElementById(id);
  const els = {
    hud: $('hud'),
    minimap: $('minimap'),
    stars: $('stars'),
    healthFill: $('health-fill'),
    money: $('money'),
    ammo: $('ammo'),
    speed: $('speed'),
    clock: $('clock'),
    objective: $('objective'),
    missionTitle: $('mission-title'),
    missionMeta: $('mission-meta'),
    packages: $('packages'),
    taxi: $('taxi'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    toast: $('toast'),
    hint: $('hint'),
    saveNote: $('save-note'),
    titleScreen: $('screen-title'),
    pauseScreen: $('screen-pause'),
    endScreen: $('screen-end'),
    endTitle: $('end-title'),
    endSub: $('end-sub'),
  };
  const mapCtx = els.minimap ? els.minimap.getContext('2d') : null;
  let bannerTimer = null;
  let toastTimer = null;
  let saveTimer = null;

  function showBanner(title, sub) {
    if (!els.banner) return;
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => els.banner.classList.remove('show'), 3600);
  }

  function showToast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  /** Brief "Saved ✓" note after an autosave, so the player trusts Continue. */
  function showSaved() {
    if (!els.saveNote) return;
    els.saveNote.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => els.saveNote.classList.remove('show'), 1400);
  }

  function setScreen(name) {
    if (els.titleScreen) els.titleScreen.classList.toggle('show', name === 'title');
    if (els.pauseScreen) els.pauseScreen.classList.toggle('show', name === 'pause');
    if (els.endScreen) els.endScreen.classList.toggle('show', name === 'end');
    if (els.hud) els.hud.classList.toggle('hidden', name === 'title');
  }

  function setEnd(title, sub) {
    if (els.endTitle) els.endTitle.textContent = title;
    if (els.endSub) els.endSub.textContent = sub || '';
  }

  function drawMinimap(state) {
    if (!mapCtx || !els.minimap) return;
    const W = els.minimap.width;
    const H = els.minimap.height;
    const scale = W / CITY.size;
    const px = (x) => (x + CITY.half) * scale;
    const pz = (z) => (z + CITY.half) * scale;
    mapCtx.clearRect(0, 0, W, H);
    mapCtx.fillStyle = '#20242c';
    mapCtx.fillRect(0, 0, W, H);
    // Sea and beach.
    mapCtx.fillStyle = '#1d6f8f';
    mapCtx.fillRect(0, pz(CITY.seaY), W, H - pz(CITY.seaY));
    mapCtx.fillStyle = '#e8cf9e';
    mapCtx.fillRect(0, pz(CITY.beachY), W, pz(CITY.seaY) - pz(CITY.beachY));
    // Roads.
    mapCtx.strokeStyle = '#4a4f58';
    mapCtx.lineWidth = 4;
    for (let i = 0; i <= CITY.blocks; i += 1) {
      const p = px(-CITY.half + i * CITY.block);
      mapCtx.beginPath();
      mapCtx.moveTo(p, 0);
      mapCtx.lineTo(p, H);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, p);
      mapCtx.lineTo(W, p);
      mapCtx.stroke();
    }
    // Packages (gold dots).
    mapCtx.fillStyle = '#facc15';
    for (const pkg of state.packages || []) {
      if (pkg.taken) continue;
      mapCtx.fillRect(px(pkg.x) - 1.5, pz(pkg.z) - 1.5, 3, 3);
    }
    // Traffic (grey dots).
    mapCtx.fillStyle = '#9aa0a8';
    for (const car of state.trafficCars || []) {
      mapCtx.fillRect(px(car.x) - 1.5, pz(car.z) - 1.5, 3, 3);
    }
    // Police (flashing blue dots).
    mapCtx.fillStyle = Math.floor(performance.now() / 300) % 2 === 0 ? '#3b82f6' : '#ef4444';
    for (const cop of state.cops || []) {
      mapCtx.beginPath();
      mapCtx.arc(px(cop.x), pz(cop.z), 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Mission target (pulsing yellow diamond).
    if (state.target) {
      const pulse = 5 + Math.sin(performance.now() / 250) * 2;
      mapCtx.fillStyle = '#facc15';
      mapCtx.save();
      mapCtx.translate(px(state.target.x), pz(state.target.z));
      mapCtx.rotate(Math.PI / 4);
      mapCtx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      mapCtx.restore();
    }
    // Player arrow.
    mapCtx.save();
    mapCtx.translate(px(state.playerX), pz(state.playerZ));
    mapCtx.rotate(state.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#111827';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
  }

  function formatTimer(seconds) {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function update(state) {
    if (els.healthFill) {
      els.healthFill.style.width = `${Math.max(0, state.health)}%`;
      els.healthFill.classList.toggle('low', state.health <= 25);
    }
    if (els.money) els.money.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
    if (els.stars) {
      els.stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
      els.stars.classList.toggle('hot', state.wanted > 0);
      // Flash the stars while a foot cop is about to bust the player.
      els.stars.classList.toggle('busting', (state.bustProgress || 0) > 0.15);
    }
    if (els.ammo) els.ammo.textContent = state.inCar ? '—' : `🔫 ${state.ammo}/${state.mag}`;
    if (els.speed) els.speed.textContent = state.inCar ? `${Math.round(state.speedKmh)} km/h` : '';
    if (els.clock) {
      const hours = Math.floor(state.timeOfDay * 24);
      const minutes = Math.floor((state.timeOfDay * 24 * 60) % 60);
      els.clock.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    if (els.missionTitle) els.missionTitle.textContent = state.missionTitle || 'Free Roam';
    if (els.objective) els.objective.textContent = state.objective || 'Explore Solmar Bay. Press M for the next mission.';
    if (els.missionMeta) {
      const parts = [];
      const timer = formatTimer(state.missionTimer);
      if (timer) parts.push(`⏱ ${timer}`);
      if (state.missionCheckpoints) parts.push(state.missionCheckpoints);
      if (state.missionHint) parts.push(state.missionHint);
      els.missionMeta.textContent = parts.join('  ·  ');
      els.missionMeta.style.display = parts.length ? 'block' : 'none';
    }
    if (els.packages) {
      els.packages.textContent = `📦 ${state.packagesCollected || 0}/${PACKAGE_COUNT}`;
    }
    if (els.taxi) {
      els.taxi.style.display = state.taxiActive ? 'block' : 'none';
      if (state.taxiActive) els.taxi.textContent = '🚕 Taxi fare — follow the marker';
    }
    drawMinimap(state);
  }

  return { showBanner, showToast, showSaved, setScreen, setEnd, update };
}
