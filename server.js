const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io'); // poprawnie importujemy klasę Server

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const players = {};

io.on('connection', (socket) => {
  console.log(`🟢 Użytkownik połączony: ${socket.id}`);

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
