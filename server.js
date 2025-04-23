import * as THREE from 'three';
import { GLTFLoader } from 'GLTFLoader';

const loadingManager = new THREE.LoadingManager();
const socket = io('https://g1teste.onrender.com');

socket.on('connect', () => {
	console.log('🟢 Połączono z serwerem!', socket.id);
});

socket.on('disconnect', () => {
	console.log('🔴 Rozłączono z serwerem');
});

loadingManager.onStart = () => {
	document.getElementById('loading-screen').style.display = 'flex';
};

loadingManager.onLoad = () => {
	document.getElementById('loading-screen').style.display = 'none';
};

loadingManager.onProgress = (url, loaded, total) => {
	const percent = Math.round((loaded / total) * 100);
	document.getElementById('loading-text').innerText = `Ładowanie... ${percent}%`;
};

const loader = new GLTFLoader(loadingManager);
const textureLoader = new THREE.TextureLoader(loadingManager);

const players = {};
const monsters = {};
const syncedMonsters = {};

let scene, camera, renderer, player, keys = {};
let velocityY = 0;
let isJumping = false;
const gravity = -0.05;
let groundLevel = 0;
let cameraDistance = 14;
let isMouseDown = false;
let prevMouseX = 0, prevMouseY = 0;
let cameraAngle = 0, cameraPitch = 0.6;
let projectiles = [];
let player_name;
let playerHP = 100;
let playerMana = 100;
let player_initial_positions;
let lastAttackTime = 0, attackCooldown = 2000;
let fireballCooldown = 500, lastFireballTime = 0;
const monsterAttackCooldown = 1500;
let speedBoostActive = false;
let baseSpeed = 0.06;
let boostedSpeed = 0.12;
let currentSpeed = baseSpeed;
let speedBoostCooldown = 10000;
let lastSpeedBoostTime = 0;
let currentlyHighlighted = null;
let originalMaterials = new Map();
let idleTime = 0;
let clickStartX = 0;
let clickStartY = 0;
let clickMoved = false;

let selected_target = null;
let prevPlayerPosition = new THREE.Vector3();

const terrainObjects = []; // obiekty terenu z kolizją

let playerXP = 0;
let playerLevel = 1;

const playerSkills = {
	melee: { level: 1, exp: 0 },
	ranged: { level: 1, exp: 0 },
	magic: { level: 1, exp: 0 }
};

const skillExpTable = [];


let base = 10;
for (let i = 1; i <= 100; i++) {
  skillExpTable[i] = Math.floor(base);
  base *= 1.15; // zwiększ o 15% dla każdego poziomu
}

const xpTable = [];

for (let level = 1; level <= 100; level++) {
  const xpRequired = Math.floor(100 * Math.pow(level, 1.5));
  xpTable.push(xpRequired);
}

const clock = new THREE.Clock();
const mixers = [];

function createBasicPlayerMesh(playerId, color = 0x00aaff) {
	const material = new THREE.MeshStandardMaterial({ color });
	const group = new THREE.Group();

	const circle = new THREE.Mesh(
		new THREE.RingGeometry(0.7, 0.8, 32),
		new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide })
	);
	circle.rotation.x = -Math.PI / 2;
	circle.visible = false;
	scene.add(circle);
	group.circle = circle;

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.4), material);
	head.position.y = 2.2;
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2), material);
	body.position.y = 1.2;
	const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), material);
	leg1.position.set(-0.15, 0.3, 0);
	const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), material);
	leg2.position.set(0.15, 0.3, 0);

	[head, body, leg1, leg2].forEach(part => part.userData.playerId = playerId);
	group.userData.playerId = playerId;
	group.add(head, body, leg1, leg2);

	return group;
}

function addOtherPlayer(data) {
	const other = createBasicPlayerMesh(data.id, 0x00aaff);
	other.position.set(data.position.x, data.position.y, data.position.z);
	scene.add(other);

	const clickableBox = createClickableBox();
	clickableBox.position.set(data.position.x, data.position.y + 1.5, data.position.z);
	clickableBox.userData.targetMesh = other;
	scene.add(clickableBox);
	other.clickableBox = clickableBox;

	const healthBar = createHealthBar(data.player_name);
	const hpBarMesh = healthBar.children[0];
	healthBar.position.set(0, 2.8, 0);
	scene.add(healthBar);

	const hpPercent = Math.max(data.hp / 100, 0);
	hpBarMesh.scale.x = hpPercent;
	hpBarMesh.position.x = -(1 - hpPercent) / 2;

	players[data.id] = {
		id: data.id,
		hp: data.hp,
		player_name: data.player_name,
		mesh: other,
		clickableBox,
		healthBar,
		hpBarMesh,
		circle: other.circle
	};
}

document.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		chat_is_open = !chat_is_open;
		$(".chat-form").toggle();
		$(".chat-form input").focus();
		return;
	}

	if (chat_is_open) return;

	keys[e.key.toLowerCase()] = true;

	if (e.key === ' ' && !isJumping) {
		velocityY = 1;
		isJumping = true;
	}

	if (e.key === '2') {
		if (!selected_target) {
			search_nearest_target();
		} else {
			use_skill('attack');
		}
	}
});

document.addEventListener('keyup', (e) => {
	keys[e.key.toLowerCase()] = false;
});

function updateHealthBar(target, newHp) {
	const hpPercent = Math.max(newHp / 100, 0);
	if (target?.hpBarMesh) {
		target.hpBarMesh.scale.x = hpPercent;
		target.hpBarMesh.position.x = -(1 - hpPercent) / 2;
	}
}

function startGame() {
	
	init();
	animate();
  
	socket.emit('newPlayer', {
		id: loggedInPlayerId,
		position: {
			x: player.position.x,
			y: player.position.y,
			z: player.position.z
		}
	});
	
	socket.on('map_objects', (objects) => {
		objects.forEach(obj => {
			if (obj.type === 'wall') {
				const geometry = new THREE.BoxGeometry(obj.size.x, obj.size.y, obj.size.z);
				const material = new THREE.MeshLambertMaterial({ color: obj.color });
				const mesh = new THREE.Mesh(geometry, material);
				mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
				scene.add(mesh);
				terrainObjects.push(mesh);
			}
		});
	});
	
	socket.on('chat_history', (messages) => {
		messages.forEach(({ message_from_player_name, message }) => {
			$(".chat .messages").append('<div class="item"><p><span>'+message_from_player_name+"</span>: "+message+'</p></div>');
		});
	});
	
	socket.on('chat_message', ({ sender, message }) => {
		$(".chat .messages").append('<div class="item"><p><span>'+sender+"</span>: "+message+'</p></div>');
	});
	
	socket.on('player_respawned', ({ id, projectile_id, position, hp }) => {
		if (id === socket.id) {
			player.position.set(position.x, position.y, position.z);
			playerHP = hp;
		}
		else {
			if (players[id]) {
				players[id].mesh.position.set(position.x, position.y, position.z);
				players[id].hp = hp;
				if (players[id].hpBarMesh) {
					players[id].hpBarMesh.scale.x = 1;
					players[id].hpBarMesh.position.x = 0;
				}
			}
		}
	});
	
	socket.on('register_damage', (data) => {
		const { target_id, damage, crit } = data;
		if (target_id === socket.id) {
			playerHP = Math.max(0, playerHP - damage);
			updateHealthBar(player, playerHP);
			showDamage(damage, player.position.clone().add(new THREE.Vector3(0, 1.5, 0)), crit);
		} else if (players[target_id]) {
			players[target_id].hp = Math.max(0, players[target_id].hp - damage);
			updateHealthBar(players[target_id], players[target_id].hp);
			showDamage(damage, players[target_id].mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), crit);
		}
	});
	
	socket.on('use_skill', (data) => {
		
		const fireball = new THREE.Mesh(
			new THREE.SphereGeometry(0.2),
			new THREE.MeshBasicMaterial({ color: 0xff5500 })
		);
		
		fireball.userData.id = data.id;
		fireball.userData.target_id = data.target_id;
		fireball.userData.target_type = data.target_type;
		
		fireball.position.set(
			data.start_position.x,
			data.start_position.y,
			data.start_position.z
		);
		
		scene.add(fireball);
		projectiles.push(fireball);
		
	});
	
	socket.on('monstersUpdate', (updatedMonsters) => {
		updatedMonsters.forEach(monster => {
			const mesh = syncedMonsters[monster.id];
			if (mesh) {
				mesh.userData.targetPosition = {
					x: monster.position.x,
					y: monster.position.y,
					z: monster.position.z
				};
			}
		});
	});
	
	socket.on('projectileHit', ({ projectileId }) => {
		const index = projectiles.findIndex(p => p.userData.id === projectileId);
		if (index !== -1) {
			scene.remove(projectiles[index]);
			projectiles.splice(index, 1);
		}
	});
	
	socket.on('playerHPUpdate', ({ id, hp }) => {
		if (id === socket.id) {
			playerHP = hp;

			if (player.hpBarMesh) {
				player.hpBarMesh.scale.x = Math.max(hp / 100, 0);
				player.hpBarMesh.position.x = -(1 - hp / 100) / 2;
			}
		} else {
			const player = players[id];
			if (player) {
				player.hp = hp;
				if (player.hpBarMesh) {
					player.hpBarMesh.scale.x = Math.max(hp / 100, 0);
					player.hpBarMesh.position.x = -(1 - hp / 100) / 2;
				}
			}
		}
	});

	socket.on('currentPlayers', (players) => {
		for (const id in players) {
			if (id !== socket.id) {
				addOtherPlayer(players[id]);
			}
		}
	});

	socket.on('newPlayerJoined', (data) => {
		if (data.id !== socket.id) {
			addOtherPlayer(data);
		}
	});

	socket.on('playerMoved', (data) => {
		const other = players[data.id];
		if (other?.mesh?.position) {
			other.mesh.position.set(data.position.x, data.position.y, data.position.z);
			if (other.clickableBox) {
				other.clickableBox.position.set(
					data.position.x,
					data.position.y + 1.5,
					data.position.z
				);
			}
		}
	});

	socket.on('playerDisconnected', (id) => {
		const player = players[id];
		if (player) {
			scene.remove(player.mesh);
			scene.remove(player.healthBar);
			scene.remove(player.circle);
			delete players[id];
		}
	});
	  
	socket.on('monstersState', (monsters) => {
		Object.values(monsters).forEach(monster => {
			const mesh = add_monster(monster);
			syncedMonsters[monster.id] = mesh;
		});
	});
	
	socket.emit('player_ready_to_play');
	
}

function init() {
	
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87CEEB);

	camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
	renderer = new THREE.WebGLRenderer();
	renderer.setSize(window.innerWidth, window.innerHeight);
  
	if (!document.body.contains(renderer.domElement)) {
		document.body.appendChild(renderer.domElement);
	}
  
	createHill(20, 20, 10, 5);
	createHill(10, 10);
	createHill(-15, -10, 8);
		
	textureLoader.load('./22.png?v=1', (texture) => {
	  const grassTexture = texture;
	  grassTexture.wrapS = THREE.RepeatWrapping;
	  grassTexture.wrapT = THREE.RepeatWrapping;
	  grassTexture.repeat.set(1, 1);

	  const grounda = new THREE.Mesh(
		new THREE.PlaneGeometry(40, 20),
		new THREE.MeshLambertMaterial({ map: grassTexture })
	  );
	  grounda.position.y = 0.01;
	  grounda.rotation.x = -Math.PI / 2; // 👈 to ustawia trawę poziomo
	  scene.add(grounda);
	});

	const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ color: 0x228B22 }));
	ground.rotation.x = -Math.PI / 2;
	scene.add(ground);

	const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
	player = new THREE.Group();
	
	// OCZY
	const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
	const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
	const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
	leftEye.position.set(-0.12, 2.25, 0.37); // lewy
	const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
	rightEye.position.set(0.12, 2.25, 0.37); // prawy
	
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.4), bodyMaterial);
	head.name = 'player_head';
	head.position.y = 2.2;
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2), bodyMaterial);
	body.position.y = 1.2;
	const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), bodyMaterial);
	leg1.position.set(-0.15, 0.3, 0);
	const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), bodyMaterial);
	leg2.position.set(0.15, 0.3, 0);
	player.add(head, body, leg1, leg2, leftEye, rightEye);
  
	player.position.set(
		player_initial_positions?.x || 0,
		player_initial_positions?.y || groundLevel,
		player_initial_positions?.z || 0
	);
  
	scene.add(player);
	player.healthBar = createHealthBar(player_name);
	player.hpBarMesh = player.healthBar.children[0];
	scene.add(player.healthBar);
	player.hpBarMesh.scale.x = Math.max(playerHP / 100, 0);
	player.hpBarMesh.position.x = -(1 - playerHP / 100) / 2;
	
	// 👇 Dodaj klikany hitbox dla lokalnego gracza (żeby inni mogli zaznaczać)
	const clickableBox = createClickableBox();
	clickableBox.position.set(player.position.x, player.position.y + 1.5, player.position.z);
	clickableBox.userData.targetMesh = player;
	scene.add(clickableBox);
	player.clickableBox = clickableBox;
	
	const playerCircle = createSelectionCircle();
	scene.add(playerCircle);
	player.circle = playerCircle;
	
	players[socket.id] = {
		id: socket.id,
		hp: playerHP,
		player_name: player_name,
		mesh: player,
		clickableBox: player.clickableBox,
		healthBar: player.healthBar,
		hpBarMesh: player.hpBarMesh,
		circle: playerCircle
	};

	const dirLight = new THREE.DirectionalLight(0xffffff, 1);
	dirLight.position.set(5, 10, 7.5);
	scene.add(dirLight);
	scene.add(new THREE.AmbientLight(0x404040));
  
  
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();

	renderer.domElement.addEventListener('click', (e) => {
		
		if (clickMoved) return;

		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouse, camera);

		const allTargets = [
			...Object.values(monsters).map(m => m.clickableBox),
			...Object.values(players).map(p => p.clickableBox)
		];

		const intersects = raycaster.intersectObjects(allTargets, true);

		Object.values(monsters).forEach(m => {
			if (m.circle) {
				m.circle.visible = false;
			}
		});

		Object.values(players).forEach(p => {
			if (p.circle) p.circle.visible = false;
		});

		selected_target = null;

		if (intersects.length > 0) {
	const clicked = intersects[0].object;

	// Szukamy celu – potwór
	const monster = Object.values(monsters).find(m => m.clickableBox === clicked);
	if (monster) {
		// Ukryj stare kółka
		Object.values(monsters).forEach(m => m.circle.visible = false);
		Object.values(players).forEach(p => p.circle.visible = false);

		monster.circle.visible = true;
		selected_target = {
			id: monster.id,
			type: 'monster',
			mesh: monster.mesh,
			circle: monster.circle
		};
		return;
	}

	// Szukamy celu – gracz
	const player = Object.values(players).find(p => p.clickableBox === clicked);
	if (player) {
		Object.values(monsters).forEach(m => m.circle.visible = false);
		Object.values(players).forEach(p => p.circle.visible = false);

		player.circle.visible = true;
		selected_target = {
			id: player.id,
			type: 'player',
			mesh: player.mesh,
			circle: player.circle
		};
		return;
	}
} else if (!clickMoved) {
	// odznacz cel TYLKO jeśli to był prawdziwy klik (a nie przeciągnięcie)
	Object.values(monsters).forEach(m => m.circle.visible = false);
	Object.values(players).forEach(p => p.circle.visible = false);
	selected_target = null;
}
		
	});
	
	renderer.domElement.addEventListener('mouseleave', () => {
		isMouseDown = false;
	});

	window.addEventListener('blur', () => {
		isMouseDown = false;
	});

	window.addEventListener('resize', () => {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	});

	window.addEventListener('wheel', (e) => {
		cameraDistance += e.deltaY * 0.01;
		cameraDistance = Math.max(2, Math.min(15, cameraDistance));
	});

	renderer.domElement.addEventListener('mousedown', (e) => {
		isMouseDown = true;
		clickMoved = false;
		clickStartX = e.clientX;
		clickStartY = e.clientY;
		prevMouseX = e.clientX;
		prevMouseY = e.clientY;
	});
  
	renderer.domElement.addEventListener('mouseup', () => isMouseDown = false);
	
	renderer.domElement.addEventListener('mousemove', (e) => {
		const rect = renderer.domElement.getBoundingClientRect();
		const mouse = new THREE.Vector2(
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-((e.clientY - rect.top) / rect.height) * 2 + 1
		);

		if (isMouseDown) {
			const deltaX = e.clientX - prevMouseX;
			const deltaY = e.clientY - prevMouseY;
			prevMouseX = e.clientX;
			prevMouseY = e.clientY;
			cameraAngle -= deltaX * 0.006;
			cameraPitch += deltaY * 0.006;
			cameraPitch = Math.max(0.06, Math.min(Math.PI / 3, cameraPitch));
			const movedX = Math.abs(e.clientX - clickStartX);
			const movedY = Math.abs(e.clientY - clickStartY);
			if (movedX > 3 || movedY > 3) {
				clickMoved = true;
			}
		}

		raycaster.setFromCamera(mouse, camera);
		
		const highlightCandidates = [
			...Object.values(monsters).map(m => m.clickableBox),
			...Object.values(players).map(p => p.clickableBox)
		];

		const intersects = raycaster.intersectObjects(highlightCandidates, true);

		if (!intersects.length) {
	// 👈 Jeśli nie ma nic pod myszką – resetuj
	renderer.domElement.style.cursor = 'default';
	if (currentlyHighlighted && originalMaterials.has(currentlyHighlighted.mesh)) {
		if (currentlyHighlighted.mesh instanceof THREE.Group) {
			const materials = originalMaterials.get(currentlyHighlighted.mesh);
			currentlyHighlighted.mesh.children.forEach((child, i) => {
				if (child.material && materials[i]) {
					child.material = materials[i];
				}
			});
		} else {
			currentlyHighlighted.mesh.material = originalMaterials.get(currentlyHighlighted.mesh);
		}
		originalMaterials.delete(currentlyHighlighted.mesh);
	}
	currentlyHighlighted = null;
}
else {
	// 👉 Jest coś pod kursorem
	const hit = intersects[0].object;
	const meshToHighlight = hit.userData.targetMesh;

	// Jeśli już coś jest podświetlone i to ten sam mesh – nic nie rób
	if (currentlyHighlighted?.mesh === meshToHighlight) return;

	// Resetuj poprzedni highlight (np. gdy zmieniono obiekt)
	if (currentlyHighlighted && originalMaterials.has(currentlyHighlighted.mesh)) {
		if (currentlyHighlighted.mesh instanceof THREE.Group) {
			const materials = originalMaterials.get(currentlyHighlighted.mesh);
			currentlyHighlighted.mesh.children.forEach((child, i) => {
				if (child.material && materials[i]) {
					child.material = materials[i];
				}
			});
		} else {
			currentlyHighlighted.mesh.material = originalMaterials.get(currentlyHighlighted.mesh);
		}
		originalMaterials.delete(currentlyHighlighted.mesh);
	}

	// Nowy highlight
	renderer.domElement.style.cursor = 'pointer';

	if (meshToHighlight instanceof THREE.Group) {
		const children = meshToHighlight.children.filter(c => c.material);
		originalMaterials.set(meshToHighlight, children.map(c => c.material));
		children.forEach(c => {
			c.material = new THREE.MeshStandardMaterial({ color: 0xffff88 });
		});
	} else if (meshToHighlight instanceof THREE.Mesh) {
		originalMaterials.set(meshToHighlight, meshToHighlight.material);
		meshToHighlight.material = new THREE.MeshStandardMaterial({ color: 0xffff88 });
	}

	currentlyHighlighted = { clickable: hit, mesh: meshToHighlight };
}
		
		if (intersects.length > 0) {
			const hit = intersects[0].object;
			const meshToHighlight = hit.userData.targetMesh;

			if (meshToHighlight instanceof THREE.Group) {
				// Gracz
				const children = meshToHighlight.children.filter(c => c.material);
				if (!originalMaterials.has(meshToHighlight)) {
					originalMaterials.set(meshToHighlight, children.map(c => c.material));
				}
				children.forEach(c => {
					c.material = new THREE.MeshStandardMaterial({ color: 0xffff88 });
				});
				currentlyHighlighted = { clickable: hit, mesh: meshToHighlight };
			}
			else if (meshToHighlight instanceof THREE.Mesh && meshToHighlight.material) {
				// Potwór
				if (!originalMaterials.has(meshToHighlight)) {
					originalMaterials.set(meshToHighlight, meshToHighlight.material);
				}
				meshToHighlight.material = new THREE.MeshStandardMaterial({ color: 0xffff88 });
				currentlyHighlighted = { clickable: hit, mesh: meshToHighlight };
			}
		}
		
	});
  
	textureLoader.load('./10450_Rectangular_Grass_Patch_v1_Diffuse.jpg?v=1', (texture) => {
		const grassTexture = texture;
		grassTexture.wrapS = THREE.RepeatWrapping;
		grassTexture.wrapT = THREE.RepeatWrapping;
		grassTexture.repeat.set(33, 33);

		const grounda = new THREE.Mesh(
		new THREE.PlaneGeometry(100, 100),
		new THREE.MeshLambertMaterial({ map: grassTexture })
		);
		grounda.rotation.x = -Math.PI / 2; // 👈 to ustawia trawę poziomo
		scene.add(grounda);
	});

	// 🏠 Budynek 2x większy
	const buildingGroup = new THREE.Group();

	// Ściany
	const wallsMaterial = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
	const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), wallsMaterial); // x2
	walls.position.y = 3; // środek ścian na wysokości 3

	// Dach
	const roofGeometry = new THREE.ConeGeometry(6, 3, 4); // x2
	const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x884400 });
	const roof = new THREE.Mesh(roofGeometry, roofMaterial);
	roof.position.y = 6 + 1.5; // wysokość ścian + połowa wysokości dachu
	roof.rotation.y = Math.PI / 4;

	// Drzwi
	const doorGeometry = new THREE.BoxGeometry(2, 4, 0.2); // x2
	const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x442200 });
	const door = new THREE.Mesh(doorGeometry, doorMaterial);
	door.position.set(0, 2, 4.05); // drzwi z przodu budynku (z offsetem)

	// Dodanie do grupy
	buildingGroup.add(walls);
	buildingGroup.add(roof);
	buildingGroup.add(door);
	buildingGroup.position.set(-10, 0.01, 10); // pozycja budynku
	scene.add(buildingGroup);

	// Kolizje (opcjonalnie)
	terrainObjects.push(walls);
  
}

function search_nearest_target() {
	
	let closest = null;
	let dist = null;
	let min_distance = Infinity;
	
	Object.values(monsters).forEach(monster => {
		if (monster.hp <= 0) return;
		const dist = monster.mesh.position.distanceTo(player.position);
		if (dist <= 20 && dist < min_distance) {
			min_distance = dist;
			closest = {
				id: monster.id,
				type: 'monster',
				mesh: monster.mesh,
				circle: monster.circle
			};
		}
	});
	
	Object.entries(players).forEach(([id, other]) => {
		const dist = other.mesh.position.distanceTo(player.position);
		if (dist <= 20 && dist < min_distance) {
			min_distance = dist;
			closest = {
				id,
				type: 'player',
				mesh: other.mesh,
				circle: other.circle
			};
		}
	});
	
	if (closest) {
		selected_target = closest;
		Object.values(monsters).forEach(m => m.circle.visible = false);
		closest.circle.visible = true;
	}
	
}

function createMonsterMesh(monster) {
	const material = new THREE.MeshStandardMaterial({ color: 0x000000 });
	const geometry = new THREE.SphereGeometry(0.6, 16, 16);
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.copy(monster.position);
	return mesh;
}

function createSelectionCircle() {
	const circle = new THREE.Mesh(
		new THREE.RingGeometry(0.7, 0.8, 32),
		new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide })
	);
	circle.rotation.x = -Math.PI / 2;
	circle.visible = false;
	return circle;
}

function add_monster(monster) {
	const mesh = createMonsterMesh(monster);
	scene.add(mesh);

	const clickableBox = createClickableBox();
	clickableBox.position.set(monster.position.x, monster.position.y + 1.5, monster.position.z);
	clickableBox.userData.targetMesh = mesh;
	scene.add(clickableBox);

	const healthBar = createHealthBar("Monster");
	scene.add(healthBar);

	const circle = createSelectionCircle();
	scene.add(circle);

	const monsterData = {
		id: monster.id,
		monster_id: monster.monster_id,
		mesh,
		clickableBox,
		hp: monster.hp ?? 100,
		healthBar,
		damage: { basic: 10 },
		circle,
		provoked: false,
		origin: mesh.position.clone(),
		lastAttack: 0,
		targetPosition: null,
		lastWanderTime: 0
	};

	monsters[monster.id] = monsterData;
	updateMinimap();
	return mesh;
}

function createHill(x, z, radius = 10, height = 6) {
	const geometry = new THREE.CylinderGeometry(0.1, radius, height, 32, 1, true);
	const material = new THREE.MeshLambertMaterial({ color: 0x228B22 });
	const hill = new THREE.Mesh(geometry, material);
	hill.castShadow = true;
	hill.receiveShadow = true;
	hill.position.set(x, height / 2, z);
	hill.rotation.y = Math.random() * Math.PI;
	hill.userData.type = 'hill';
	scene.add(hill);
	terrainObjects.push(hill);
}

function createClickableBox(size = 2) {
	const geometry = new THREE.BoxGeometry(size, size, size);
	const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0 });
	const box = new THREE.Mesh(geometry, material);
	box.userData.isClickableArea = true;
	return box;
}

function createHealthBarMesh(color, zOffset) {
	const geometry = new THREE.PlaneGeometry(1, 0.1);
	const material = new THREE.MeshBasicMaterial({
		color,
		side: THREE.DoubleSide,
		transparent: true
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(0, 0.3, zOffset);
	return mesh;
}

function createNameLabel(text) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 64;

	const ctx = canvas.getContext('2d');
	ctx.fillStyle = 'white';
	ctx.font = 'bold 34px Arial';
	ctx.textAlign = 'center';
	ctx.fillText(text, canvas.width / 2, 40);

	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false // <- zawsze na wierzchu
	});

	const sprite = new THREE.Sprite(material);
	sprite.center.set(0.5, 0.5);
	sprite.scale.set(2.5, 0.6, 1); // domyślna skala
	sprite.renderOrder = 10;

	return sprite;
}

function createHealthBar(name = '') {
	const group = new THREE.Group();
	group.userData.isHealthBar = true;

	const bar = createHealthBarMesh(0xff0000, 0.001);
	const background = createHealthBarMesh(0x000000, 0);
	background.material.opacity = 0.4;
	background.material.transparent = true;

	group.add(bar);
	group.add(background);

	const label = createNameLabel(name);
	group.userData.label = label;
	group.add(label);

	return group;
}

function use_skill(skill_name) {
	
	if (!selected_target) return;
	
	socket.emit('use_skill', {
		from: socket.id,
		skill_name: skill_name,
		target_id: selected_target?.id,
		target_type: selected_target?.type,
		start_position: {
			x: player.position.x,
			y: player.position.y + 2,
			z: player.position.z
		}
	});
	
}

function updateMixers(delta) {
	mixers.forEach(m => m.update(delta));
}

function updatePlayerMovement() {
	if (keys['w']) movePlayer(-currentSpeed);
	if (keys['s']) movePlayer(currentSpeed);
	if (keys['a']) strafePlayer(-currentSpeed);
	if (keys['d']) strafePlayer(currentSpeed);

	const downRaycaster = new THREE.Raycaster(
		new THREE.Vector3(player.position.x, 50, player.position.z),
		new THREE.Vector3(0, -1, 0)
	);

	const intersects = downRaycaster.intersectObjects(terrainObjects, true);
	const terrainY = intersects.length > 0 ? intersects[0].point.y : groundLevel;

	const isMoving = keys.w || keys.a || keys.s || keys.d || isJumping;

	if (!isMoving) {
		idleTime += clock.getDelta();
		const idleOffset = Math.sin(idleTime * 2) * 0.02;
		player.position.y = terrainY + groundLevel + idleOffset;
	} else {
		player.position.y = terrainY + groundLevel;
	}
	
	if (player.clickableBox) {
		player.clickableBox.position.set(
			player.position.x,
			player.position.y + 1.5,
			player.position.z
		);
	}

	if (isJumping) {
		player.position.y += velocityY;
		velocityY += gravity;
		if (player.position.y <= groundLevel) {
			player.position.y = groundLevel;
			isJumping = false;
		}
	}
}

function updateCamera() {
	camera.position.x = player.position.x + cameraDistance * Math.sin(cameraAngle) * Math.cos(cameraPitch);
	camera.position.z = player.position.z + cameraDistance * Math.cos(cameraAngle) * Math.cos(cameraPitch);
	camera.position.y = player.position.y + cameraDistance * Math.sin(cameraPitch);
	camera.lookAt(player.position);
}

function updateHealthBars() {
	updateOneHealthBar(player, player.position);
	Object.values(players).forEach(other => {
		if (other.mesh && other.healthBar) {
			const pos = other.mesh.position.clone();
			updateOneHealthBar(other, pos);
		}
	});
}

function updateOneHealthBar(entity, position) {
	const barGroup = entity.healthBar;
	if (!barGroup) return;

	barGroup.position.set(position.x, position.y + 2.8, position.z);

	// Obracaj całą grupę tak, jak login (względem lokalnej kamery)
	barGroup.quaternion.copy(camera.quaternion);

	const label = barGroup.userData.label;
	if (label) {
		const dist = camera.position.distanceTo(position);
		const scaleFactor = Math.min(1 + dist * 0.05, 6);

		label.scale.set(1.5 * scaleFactor, 0.4 * scaleFactor, 1);
		label.material.opacity = dist > 100 ? 0 : 1;
		label.material.transparent = true;
		label.position.set(0, 0.6, 0);
	}
}

function updateTargetCircle() {
	if (!selected_target || !selected_target.mesh?.getWorldPosition) return;
	const worldPos = new THREE.Vector3();
	selected_target.mesh.getWorldPosition(worldPos);
	selected_target.circle.position.set(worldPos.x, worldPos.y + 0.03, worldPos.z);
}

function updateHeadRotation() {
	const head = player.getObjectByName('player_head');
	if (!head) return;

	const movementDir = new THREE.Vector3().subVectors(player.position, prevPlayerPosition);
	if (movementDir.lengthSq() > 0.0001) {
		const angle = Math.atan2(movementDir.x, movementDir.z);
		head.rotation.y = angle;
	}
	prevPlayerPosition.copy(player.position);
}

function animate() {
	requestAnimationFrame(animate);

	const delta = clock.getDelta();
	updateMixers(delta);
	updatePlayerMovement();
	updateCamera();
	updateHealthBars();
	updateTargetCircle();
	updateProjectiles();
	updateMinimap();
	updateHeadRotation();

	socket?.emit('updatePosition', {
		id: loggedInPlayerId,
		x: player.position.x,
		y: player.position.y,
		z: player.position.z
	});

	renderer.render(scene, camera);
}

function isPositionBlocked(x, z) {
	const playerRadius = 0.5;
	const playerHeight = 1.8;
	const playerFeetY = player.position.y;

	for (const obj of terrainObjects) {
		const box = new THREE.Box3().setFromObject(obj);

		// Ignoruj bardzo cienkie (płaskie) obiekty – np. trawę
		if (obj.userData?.type === 'hill') continue;
		if ((box.max.y - box.min.y) < 0.2) continue;

		const intersectsXZ =
			x + playerRadius > box.min.x &&
			x - playerRadius < box.max.x &&
			z + playerRadius > box.min.z &&
			z - playerRadius < box.max.z;

		const intersectsY = playerFeetY < box.max.y && (playerFeetY + playerHeight) > box.min.y;

		if (intersectsXZ && intersectsY) return true;
	}
	return false;
}

function movePlayer(value) {
	const newX = player.position.x + value * Math.sin(cameraAngle);
	const newZ = player.position.z + value * Math.cos(cameraAngle);
	if (!isPositionBlocked(newX, newZ)) {
		player.position.x = newX;
		player.position.z = newZ;
	}
}

function strafePlayer(value) {
	const newX = player.position.x + value * Math.cos(cameraAngle);
	const newZ = player.position.z - value * Math.sin(cameraAngle);
	if (!isPositionBlocked(newX, newZ)) {
		player.position.x = newX;
		player.position.z = newZ;
	}
}

function showDamage(amount, position, isCrit = false) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;

	const ctx = canvas.getContext('2d');
	ctx.font = 'bold 58px Arial'; // ciut większa
	ctx.fillStyle = isCrit ? 'yellow' : '#ff5555'; // jaśniejszy czerwony
	ctx.textAlign = 'center';
	ctx.fillText(`-${amount}`, canvas.width / 2, 70);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;

	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false
	});

	const sprite = new THREE.Sprite(material);

	const offset = new THREE.Vector3(-0.8, 1.8, 0);
	sprite.position.copy(position.clone().add(offset));

	sprite.scale.set(2.8, 1.2, 1);
	scene.add(sprite);

	const duration = 1500;
	const startTime = performance.now();

	function animateDamage() {
		const now = performance.now();
		const elapsed = now - startTime;

		if (elapsed < duration) {
			sprite.material.opacity = 1 - (elapsed / duration);
			sprite.position.y += 0.015;
			sprite.lookAt(camera.position);
			requestAnimationFrame(animateDamage);
		} else {
			scene.remove(sprite);
			sprite.material.map.dispose();
			sprite.material.dispose();
		}
	}

	animateDamage();
}

function updateMinimap() {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const size = 150;

  // Czyste tło
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, size, size);

  const zoom = 30; // 30x30 jednostek w minimapie
  const scale = size / zoom;

  // Środek minimapy to pozycja gracza
  const centerX = player.position.x;
  const centerZ = player.position.z;

  // Rysowanie gracza (żółty punkt na środku)
  ctx.fillStyle = 'yellow';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Rysowanie potworów
  ctx.fillStyle = 'red';
  Object.values(monsters).forEach(monster => {
    const dx = (monster.mesh.position.x - centerX) * scale;
    const dz = (monster.mesh.position.z - centerZ) * scale;
    const px = size / 2 + dx;
    const pz = size / 2 + dz;
    ctx.beginPath();
    ctx.arc(px, pz, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // (Opcjonalnie: ramka)
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(0, 0, size, size);
}


let lastAreaSkillTime = 0;
const areaSkillCooldown = 1000;

function showLoot(lootArray) {
  const box = document.getElementById('loot-box');
  box.innerHTML = `<strong>Loot:</strong><br>${lootArray.join("<br>")}`;
  box.style.display = 'block';
  setTimeout(() => box.style.display = 'none', 5000);
}
const playerBagDiv = document.getElementById('player-bag');
if (playerBagDiv) {
  makeBagDraggable(playerBagDiv);
}
function makeBagDraggable(bagElement) {
  let offsetX = 0, offsetY = 0;
  let isDragging = false;

  bagElement.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - bagElement.offsetLeft;
    offsetY = e.clientY - bagElement.offsetTop;
    bagElement.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    bagElement.style.left = `${e.clientX - offsetX}px`;
    bagElement.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    bagElement.style.cursor = 'move';
  });
}

function updateProjectiles() {
	for (let i = projectiles.length - 1; i >= 0; i--) {
		const projectile = projectiles[i];
		const { target_id, target_type } = projectile.userData;

		let target;
		if (target_type === 'monster') {
			target = monsters[target_id];
		}
		else if (target_type === 'player') {
			target = target_id === socket.id ? { mesh: player } : players[target_id];
		}
		if (!target || !target.mesh || !target.mesh.position) {
			scene.remove(projectile);
			projectiles.splice(i, 1);
			continue;
		}

		const target_position = target.mesh.position.clone();
		const direction = new THREE.Vector3().subVectors(target_position, projectile.position).normalize();

		const raycaster = new THREE.Raycaster(projectile.position.clone(), direction, 0, 0.6);
		const hits = raycaster.intersectObjects(terrainObjects, true);

		if (hits.length > 0) {
			scene.remove(projectile);
			projectiles.splice(i, 1);
			continue;
		}

		projectile.position.add(direction.multiplyScalar(0.3));

		if (projectile.position.distanceTo(target_position) < 0.6 && target.mesh.visible) {
			scene.remove(projectile);
			projectiles.splice(i, 1);
		}
	}
}

let loggedInPlayerId = null;
let chat_is_open = false;

$('#chat-form').on('submit', function(e) {
	e.preventDefault();
	const input = document.getElementById('chat-input');
	const message = input.value.trim();
	if (message.length > 0) {
		socket.emit('chat_message', message);
		input.value = '';
	}
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
	
	e.preventDefault();

	const res = await fetch('https://g1teste.onrender.com/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ player_email: e.target.user_email.value, player_pass: e.target.user_pass.value })
	});

	const data = await res.json();

	if (data.success) {
		loggedInPlayerId = data.id;
		player_initial_positions = data.position;
		playerHP = data.hp ?? 100;
		player_name = data.player_name;
		document.querySelector('.start-screen').style.display = 'none';
		$(".start-screen").hide();
		startGame();
	}
	else {
		alert(data.error || "Błąd logowania");
	}
	
});


