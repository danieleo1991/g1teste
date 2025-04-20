const express = require('express');
const app = express();
const http = require('http');
const crypto = require('crypto');
const server = http.createServer(app);

const { Server } = require('socket.io'); // poprawnie importujemy klasę Server

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const players = {};

const monsters = [
	{
		id: 0,
		hp: 100,
		speed: 0.05
	},
	{
		id: 1,
		hp: 200,
		speed: 2
	}
]

const monsters_spawns = [
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 20 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 10 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 30 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 15 },
		direction: { x: 1, z: 0 },
		timer: 0
	},
	{
		id: crypto.randomUUID(),
		monster_id: 1,
		position: { x: 0, y: 0.5, z: 5 },
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

  socket.on('updatePosition', (position) => {
    if (players[socket.id]) {
      players[socket.id].position = position;
      socket.broadcast.emit('playerMoved', { id: socket.id, position });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 Użytkownik rozłączony: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

setInterval(() => {
	
	monsters_spawns.forEach(monster => {
		
		monster.position.x += monster.direction.x * monsters[monster.monster_id].speed;
		monster.position.z += monster.direction.z * monsters[monster.monster_id].speed;

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
