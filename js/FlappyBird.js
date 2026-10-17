// Visual only: position comes from the simulation (sim.js), this just
// handles the sprite and its tilt.
class FlappyBird extends Phaser.GameObjects.Sprite {
	constructor(scene, x, y, character){
		super(scene, x, y, character);
		scene.add.existing(this);

		this.upwardsVelocity = 0;
		this.angle = -15;
	}

	flap(){
		this.setAngle(-15);
		this.angle = -15;
		this.upwardsVelocity = 30;
	}

	falls(){
		if (this.upwardsVelocity > 0){
			this.upwardsVelocity--;
		}else{
		if (this.angle < 90){
			this.angle += 3;
			this.setAngle(this.angle);
		}}
	}

	die(){
		this.setAngle(90);
		this.setDepth(15); // bring it to the front of everything
	}
}

export default FlappyBird;
