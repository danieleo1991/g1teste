const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "*"
  }
});

const players = {};

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  // Tworzenie nowego gracza
  players[socket.id] = {
    x: 0,
    y: 0,
    z: 0
  };

  // Wyślij wszystkim info o nowym graczu
  socket.broadcast.emit('playerJoined', { id: socket.id, ...players[socket.id] });

  // Wyślij nowemu graczowi info o wszystkich innych
  socket.emit('currentPlayers', players);

  // Odbieraj pozycję gracza i przekazuj dalej
  socket.on('updatePosition', (position) => {
    if (players[socket.id]) {
      players[socket.id] = position;
      socket.broadcast.emit('updatePosition', { id: socket.id, position });
    }
  });

  // Rozłączenie gracza
  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
