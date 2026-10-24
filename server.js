const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname + '/public'));
const server = http.createServer(app);
const io = new Server(server);

const MAX_HP = 100, DAMAGE = 20, FIRE_GAP_MS = 120;
const players = {};
const num = v => (Number.isFinite(v) ? v : 0);
const cleanName = n => String(n || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 14) || 'Player';

io.on('connection', socket => {
  players[socket.id] = { id: socket.id, name: 'Player', x: 0, y: 0, z: 0, yaw: 0, hp: MAX_HP, last: 0, active: false };
  socket.emit('init', { id: socket.id });

  socket.on('name', n => {
    const p = players[socket.id];
    if (p) p.name = cleanName(n);
  });

  socket.on('state', s => {
    const p = players[socket.id];
    if (!p || !s) return;
    p.x = num(s.x); p.y = num(s.y); p.z = num(s.z); p.yaw = num(s.yaw);
    p.active = true; // only show players who have actually started
  });

  // the shooter's client says who it hit; the server keeps the HP
  socket.on('hit', d => {
    const shooter = players[socket.id];
    const target = d && players[d.id];
    if (!shooter || !target || target.id === shooter.id) return;
    const now = Date.now();
    if (now - shooter.last < FIRE_GAP_MS) return;
    shooter.last = now;
    target.hp -= DAMAGE;
    if (target.hp <= 0) {
      target.hp = MAX_HP;
      io.to(target.id).emit('died', { by: shooter.name });
      io.emit('kill', { killer: shooter.name, victim: target.name });
    }
  });

  socket.on('disconnect', () => { delete players[socket.id]; });
});

// broadcast everyone's position, name and HP 20 times a second
setInterval(() => {
  io.emit('players', Object.values(players).filter(p => p.active).map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp
  })));
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('RTMP server on http://localhost:' + PORT));
