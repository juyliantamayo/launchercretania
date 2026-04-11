/**
 * stars.js â€” Lucerion Galaxy Engine
 * Layers: nebula clouds â†’ deep star field â†’ mid stars â†’ bright stars â†’ shooting stars + novas
 */
(function () {
  const canvas = document.getElementById('starsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  let layers   = [];   // parallax star layers
  let nebulae  = [];   // slow-drifting nebula blobs
  let shooters = [];   // shooting stars
  let novas    = [];   // flash explosions
  let t = 0;
  let hidden   = false; // tab/window visibility

  const MAX_SHOOTERS = 6;
  const MAX_NOVAS    = 3;

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     RESIZE
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     NEBULA CLOUDS â€” large slow radial blobs
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function initNebulae() {
    nebulae = [];
    const defs = [
      { cx:0.10, cy:0.85, rx:0.62, ry:0.52, col:'95,22,150',   a:0.38, speed:0.00006 },
      { cx:0.85, cy:0.10, rx:0.58, ry:0.44, col:'18,52,170',   a:0.42, speed:0.00004 },
      { cx:0.50, cy:0.50, rx:0.70, ry:0.55, col:'10,20,70',    a:0.48, speed:0.000025 },
      { cx:0.72, cy:0.78, rx:0.50, ry:0.40, col:'72,18,110',   a:0.32, speed:0.00007 },
      { cx:0.25, cy:0.20, rx:0.45, ry:0.35, col:'15,62,140',   a:0.34, speed:0.00005 },
      { cx:0.60, cy:0.30, rx:0.35, ry:0.28, col:'200,148,18',  a:0.14, speed:0.00008 },
      { cx:0.08, cy:0.72, rx:0.38, ry:0.24, col:'38,100,230',  a:0.32, speed:0.000035 },
    ];
    defs.forEach(d => nebulae.push({ ...d, phase: Math.random() * Math.PI * 2 }));
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     STAR LAYERS â€” 5 depth layers, each drifting slightly
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  const LAYER_CFG = [
    { count:180, rMin:0.12, rMax:0.35, speed:0.000008, aMin:0.05, aMax:0.30 }, // distant dust
    { count:140, rMin:0.22, rMax:0.55, speed:0.000014, aMin:0.12, aMax:0.55 }, // far stars
    { count:100, rMin:0.38, rMax:0.80, speed:0.000022, aMin:0.20, aMax:0.70 }, // mid stars
    { count:60,  rMin:0.55, rMax:1.20, speed:0.000035, aMin:0.35, aMax:0.90 }, // bright stars
    { count:25,  rMin:1.00, rMax:2.20, speed:0.000055, aMin:0.50, aMax:1.00 }, // foreground giants
  ];

  // Star colours â€” warm golds, cool blues, neutral whites
  const STAR_COLS = [
    '#fff8e8','#fff4d0','#ffe8a8',  // warm gold-white
    '#c8e0ff','#a8c4f8','#d0e8ff',  // cool arc blue
    '#f0f0f8','#e8e8f8','#ffffff',  // neutral white
    '#ffd0a0','#ffb870',             // orange tint (rare giant)
  ];

  function initLayers() {
    layers = LAYER_CFG.map(cfg => {
      const stars = [];
      for (let i = 0; i < cfg.count; i++) {
        const twinSpeed = Math.random() * 0.008 + 0.0015;
        stars.push({
          x:  Math.random() * W,
          y:  Math.random() * H,
          r:  cfg.rMin + Math.random() * (cfg.rMax - cfg.rMin),
          a:  cfg.aMin + Math.random() * (cfg.aMax - cfg.aMin),
          da: twinSpeed * (Math.random() < 0.5 ? 1 : -1),
          aMin: cfg.aMin,
          aMax: cfg.aMax,
          col: STAR_COLS[Math.floor(Math.random() * STAR_COLS.length)],
          glowOdds: Math.random(), // >0.92 = gets a halo
        });
      }
      return { cfg, stars };
    });
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     DRAW NEBULAE
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function drawNebulae() {
    nebulae.forEach(n => {
      // Very slow drift
      const ox = Math.sin(t * n.speed + n.phase)      * W * 0.025;
      const oy = Math.cos(t * n.speed * 0.73 + n.phase) * H * 0.018;
      const cx = n.cx * W + ox;
      const cy = n.cy * H + oy;
      const rx = n.rx * W;
      const ry = n.ry * H;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      g.addColorStop(0,   'rgba(' + n.col + ',' + (n.a).toFixed(3) + ')');
      g.addColorStop(0.45,'rgba(' + n.col + ',' + (n.a * 0.55).toFixed(3) + ')');
      g.addColorStop(1,   'rgba(' + n.col + ',0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    });
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     DRAW STAR LAYERS
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function drawLayers() {
    layers.forEach((layer, li) => {
      const driftX = Math.sin(t * layer.cfg.speed + li)       * W * 0.003 * (li + 1);
      const driftY = Math.cos(t * layer.cfg.speed * 0.8 + li) * H * 0.002 * (li + 1);

      layer.stars.forEach(s => {
        // Twinkle
        s.a += s.da;
        if (s.a >= s.aMax) { s.a = s.aMax; s.da = -Math.abs(s.da); }
        if (s.a <= s.aMin) { s.a = s.aMin; s.da =  Math.abs(s.da); }

        const sx = ((s.x + driftX) % W + W) % W;
        const sy = ((s.y + driftY) % H + H) % H;

        ctx.globalAlpha = s.a;

        // Glow halo for bright stars
        if (s.glowOdds > 0.88 && s.r > 0.7) {
          const haloR = s.r * 4.5;
          const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
          const baseA = (s.a * 0.18).toFixed(3);
          halo.addColorStop(0,   s.col.replace('#','').length === 6 ? hexToRgba(s.col, s.a * 0.45) : s.col);
          halo.addColorStop(0.4, hexToRgba(s.col, s.a * 0.12));
          halo.addColorStop(1,   hexToRgba(s.col, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = s.a;
        }

        // Core dot
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     SHOOTING STARS
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function addShooter(big) {
    const angleDeg = 28 + (Math.random() * 28 - 14);
    const rad   = angleDeg * Math.PI / 180;
    const speed = big ? (Math.random() * 9 + 14) : (Math.random() * 7 + 8);
    const sx    = Math.random() * W * 0.80;
    const sy    = Math.random() * H * 0.55;
    const tailLen = big ? (Math.random() * 260 + 200) : (Math.random() * 100 + 60);
    const warm  = Math.random() < 0.6;
    const width = big ? (Math.random() * 2.2 + 1.8) : (Math.random() * 0.9 + 0.8);
    shooters.push({
      x: sx, y: sy,
      vx: Math.cos(rad) * speed,
      vy: Math.sin(rad) * speed,
      tailLen, width,
      life: 1,
      decay: big ? 0.005 : 0.013,
      headR: big ? 7.0 : 3.0,
      headCol:  warm ? '#fff8d0' : '#c8e8ff',
      trailCol: warm ? '220,195,130' : '140,195,255',
    });
  }

  function drawShooters() {
    const alive = [];
    shooters.forEach(s => {
      if (s.life <= 0) return;
      alive.push(s);

      const steps = s.tailLen / Math.max(s.vx, 1);
      const tx = s.x - s.vx * steps * 0.92;
      const ty = s.y - s.vy * steps * 0.92;

      const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
      grad.addColorStop(0,   'rgba(' + s.trailCol + ',0)');
      grad.addColorStop(0.5, 'rgba(' + s.trailCol + ',' + (s.life * 0.18).toFixed(2) + ')');
      grad.addColorStop(0.85,'rgba(' + s.trailCol + ',' + (s.life * 0.55).toFixed(2) + ')');
      grad.addColorStop(1,   'rgba(' + s.trailCol + ',' + (s.life * 0.90).toFixed(2) + ')');

      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth   = s.width;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();

      // Bright head
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.headR * 2.8);
      grd.addColorStop(0,   s.headCol);
      grd.addColorStop(0.3, s.headCol);
      grd.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.globalAlpha = s.life * 0.95;
      ctx.fillStyle   = grd;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.headR * 2.8, 0, Math.PI * 2);
      ctx.fill();

      s.x     += s.vx;
      s.y     += s.vy;
      s.life  -= s.decay;
    });
    shooters = alive;
    ctx.globalAlpha = 1;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     NOVA FLASHES â€” sudden bright glows
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function addNova() {
    const warm = Math.random() < 0.55;
    novas.push({
      x:    Math.random() * W,
      y:    Math.random() * H * 0.8,
      r:    0,
      rMax: Math.random() * 40 + 22,
      life: 1,
      col:  warm ? '220,180,80' : '100,175,255',
    });
  }

  function drawNovas() {
    const alive = [];
    novas.forEach(n => {
      if (n.life <= 0) return;
      alive.push(n);
      n.r = n.rMax * (1 - n.life);
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r + 1);
      g.addColorStop(0,   'rgba(' + n.col + ',' + (n.life * 0.7).toFixed(2) + ')');
      g.addColorStop(0.5, 'rgba(' + n.col + ',' + (n.life * 0.2).toFixed(2) + ')');
      g.addColorStop(1,   'rgba(' + n.col + ',0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle   = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 1, 0, Math.PI * 2);
      ctx.fill();
      n.life -= 0.018;
    });
    novas = alive;
    ctx.globalAlpha = 1;
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     HELPERS
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     MAIN LOOP
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function draw() {
    t++;
    ctx.clearRect(0, 0, W, H);
    drawNebulae();
    drawLayers();
    drawNovas();
    drawShooters();
    requestAnimationFrame(draw);
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     SCHEDULERS
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  function scheduleShooter() {
    if (!hidden && shooters.length < MAX_SHOOTERS) {
      const big = Math.random() < 0.42;
      addShooter(big);
    }
    setTimeout(scheduleShooter, Math.random() * 2000 + 600);
  }

  function scheduleNova() {
    if (!hidden && novas.length < MAX_NOVAS) {
      addNova();
    }
    setTimeout(scheduleNova, Math.random() * 8000 + 4000);
  }

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     INIT
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  resize();
  initNebulae();
  initLayers();
  draw();

  // Stagger 4 initial shooters so screen isn't empty at start
  setTimeout(() => addShooter(false), 300);
  setTimeout(() => addShooter(true),  800);
  setTimeout(() => addShooter(true),  1500);
  setTimeout(() => addShooter(false), 2200);
  setTimeout(() => addShooter(true),  2800);
  setTimeout(scheduleShooter, 3200);

  setTimeout(() => addNova(), 2000);
  setTimeout(scheduleNova, 5500);

  window.addEventListener('resize', () => { resize(); initNebulae(); initLayers(); });

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!hidden) {
      // Al restaurar, descartar estrellas/novas acumuladas
      shooters = [];
      novas    = [];
    }
  });
})();

