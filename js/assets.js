const assets = {
    // single-frame 32x32 images in assets/characters/
    characters: ['char-1', 'char-2', 'char-3', 'char-4', 'char-5', 'char-6', 'char-7', 'char-8'],
    obstacle: {
        pipe: {
            orange: {
                top: 'pipe-orange-top',
                bottom: 'pipe-orange-bottom'
            }
        }
    },
    scene: {
        width: 144,
        background: {
            day: 'background-day',
            night: 'background-night'
        },
        ground: 'ground',
        gameOver: 'game-over',
        restartGame: 'restart-button',
        startGame: 'start-game'
    },
    scoreboard: {
        width: 25,
        base: 'number',
        score: 'score'
    },
    animation: {
        ground: {
            moving: 'moving-ground',
            stop: 'stop-ground'
        }
    }
}

export default assets;