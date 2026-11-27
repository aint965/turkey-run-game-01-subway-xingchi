import { createRandom } from '../../game/src/random.js';
import { createWorld, EVENT_HIT, EVENT_OVER } from '../../game/src/world.js';
import { autopilotAction, HORIZON_GOOD } from '../../game/src/shots.js';
import { STEP } from '../../game/src/config.js';

const seed = Number(process.argv[2] ?? 1);
const w = createWorld(createRandom(seed));
const steps = Math.floor(45 / STEP);
for (let i = 0; i < steps; i += 1) {
  const s = w.state;
  const act = autopilotAction(s, HORIZON_GOOD);
  const ev = w.step(STEP, act);
  if (ev & EVENT_HIT) {
    console.log(`HIT dist=${Math.floor(s.distance)} lives=${s.lives} player x=${s.player.x.toFixed(2)} y=${s.player.y.toFixed(2)} lane=${s.player.lane} sliding=${s.player.sliding}`);
    for (const ob of s.obstacles) {
      if (ob.active) console.log(`  ob ${ob.kind} lane=${ob.lane} x=${ob.x} z=${ob.z.toFixed(2)} hit=${ob.hit}`);
    }
    break;
  }
  if (ev & EVENT_OVER) { console.log('OVER'); break; }
}
