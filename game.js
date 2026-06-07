const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');
const gameWrap = document.getElementById('gameWrap');
const ladderEl = document.getElementById('ladder');
const leaderboardEl = document.getElementById('leaderboard');
const clearScoresBtn = document.getElementById('clearScoresBtn');
const soundBtn = document.getElementById('soundBtn');

const W = canvas.width, H = canvas.height;
const keys = new Set();
const prizeSteps = [900, 1900, 3300, 5200, 7600, 10500];
const SCORE_KEY = 'prizeInvaderHighScores.v6';
const WIX_SHARED_LEADERBOARD = new URLSearchParams(location.search).get('leaderboard') === 'wix';
let wixScores = null;
let state, last = 0, touchX = null;
let audioCtx = null;
let soundEnabled = true;

function ensureAudio() {
  if (!soundEnabled) return null;
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(type='fire') {
  const ac = ensureAudio(); if (!ac) return;
  const now = ac.currentTime;
  const cfg = {
    fire:[680, .055, 'square', .035], hit:[210, .09, 'sawtooth', .045], shelter:[120, .055, 'triangle', .035],
    bonus:[880, .18, 'triangle', .07], boom:[70, .28, 'sawtooth', .08], level:[330, .18, 'sine', .055], board:[523, .25, 'sine', .06], wave:[196, .35, 'square', .045]
  }[type] || [440,.08,'sine',.04];
  const [freq, dur, wave, gainLevel] = cfg;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = wave; osc.frequency.setValueAtTime(freq, now);
  if (type === 'bonus') { osc.frequency.exponentialRampToValueAtTime(freq * 1.8, now + dur); }
  if (type === 'boom') { osc.frequency.exponentialRampToValueAtTime(35, now + dur); }
  gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(gainLevel, now + .01); gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(ac.destination); osc.start(now); osc.stop(now + dur + .03);
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    this.moveTo(x+r, y); this.arcTo(x+w, y, x+w, y+h, r); this.arcTo(x+w, y+h, x, y+h, r); this.arcTo(x, y+h, x, y, r); this.arcTo(x, y, x+w, y, r);
    return this;
  };
}

function reset() {
  state = {
    running: true, paused: false, over: false,
    score: 0, level: 1, lives: 3, combo: 0,
    player: { x: W/2 - 13, y: H - 28, w: 26, h: 9, cooldown: 0 },
    bullets: [], enemyBullets: [], particles: [],
    swarm: makeSwarm(1), shelters: makeShelters(), dir: 1, stepTimer: 0, bonusShip: null, bonusSquad: [], bonusTimer: 2.5 + Math.random() * 5, nextBonusWave: 22 + Math.random() * 18, highScoreSaved: false,
    message: 'CLEAR WAVES TO CLIMB THE LADDER'
  };
  updateLadder();
}

function makeShelters() {
  return [76, 190, 304, 418].map(x => ({ x, y: H - 66, w: 50, h: 24, hp: 10, maxHp: 10 }));
}

function makeSwarm(level) {
  const rows = Math.min(6, 4 + Math.floor(level / 2));
  const cols = Math.min(10, 9 + Math.floor(level / 3));
  const enemies = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      enemies.push({ x: 42 + c * 38, y: 44 + r * 23, w: 20, h: 12, hp: 1 + (r <= 1 && level > 2 ? 1 : 0) + (level > 5 && r === 0 ? 1 : 0), kind: r });
    }
  }
  return enemies;
}

function updateLadder() {
  ladderEl.innerHTML = prizeSteps.map(s => `<li class="${state.score >= s ? 'hit' : ''}">${s} pts — ${state.score >= s ? 'unlocked' : 'locked'}</li>`).join('');
}

function loadScores() {
  if (WIX_SHARED_LEADERBOARD && Array.isArray(wixScores)) return wixScores;
  try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '[]').filter(x => x && x.name && Number.isFinite(x.score)); }
  catch { return []; }
}

function saveScores(scores) {
  const cleaned = scores.slice(0, 10);
  if (WIX_SHARED_LEADERBOARD) {
    wixScores = cleaned;
    window.parent?.postMessage({ type: 'PRIZE_INVADER_SAVE_SCORE', scores: cleaned }, '*');
    return;
  }
  localStorage.setItem(SCORE_KEY, JSON.stringify(cleaned));
}

function qualifiesForBoard(score) {
  const scores = loadScores();
  return score > 0 && (scores.length < 10 || score > scores[scores.length - 1].score);
}

function renderLeaderboard() {
  const scores = loadScores();
  if (!scores.length) {
    leaderboardEl.innerHTML = '<li class="empty">No scores yet</li>';
    return;
  }

  leaderboardEl.innerHTML = scores.map((row, index) => {
    const name = escapeHtml(row.name || row.title || 'PLAYER');
    const score = Number(row.score || 0).toLocaleString('en-GB');
    const level = Number(row.level || 0);
    const when = escapeHtml(formatScoreDate(row.when));
    return `
      <li class="scoreRow">
        <span class="scoreRank">${index + 1}</span>
        <span class="scoreName">${name}</span>
        <strong class="scoreValue">${score}</strong>
        <span class="scoreMeta">L${level}${when ? ' · ' + when : ''}</span>
      </li>`;
  }).join('');
}

function formatScoreDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function maybeSaveHighScore() {
  if (state.highScoreSaved || !qualifiesForBoard(state.score)) return;
  state.highScoreSaved = true;
  const raw = prompt(`You made the leaderboard with ${state.score} points. Enter your name:`, 'PLAYER');
  const name = (raw || 'PLAYER').trim().slice(0, 14).replace(/\s+/g, ' ') || 'PLAYER';
  const scores = loadScores();
  scores.push({ name, score: state.score, level: state.level, when: new Date().toISOString() });
  scores.sort((a, b) => b.score - a.score);
  saveScores(scores);
  beep('board');
  renderLeaderboard();
}

function rects(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function addBurst(x,y,n=8){ for(let i=0;i<n;i++) state.particles.push({x,y,vx:(Math.random()-.5)*90,vy:(Math.random()-.5)*90,life:.45}); }

function shoot() {
  if (state.player.cooldown <= 0) {
    state.bullets.push({ x: state.player.x + state.player.w/2 - 1, y: state.player.y - 7, w: 2, h: 8, vy: -210 });
    beep('fire');
    state.player.cooldown = .40;
  }
}

function update(dt) {
  if (!state.running || state.paused || state.over) return;
  const p = state.player;
  p.cooldown -= dt;
  let move = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) move -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) move += 1;
  if (touchX !== null) p.x += (touchX - (p.x + p.w/2)) * Math.min(1, dt * 8);
  else p.x += move * 140 * dt;
  p.x = clamp(p.x, 18, W - p.w - 18);

  state.bullets.forEach(b => b.y += b.vy * dt);
  state.enemyBullets.forEach(b => b.y += b.vy * dt);
  state.bullets = state.bullets.filter(b => b.y > -20);
  state.enemyBullets = state.enemyBullets.filter(b => b.y < H + 20);

  for (const b of [...state.bullets, ...state.enemyBullets]) {
    const shelter = state.shelters.find(h => h.hp > 0 && rects(b, h));
    if (shelter) {
      shelter.hp--;
      addBurst(b.x, b.y, 5); beep('shelter');
      if (state.bullets.includes(b)) b.y = -999; else b.y = H + 999;
    }
  }
  state.shelters = state.shelters.filter(h => h.hp > 0);
  state.bullets = state.bullets.filter(b => b.y > -20);
  state.enemyBullets = state.enemyBullets.filter(b => b.y < H + 20);

  state.stepTimer += dt;
  const speed = Math.max(.09, .43 - state.level * .035);
  if (state.stepTimer > speed) {
    state.stepTimer = 0;
    let edge = false;
    state.swarm.forEach(e => { e.x += state.dir * (8 + state.level * 1.3); if (e.x < 18 || e.x + e.w > W-18) edge = true; });
    if (edge) { state.dir *= -1; state.swarm.forEach(e => e.y += 12); }
    if (Math.random() < .46 + state.level * .055 && state.swarm.length) {
      const shooters = state.swarm.slice().sort((a,b)=>b.y-a.y).slice(0, 12);
      const e = shooters[Math.floor(Math.random()*shooters.length)];
      state.enemyBullets.push({ x:e.x+e.w/2-2, y:e.y+e.h, w:4, h:8, vy:96+state.level*16 });
    }
  }

  for (const b of state.bullets) {
    const hit = state.swarm.find(e => rects(b,e));
    if (hit) {
      b.y = -999; hit.hp--; addBurst(hit.x+10, hit.y+6, 7); beep('hit');
      if (hit.hp <= 0) {
        state.swarm.splice(state.swarm.indexOf(hit),1);
        state.combo++; state.score += 25 + hit.kind * 8 + Math.min(65, state.combo*4);
        updateLadder();
      }
    }
  }
  state.bullets = state.bullets.filter(b=>b.y>-20);

  for (const b of state.enemyBullets) if (rects(b,p)) { loseLife(); b.y = H+999; }
  if (state.swarm.some(e => e.y + e.h >= p.y - 6)) loseLife(true);

  updateBonusShip(dt);

  if (state.swarm.length === 0) {
    state.level++; state.combo = 0; state.message = `LEVEL ${state.level}: FASTER SWARM`;
    state.swarm = makeSwarm(state.level); beep('level');
  }

  state.particles.forEach(q => { q.x += q.vx*dt; q.y += q.vy*dt; q.life -= dt; });
  state.particles = state.particles.filter(q => q.life > 0);
}

function loseLife(force=false) {
  beep('boom');
  state.lives--; state.combo = 0; addBurst(state.player.x+13, state.player.y+5, 20);
  state.enemyBullets = []; state.bullets = [];
  state.player.x = W/2-13;
  if (force) state.swarm.forEach(e=>e.y-=18);
  if (state.lives <= 0) { state.over = true; state.message = `GAME OVER — SCORE ${state.score}`; maybeSaveHighScore(); }
}


function updateBonusShip(dt) {
  state.nextBonusWave -= dt;
  if (state.nextBonusWave <= 0 && !state.bonusShip && state.bonusSquad.length === 0) {
    launchBonusWave();
  }

  state.bonusTimer -= dt;
  if (!state.bonusShip && state.bonusSquad.length === 0 && state.bonusTimer <= 0) {
    state.bonusShip = makeBonusVisitor(chooseBonusVisitor(), Math.random() < .5, false, 0);
    state.message = bonusVisitorLabel(state.bonusShip.type) + ' — CENTRE HIT SCORES BIG';
  }

  const visitors = [];
  if (state.bonusShip) visitors.push(state.bonusShip);
  visitors.push(...state.bonusSquad);

  for (const ship of visitors) {
    ship.x += ship.vx * dt;
    ship.wobble += dt * (ship.wobbleRate || 8);
    ship.distractFlash += dt;
    if (ship.type === 'azure') ship.y += Math.sin(ship.wobble * 1.4) * 0.55;
    if (ship.type === 'amber') ship.vx += Math.sin(ship.wobble * .9) * 5 * dt;
  }

  state.bonusSquad = state.bonusSquad.filter(ship => ship.x > -120 && ship.x < W + 120);
  if (state.bonusShip && (state.bonusShip.x < -90 || state.bonusShip.x > W + 90)) {
    state.bonusShip = null;
    state.bonusTimer = 4 + Math.random() * 8;
  }
  if (state.bonusSquad.length === 0 && state.message === 'BONUS INVASION — HIT ALL FOUR PHANTOMS') {
    state.nextBonusWave = 28 + Math.random() * 22;
    state.bonusTimer = 5 + Math.random() * 8;
  }

  for (const b of state.bullets) {
    const all = (state.bonusShip ? [state.bonusShip] : []).concat(state.bonusSquad);
    const ship = all.find(v => rects(b, v));
    if (!ship) continue;
    const bulletCentre = b.x + b.w / 2;
    const shipCentre = ship.x + ship.w / 2;
    const distance = Math.abs(bulletCentre - shipCentre);
    const centreFactor = clamp(1 - distance / (ship.w / 2), 0, 1);
    const base = ship.base || (120 + state.level * 15);
    const bonus = Math.round(base + centreFactor * (ship.centreBonus || 420));
    state.score += bonus;
    state.combo += ship.wave ? 3 : 2;
    state.message = centreFactor > .72 ? `DIRECT CENTRE BONUS +${bonus}` : `${bonusVisitorLabel(ship.type)} +${bonus}`;
    b.y = -999;
    beep('bonus');
    addBurst(ship.x + ship.w / 2, ship.y + ship.h / 2, ship.wave ? 28 : 18);
    if (state.bonusShip === ship) { state.bonusShip = null; state.bonusTimer = 5 + Math.random() * 9; }
    state.bonusSquad = state.bonusSquad.filter(v => v !== ship);
    updateLadder();
    break;
  }
}

function makeBonusVisitor(type, fromLeft, wave=false, offset=0) {
  const size = wave || type !== 'saucer' ? 36 : 32;
  const baseSpeed = type === 'crimson' ? 150 : type === 'azure' ? 122 : type === 'rose' ? 104 : type === 'amber' ? 92 : 82;
  return {
    x: fromLeft ? -60 - offset : W + 60 + offset,
    y: wave ? 22 + offset * .04 : 23 + Math.random() * 24,
    w: type === 'saucer' ? 36 : size,
    h: type === 'saucer' ? 13 : 28,
    vx: (fromLeft ? 1 : -1) * (baseSpeed + Math.random() * 34 + state.level * 4),
    wobble: Math.random() * Math.PI * 2,
    wobbleRate: type === 'amber' ? 12 : type === 'rose' ? 7 : 9,
    distractFlash: 0,
    type, wave,
    base: type === 'azure' ? 260 : type === 'crimson' ? 220 : type === 'rose' ? 190 : type === 'amber' ? 160 : type === 'chomper' ? 180 : 140,
    centreBonus: type === 'azure' ? 700 : type === 'crimson' ? 620 : type === 'rose' ? 520 : type === 'amber' ? 440 : type === 'chomper' ? 500 : 420
  };
}

function launchBonusWave() {
  const fromLeft = Math.random() < .5;
  const types = ['crimson', 'rose', 'azure', 'amber'];
  state.bonusSquad = types.map((type, i) => makeBonusVisitor(type, fromLeft, true, i * 52));
  state.message = 'BONUS INVASION — HIT ALL FOUR PHANTOMS';
  beep('wave');
}

function chooseBonusVisitor() {
  const roll = Math.random();
  if (roll < .34) return 'saucer';
  if (roll < .55) return 'chomper';
  return ['crimson','rose','azure','amber'][Math.floor(Math.random()*4)];
}

function bonusVisitorLabel(type) {
  const labels = { chomper:'BONUS CHOMPER', crimson:'CRIMSON PHANTOM', rose:'ROSE SPECTRE', azure:'AZURE WISP', amber:'AMBER SHADE', spirit:'AZURE WISP' };
  return labels[type] || 'BONUS SHIP';
}

function drawBonusShip(ship) {
  if (ship.type === 'chomper') return drawChomperVisitor(ship);
  if (['crimson','rose','azure','amber','spirit'].includes(ship.type)) return drawSpiritVisitor(ship);
  return drawSaucerVisitor(ship);
}

function bonusGlow(alpha, colourA, colourB) {
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  glow.addColorStop(0, colourA.replace('ALPHA', alpha.toFixed(2)));
  glow.addColorStop(1, colourB);
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
}

function drawSaucerVisitor(ship) {
  const cx = ship.x + ship.w / 2;
  const cy = ship.y + ship.h / 2 + Math.sin(ship.wobble) * 1.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(ship.vx > 0 ? 1 : -1, 1);
  const pulse = .65 + Math.abs(Math.sin(ship.distractFlash * 13)) * .35;
  bonusGlow(pulse, 'rgba(255,117,143,ALPHA)', 'rgba(255,117,143,0)');
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath(); ctx.ellipse(0, 2, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c4b5fd';
  ctx.beginPath(); ctx.ellipse(0, -3, 11, 6, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(-4, -5, 3, 2); ctx.fillRect(2, -5, 3, 2);
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath(); ctx.moveTo(-23, 2); ctx.lineTo(-34, -3); ctx.lineTo(-30, 8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawChomperVisitor(ship) {
  const cx = ship.x + ship.w / 2;
  const cy = ship.y + ship.h / 2 + Math.sin(ship.wobble * 1.2) * 2;
  const mouth = .35 + Math.abs(Math.sin(ship.wobble * 1.8)) * .45;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(ship.vx > 0 ? 1 : -1, 1);
  const pulse = .55 + Math.abs(Math.sin(ship.distractFlash * 12)) * .35;
  bonusGlow(pulse, 'rgba(251,191,36,ALPHA)', 'rgba(251,191,36,0)');
  const body = ctx.createRadialGradient(-4, -5, 3, 0, 0, 18);
  body.addColorStop(0, '#fff7ad'); body.addColorStop(.45, '#facc15'); body.addColorStop(1, '#b45309');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 16, mouth, Math.PI * 2 - mouth);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#020711';
  ctx.beginPath(); ctx.arc(2, -8, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fde68a';
  for (let i=0;i<3;i++) { ctx.beginPath(); ctx.arc(-22 - i*8, 0, 2.5, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
}

function drawSpiritVisitor(ship) {
  const cx = ship.x + ship.w / 2;
  const cy = ship.y + ship.h / 2 + Math.sin(ship.wobble * 1.5) * 2.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(ship.vx > 0 ? 1 : -1, 1);
  const pulse = .55 + Math.abs(Math.sin(ship.distractFlash * 14)) * .35;
  const ghostPalettes = { crimson:['rgba(248,113,113,ALPHA)','rgba(248,113,113,0)','#fee2e2','#ef4444','#7f1d1d'], rose:['rgba(244,114,182,ALPHA)','rgba(244,114,182,0)','#fce7f3','#ec4899','#831843'], azure:['rgba(56,189,248,ALPHA)','rgba(56,189,248,0)','#e0f2fe','#38bdf8','#075985'], amber:['rgba(251,146,60,ALPHA)','rgba(251,146,60,0)','#ffedd5','#f97316','#7c2d12'], spirit:['rgba(56,189,248,ALPHA)','rgba(56,189,248,0)','#e0f2fe','#38bdf8','#075985'] };
  const gp = ghostPalettes[ship.type] || ghostPalettes.azure;
  bonusGlow(pulse, gp[0], gp[1]);
  const grad = ctx.createLinearGradient(0, -18, 0, 17);
  grad.addColorStop(0, gp[2]); grad.addColorStop(.24, gp[3]); grad.addColorStop(1, gp[4]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-16, 12);
  ctx.lineTo(-16, -1);
  ctx.bezierCurveTo(-16, -13, -8, -18, 0, -18);
  ctx.bezierCurveTo(8, -18, 16, -13, 16, -1);
  ctx.lineTo(16, 12);
  ctx.lineTo(10, 7); ctx.lineTo(5, 12); ctx.lineTo(0, 7); ctx.lineTo(-5, 12); ctx.lineTo(-10, 7);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.ellipse(-6, -4, 4, 5, 0, 0, Math.PI*2); ctx.ellipse(6, -4, 4, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#020711';
  const look = ship.vx > 0 ? 1 : -1;
  ctx.beginPath(); ctx.arc(-5 + look, -4, 1.7, 0, Math.PI*2); ctx.arc(7 + look, -4, 1.7, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawInvader(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const palette = [ ['#facc15','#fde68a'], ['#22d3ee','#a5f3fc'], ['#fb7185','#fecdd3'], ['#34d399','#bbf7d0'], ['#a78bfa','#ddd6fe'], ['#f97316','#fed7aa'] ][e.kind % 6];
  ctx.save();
  ctx.translate(cx, cy);
  const flap = Math.sin(performance.now()/120 + e.x) > 0 ? 1 : -1;
  ctx.shadowColor = palette[0]; ctx.shadowBlur = 8;
  ctx.fillStyle = palette[0];
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.bezierCurveTo(10, -8, 15, -2, 17, 4);
  ctx.lineTo(10, 8 + flap);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 9);
  ctx.lineTo(-5, 5);
  ctx.lineTo(-10, 8 - flap);
  ctx.lineTo(-17, 4);
  ctx.bezierCurveTo(-15, -2, -10, -8, 0, -8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = palette[1];
  ctx.beginPath(); ctx.ellipse(0, -2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#020711';
  ctx.beginPath(); ctx.arc(-4, -2, 1.6, 0, Math.PI*2); ctx.arc(4, -2, 1.6, 0, Math.PI*2); ctx.fill();
  if (e.hp > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-10, -10, 20, 20); }
  ctx.restore();
}

function drawLauncher(p) {
  ctx.save();
  const cx = p.x + p.w / 2;
  ctx.shadowColor = '#71f5a1'; ctx.shadowBlur = 10;
  const grad = ctx.createLinearGradient(p.x, p.y-10, p.x, p.y+p.h+8);
  grad.addColorStop(0, '#d9f99d'); grad.addColorStop(.45, '#22c55e'); grad.addColorStop(1, '#14532d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(p.x - 8, p.y + 3, p.w + 16, 9, 3);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  for (let i=0;i<4;i++) { ctx.beginPath(); ctx.arc(p.x - 2 + i*10, p.y + 11, 3, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(cx - 13, p.y - 3, 26, 9, 4); ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - 4, p.y - 17, 8, 17, 3); ctx.fill();
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath(); ctx.roundRect(cx - 2, p.y - 23, 4, 8, 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawShelter(h) {
  const damage = 1 - h.hp / h.maxHp;
  ctx.save();
  const grad = ctx.createLinearGradient(h.x, h.y, h.x, h.y + h.h);
  grad.addColorStop(0, '#cbd5e1'); grad.addColorStop(.55, '#64748b'); grad.addColorStop(1, '#334155');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(h.x + 4, h.y + h.h);
  ctx.lineTo(h.x + 4, h.y + 9);
  ctx.quadraticCurveTo(h.x + h.w / 2, h.y - 10, h.x + h.w - 4, h.y + 9);
  ctx.lineTo(h.x + h.w - 4, h.y + h.h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(h.x + 17, h.y + 14, 16, 10);
  ctx.strokeStyle = '#94a3b8';
  for (let y=h.y+7; y<h.y+h.h; y+=6) { ctx.beginPath(); ctx.moveTo(h.x+6, y); ctx.lineTo(h.x+h.w-6, y); ctx.stroke(); }
  ctx.fillStyle = '#020711';
  for (let i=0; i<Math.ceil(damage*10); i++) {
    const rx = h.x + 6 + ((i*17 + h.x) % (h.w-12));
    const ry = h.y + 4 + ((i*11 + h.y) % (h.h-5));
    ctx.beginPath(); ctx.arc(rx, ry, 2 + (i%3), 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function render() {
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#020711'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#ffffff12'; for(let i=0;i<55;i++) ctx.fillRect((i*83+state.level*7)%W,(i*47)%H,1,1);
  ctx.fillStyle = '#d7e7ff'; ctx.font = '10px monospace';
  ctx.fillText(`SCORE ${state.score}`, 14, 16); ctx.fillText(`LIVES ${state.lives}`, 222, 16); ctx.fillText(`LEVEL ${state.level}`, 420, 16);
  state.shelters.forEach(drawShelter);
  state.swarm.forEach(drawInvader);
  if (state.bonusShip) drawBonusShip(state.bonusShip);
  if (state.bonusSquad) state.bonusSquad.forEach(drawBonusShip);
  drawLauncher(state.player);
  ctx.fillStyle = '#eef6ff'; state.bullets.forEach(b=>ctx.fillRect(b.x,b.y,b.w,b.h));
  ctx.fillStyle = '#ff758f'; state.enemyBullets.forEach(b=>ctx.fillRect(b.x,b.y,b.w,b.h));
  state.particles.forEach(q=>{ ctx.globalAlpha = Math.max(0,q.life*2); ctx.fillStyle = '#f9d15c'; ctx.fillRect(q.x,q.y,2,2); ctx.globalAlpha=1; });
  ctx.fillStyle = '#f9d15c'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(state.message, W/2, 34); ctx.textAlign = 'left';
  if (!state.running || state.paused || state.over) {
    ctx.fillStyle = '#0009'; ctx.fillRect(0,0,W,H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '18px monospace';
    ctx.fillText(state.over ? 'GAME OVER' : state.paused ? 'PAUSED' : 'PRIZE INVADER', W/2, H/2-10);
    ctx.font = '11px monospace';
    ctx.fillText(state.over && qualifiesForBoard(state.score) ? 'Leaderboard score saved' : 'Press Start / Space to play', W/2, H/2+14);
    ctx.textAlign = 'left';
  }
}

function loop(ts) { const dt = Math.min(.05, (ts-last)/1000 || 0); last = ts; update(dt); render(); requestAnimationFrame(loop); }

window.addEventListener('keydown', e => { keys.add(e.key); if(e.key === ' ') { ensureAudio(); if(!state?.running || state.over) reset(); shoot(); } if(e.key.toLowerCase()==='p' && state) state.paused=!state.paused; });
window.addEventListener('keyup', e => keys.delete(e.key));
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); touchX = (e.offsetX / canvas.clientWidth) * W; ensureAudio(); if(!state?.running || state.over) reset(); shoot(); });
canvas.addEventListener('pointermove', e => touchX = (e.offsetX / canvas.clientWidth) * W);
canvas.addEventListener('pointerup', () => touchX = null);
startBtn.addEventListener('click', () => { ensureAudio(); reset(); beep('level'); });
soundBtn.addEventListener('click', () => { soundEnabled = !soundEnabled; soundBtn.textContent = soundEnabled ? 'Sound On' : 'Sound Off'; if (soundEnabled) beep('level'); });

clearScoresBtn.addEventListener('click', () => {
  if (WIX_SHARED_LEADERBOARD) { alert('Shared Wix leaderboard scores should be cleared from the Wix database collection.'); return; }
  if (confirm('Clear all local high scores?')) { localStorage.removeItem(SCORE_KEY); renderLeaderboard(); }
});
fullscreenBtn.addEventListener('click', async () => {
  try {
    if (gameWrap.requestFullscreen) await gameWrap.requestFullscreen();
    else if (gameWrap.webkitRequestFullscreen) gameWrap.webkitRequestFullscreen();
  } catch (err) { alert('Full screen is blocked by this browser or iframe settings.'); }
});
exitFullscreenBtn.addEventListener('click', async () => {
  if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
});
window.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'PRIZE_INVADER_SCORES' && Array.isArray(data.scores)) {
    wixScores = data.scores
      .filter(x => x && (x.name || x.title) && Number.isFinite(Number(x.score)))
      .map(x => ({ name: x.name || x.title || 'PLAYER', score: Number(x.score), level: Number(x.level || 0), when: x.when }))
      .sort((a,b)=>b.score-a.score)
      .slice(0,10);
    renderLeaderboard();
  }
});
if (WIX_SHARED_LEADERBOARD) window.parent?.postMessage({ type: 'PRIZE_INVADER_REQUEST_SCORES' }, '*');
renderLeaderboard();
reset(); state.running = false; requestAnimationFrame(loop);
