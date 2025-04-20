const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: '*', // zezwala na połączenie z dowolnego źródła (np. Twoja gra lokalnie lub z innego hosta)
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log('✅ Nowy gracz połączony:', socket.id);

  socket.emit('welcome', 'Witaj w grze online!');

  socket.on('disconnect', () => {
    console.log('❌ Gracz rozłączony:', socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});