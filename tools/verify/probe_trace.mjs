import { createRandom } from '../../game/src/random.js';
import { createWorld, EVENT_HIT, EVENT_OVER } from '../../game/src/world.js';
import { autopilotAction, HORIZON_GOOD } from '../../game/src/shots.js';
import { STEP } from '../../game/src/config.js';

const seed = Number(process.argv[2] ?? 1);
const w = createWorld(createRandom(seed));
const steps = Math.floor(45 / STEP);
const trace = [];
for (let i = 0; i < steps; i += 1) {
  const s = w.state;
  const act = autopilotAction(s, HORIZON_GOOD);
  // ancaman terdekat di jalur AKTUAL (x) pemain
  let near = null;
  for (const ob of s.obstacles) {
    if (!ob.active || ob.hit || ob.z > 0 || ob.z < -40) continue;
    if (Math.abs(ob.x - s.player.x) < 1.3 && (near === null || ob.z > near.z)) near = ob;
  }
  trace.push({
    d: Math.floor(s.distance), lane: s.player.lane, x: +s.player.x.toFixed(2),
    y: +s.player.y.toFixed(2), g: s.player.grounded, sl: s.player.sliding,
    act: `${act.move ? (act.move > 0 ? 'R' : 'L') : '-'}${act.jump ? 'J' : ''}${act.slide ? 'S' : ''}`,
    near: near ? `${near.kind}@${(-near.z).toFixed(1)}` : '--',
  });
  const ev = w.step(STEP, act);
  if (ev & EVENT_HIT) {
    console.log(`HIT at dist=${Math.floor(s.distance)} lives=${s.lives}`);
    for (const t of trace.slice(-40)) console.log(JSON.stringify(t));
    break;
  }
  if (ev & EVENT_OVER) { console.log('OVER'); break; }
}
