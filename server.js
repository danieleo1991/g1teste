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
const { Vector3, Raycaster, Box3 } = require('three');
const server = http.createServer(app);
const port = process.env.PORT || 3000;

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
	ssl: { rejectUnauthorized: false }
});

app.post('/login', async (req, res) => {
	try {
		const { player_email, player_pass } = req.body;
		const result = await pool.query("SELECT * FROM players WHERE player_email = $1", [player_email]);
		if (result.rows.length === 0) return res.status(401).json({ error: "Brak użytkownika" });
		const user = result.rows[0];
		if (player_pass !== user.player_pass) return res.status(401).json({ error: "Błędne hasło" });
		res.json({
			success: true,
			id: user.id,
			hp: user.hp,
			player_name: user.player_name,
			position: { x: user.x, y: user.y, z: user.z }
		});
		console.log("Zalogował się, ID: " + user.id);
	} catch (err) {
		console.error("Błąd podczas logowania:", err);
		res.status(500).json({ error: "Błąd serwera" });
	}
});

const players = {};
const projectiles = {};
const terrain_objects = {};
const skill_cooldowns = {};
const skill_last_use = {};

const skills = {
	attack: {
		damage: 10,
		cooldown: 1000
	},
	fireball: {
		damage: 30,
		cooldown: 3000
	},
	heal: {
		damage: -20,
		cooldown: 5000
	}
};

const monsters = [
	{
		id: 0,
		name: 'Dragon',
		hp: 100,
		speed: 0.15
	},
	{
		id: 1,
		name: 'Rat',
		hp: 200,
		speed: 0.3
	}
];

//const mapObjects = require('./map_objects.json');

const mapObjects = [
  {
    type: "wall",
    position: { x: 0, y: 0, z: 0 },
    size: { x: 4, y: 4, z: 0.5 },
    color: 8947848
  },
  {
    type: "wall",
    position: { x: 5, y: 0, z: 5 },
    size: { x: 4, y: 4, z: 0.5 },
    color: 8947848
  },
  {
    type: "wall",
    position: { x: -5, y: 0, z: -5 },
    size: { x: 4, y: 4, z: 0.5 },
    color: 8947848
  },
  {
    type: "wall",
    position: { x: 10, y: 0, z: 0 },
    size: { x: 4, y: 4, z: 0.5 },
    color: 8947848
  },
  {
    type: "wall",
    position: { x: 0, y: 0, z: 10 },
    size: { x: 4, y: 4, z: 0.5 },
    color: 8947848
  }
];

/*
const monsters_spawns = [
	{ id: crypto.randomUUID(), monster_id: 0, position: { x: 0, y: 0.6, z: 20 }, direction: { x: 1, z: 0 }, timer: 0 },
	{ id: crypto.randomUUID(), monster_id: 0, position: { x: 0, y: 0.6, z: 10 }, direction: { x: 1, z: 0 }, timer: 0 },
	{ id: crypto.randomUUID(), monster_id: 0, position: { x: 0, y: 0.6, z: 30 }, direction: { x: 1, z: 0 }, timer: 0 },
	{ id: crypto.randomUUID(), monster_id: 0, position: { x: 0, y: 0.6, z: 15 }, direction: { x: 1, z: 0 }, timer: 0 },
	{ id: crypto.randomUUID(), monster_id: 1, position: { x: 0, y: 0.6, z: 5 }, direction: { x: 1, z: 0 }, timer: 0 }
];
*/
const monsters_spawns = [];

function isLineObstructed(start, end) {
	for (const obj of mapObjects) {
		if (!obj.size || !obj.position) continue;

		const halfSize = {
			x: obj.size.x / 2,
			y: obj.size.y / 2,
			z: obj.size.z / 2
		};

		const min = {
			x: obj.position.x - halfSize.x,
			y: obj.position.y - halfSize.y, // 👈 poprawione!
			z: obj.position.z - halfSize.z
		};

		const max = {
			x: obj.position.x + halfSize.x,
			y: obj.position.y + halfSize.y, // 👈 poprawione!
			z: obj.position.z + halfSize.z
		};

		if (lineIntersectsBox(start, end, min, max)) {
			console.log("💥 TRAFIONA kolizja z:", obj.position, obj.size);
			return true;
		}
	}
	return false;
}

function lineIntersectsBox(start, end, min, max) {
	let tmin = 0.0;
	let tmax = 1.0;
	const delta = {
		x: end.x - start.x,
		y: end.y - start.y,
		z: end.z - start.z
	};

	const check = (axis) => {
		if (Math.abs(delta[axis]) < 1e-6) {
			const inside = start[axis] >= min[axis] && start[axis] <= max[axis];
			if (!inside) {
				console.log(`❌ ${axis} poza zakresem: ${start[axis]} vs [${min[axis]}, ${max[axis]}]`);
			}
			return inside;
		}
		const ood = 1.0 / delta[axis];
		let t1 = (min[axis] - start[axis]) * ood;
		let t2 = (max[axis] - start[axis]) * ood;
		if (t1 > t2) [t1, t2] = [t2, t1];
		tmin = Math.max(tmin, t1);
		tmax = Math.min(tmax, t2);
		return tmax >= tmin;
	};

	const result = check('x') && check('y') && check('z');
	if (result) {
		console.log("✅ TRAFIŁO W OBIEKT");
	}
	return result;
}

function checkProjectileCollision(position) {
	for (const obj of mapObjects) {
		if (!obj.size || !obj.position) continue;
		const halfSize = {
			x: obj.size.x / 2,
			y: obj.size.y / 2,
			z: obj.size.z / 2
		};

		const min = {
			x: obj.position.x - halfSize.x,
			y: obj.position.y,
			z: obj.position.z - halfSize.z
		};

		const max = {
			x: obj.position.x + halfSize.x,
			y: obj.position.y + obj.size.y,
			z: obj.position.z + halfSize.z
		};

		if (
			position.x >= min.x && position.x <= max.x &&
			position.y >= min.y && position.y <= max.y &&
			position.z >= min.z && position.z <= max.z
		) {
			return true; // trafiono w przeszkodę
		}
	}
	return false;
}

function isPositionBlocked(x, z) {
	const playerRadius = 0.5;
	const playerHeight = 1.8;
	const y = 0.6; // przyjmujemy stałą wysokość nóg gracza

	for (const obj of mapObjects) {
		if (!obj.size || !obj.position) continue;

		const min = {
			x: obj.position.x - obj.size.x / 2,
			y: obj.position.y,
			z: obj.position.z - obj.size.z / 2
		};

		const max = {
			x: obj.position.x + obj.size.x / 2,
			y: obj.position.y + obj.size.y,
			z: obj.position.z + obj.size.z / 2
		};

		const intersectsXZ =
			x + playerRadius > min.x &&
			x - playerRadius < max.x &&
			z + playerRadius > min.z &&
			z - playerRadius < max.z;

		const intersectsY = y < max.y && (y + playerHeight) > min.y;

		if (intersectsXZ && intersectsY) return true;
	}
	return false;
}

io.on('connection', (socket) => {
	
	socket.on('player_ready_to_play', async () => {
		try {
			const result = await pool.query("SELECT message_from_player_name, message FROM chat_messages ORDER BY message_id DESC LIMIT 10");
			const messages = result.rows.reverse();
			socket.emit('chat_history', messages);
			socket.emit('monstersState', monsters_spawns);
			socket.emit('map_objects', mapObjects);
		} catch (err) {
			console.error("❌ Błąd przy pobieraniu historii czatu:", err);
		}
	});

	socket.on('newPlayer', async (data) => {
		
		const result = await pool.query("SELECT * FROM players WHERE id = $1", [data.id]);
		const player_name = result.rows[0]?.player_name;
		players[socket.id] = {
			id: socket.id,
			position: {
				x: result.rows[0].x ?? 0,
				y: result.rows[0].y ?? 0.6,
				z: result.rows[0].z ?? 0
			},
			hp: result.rows[0]?.hp,
			player_name: player_name,
			attack: result.rows[0]?.attack ?? 10,
			crit: result.rows[0]?.crit ?? 5,
			last_position: {
				x: result.rows[0].x ?? 0,
				y: result.rows[0].y ?? 0.6,
				z: result.rows[0].z ?? 0
			},
		};
		
		socket.emit('currentPlayers', players);
		
		socket.broadcast.emit('newPlayerJoined', {
			id: socket.id,
			position: {
				x: result.rows[0].x ?? 0,
				y: result.rows[0].y ?? 0.6,
				z: result.rows[0].z ?? 0
			},
			hp: result.rows[0]?.hp,
			player_name: player_name
		});
		
		try {
			await pool.query("UPDATE players SET socket_id = $1 WHERE id = $2", [socket.id, data.id]);
		}
		catch (err) {
			console.error("❌ Błąd przy zapisie socket_id do bazy:", err);
		}
		
	});
	
	socket.on('chat_message', async (msg) => {
		try {
			await pool.query("INSERT INTO chat_messages (message_from, message_from_player_name, message, message_to, message_to_player_name) VALUES ($1, $2, $3, NULL, NULL)",
			[
				socket.id,
				players[socket.id]?.player_name,
				msg
			]);
			io.emit('chat_message', {
				sender: players[socket.id]?.player_name,
				message: msg
			});
		}
		catch (err) {
			console.error("❌ Błąd przy obsłudze wiadomości czatu:", err);
		}
	});

	// USE SKILL
	socket.on('use_skill', (data) => {
		if (!skills[data.skill_name]) return;
		if (!skill_last_use[socket.id]) skill_last_use[socket.id] = {};
		const now = Date.now();
		const last_use = skill_last_use[socket.id][data.skill_name] || 0;
		const cooldown = skills[data.skill_name].cooldown;
		if (now - last_use < cooldown) return;
		skill_last_use[socket.id][data.skill_name] = now;

		const attacker = players[socket.id];
		if (!attacker) return;
		
		const start_position = {
			x: players[socket.id].position.x,
			y: players[socket.id].position.y + 1.2,
			z: players[socket.id].position.z
		};

		const projectile = {
			id: crypto.randomUUID(),
			from: socket.id,
			start_position,
			current_position: { ...start_position },
			target_id: data.target_id,
			target_type: data.target_type,
			skill_name: data.skill_name
		};
		
		projectiles[projectile.id] = projectile;
		io.emit('use_skill', projectile);
	});

	socket.on('updatePosition', async (data) => {
		const player = players[socket.id];
		if (!player) return;

		const dx = data.x - player.last_position.x;
		const dz = data.z - player.last_position.z;
		const distance = Math.sqrt(dx * dx + dz * dz);

		const maxDistance = 0.3;

		const blocked = isPositionBlocked(data.x, data.z);

		if (distance > maxDistance || blocked) return;

		player.position = { x: data.x, y: data.y, z: data.z };
		player.last_position = { x: data.x, y: data.y, z: data.z };

		socket.broadcast.emit('playerMoved', { id: socket.id, position: data });

		try {
			await pool.query("UPDATE players SET x = $1, y = $2, z = $3 WHERE id = $4", [data.x, data.y, data.z, data.id]);
		} catch (err) {
			console.error("❌ Błąd przy zapisie pozycji do bazy:", err);
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

setInterval(() => {
	for (const id in projectiles) {
			
		if (!projectiles[id]) continue;
		
		const projectile = projectiles[id];
		
		const attacker = players[projectile.from];
		if (!attacker) {
			delete projectiles[id];
			continue;
		}
		
		let target;
		
		if (projectile.target_type === 'player') {
			target = players[projectile.target_id];
		}
		else if (projectile.target_type === 'monster') {
			target = monsters_spawns.find(m => m.id === projectile.target_id);
		}

		if (!target || !projectile.current_position) {
			delete projectiles[id];
			continue;
		}

		const dir = {
			x: target.position.x - projectile.current_position.x,
			y: target.position.y - projectile.current_position.y,
			z: target.position.z - projectile.current_position.z
		};

		const length = Math.sqrt(dir.x**2 + dir.y**2 + dir.z**2);
		const normalized = {
			x: dir.x / length,
			y: dir.y / length,
			z: dir.z / length
		};

		if (checkProjectileCollision(projectile.current_position)) {
			io.emit('projectileHit', { projectileId: projectile.id });
			delete projectiles[id];
			continue;
		}
		
		target.position.y += 1.2;
		
		const dx = target.position.x - projectile.current_position.x;
		const dy = target.position.y - projectile.current_position.y;
		const dz = target.position.z - projectile.current_position.z;
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
		
		projectile.current_position = {
			x: projectile.current_position.x + normalized.x * 0.3,
			y: projectile.current_position.y + normalized.y * 0.3,
			z: projectile.current_position.z + normalized.z * 0.3
		};
		
		if (distance < 0.6) {

			const obstructed = isLineObstructed(projectile.current_position, target.position);
			
			if (obstructed) {
				console.log("❌ Zablokowany przez przeszkodę!");
				io.emit('projectileHit', { projectileId: projectile.id });
				delete projectiles[id];
				continue;
			}

			const baseAttack = attacker?.attack ?? 10;
			const critChance = attacker?.crit ?? 5;
			let damage = Math.floor(baseAttack * (0.5 + Math.random() * 0.5));
			let isCrit = false;

			if (Math.random() * 100 < critChance) {
				damage *= 2;
				isCrit = true;
			}

			if (projectile.target_type === 'player') {
				const player = players[projectile.target_id];
				player.hp = Math.max(0, player.hp - damage);

				pool.query('UPDATE players SET hp = $1 WHERE socket_id = $2', [player.hp, player.id]).catch(err => console.error("❌ Błąd przy zapisie do bazy:", err));

				if (player.hp <= 0) {
					const respawn_position = { x: 0, y: 0.6, z: 0 };
					player.hp = 100;
					player.position = { ...respawn_position };
					io.emit('player_respawned', {
						id: projectile.target_id,
						projectile_id: projectile.id,
						position: { ...respawn_position },
						hp: player.hp
					});
					pool.query('UPDATE players SET hp = $1, x = $2, y = $3, z = $4 WHERE socket_id = $5', [
						player.hp,
						player.position.x,
						player.position.y,
						player.position.z,
						projectile.target_id
					]).catch(err => console.error("❌ Błąd przy zapisie do bazy:", err));
				}
			}

			io.emit('register_damage', {
				target_id: projectile.target_id,
				target_type: projectile.target_type,
				damage: damage,
				crit: isCrit
			});

			delete projectiles[id];
		}
	}
}, 20);

server.listen(port);
