import FlappyBirdScene from './js/FlappyBirdScene.js';

window.onload = function(){
    var config = {
        type: Phaser.AUTO,
        pixelArt: true, // scale up with hard pixel edges instead of blurring
        scale: {
            mode: Phaser.Scale.FIT,
            // 3x the 288x512 world; the camera zooms in so game logic keeps
            // using 288x512 coordinates while sprites rotate on a finer grid
            width: 288 * 3,
            height: 512 * 3
        },
        scene : [ FlappyBirdScene ]
    };

    var game = new Phaser.Game(config);
}

