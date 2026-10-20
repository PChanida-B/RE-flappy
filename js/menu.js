// Pre-game menu: player name, character choice and the leaderboard.
const menu = document.getElementById('menu');
const nameInput = document.getElementById('player-name');
const playButton = document.getElementById('play');
const errorText = document.getElementById('menu-error');
const leaderboard = document.getElementById('leaderboard');
const characterButtons = document.querySelectorAll('#characters button');

let character = characterButtons[0].dataset.character;
let onPlay = null;

try {
	nameInput.value = localStorage.getItem('playerName') || '';
	const saved = localStorage.getItem('character');
	// ignore a saved choice from an older version that no longer exists
	if ([...characterButtons].some(b => b.dataset.character === saved)) character = saved;
} catch (e) {}

function selectCharacter(key){
	character = key;
	characterButtons.forEach(b => b.classList.toggle('selected', b.dataset.character === key));
}

characterButtons.forEach(b => b.addEventListener('click', () => selectCharacter(b.dataset.character)));
selectCharacter(character);

async function loadLeaderboard(){
	leaderboard.textContent = '';
	try {
		const res = await fetch('/api/leaderboard');
		const rows = await res.json();
		if (!res.ok) throw new Error(rows.error);
		for (const row of rows){
			const li = document.createElement('li');
			const score = document.createElement('span');
			score.className = 'score';
			score.textContent = row.score;
			li.append(score, row.name); // textContent only, names can't inject HTML
			leaderboard.append(li);
		}
		if (rows.length === 0) leaderboard.textContent = 'No scores yet';
	} catch (e) {
		leaderboard.textContent = 'Leaderboard unavailable';
	}
}

playButton.addEventListener('click', async () => {
	const name = nameInput.value.trim();
	if (!name){
		errorText.textContent = 'Please enter your name';
		return;
	}
	errorText.textContent = '';
	nameInput.blur(); // close the mobile keyboard before the game starts
	playButton.disabled = true;
	try {
		const res = await fetch('/api/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, character })
		});
		const session = await res.json();
		if (!res.ok) throw new Error(session.error);
		try {
			localStorage.setItem('playerName', name);
			localStorage.setItem('character', character);
		} catch (e) {}
		menu.hidden = true;
		onPlay({ name, character, session });
	} catch (e) {
		errorText.textContent = e.message || 'Could not reach the server';
	} finally {
		playButton.disabled = false;
	}
});

// Show the menu; resolves with { name, character, session } when the player hits Play.
export function openMenu(){
	menu.hidden = false;
	loadLeaderboard();
	return new Promise(resolve => { onPlay = resolve; });
}

export async function submitScore(sessionId, flaps){
	const res = await fetch('/api/score', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sessionId, flaps })
	});
	const result = await res.json();
	if (!res.ok) throw new Error(result.error);
	return result;
}
