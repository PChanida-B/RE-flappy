const express = require('express');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const app = express();
const path = require('path');
const router = express.Router();

const CHARACTERS = ['char-1', 'char-2', 'char-3', 'char-4', 'char-5', 'char-6', 'char-7', 'char-8'];
const MAX_TICKS = 60 * 60 * 60;            // a run can't be longer than 1 hour
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // unused sessions expire after 2 hours

// connection settings come from environment variables (set them in Plesk)
const db = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: process.env.DB_PORT || 3306,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	connectionLimit: 5
});

const simReady = import('./js/sim.js');

// Express 4 doesn't catch errors from async handlers on its own
const wrap = fn => (req, res, next) => fn(req, res).catch(next);

async function createTables(){
	await db.query(`CREATE TABLE IF NOT EXISTS game_sessions (
		id CHAR(36) PRIMARY KEY,
		seed INT UNSIGNED NOT NULL,
		name VARCHAR(12) NOT NULL,
		bird VARCHAR(10) NOT NULL,
		created_at BIGINT NOT NULL
	) CHARACTER SET utf8mb4`);
	await db.query(`CREATE TABLE IF NOT EXISTS scores (
		id INT AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(12) NOT NULL,
		bird VARCHAR(10) NOT NULL,
		score INT NOT NULL,
		created_at BIGINT NOT NULL,
		INDEX (score)
	) CHARACTER SET utf8mb4`);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '/')));

router.get('/', function(req, res){
	res.sendFile(path.join(__dirname, '/index.html'));
});

// Start a run: the server picks the seed that decides every pipe position.
router.post('/api/session', wrap(async function(req, res){
	const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
	const bird = req.body.character;
	if (name.length < 1 || [...name].length > 12) return res.status(400).json({ error: 'Name must be 1-12 characters' });
	if (!CHARACTERS.includes(bird)) return res.status(400).json({ error: 'Unknown character' });

	const now = Date.now();
	const session = { id: crypto.randomUUID(), seed: crypto.randomInt(0, 2 ** 32) };
	await db.query('DELETE FROM game_sessions WHERE created_at < ?', [now - SESSION_TTL_MS]);
	await db.query('INSERT INTO game_sessions (id, seed, name, bird, created_at) VALUES (?, ?, ?, ?, ?)',
		[session.id, session.seed, name, bird, now]);
	res.json(session);
}));

// Finish a run: the client only sends the ticks it flapped on. The server
// replays them and computes the score itself, so a score can't be faked.
router.post('/api/score', wrap(async function(req, res){
	const { replay, TICK_MS } = await simReady;
	const [rows] = await db.query('SELECT * FROM game_sessions WHERE id = ?', [String(req.body.sessionId)]);
	const session = rows[0];
	if (!session) return res.status(400).json({ error: 'Unknown or used session' });

	// each session can be submitted once; the affectedRows check stops races
	const [deleted] = await db.query('DELETE FROM game_sessions WHERE id = ?', [session.id]);
	if (deleted.affectedRows !== 1) return res.status(400).json({ error: 'Unknown or used session' });

	const result = replay(session.seed, req.body.flaps, MAX_TICKS);
	if (!result) return res.status(400).json({ error: 'Invalid replay' });

	// a run can't be submitted faster than it takes to actually play it
	if (Date.now() - Number(session.created_at) < result.ticks * TICK_MS * 0.9){
		return res.status(400).json({ error: 'Run finished too fast' });
	}

	const [inserted] = await db.query('INSERT INTO scores (name, bird, score, created_at) VALUES (?, ?, ?, ?)',
		[session.name, session.bird, result.score, Date.now()]);
	// same order as the leaderboard: higher score first, ties go to whoever got it first
	const [[{ ahead }]] = await db.query(
		'SELECT COUNT(*) AS ahead FROM scores WHERE score > ? OR (score = ? AND id < ?)',
		[result.score, result.score, inserted.insertId]);
	res.json({ score: result.score, rank: ahead + 1 });
}));

router.get('/api/leaderboard', wrap(async function(req, res){
	const [rows] = await db.query(
		'SELECT name, bird AS `character`, score FROM scores ORDER BY score DESC, id ASC LIMIT 5');
	res.json(rows);
}));

app.use('/', router);

app.use(function(err, req, res, next){
	console.error(err);
	res.status(500).json({ error: 'Server error' });
});

createTables().then(function(){
	app.listen(process.env.PORT || process.env.port || 3000);
	console.log('Listening on port ' + (process.env.PORT || process.env.port || 3000));
}).catch(function(err){
	console.error('Database setup failed:', err.message);
	process.exit(1);
});
