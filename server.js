const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

const players = {};

io.on('connection', (socket) => {
  console.log(`🟢 Użytkownik połączony: ${socket.id}`);

  // Gdy nowy gracz dołącza
  socket.on('newPlayer', (data) => {
  players[socket.id] = {
    id: socket.id,
    position: {
      x: data.position.x,
      y: data.position.y,
      z: data.position.z
    }
  };

  socket.emit('currentPlayers', players); // wysyła poprawną strukturę
  socket.broadcast.emit('newPlayerJoined', players[socket.id]); // też
});

  // Gdy gracz się porusza
  socket.on('updatePosition', (position) => {
    if (players[socket.id]) {
      players[socket.id].position = position;
      socket.broadcast.emit('playerMoved', { id: socket.id, position });
    }
  });

  // Gdy gracz się rozłącza
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
