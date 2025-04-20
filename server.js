const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app); // 👈 TO jest Twój brakujący "server"
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Obsługa graczy
const players = {};

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  players[socket.id] = { x: 0, y: 0, z: 0 };

  socket.broadcast.emit('playerJoined', { id: socket.id, ...players[socket.id] });
  socket.emit('currentPlayers', players);

  socket.on('updatePosition', (position) => {
    if (players[socket.id]) {
      players[socket.id] = position;
      socket.broadcast.emit('updatePosition', { id: socket.id, position });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Wymagane na Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
