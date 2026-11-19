// Save / load through localStorage (this browser only).
// The loader validates every field: a corrupt, truncated or hand-edited save
// loads as defaults instead of smuggling NaN or a wrong type into the game.
import { SAVE_KEY, SAVE_VERSION, MISSIONS, PACKAGE_COUNT } from './config.js';

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteInt(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return Math.max(min, Math.min(max, n));
}

/** Coerce a raw parsed save into the shape the game expects. Returns null when unusable. */
export function sanitizeSave(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = {};
  data.version = finiteInt(raw.version, 1, 1, SAVE_VERSION);
  data.money = finiteNumber(raw.money, 500);
  data.health = finiteInt(raw.health, 100, 0, 100);
  data.ammo = finiteInt(raw.ammo, 12, 0, 12);
  data.reserve = finiteInt(raw.reserve, 48, 0, 999);
  data.wanted = finiteInt(raw.wanted, 0, 0, 5);
  data.missionIndex = finiteInt(raw.missionIndex, 0, 0, MISSIONS.length);
  data.missionStage = finiteInt(raw.missionStage, 0, 0, 2);
  data.missionTimer = finiteNumber(raw.missionTimer, 0);
  data.missionCollected = finiteInt(raw.missionCollected, 0, 0, 3);
  data.packagesCollected = finiteInt(raw.packagesCollected, 0, 0, PACKAGE_COUNT);
  data.packagesTaken = Array.isArray(raw.packagesTaken)
    ? raw.packagesTaken.filter((i) => Number.isInteger(i) && i >= 0 && i < PACKAGE_COUNT)
    : [];
  data.playerX = finiteNumber(raw.playerX, 0);
  data.playerZ = finiteNumber(raw.playerZ, 48);
  data.playerHeading = finiteNumber(raw.playerHeading, Math.PI);
  data.timeOfDay = finiteNumber(raw.timeOfDay, 0.42);
  data.muted = raw.muted === true;
  data.taxi = raw.taxi && typeof raw.taxi === 'object'
    ? { x: finiteNumber(raw.taxi.x, 0), z: finiteNumber(raw.taxi.z, 0) }
    : null;
  data.car = raw.car && typeof raw.car === 'object'
    ? {
      x: finiteNumber(raw.car.x, 0),
      z: finiteNumber(raw.car.z, 0),
      heading: finiteNumber(raw.car.heading, Math.PI),
      health: finiteInt(raw.car.health, 100, 0, 100),
      color: finiteInt(raw.car.color, 0xd43d2a, 0, 0xffffff),
      taxi: raw.car.taxi === true,
    }
    : null;
  return data;
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return sanitizeSave(JSON.parse(raw));
  } catch (error) {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
    return true;
  } catch (error) {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // No storage available; the game still plays.
  }
}
