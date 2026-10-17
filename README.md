# RE: flappy

![flappy bird](_docs/logo.png)

# Demo

![flappy bird](_docs/demo.gif)

## Running

Running the game is as simple as:

```npm start```

The game will start at port 3000 on localhost.

The leaderboard needs a MySQL/MariaDB database. Set these environment variables
(tables are created automatically on start):

```
DB_HOST=localhost
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
```

Scores can't be posted directly: the server hands out a random seed per run,
the client sends back only the ticks it flapped on, and the server replays them
with the same simulation (`js/sim.js`) to compute the score.

# About me

Check out [curcio.dev](https://curcio.dev)
