// Combat: the player's punch and pistol, and the armed enemies who shoot back.
// Hitscan shooting uses the camera aim; tracers are short-lived lines in the scene.
//
// Two v1 fixes live here: enemies now collide with buildings instead of
// walking through them, and shots are blocked by buildings — a wall between
// the shooter and the target stops the bullet (line-of-sight test against
// the city's colliders). Tracers are pooled instead of allocating a new
// geometry and material for every shot.
import * as THREE from '../vendor/three.module.min.js';
import { COMBAT } from './config.js';
import { createPersonMesh } from './traffic.js';
import { range } from './random.js';

export function createCombat(scene, random) {
  const enemies = [];
  const tracers = [];
  const tracerPool = [];
  const group = new THREE.Group();
  scene.add(group);

  function spawnShooters(positions) {
    for (const pos of positions) {
      const mesh = createPersonMesh(random, { shirt: 0x3f1d1d, pants: 0x111827, hair: 0x000000 });
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.42, 1.25, 0.3);
      mesh.add(gun);
      mesh.position.set(pos.x, 0, pos.z);
      group.add(mesh);
      // Remember every material's base colour so the hit flash can restore it.
      mesh.traverse((child) => {
        if (child.isMesh && child.material && child.material.color) {
          child.material.userData.baseColor = child.material.color.getHex();
        }
      });
      enemies.push({ mesh, x: pos.x, z: pos.z, health: COMBAT.enemyHealth, cooldown: range(random, 0.5, 1.5), alive: true, fade: 0, flash: 0 });
    }
  }

  function clearEnemies() {
    for (const e of enemies) group.remove(e.mesh);
    enemies.length = 0;
  }

  function shootersAlive() {
    return enemies.filter((e) => e.alive).length;
  }

  function addTracer(from, to) {
    let line = tracerPool.pop();
    if (!line) {
      // Each pooled line owns its material: the fade writes opacity per
      // tracer, and a shared material would fade every live tracer at once.
      line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
      );
      line.frustumCulled = false;
    }
    line.geometry.setFromPoints([from, to]);
    line.material.opacity = 0.9;
    scene.add(line);
    tracers.push({ line, life: 0.09 });
  }

  function releaseTracer(t) {
    scene.remove(t.line);
    t.line.geometry.dispose();
    // The geometry is rebuilt on reuse; keep the line object itself pooled
    // so repeated firefights stop churning THREE objects every shot.
    t.line.geometry = new THREE.BufferGeometry();
    tracerPool.push(t.line);
  }

  /** True when a building stands between (x1,z1) and (x2,z2). */
  function losBlocked(x1, z1, x2, z2, world) {
    const colliders = world.colliders;
    if (!colliders) return false;
    const dx = x2 - x1;
    const dz = z2 - z1;
    for (const c of colliders) {
      // Slab test: does the segment cross this building's rectangle?
      let tmin = 0;
      let tmax = 1;
      let blocked = true;
      for (const [o, d, min, max] of [[x1, dx, c.minX, c.maxX], [z1, dz, c.minZ, c.maxZ]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < min || o > max) { blocked = false; break; }
        } else {
          let t0 = (min - o) / d;
          let t1 = (max - o) / d;
          if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
          tmin = Math.max(tmin, t0);
          tmax = Math.min(tmax, t1);
          if (tmin > tmax) { blocked = false; break; }
        }
      }
      if (blocked && tmax >= 0 && tmin <= 1) return true;
    }
    return false;
  }

  /** Player fires the pistol along the camera aim. Returns what was hit, if anything. */
  function playerShoot(origin, dir, onHit, world) {
    let best = null;
    let bestDist = COMBAT.pistolRange;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - origin.x;
      const dz = e.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
      if (dot < 0.94) continue; // outside the aim cone
      if (world && losBlocked(origin.x, origin.z, e.x, e.z, world)) continue;
      best = e;
      bestDist = dist;
    }
    const end = {
      x: origin.x + dir.x * (best ? bestDist : COMBAT.pistolRange),
      y: 1.3,
      z: origin.z + dir.z * (best ? bestDist : COMBAT.pistolRange),
    };
    addTracer(new THREE.Vector3(origin.x, 1.35, origin.z), new THREE.Vector3(end.x, end.y, end.z));
    if (best) {
      best.health -= COMBAT.pistolDamage;
      best.flash = 0.12;
      if (best.health <= 0) {
        best.alive = false;
        best.fade = 0;
        best.mesh.rotation.x = -Math.PI / 2;
        best.mesh.position.y = 0.3;
      }
      if (onHit) onHit(best);
      return best;
    }
    return null;
  }

  /** Player punches: nearest living enemy, cop or pedestrian in front, within reach. */
  function playerPunch(origin, facing, targets) {
    let best = null;
    let bestDist = COMBAT.punchRange;
    for (const t of targets) {
      if (t.alive === false) continue;
      const dx = t.x - origin.x;
      const dz = t.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const dot = (dx * facing.x + dz * facing.z) / (dist || 1);
      if (dot < 0.4) continue;
      best = t;
      bestDist = dist;
    }
    if (best) {
      if (best.damage) best.damage(COMBAT.punchDamage);
      if (best.flash !== undefined) best.flash = 0.12;
      // Knockback lives in the target's own damage() — it owns its position.
    }
    return best;
  }

  function update(dt, world) {
    for (const e of enemies) {
      if (!e.alive) {
        e.fade += dt;
        if (e.fade > 2) {
          group.remove(e.mesh);
          e.gone = true;
        }
        continue;
      }
      // Hit flash: briefly tint the whole figure white, then restore the
      // base colours recorded at spawn time.
      if (e.flash > 0) {
        e.flash -= dt;
        const target = e.flash > 0 ? 0xffffff : null;
        e.mesh.traverse((child) => {
          if (!child.isMesh || !child.material || !child.material.color) return;
          if (target !== null) child.material.color.setHex(target);
          else if (child.material.userData.baseColor !== undefined) {
            child.material.color.setHex(child.material.userData.baseColor);
          }
        });
      }
      const dx = world.playerX - e.x;
      const dz = world.playerZ - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > COMBAT.enemyRange) {
        const nx = e.x + (dx / dist) * 4.2 * dt;
        const nz = e.z + (dz / dist) * 4.2 * dt;
        // Enemies path around buildings instead of walking through them.
        const fixed = world.collide ? world.collide(nx, nz, 0.9) : { x: nx, z: nz };
        e.x = fixed.x;
        e.z = fixed.z;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.cooldown -= dt;
      if (dist < COMBAT.enemyRange && e.cooldown <= 0) {
        e.cooldown = COMBAT.enemyCooldown + range(random, -0.3, 0.5);
        // No shooting through walls: the enemy holds fire when a building
        // stands between them and the player.
        if (losBlocked(e.x, e.z, world.playerX, world.playerZ, world)) continue;
        world.damagePlayer(Math.round(range(random, 5, 10)));
        addTracer(
          new THREE.Vector3(e.x, 1.3, e.z),
          new THREE.Vector3(world.playerX, 1.2, world.playerZ),
        );
        world.audioGunshot();
      }
    }
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (enemies[i].gone) enemies.splice(i, 1);
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        releaseTracer(t);
        tracers.splice(i, 1);
      }
    }
  }

  return { enemies, spawnShooters, clearEnemies, shootersAlive, playerShoot, playerPunch, update, losBlocked };
}
