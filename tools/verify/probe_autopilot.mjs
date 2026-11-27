import { createRandom } from '../../game/src/random.js';
import { createWorld, EVENT_HIT, EVENT_OVER } from '../../game/src/world.js';
import { autopilotAction, HORIZON_GOOD } from '../../game/src/shots.js';
import { STEP } from '../../game/src/config.js';

let deaths = 0;
for (let seed = 0; seed < 100; seed += 1) {
  const w = createWorld(createRandom(seed));
  const steps = Math.floor(60 / STEP);
  const hits = [];
  const seen = new Set();
  for (let i = 0; i < steps; i += 1) {
    const ev = w.step(STEP, autopilotAction(w.state, HORIZON_GOOD));
    if (ev & EVENT_HIT) {
      const s = w.state;
      for (const ob of s.obstacles) {
        if (ob.hit && !seen.has(ob)) {
          seen.add(ob);
          hits.push({ kind: ob.kind, dist: Math.floor(s.distance), lane: ob.lane, pLane: s.player.lane, y: +s.player.y.toFixed(2), sliding: s.player.sliding, speed: +s.speed.toFixed(1) });
        }
      }
    }
    if (ev & EVENT_OVER) break;
  }
  const s = w.state;
  if (s.lives <= 0) deaths += 1;
  console.log(`seed ${seed}: lives=${s.lives} dist=${Math.floor(s.distance)} hits=${JSON.stringify(hits)}`);
}
console.log(`DEATHS ${deaths}/100`);
