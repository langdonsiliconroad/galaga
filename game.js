const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = {
  score: document.getElementById("score"),
  hiScore: document.getElementById("hiscore"),
  stage: document.getElementById("stage"),
  lives: document.getElementById("lives"),
  overlay: document.getElementById("overlay"),
};

const W = canvas.width;
const H = canvas.height;
const STAR_COUNT = 72;
const FORMATION_TOP = 80;
const COLS = 10;
const ROWS = 5;
const CELL_X = 38;
const CELL_Y = 34;

const keys = new Set();
let lastTime = 0;
let running = true;

const state = {
  stage: 1,
  score: 0,
  hiScore: Number(localStorage.getItem("galaga-hi-score") ?? 0),
  lives: 3,
  player: {
    x: W / 2,
    y: H - 60,
    speed: 280,
    cooldown: 0,
    respawnTimer: 0,
    invulnerable: 0,
    alive: true,
  },
  stars: Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: 0.8 + Math.random() * 1.8,
  })),
  playerShots: [],
  enemyShots: [],
  enemies: [],
  explosions: [],
  mode: "intro",
  modeTimer: 2,
  pause: false,
};

const enemyTemplates = {
  grunt: { color: "#ef476f", hp: 1, score: 50, fireRate: 0.003 },
  bee: { color: "#ffd166", hp: 1, score: 80, fireRate: 0.004 },
  boss: { color: "#06d6a0", hp: 2, score: 150, fireRate: 0.005 },
};

function toScoreText(value) {
  return value.toString().padStart(6, "0");
}

function setOverlay(html = "") {
  hud.overlay.innerHTML = html;
}

function buildWave(stage) {
  const enemies = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (row === 4 && (col < 2 || col > 7)) continue;
      const t = row === 0 ? "boss" : row <= 2 ? "bee" : "grunt";
      const templ = enemyTemplates[t];
      enemies.push({
        type: t,
        hp: templ.hp + (t === "boss" && stage > 2 ? 1 : 0),
        maxHp: templ.hp + (t === "boss" && stage > 2 ? 1 : 0),
        baseX: W / 2 - ((COLS - 1) * CELL_X) / 2 + col * CELL_X,
        baseY: FORMATION_TOP + row * CELL_Y,
        x: Math.random() * W,
        y: -120 - Math.random() * 360,
        col,
        row,
        phase: Math.random() * Math.PI * 2,
        entering: true,
        diving: false,
        diveT: 0,
        fireRate: templ.fireRate + stage * 0.0007,
        score: templ.score,
        color: templ.color,
      });
    }
  }
  return enemies;
}

function startStage(stage) {
  state.enemies = buildWave(stage);
  state.enemyShots = [];
  state.playerShots = [];
  state.mode = "intro";
  state.modeTimer = 1.8;
  state.player.x = W / 2;
  state.player.alive = true;
  state.player.invulnerable = 1.5;
  setOverlay(`<strong>STAGE ${stage}</strong>Ready`);
}

function updateHud() {
  hud.score.textContent = toScoreText(state.score);
  hud.hiScore.textContent = toScoreText(state.hiScore);
  hud.stage.textContent = String(state.stage);
  hud.lives.textContent = String(Math.max(state.lives, 0));
}

function addScore(points) {
  state.score += points;
  if (state.score > state.hiScore) {
    state.hiScore = state.score;
    localStorage.setItem("galaga-hi-score", String(state.hiScore));
  }
}

function spawnExplosion(x, y, color = "#fff") {
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    state.explosions.push({
      x,
      y,
      vx: Math.cos(a) * (30 + Math.random() * 80),
      vy: Math.sin(a) * (30 + Math.random() * 80),
      life: 0.4 + Math.random() * 0.35,
      t: 0,
      color,
    });
  }
}

function handleInput(dt) {
  const p = state.player;
  if (!p.alive) return;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) p.x -= p.speed * dt;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) p.x += p.speed * dt;
  p.x = Math.max(18, Math.min(W - 18, p.x));

  p.cooldown -= dt;
  if ((keys.has(" ") || keys.has("Space")) && p.cooldown <= 0) {
    state.playerShots.push({ x: p.x, y: p.y - 18, vy: -520, r: 2.5 });
    p.cooldown = 0.18;
  }
}

function enemyDivePattern(e, dt) {
  e.diveT += dt;
  const t = e.diveT;
  if (t < 0.6) {
    e.x += Math.sin(t * 5 + e.phase) * 90 * dt;
    e.y += 180 * dt;
  } else if (t < 2.8) {
    e.x += Math.sin(t * 7 + e.phase) * 220 * dt;
    e.y += 250 * dt;
  } else {
    e.diveT = 0;
    e.diving = false;
  }
}

function updateEnemies(dt) {
  const alive = [];
  const formationSwing = Math.sin(performance.now() * 0.0017) * 16;

  for (const e of state.enemies) {
    if (e.entering) {
      e.y += 180 * dt;
      e.x += (e.baseX - e.x) * dt * 2.8;
      if (Math.abs(e.y - e.baseY) < 8) e.entering = false;
    } else if (e.diving) {
      enemyDivePattern(e, dt);
    } else {
      e.x = e.baseX + formationSwing + Math.sin(performance.now() * 0.002 + e.phase) * 6;
      e.y = e.baseY + Math.cos(performance.now() * 0.002 + e.phase) * 2;

      const diveChance = 0.0009 + state.stage * 0.00035;
      if (Math.random() < diveChance * dt * 60) {
        e.diving = true;
        e.diveT = 0;
      }

      if (Math.random() < e.fireRate * dt * 60) {
        state.enemyShots.push({ x: e.x, y: e.y + 8, vy: 210 + Math.random() * 90, r: 3 });
      }
    }

    if (e.y < H + 40) alive.push(e);
  }
  state.enemies = alive;
}

function circleHit(a, b, r) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= r * r;
}

function killPlayer() {
  if (!state.player.alive || state.player.invulnerable > 0) return;
  state.player.alive = false;
  spawnExplosion(state.player.x, state.player.y, "#2cf2ff");
  state.lives -= 1;
  if (state.lives < 0) {
    state.mode = "gameover";
    state.modeTimer = 999;
    setOverlay(`<strong>GAME OVER</strong>Press Enter to Restart`);
  } else {
    state.mode = "respawn";
    state.modeTimer = 1.8;
    setOverlay(`<strong>SHIP LOST</strong>Get Ready`);
  }
}

function updateShots(dt) {
  for (const s of state.playerShots) s.y += s.vy * dt;
  for (const s of state.enemyShots) s.y += s.vy * dt;

  state.playerShots = state.playerShots.filter((s) => s.y > -20);
  state.enemyShots = state.enemyShots.filter((s) => s.y < H + 20);

  for (const shot of state.playerShots) {
    for (const e of state.enemies) {
      if (circleHit(shot, e, 13)) {
        shot.y = -999;
        e.hp -= 1;
        if (e.hp <= 0) {
          e.y = H + 100;
          addScore(e.score);
          spawnExplosion(e.x, e.y - 100, e.color);
        } else {
          addScore(30);
        }
        break;
      }
    }
  }

  const p = state.player;
  if (p.alive) {
    for (const shot of state.enemyShots) {
      if (circleHit(shot, p, 13)) {
        shot.y = H + 200;
        killPlayer();
      }
    }

    for (const e of state.enemies) {
      if (circleHit(e, p, 18)) {
        e.y = H + 200;
        addScore(e.score);
        spawnExplosion(e.x, e.y - 110, e.color);
        killPlayer();
      }
    }
  }

  state.playerShots = state.playerShots.filter((s) => s.y > -40);
}

function updateExplosions(dt) {
  const keep = [];
  for (const p of state.explosions) {
    p.t += dt;
    if (p.t < p.life) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      keep.push(p);
    }
  }
  state.explosions = keep;
}

function updateStars(dt) {
  for (const s of state.stars) {
    s.y += s.s * (45 + state.stage * 6) * dt;
    if (s.y > H) {
      s.y = -2;
      s.x = Math.random() * W;
    }
  }
}

function updateMode(dt) {
  if (state.mode === "intro") {
    state.modeTimer -= dt;
    if (state.modeTimer <= 0) {
      state.mode = "play";
      setOverlay("");
    }
    return;
  }
  if (state.mode === "respawn") {
    state.modeTimer -= dt;
    if (state.modeTimer <= 0) {
      state.mode = "play";
      state.player.alive = true;
      state.player.x = W / 2;
      state.player.invulnerable = 1.8;
      setOverlay("");
    }
  }
}

function maybeAdvanceStage() {
  if (state.mode === "play" && state.enemies.length === 0) {
    state.stage += 1;
    startStage(state.stage);
  }
}

function update(dt) {
  if (!running || state.pause) return;
  updateStars(dt);
  updateMode(dt);

  if (state.player.invulnerable > 0) state.player.invulnerable -= dt;

  if (state.mode === "play") {
    handleInput(dt);
    updateEnemies(dt);
    updateShots(dt);
    maybeAdvanceStage();
  }

  updateExplosions(dt);
  updateHud();
}

function drawPlayer() {
  const p = state.player;
  if (!p.alive) return;
  const blink = p.invulnerable > 0 && Math.floor(performance.now() / 80) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = "#2cf2ff";
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(14, 12);
  ctx.lineTo(5, 8);
  ctx.lineTo(0, 13);
  ctx.lineTo(-5, 8);
  ctx.lineTo(-14, 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f6f6f6";
  ctx.fillRect(-2, -10, 4, 10);
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = e.color;
  const wing = 7 + Math.sin(performance.now() * 0.02 + e.phase) * 2;

  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-4, 1);
  ctx.lineTo(-wing - 3, -6);
  ctx.lineTo(-5, -2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(4, 1);
  ctx.lineTo(wing + 3, -6);
  ctx.lineTo(5, -2);
  ctx.closePath();
  ctx.fill();

  if (e.maxHp > 1) {
    ctx.fillStyle = "#0b1b2a";
    ctx.fillRect(-2, -2, 4, 4);
  }
  ctx.restore();
}

function render() {
  ctx.fillStyle = "#01040c";
  ctx.fillRect(0, 0, W, H);

  for (const s of state.stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.s / 4})`;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }

  for (const s of state.playerShots) {
    ctx.fillStyle = "#f9ff7a";
    ctx.fillRect(s.x - 1, s.y - 8, 2, 8);
  }

  for (const s of state.enemyShots) {
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of state.enemies) drawEnemy(e);
  drawPlayer();

  for (const p of state.explosions) {
    const alpha = 1 - p.t / p.life;
    ctx.fillStyle = `${p.color}${Math.floor(alpha * 255)
      .toString(16)
      .padStart(2, "0")}`;
    ctx.fillRect(p.x, p.y, 2, 2);
  }
}

function resetGame() {
  state.stage = 1;
  state.score = 0;
  state.lives = 3;
  state.explosions = [];
  state.enemyShots = [];
  state.playerShots = [];
  startStage(1);
}

function frame(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.033);
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", " ", "Space", "a", "A", "d", "D"].includes(e.key)) {
    e.preventDefault();
    keys.add(e.key);
  }

  if (e.key === "p" || e.key === "P") {
    state.pause = !state.pause;
    setOverlay(state.pause ? "<strong>PAUSED</strong>Press P to Continue" : "");
  }

  if (e.key === "Enter" && state.mode === "gameover") {
    resetGame();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key);
});

setOverlay("<strong>GALAGA</strong>Press Space to Start");

window.addEventListener("keydown", function startHandler(e) {
  if ((e.key === " " || e.key === "Space") && state.mode === "intro") {
    setOverlay("");
    state.modeTimer = 0;
  }
});

startStage(1);
updateHud();
requestAnimationFrame((ts) => {
  lastTime = ts;
  requestAnimationFrame(frame);
});
