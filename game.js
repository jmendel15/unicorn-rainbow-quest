(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  const RAINBOW = ['#ff5c8a', '#ff9f43', '#ffd23f', '#5ed17a', '#45c4f5', '#7b8cff', '#c77dff'];
  const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

  // ---------------------------------------------------------------------------
  // STAGES — add new stages here. `type` picks the gameplay; every stage has
  // one clear goal (`goalSay`) and ends with a celebration (`winSay`).
  // ---------------------------------------------------------------------------
  const STAGES = [
    {
      id: 1,
      name: 'Star Meadow',
      icon: '⭐',
      type: 'collect',
      target: 10,
      onScreen: 3,
      goalIcon: '⭐<span class="x">×</span>10',
      goalText: 'Collect 10 rainbow stars!',
      goalSay: 'Help the unicorn collect ten rainbow stars! Touch where you want the unicorn to go.',
      winSay: 'Hooray! You found all the rainbow stars! You made a rainbow!',
    },
    { id: 2, name: 'Fairy Forest', icon: '🧚', comingSoon: true },
    { id: 3, name: 'Cloud Castle', icon: '🏰', comingSoon: true },
  ];

  // ---------------------------------------------------------------------------
  // Saved progress (per device)
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const progress = store.get('urq.progress', {});
  let muted = store.get('urq.muted', false);

  // ---------------------------------------------------------------------------
  // Sound: tiny synthesized chimes + the device's speaking voice
  // ---------------------------------------------------------------------------
  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, t0, dur, type, vol) {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  function chime(i) {
    if (muted || !actx) return;
    const t = actx.currentTime, f = SCALE[i % SCALE.length];
    tone(f, t, 0.6, 'sine', 0.25);
    tone(f * 2, t + 0.06, 0.45, 'triangle', 0.07);
  }
  function fanfare() {
    if (muted || !actx) return;
    const t = actx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => tone(f, t + i * 0.12, 0.5, 'triangle', 0.18));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, t + 0.7, 1.4, 'sine', 0.12));
  }
  function blip() {
    if (muted || !audio()) return;
    tone(880, actx.currentTime, 0.12, 'sine', 0.15);
  }

  const canSpeak = 'speechSynthesis' in window;
  let voice = null;
  function pickVoice() {
    const en = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    voice = en.find((v) => /Samantha|Karen|Moira|Tessa|Google US English|Female/i.test(v.name)) || en[0] || null;
  }
  if (canSpeak) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text) {
    if (muted || !canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 1.25;
    speechSynthesis.speak(u);
  }

  // ---------------------------------------------------------------------------
  // Sizing + painted background
  // ---------------------------------------------------------------------------
  let W = 0, H = 0, S = 1, DPR = 1;
  const bg = document.createElement('canvas');
  const bgx = bg.getContext('2d');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function hudBottom() {
    const hud = $('hud');
    return hud.classList.contains('hidden') ? 20 : hud.getBoundingClientRect().bottom;
  }
  function bounds() {
    return { x0: 70 * S, x1: W - 70 * S, y0: hudBottom() + 75 * S, y1: H - 45 * S };
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    S = clamp(Math.min(W, H) / 560, 0.62, 1.3);
    canvas.width = bg.width = Math.round(W * DPR);
    canvas.height = bg.height = Math.round(H * DPR);
    paintBackground();
    const b = bounds();
    uni.x = clamp(uni.x || W * 0.3, b.x0, b.x1);
    uni.y = clamp(uni.y || H * 0.65, b.y0, b.y1);
    uni.tx = clamp(uni.tx || uni.x, b.x0, b.x1);
    uni.ty = clamp(uni.ty || uni.y, b.y0, b.y1);
    stars.forEach((st) => { st.x = clamp(st.x, b.x0, b.x1); st.y = clamp(st.y, b.y0, b.y1); });
  }

  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function paintBackground() {
    const c = bgx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#aee3ff');
    g.addColorStop(0.55, '#e6dcff');
    g.addColorStop(1, '#ffe0f0');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // faint rainbow in the sky
    const R = Math.max(W, H) * 0.55, bw = R * 0.035;
    c.globalAlpha = 0.22;
    c.lineWidth = bw + 1;
    RAINBOW.forEach((col, i) => {
      c.strokeStyle = col;
      c.beginPath();
      c.arc(W * 0.5, H * 0.8, R - i * bw, Math.PI, 0);
      c.stroke();
    });
    c.globalAlpha = 1;

    hill(c, H * 0.78, 40, 0.004, '#c9f2cf', 1);
    hill(c, H * 0.86, 30, 0.006, '#a6e8b4', 2);
    hill(c, H * 0.93, 20, 0.009, '#8ddc9f', 3);

    const rnd = seeded(7);
    const n = Math.round(W / 35);
    for (let i = 0; i < n; i++) {
      flower(c, rnd() * W, H * 0.88 + rnd() * H * 0.11, (4 + rnd() * 3) * S, RAINBOW[Math.floor(rnd() * 7)]);
    }
  }
  function hill(c, base, amp, freq, col, seed) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      c.lineTo(x, base + Math.sin(x * freq + seed * 2) * amp * S + Math.sin(x * freq * 2.3 + seed) * amp * 0.4 * S);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fill();
  }
  function flower(c, x, y, r, col) {
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5;
      c.beginPath();
      c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, 7);
      c.fill();
    }
    c.fillStyle = '#fff6b0';
    c.beginPath();
    c.arc(x, y, r * 0.6, 0, 7);
    c.fill();
  }

  // ---------------------------------------------------------------------------
  // World state
  // ---------------------------------------------------------------------------
  const uni = { x: 0, y: 0, tx: 0, ty: 0, facing: 1, moving: false, t: 0 };
  let stars = [];
  let particles = [];
  const clouds = [];
  let now = 0;
  let state = 'title';          // title | map | goal | play | win
  let stage = null;
  let collected = 0, spawned = 0;
  let lastPointer = -99, lastCollect = 0, lastHint = 0;
  let rainbowP = 0, winT = 0;
  let goalTimer = null, winTimer = null;

  function initClouds() {
    clouds.length = 0;
    for (let i = 0; i < 4; i++) {
      clouds.push({ x: Math.random() * W, y: (0.12 + Math.random() * 0.33) * H, s: 0.7 + Math.random() * 0.7, v: 6 + Math.random() * 10 });
    }
  }

  // ---------------------------------------------------------------------------
  // Input: the unicorn runs to wherever you touch (or point, on a laptop)
  // ---------------------------------------------------------------------------
  function aim(e) {
    const b = bounds();
    uni.tx = clamp(e.clientX, b.x0, b.x1);
    uni.ty = clamp(e.clientY + 15 * S, b.y0, b.y1);
    lastPointer = now;
  }
  canvas.addEventListener('pointerdown', (e) => { audio(); aim(e); });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) aim(e); });

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  const SCREENS = ['title', 'map', 'goal', 'win'];
  function show(name) {
    SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== name));
    $('hud').classList.toggle('hidden', !['goal', 'play', 'win'].includes(state));
  }

  const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
  function buildSlots(n) {
    const box = $('slots');
    box.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = STAR_SVG;
      box.appendChild(d);
    }
  }
  function fillSlot(i, color) {
    const slot = $('slots').children[i];
    if (!slot) return;
    slot.classList.add('on');
    slot.querySelector('path').style.fill = color;
  }

  function buildMap() {
    const list = $('stageList');
    list.innerHTML = '';
    STAGES.forEach((st, i) => {
      const b = document.createElement('button');
      b.className = 'stage' + (st.comingSoon ? ' locked' : '');
      b.innerHTML =
        `<span class="st-icon">${st.comingSoon ? '🔒' : st.icon}</span>` +
        `<span class="st-num">${st.id}</span>` +
        (progress[st.id] ? '<span class="st-badge">🌈</span>' : '');
      b.setAttribute('aria-label', `Stage ${st.id}: ${st.name}${st.comingSoon ? ' (coming soon)' : ''}`);
      b.addEventListener('click', () => {
        blip();
        if (st.comingSoon) {
          say('This one is coming soon!');
          b.classList.remove('shake');
          void b.offsetWidth;
          b.classList.add('shake');
        } else {
          startStage(i);
        }
      });
      list.appendChild(b);
    });
  }

  function showMap() {
    clearTimeout(goalTimer);
    clearTimeout(winTimer);
    state = 'map';
    stars = [];
    rainbowP = 0;
    buildMap();
    show('map');
    say('Pick a stage!');
  }

  function startStage(i) {
    clearTimeout(goalTimer);
    clearTimeout(winTimer);
    stage = STAGES[i];
    state = 'goal';
    collected = 0;
    spawned = 0;
    stars = [];
    rainbowP = 0;
    buildSlots(stage.target);
    $('goalIcon').innerHTML = stage.goalIcon;
    $('goalText').textContent = stage.goalText;
    show('goal');
    say(stage.goalSay);
    goalTimer = setTimeout(beginPlay, 9000);
  }

  function beginPlay() {
    if (state !== 'goal') return;
    clearTimeout(goalTimer);
    state = 'play';
    lastCollect = now;
    lastHint = now;
    show(null);
  }

  function win() {
    state = 'win';
    winT = 0;
    progress[stage.id] = true;
    store.set('urq.progress', progress);
    fanfare();
    say(stage.winSay);
    confetti();
    winTimer = setTimeout(() => { if (state === 'win') show('win'); }, 2600);
  }

  // ---------------------------------------------------------------------------
  // Stars
  // ---------------------------------------------------------------------------
  function spawnStar() {
    const b = bounds();
    let best = null;
    for (let k = 0; k < 30; k++) {
      const x = b.x0 + Math.random() * (b.x1 - b.x0);
      const y = b.y0 + Math.random() * (b.y1 - b.y0);
      const farFromUni = Math.hypot(x - uni.x, y - uni.y) > 170 * S;
      const farFromStars = stars.every((s) => Math.hypot(x - s.x, y - s.y) > 120 * S);
      best = { x, y };
      if (farFromUni && farFromStars) break;
    }
    stars.push({ x: best.x, y: best.y, color: RAINBOW[spawned % RAINBOW.length], born: now, phase: Math.random() * 6 });
    spawned++;
  }

  function collect(st) {
    st.dead = true;
    collected++;
    lastCollect = now;
    burst(st.x, st.y, st.color);
    chime(collected - 1);
    fillSlot(collected - 1, st.color);
    if (collected >= stage.target) win();
    else say(NUMBERS[collected - 1] + '!');
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------
  function burst(x, y, color) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, v = (120 + Math.random() * 260) * S;
      particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.5, size: (5 + Math.random() * 6) * S, color: Math.random() < 0.5 ? color : RAINBOW[i % 7] });
    }
    particles.push({ kind: 'ring', x, y, life: 0, max: 0.5, size: 20 * S, color });
  }
  function trail() {
    const b = uni.x - uni.facing * 42 * S, y = uni.y - (4 + Math.random() * 16) * S;
    particles.push({ kind: 'spark', x: b, y, vx: -uni.facing * 30 * S, vy: -20 * S, life: 0, max: 0.7, size: (3 + Math.random() * 4) * S, color: RAINBOW[Math.floor(Math.random() * 7)] });
  }
  function confetti() {
    for (let i = 0; i < 140; i++) {
      particles.push({ kind: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 160, life: 0, max: 6, size: (6 + Math.random() * 6) * S, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, color: RAINBOW[i % 7] });
    }
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    now += dt;
    const b = bounds();

    // Idle wandering on the title and map screens
    if ((state === 'title' || state === 'map') && now - lastPointer > 3 && Math.hypot(uni.tx - uni.x, uni.ty - uni.y) < 5 && Math.random() < dt * 0.8) {
      uni.tx = b.x0 + Math.random() * (b.x1 - b.x0);
      uni.ty = b.y0 + (0.4 + Math.random() * 0.6) * (b.y1 - b.y0);
    }

    // Unicorn movement
    const dx = uni.tx - uni.x, dy = uni.ty - uni.y, d = Math.hypot(dx, dy);
    if (d > 3) {
      const v = Math.min(520 * S, d * 5);
      uni.x += (dx / d) * v * dt;
      uni.y += (dy / d) * v * dt;
      uni.moving = v > 40;
      if (Math.abs(dx) > 6) uni.facing = dx > 0 ? 1 : -1;
    } else {
      uni.moving = false;
    }
    uni.x = clamp(uni.x, b.x0, b.x1);
    uni.y = clamp(uni.y, b.y0, b.y1);
    uni.t += dt;
    if (uni.moving && Math.random() < dt * 30) trail();

    // Stars
    if (state === 'play') {
      if (stars.length < stage.onScreen && spawned < stage.target) spawnStar();
      const hx = uni.x + uni.facing * 12 * S, hy = uni.y - 18 * S, reach = 62 * S;
      for (const st of stars) {
        if (!st.dead && now - st.born > 0.25 && Math.hypot(st.x - hx, st.y - hy) < reach + 20 * S) collect(st);
        if (state !== 'play') break;
      }
      if (now - lastCollect > 7 && now - lastHint > 12) {
        lastHint = now;
        say('Look! A star! Go get it!');
      }
    }
    stars = stars.filter((s) => !s.dead);

    // Win celebration
    if (state === 'win') {
      winT += dt;
      rainbowP = Math.min(1, winT / 1.6);
      if (Math.random() < dt * 3) burst(Math.random() * W, H * (0.2 + Math.random() * 0.4), RAINBOW[Math.floor(Math.random() * 7)]);
    }

    // Particles
    for (const p of particles) {
      p.life += dt;
      if (p.kind === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + 60 * S * dt; }
      if (p.kind === 'confetti') { p.x += p.vx * dt + Math.sin(p.life * 3 + p.rot) * 30 * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
    }
    particles = particles.filter((p) => p.life < p.max && p.y < H + 40);

    for (const cl of clouds) {
      cl.x += cl.v * dt;
      if (cl.x > W + 120 * S) cl.x = -140 * S;
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function ellipse(x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  }

  function drawCloud(cl) {
    const s = cl.s * S;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    [[0, 0, 30], [28, -14, 28], [58, 0, 30], [28, 10, 26]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(cl.x + x * s, cl.y + y * s, r * s, 0, 7);
      ctx.fill();
    });
  }

  function starPath(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.52 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function drawStar(st) {
    const k = easeOutBack(Math.min(1, (now - st.born) / 0.45));
    const r = 34 * S * k * (1 + Math.sin(now * 4 + st.phase) * 0.06);
    const x = st.x, y = st.y + Math.sin(now * 2 + st.phase) * 5 * S;
    const rot = Math.sin(now * 1.5 + st.phase) * 0.18;
    ctx.save();
    ctx.shadowColor = st.color;
    ctx.shadowBlur = 24 * S;
    ctx.fillStyle = st.color;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4 * S;
    ctx.strokeStyle = '#fff';
    starPath(x, y, r, rot);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    // cute face
    if (k > 0.6) {
      ctx.fillStyle = '#4a2a6a';
      ellipse(x - r * 0.2, y - r * 0.05, r * 0.07, r * 0.1); ctx.fill();
      ellipse(x + r * 0.2, y - r * 0.05, r * 0.07, r * 0.1); ctx.fill();
      ctx.strokeStyle = '#4a2a6a';
      ctx.lineWidth = 2.2 * S;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y + r * 0.1, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ellipse(x - r * 0.28, y - r * 0.35, r * 0.1, r * 0.06, -0.6); ctx.fill();
    }
    ctx.restore();
  }

  function drawHintArrow() {
    if (state !== 'play' || now - lastCollect < 6 || !stars.length) return;
    let near = stars[0];
    for (const s of stars) if (Math.hypot(s.x - uni.x, s.y - uni.y) < Math.hypot(near.x - uni.x, near.y - uni.y)) near = s;
    const y = near.y - 62 * S - Math.abs(Math.sin(now * 5)) * 16 * S;
    ctx.save();
    ctx.fillStyle = '#ff5c8a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4 * S;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(near.x, y + 18 * S);
    ctx.lineTo(near.x - 16 * S, y - 4 * S);
    ctx.lineTo(near.x - 6 * S, y - 4 * S);
    ctx.lineTo(near.x - 6 * S, y - 20 * S);
    ctx.lineTo(near.x + 6 * S, y - 20 * S);
    ctx.lineTo(near.x + 6 * S, y - 4 * S);
    ctx.lineTo(near.x + 16 * S, y - 4 * S);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function drawUnicorn() {
    const { x, y, facing, t, moving } = uni;
    const s = S;
    const gait = moving ? Math.sin(t * 16) : 0;
    const bob = moving ? Math.abs(gait) * -4 : Math.sin(t * 3) * 1.5;
    const LINE = '#d6c4f2';

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * facing, s);

    // shadow
    ctx.fillStyle = 'rgba(90,50,140,0.15)';
    ellipse(4, 44, 44, 8); ctx.fill();

    ctx.translate(0, bob);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // tail
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = RAINBOW[i];
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-36, -8);
      ctx.quadraticCurveTo(-60, -22 + i * 5 + Math.sin(t * 6 + i) * 4, -60 - i * 1.5 + gait * 3, 6 + i * 7);
      ctx.stroke();
    }

    function leg(lx, a, col) {
      ctx.save();
      ctx.translate(lx, 12);
      ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-5.5, 0, 11, 30, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff9ed2';
      ctx.beginPath();
      ctx.roundRect(-5.5, 24, 11, 8, 3);
      ctx.fill();
      ctx.restore();
    }
    const sw = gait * 0.45;
    leg(-26, sw, '#f1eaff');
    leg(18, -sw, '#f1eaff');

    // neck
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, -12);
    ctx.quadraticCurveTo(24, -40, 32, -50);
    ctx.lineTo(50, -40);
    ctx.quadraticCurveTo(42, -20, 38, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // mane
    const mane = [[36, -62, 9], [28, -54, 9], [23, -44, 8.5], [19, -34, 8], [16, -24, 7.5], [14, -15, 7]];
    mane.forEach(([mx, my, r], i) => {
      ctx.fillStyle = RAINBOW[i % 7];
      ctx.beginPath();
      ctx.arc(mx + Math.sin(t * 5 + i) * (moving ? 1.5 : 0.5), my, r, 0, 7);
      ctx.fill();
    });

    // body
    ctx.fillStyle = '#fff';
    ellipse(0, 0, 42, 26); ctx.fill(); ctx.stroke();
    // belly sparkle
    ctx.fillStyle = 'rgba(255,158,210,0.35)';
    ellipse(-6, 8, 22, 9); ctx.fill();

    leg(-14, -sw, '#fff');
    leg(28, sw, '#fff');

    // head
    ctx.fillStyle = '#fff';
    ellipse(46, -46, 18, 16); ctx.fill(); ctx.stroke();
    // snout
    ctx.fillStyle = '#ffe4f1';
    ellipse(60, -39, 12, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e79ac0';
    ellipse(65, -41, 1.8, 2.2); ctx.fill();
    ctx.strokeStyle = '#c47aa5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(61, -37, 4, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // ear
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(34, -56); ctx.lineTo(37, -74); ctx.lineTo(45, -59); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffc2df';
    ctx.beginPath();
    ctx.moveTo(37, -59); ctx.lineTo(38.5, -69); ctx.lineTo(42, -60); ctx.closePath();
    ctx.fill();

    // horn
    const hg = ctx.createLinearGradient(47, -60, 58, -92);
    hg.addColorStop(0, '#ffd23f');
    hg.addColorStop(1, '#fff3b0');
    ctx.fillStyle = hg;
    ctx.strokeStyle = '#f0b429';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(45, -59); ctx.lineTo(55, -60); ctx.lineTo(59, -93); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.8;
    [[-66, 0.75], [-75, 0.5], [-84, 0.28]].forEach(([hy, w]) => {
      ctx.beginPath();
      ctx.moveTo(57 - 10 * w, hy + 4 * w);
      ctx.lineTo(57 + 1 * w, hy - 1);
      ctx.stroke();
    });
    // horn twinkle
    const tw = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + tw * 0.5})`;
    ctx.save();
    ctx.translate(59, -95);
    ctx.rotate(t);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, rr = i % 2 ? 1.5 : 5 + tw * 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // forelock
    ctx.fillStyle = RAINBOW[5];
    ctx.beginPath(); ctx.arc(41, -60, 6, 0, 7); ctx.fill();
    ctx.fillStyle = RAINBOW[6];
    ctx.beginPath(); ctx.arc(35, -57, 6, 0, 7); ctx.fill();

    // eye (blinks now and then)
    const blink = (t % 4) < 0.12;
    ctx.fillStyle = '#3d2257';
    ctx.strokeStyle = '#3d2257';
    if (blink) {
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(48, -48, 4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    } else {
      ellipse(48, -48, 4, 5); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(49.5, -50, 1.6, 0, 7); ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(44, -52); ctx.lineTo(41, -55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(46, -53.5); ctx.lineTo(44.5, -57); ctx.stroke();
    }
    // blush
    ctx.fillStyle = 'rgba(255,140,190,0.55)';
    ellipse(47, -38, 5, 3.5); ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.5));
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        starPath(p.x, p.y, p.size * (0.4 + k * 0.6), p.life * 4);
        ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6 * S * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - k) * 70 * S, 0, 7);
        ctx.stroke();
      } else if (p.kind === 'confetti') {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBigRainbow(p) {
    const cx = W / 2, cy = H * 0.92;
    const R = Math.min(W * 0.47, H * 0.72), band = R * 0.075;
    ctx.save();
    ctx.lineWidth = band + 1;
    RAINBOW.forEach((col, i) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, R - i * band, Math.PI, Math.PI + Math.PI * p);
      ctx.stroke();
    });
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    clouds.forEach(drawCloud);
    if (rainbowP > 0) drawBigRainbow(rainbowP);
    stars.forEach(drawStar);
    drawParticles();
    drawUnicorn();
    drawHintArrow();
  }

  // ---------------------------------------------------------------------------
  // Buttons + loop
  // ---------------------------------------------------------------------------
  function updateSoundBtn() { $('soundBtn').textContent = muted ? '🔇' : '🔊'; }

  $('playBtn').addEventListener('click', () => { audio(); blip(); showMap(); });
  $('homeBtn').addEventListener('click', () => { blip(); showMap(); });
  $('againBtn').addEventListener('click', () => { blip(); startStage(STAGES.indexOf(stage)); });
  $('mapBtn').addEventListener('click', () => { blip(); showMap(); });
  $('goal').addEventListener('pointerup', () => { audio(); blip(); beginPlay(); });
  $('soundBtn').addEventListener('click', () => {
    muted = !muted;
    store.set('urq.muted', muted);
    if (muted && canSpeak) speechSynthesis.cancel();
    updateSoundBtn();
    blip();
  });

  window.addEventListener('resize', resize);
  document.addEventListener('gesturestart', (e) => e.preventDefault());   // no pinch-zoom on iOS
  document.addEventListener('dblclick', (e) => e.preventDefault());

  resize();
  initClouds();
  updateSoundBtn();

  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
