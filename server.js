const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const L = require('./public/level.js').build();

const app = express();
app.use(express.static(__dirname + '/public'));
const server = http.createServer(app);
const io = new Server(server);

const MAX_HP = 100, DAMAGE = 20, FIRE_GAP_MS = 120, RANGE = 90;
const REWIND_CAP_MS = 150, INTERP_MS = 80; // most the server will look back for a shooter
const players = {};
const num = v => (Number.isFinite(v) ? v : 0);
const cleanName = n => String(n || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 14) || 'Player';

function blockedAt(x, y, z) {
  if (y < 0) return true;
  for (const s of L.solids) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && y < s.top) return true;
  for (const r of L.ramps) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) {
    let u = r.ax === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
    if (r.sg < 0) u = 1 - u;
    if (y < r.h * u) return true;
  }
  return false;
}
function clear(o, d, dist) {
  for (let t = 0.5; t < dist; t += 0.5) if (blockedAt(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t)) return false;
  return true;
}
function posAt(p, tm) { // where this player was at server time tm
  const h = p.hist;
  if (!h.length) return null;
  if (tm <= h[0].t) return h[0];
  if (tm >= h[h.length - 1].t) return h[h.length - 1];
  for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= tm) {
    const a = h[i - 1], b = h[i], f = (tm - a.t) / (b.t - a.t || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, sl: f < 0.5 ? a.sl : b.sl };
  }
  return h[h.length - 1];
}
function rayCyl(o, d, p, h, r) { // ray against an upright cylinder, returns distance or -1
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-6) return -1;
  const fx = o[0] - p.x, fz = o[2] - p.z, b = 2 * (fx * d[0] + fz * d[2]), c = fx * fx + fz * fz - r * r, disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return -1;
  const y = o[1] + d[1] * t;
  return y >= p.y - 0.05 && y <= p.y + h ? t : -1;
}

io.on('connection', socket => {
  const me = players[socket.id] = { id: socket.id, sock: socket, name: 'Player', x: 0, y: 0, z: 0, yaw: 0, sl: 0, hp: MAX_HP, last: 0, active: false, rtt: 80, hist: [] };
  socket.emit('init', { id: socket.id });

  socket.on('name', n => { me.name = cleanName(n); });

  socket.on('state', s => {
    if (!s) return;
    const now = Date.now();
    me.x = num(s.x); me.y = num(s.y); me.z = num(s.z); me.yaw = num(s.yaw); me.sl = s.sl ? 1 : 0;
    me.active = true;
    me.hist.push({ t: now, x: me.x, y: me.y, z: me.z, sl: me.sl });
    while (me.hist.length && me.hist[0].t < now - 1000) me.hist.shift();
  });

  // the client only says where it fired from and in which direction; the server decides what was hit
  socket.on('shoot', s => {
    if (!me.active || !s || !Array.isArray(s.o) || !Array.isArray(s.d)) return;
    const now = Date.now();
    if (now - me.last < FIRE_GAP_MS) return;
    me.last = now;
    const o = s.o.slice(0, 3).map(num), d = s.d.slice(0, 3).map(num), len = Math.hypot(d[0], d[1], d[2]);
    if (len < 0.5 || Math.hypot(o[0] - me.x, o[2] - me.z) > 6) return;
    d[0] /= len; d[1] /= len; d[2] /= len;
    socket.broadcast.emit('shot', { id: me.id });
    const tm = now - Math.min(me.rtt + INTERP_MS, REWIND_CAP_MS);
    let best = null, bt = RANGE;
    for (const t of Object.values(players)) {
      if (t.id === me.id || !t.active) continue;
      const p = posAt(t, tm);
      if (!p) continue;
      const hit = rayCyl(o, d, p, p.sl ? 0.85 : 1.7, 0.5);
      if (hit >= 0 && hit < bt) { bt = hit; best = t; }
    }
    if (!best || !clear(o, d, bt)) return;
    socket.emit('hitconf', { id: best.id });
    best.hp -= DAMAGE;
    if (best.hp <= 0) {
      best.hp = MAX_HP;
      io.to(best.id).emit('died', { by: me.name });
      io.emit('kill', { killer: me.name, victim: best.name });
    }
  });

  socket.on('disconnect', () => { delete players[socket.id]; });
});

// measure each player's round-trip time
setInterval(() => {
  for (const p of Object.values(players)) {
    const t0 = Date.now();
    p.sock.timeout(2000).emit('sping', err => { if (!err) p.rtt = Math.min(400, Date.now() - t0); });
  }
}, 2000);

// broadcast everyone's position, name and HP about 30 times a second
setInterval(() => {
  io.emit('players', Object.values(players).filter(p => p.active).map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, sl: p.sl, rtt: p.rtt
  })));
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('RustTide server on http://localhost:' + PORT));
