// Combat: the player's punch and pistol, and the armed enemies who shoot back.
// Hitscan shooting uses the camera aim; tracers are short-lived lines in the scene.
import * as THREE from '../vendor/three.module.min.js';
import { COMBAT } from './config.js';
import { createPersonMesh } from './traffic.js';
import { range } from './random.js';

export function createCombat(scene, random) {
  const enemies = [];
  const tracers = [];
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
      enemies.push({ mesh, x: pos.x, z: pos.z, health: COMBAT.enemyHealth, cooldown: range(random, 0.5, 1.5), alive: true, fade: 0 });
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
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.09 });
  }

  /** Player fires the pistol along the camera aim. Returns what was hit, if anything. */
  function playerShoot(origin, dir, onHit) {
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
      const dx = world.playerX - e.x;
      const dz = world.playerZ - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > COMBAT.enemyRange) {
        e.x += (dx / dist) * 4.2 * dt;
        e.z += (dz / dist) * 4.2 * dt;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.cooldown -= dt;
      if (dist < COMBAT.enemyRange && e.cooldown <= 0) {
        e.cooldown = COMBAT.enemyCooldown + range(random, -0.3, 0.5);
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
        scene.remove(t.line);
        t.line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  return { enemies, spawnShooters, clearEnemies, shootersAlive, playerShoot, playerPunch, update };
}
