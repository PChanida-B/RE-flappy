import assets from './assets.js';
import FlappyBird from './FlappyBird.js';
import { createSim, step, TICK_MS, BIRD_X, BIRD_START_Y, GROUND_Y, PIPE_BOTTOM_OFFSET } from './sim.js';
import { openMenu, submitScore } from './menu.js';

class FlappyBirdScene extends Phaser.Scene {
	constructor(){
		super("FlappyBird");
	}

	preload(){
		let game = this;

		// scene assets
		// same art for day and night
		this.load.image(assets.scene.background.day, 'assets/background-day.png');
		this.load.image(assets.scene.background.night, 'assets/background-day.png');
		this.load.image(assets.scene.ground, 'assets/ground-sprite.png');

		this.load.image(assets.scene.startGame, 'assets/startgame.png');
		this.load.image(assets.scene.gameOver, 'assets/gameover.png');
		this.load.image(assets.scene.restartGame, 'assets/restart-button.png');
		
		[assets.obstacle.pipe.orange].forEach(function(pipe){
			game.load.image(pipe.top, `assets/${pipe.top}.png`);
			game.load.image(pipe.bottom, `assets/${pipe.bottom}.png`);
		});

		assets.characters.forEach(function(key){
			game.load.image(key, `assets/characters/${key}.png`);
		});
		this.load.image(assets.scoreboard.score, 'assets/score.png');
	}

	create(){
		let game = this;
		this.cameras.main.setZoom(3).centerOn(144, 256);

		// background
		// 288x512 art; its bottom edge sits on top of the ground strip at y=412,
		// so the houses stand on the ground and only plain sky goes off the top
		this.backgroundDay = this.add.image(assets.scene.width, 412, assets.scene.background.day).setOrigin(0.5, 1).setInteractive();
		this.backgroundNight = this.add.image(assets.scene.width, 412, assets.scene.background.night).setOrigin(0.5, 1).setInteractive();
		this.backgroundNight.visible = false;

		this.pipeSprites = new Map(); // sim pipe id -> { top, bottom } images

		// ground: one long strip drawn twice side by side; update() slides both
		// left and wraps. (A TileSprite would resample the art and blur it.)
		this.groundStrips = [0, 1].map(() =>
			this.add.image(0, 412, assets.scene.ground).setOrigin(0, 0).setDepth(20));
		this.groundOffset = 0;
		this.groundMoving = false;
		
		// start, over, repeat
		this.start = this.add.image(assets.scene.width, 156, assets.scene.startGame);
		this.start.setDepth(30);
		this.start.visible = false;

		// 86px tall art; sits high enough to leave room for the player name at y=134
		this.gameOver = this.add.image(assets.scene.width, 88, assets.scene.gameOver);
		this.gameOver.setDepth(20);
		this.gameOver.visible = false;

		this.restart = this.add.image(assets.scene.width, 300, assets.scene.restartGame).setInteractive();
		this.restart.setDepth(20);
		this.restart.visible = false;
		this.restart.on('pointerdown', () => this.restartGame(this));

		this.scoreboard = this.add.image(assets.scene.width, 200, assets.scoreboard.score);
		this.scoreboard.scale = 0.5;
		this.scoreboard.setDepth(30);

		this.scoreTxt = this.add.text(assets.scene.width, 40, 
			'0', { 
					fontFamily: 'font1', 
					fontSize: '38px', 
					fill: '#fff', 
					stroke: '#000',
					strokeThickness: 4,
					strokeLinecap: 'square',
					shadow: {
						offsetX: 2.5,
						offsetY: 3,
						color: '#000',
						blur: 0,
						stroke: true,
						fill: true
					}
				}
			);
		this.scoreTxt.setDepth(30);
		this.scoreTxt.setOrigin(0.5); //center text
		this.scoreTxt.alpha = 0;

		this.scored = this.add.text(assets.scene.width+5, 186, 
			'0', { 
					fontFamily: 'font1', 
					fontSize: '18px', 
					fill: '#fff', 
					stroke: '#000',
					strokeThickness: 3,
				}
			);
		this.scored.setDepth(30);
		this.scored.setOrigin(0.5);

		this.bestScore = this.add.text(assets.scene.width+5, 225, 
			'0', { 
					fontFamily: 'font1', 
					fontSize: '18px', 
					fill: '#fff', 
					stroke: '#000',
					strokeThickness: 3,
				}
			);
		this.bestScore.setDepth(30);
		this.bestScore.setOrigin(0.5, 0.5);

		// result of the server-side score check, shown on game over
		this.statusTxt = this.add.text(assets.scene.width, 360,
			'', {
					fontFamily: 'font1',
					fontSize: '16px',
					fill: '#fff',
					stroke: '#000',
					strokeThickness: 3,
				}
			);
		this.statusTxt.setDepth(30);
		this.statusTxt.setOrigin(0.5);

		// player name on the game over screen, so a screenshot shows who scored
		this.playerName = this.add.text(assets.scene.width, 134,
			'', {
					fontFamily: 'font1, sans-serif',
					fontSize: '16px',
					fill: '#fff',
					stroke: '#000',
					strokeThickness: 3,
				}
			);
		this.playerName.setDepth(30);
		this.playerName.setOrigin(0.5);
		this.playerName.visible = false;

		// controls: works for mobile too
		this.input.on('pointerdown', function () {
			this.flapBird();
		}, this);

		this.showMenu();
	}

	showMenu(){
		this.start.visible = false;
		this.scoreboard.visible = false;
		this.groundMoving = true;
		openMenu().then(({ name, character, session }) => this.initGame(name, character, session));
	}

	update(time, delta){
		// same speed as the pipes (100px/s in sim.js)
		if (this.groundMoving){
			const stripWidth = this.groundStrips[0].width;
			this.groundOffset = (this.groundOffset + 100 * delta / 1000) % stripWidth;
			this.groundStrips.forEach((strip, i) => { strip.x = i * stripWidth - this.groundOffset; });
		}

		if (this.isGameOver){
			// cosmetic: let the dead bird drop to the ground
			if (this.flappyBird.y < GROUND_Y - 12){
				this.deadVelocity += 0.4;
				this.flappyBird.y = Math.min(this.flappyBird.y + this.deadVelocity, GROUND_Y - 12);
			}
			return;
		}
		if (!this.hasGameStarted) return;

		// run the simulation at a fixed 60 ticks/s whatever the frame rate
		this.accumulator = Math.min(this.accumulator + delta, 250);
		while (this.accumulator >= TICK_MS && !this.sim.dead){
			this.accumulator -= TICK_MS;
			const flap = this.pendingFlap;
			this.pendingFlap = false;
			if (flap) this.flaps.push(this.sim.tick);

			const score = this.sim.score;
			step(this.sim, flap);
			if (flap) this.flappyBird.flap();
			else this.flappyBird.falls();
			if (this.sim.score !== score) this.updateScore();
		}

		this.flappyBird.y = this.sim.y;
		this.syncPipes();
		if (this.sim.dead) this.hitBird();
	}

	initGame(name, character, session){
		this.session = session;
		this.playerName.setText(name);
		this.playerName.visible = false;
		this.sim = createSim(session.seed);
		this.flaps = [];
		this.pendingFlap = false;
		this.accumulator = 0;
		this.score = 0;
		this.isGameOver = false;
		this.hasGameStarted = false;

		this.start.visible = true;
		this.gameOver.visible = false;
		this.scoreboard.visible = false;
		this.scored.visible = false;
		this.bestScore.visible = false;
		this.statusTxt.setText('');
		this.backgroundDay.visible = true;
		this.backgroundNight.visible = false;
		this.currentPipe = assets.obstacle.pipe.orange;
		// wait centered under the start image; startGame() slides it to BIRD_X
		this.flappyBird = new FlappyBird(this, assets.scene.width, BIRD_START_Y, character);
		this.groundMoving = true;
	}

	flapBird(){
		if (!this.sim || this.isGameOver) return;
		if (!this.hasGameStarted) this.startGame();
		this.pendingFlap = true;
	}

	saveScore(){
		let bestScore = parseInt(localStorage.getItem('bestScore'));
		if (bestScore){
			localStorage.setItem('bestScore', Math.max(this.score, bestScore));
			this.bestScore.setText(bestScore);
		} else {
			localStorage.setItem('bestScore', this.score);
			this.bestScore.setText(0);
		}
		this.scored.setText(this.score);
		this.scored.visible = true;
		this.bestScore.visible = true;
	}

	hitBird(){
		this.saveScore();
		this.isGameOver = true;
		this.deadVelocity = 0;
		this.scoreboard.visible = true;
		this.hasGameStarted = false;
		this.flappyBird.die();
		this.groundMoving = false;
		this.gameOver.visible = true;
		this.playerName.visible = true;
		this.restart.visible = true;
		this.scoreTxt.setText('');

		// the server replays the flaps and computes the official score
		const session = this.session;
		const showStatus = text => { if (this.session === session) this.statusTxt.setText(text); };
		this.statusTxt.setText('Submitting...');
		submitScore(session.id, this.flaps)
			.then(result => showStatus(`Rank #${result.rank}`))
			.catch(err => showStatus(err.message || 'Submit failed'));
	}

	restartGame(scene){
		scene.pipeSprites.forEach(sprites => { sprites.top.destroy(); sprites.bottom.destroy(); });
		scene.pipeSprites.clear();
		scene.flappyBird.destroy();
		scene.sim = null;
		scene.session = null;
		scene.isGameOver = false;
		scene.gameOver.visible = false;
		scene.playerName.visible = false;
		scene.scoreboard.visible = false;
		scene.scored.visible = false;
		scene.bestScore.visible = false;
		scene.restart.visible = false;
		scene.statusTxt.setText('');
		scene.scoreTxt.setText('0');
		scene.scoreTxt.alpha = 0;
		scene.showMenu();
	}

	updateScore(){
		this.score = this.sim.score;

		if (this.score % 10 == 0){
			this.backgroundDay.visible = !this.backgroundDay.visible;
			this.backgroundNight.visible = !this.backgroundNight.visible;
		}
		this.scoreTxt.setText(this.score);
	}

	startGame(){
		this.scoreTxt.alpha = 1;
		this.hasGameStarted = true;
		this.start.visible = false;
		// cosmetic only: the simulation already treats the bird as being at BIRD_X
		this.tweens.add({ targets: this.flappyBird, x: BIRD_X, duration: 150 });
	}

	// create, move and remove pipe images to match the simulation
	syncPipes(){
		const alive = new Set();
		for (const pipe of this.sim.pipes){
			alive.add(pipe.id);
			let sprites = this.pipeSprites.get(pipe.id);
			if (!sprites){
				sprites = {
					top: this.add.image(pipe.x, pipe.top, this.currentPipe.top),
					bottom: this.add.image(pipe.x, pipe.top + PIPE_BOTTOM_OFFSET, this.currentPipe.bottom)
				};
				this.pipeSprites.set(pipe.id, sprites);
			}
			sprites.top.x = pipe.x;
			sprites.bottom.x = pipe.x;
		}
		this.pipeSprites.forEach((sprites, id) => {
			if (alive.has(id)) return;
			sprites.top.destroy();
			sprites.bottom.destroy();
			this.pipeSprites.delete(id);
		});
	}
}

export default FlappyBirdScene;