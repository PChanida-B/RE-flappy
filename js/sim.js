// Deterministic game simulation, shared by the browser and the server.
// Both sides run this exact fixed-step code, so the server can replay the
// list of ticks where the player flapped and compute the score itself.
// Only + - * / and Math.floor are used, which are bit-identical everywhere.

export const TICK_MS = 1000 / 60;
const DT = 1 / 60;

const GRAVITY = 850; // world gravity (600) + bird gravity (250) of the original
const FLAP_VY = -300;
const PIPE_VX = -100;
const PIPE_INTERVAL = 130; // ticks between pipes

export const BIRD_X = 60;
export const BIRD_START_Y = 310; // just below the start image
const BIRD_HALF_W = 17; // sprite is 34x24
const BIRD_HALF_H = 12;

export const PIPE_SPAWN_X = 288;
export const PIPE_BOTTOM_OFFSET = 420; // bottom pipe y relative to top pipe y
const PIPE_HALF_W = 26; // pipe is 52 wide
const GAP_TOP = 160;    // gap spans [top + 160, top + 260]
const GAP_BOTTOM = 260;

export const GROUND_Y = 422; // top of the ground's collision box
const DESPAWN_X = -50;

// mulberry32: small seeded PRNG, uses only 32-bit integer math
function makeRandom(seed){
	let a = seed >>> 0;
	return function(){
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function createSim(seed){
	return {
		random: makeRandom(seed),
		tick: 0,
		y: BIRD_START_Y,
		vy: 0,
		pipes: [],
		nextPipeId: 0,
		pipeTimer: 0,
		score: 0,
		dead: false
	};
}

function spawnPipe(sim){
	const top = Math.floor(sim.random() * 241) - 120; // -120..120
	sim.pipes.push({ id: sim.nextPipeId++, x: PIPE_SPAWN_X, top: top, scored: false });
}

// Advance one tick. `flap` is true if the player tapped since the last tick.
export function step(sim, flap){
	if (sim.dead) return;
	if (sim.tick === 0) spawnPipe(sim); // first pipe appears as the game starts

	if (flap) sim.vy = FLAP_VY;
	sim.vy += GRAVITY * DT;
	sim.y += sim.vy * DT;

	for (const pipe of sim.pipes) pipe.x += PIPE_VX * DT;
	sim.pipes = sim.pipes.filter(pipe => pipe.x > DESPAWN_X);

	if (++sim.pipeTimer === PIPE_INTERVAL){
		spawnPipe(sim);
		sim.pipeTimer = 0;
	}
	sim.tick++;

	if (sim.y + BIRD_HALF_H >= GROUND_Y){
		sim.dead = true;
		return;
	}

	for (const pipe of sim.pipes){
		const overlapsX = Math.abs(pipe.x - BIRD_X) < PIPE_HALF_W + BIRD_HALF_W;
		if (!overlapsX) continue;
		// the top pipe extends upward forever, so flying over the screen doesn't help
		if (sim.y - BIRD_HALF_H < pipe.top + GAP_TOP || sim.y + BIRD_HALF_H > pipe.top + GAP_BOTTOM){
			sim.dead = true;
			return;
		}
		if (!pipe.scored && pipe.x <= BIRD_X + BIRD_HALF_W){
			pipe.scored = true;
			sim.score++;
		}
	}
}

// Server-side check: replay the flap ticks and return the score, or null if the
// replay is invalid (malformed, doesn't end in death, or uses ticks after death).
export function replay(seed, flaps, maxTicks){
	if (!Array.isArray(flaps) || flaps.length === 0 || flaps[0] !== 0) return null;
	for (let i = 0; i < flaps.length; i++){
		if (!Number.isInteger(flaps[i])) return null;
		if (i > 0 && flaps[i] <= flaps[i - 1]) return null;
	}

	const sim = createSim(seed);
	let next = 0;
	while (!sim.dead && sim.tick < maxTicks){
		const flap = flaps[next] === sim.tick;
		if (flap) next++;
		step(sim, flap);
	}
	if (!sim.dead || next !== flaps.length) return null;
	return { score: sim.score, ticks: sim.tick };
}
