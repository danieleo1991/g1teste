const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({
	origin: 'https://stepmedia.pl',
	methods: ['GET', 'POST', 'PUT', 'DELETE'],
	credentials: false
}));
app.use(express.json());

const http = require('http');
const crypto = require('crypto');
const server = http.createServer(app);

const { Pool } = require('pg');
const { Server } = require('socket.io');

const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST']
	}
});

const pool = new Pool({
	user: 'g1_user',
	host: 'dpg-d02hi2buibrs73at5820-a',
	database: 'g1',
	password: 'H9QYEitTuF0eQo1vTLVxCWJF2sNy5tdR',
	port: 5432,
	ssl: { rejectUnauthorized: false } // ważne na Render
});

app.post('/login', async (req, res) => {
  try {
    const { player_email, player_pass } = req.body; // ← TO BYŁO POTRZEBNE!

    const result = await pool.query(
      "SELECT * FROM players WHERE player_email = $1",
      [player_email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Brak użytkownika" });
    }

    const user = result.rows[0];

    if (player_pass !== user.player_pass) {
      return res.status(401).json({ error: "Błędne hasło" });
    }

    res.json({
		success: true,
		id: user.id,
		position: {
			x: user.x,
			y: user.y,
			z: user.z
		}
    });
	
	console.log("Zalogował się, ID: " + user.id);
	
	} catch (err) {
		console.error("Błąd podczas logowania:", err);
		res.status(500).json({ error: "Błąd serwera" });
	}
	
});

const players = {};

const monsters = [
	{
		id: 0,
		hp: 100,
		speed: 0.15
	},
	{
		id: 1,
		hp: 200,
		speed: 0.3
	}
]

const monsters_spawns = [
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.6, z: 20 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.6, z: 10 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.6, z: 30 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.6, z: 15 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 1,
		position: { x: 0, y: 0.6, z: 5 },
		direction: { x: 1, z: 0 },
		timer: 0
	}
];

io.on('connection', (socket) => {
	
	socket.on('player_ready_to_play', () => {
		socket.emit('monstersState', monsters_spawns);
	});

	socket.on('newPlayer', (data) => {
		players[socket.id] = {
			id: socket.id,
			position: data.position
		};
		socket.emit('currentPlayers', players);
		socket.broadcast.emit('newPlayerJoined', players[socket.id]);
	});
	
	socket.on('createProjectile', (data) => {
		io.emit('spawnProjectile', data);
	});

	socket.on('updatePosition', async (data) => {
	  
		if (players[socket.id]) {
			
			players[socket.id].position = {
				x: data.x,
				y: data.y,
				z: data.z
			};
	
			socket.broadcast.emit('playerMoved', {
				id: socket.id,
				position: data
			});
			
			try {
				await pool.query("UPDATE players SET x = $1, y = $2, z = $3 WHERE id = $4", [data.x, data.y, data.z, data.id]);
			}
			catch (err) {
				console.error("❌ Błąd przy zapisie pozycji do bazy:", err);
			}
		  
		}
	
	});

	socket.on('disconnect', () => {
		console.log(`🔴 Użytkownik rozłączony: ${socket.id}`);
		delete players[socket.id];
		io.emit('playerDisconnected', socket.id);
	});
  
});

setInterval(() => {

	const MAP_BOUND = 49;

	monsters_spawns.forEach(monster => {

		monster.position.x += monster.direction.x * monsters[monster.monster_id].speed;
		monster.position.z += monster.direction.z * monsters[monster.monster_id].speed;

		if (
			monster.position.x > MAP_BOUND || monster.position.x < -MAP_BOUND ||
			monster.position.z > MAP_BOUND || monster.position.z < -MAP_BOUND
		) {
			monster.position.x -= monster.direction.x * monsters[monster.monster_id].speed;
			monster.position.z -= monster.direction.z * monsters[monster.monster_id].speed;
			const angle = Math.random() * Math.PI * 2;
			monster.direction.x = Math.cos(angle);
			monster.direction.z = Math.sin(angle);
		}
		
		monster.timer += 100;
		if (monster.timer >= 5000) {
			monster.timer = 0;
			const angle = Math.random() * Math.PI * 2;
			monster.direction.x = Math.cos(angle);
			monster.direction.z = Math.sin(angle);
		}

	});

	io.emit('monstersUpdate', monsters_spawns);

}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
