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
		id: 1,
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 20 },
		direction: { x: 1, z: 0 },
		speed: 0.03,
		timer: 0
	},
	{
		id: 2,
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 10 },
		direction: { x: 1, z: 0 },
		speed: 0.03,
		timer: 0
	},
	{
		id: 3,
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 30 },
		direction: { x: 1, z: 0 },
		speed: 0.03,
		timer: 0
	},
	{
		id: 4,
		monster_id: 0,
		position: { x: 0, y: 0.5, z: 15 },
		direction: { x: 1, z: 0 },
		speed: 0.03,
		timer: 0
	}
];

io.on('connection', (socket) => {
	
	socket.on('player_ready_to_play', () => {
		socket.emit('monstersState', monsters);
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
	
	monsters.forEach(monster => {
		
		monster.position.x += monster.direction.x * monster.speed;
		monster.position.z += monster.direction.z * monster.speed;

		monster.timer += 100;
		
		if (monster.timer >= 5000) {
			monster.timer = 0;
			const angle = Math.random() * Math.PI * 2;
			monster.direction.x = Math.cos(angle);
			monster.direction.z = Math.sin(angle);
		}
		
		console.log(monster.id + " idzie..." + monster.position);
		
	});

	io.emit('monstersUpdate', monsters);
  
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
