/*
 * <geister-falle> – Scroll-Animation für Wix Studio (Custom Element)
 * Runterscrollen: Geister werden in den Spuk-Sauger gesogen.
 * Hochscrollen: Sie kommen wieder heraus.
 *
 * Attribute (alle optional):
 *   geister      Anzahl Geister (6–80, Standard 36)
 *   start        Position der Element-Mitte im Fenster, an der die Animation beginnt (0–1.5, Standard 0.9)
 *   ende         Position der Element-Mitte, an der alle Geister gefangen sind (Standard 0.2)
 *   hintergrund  "nacht" (Standard) oder "transparent"
 *   hud          "an" (Standard) oder "aus" – Zähler oben links
 */
(() => {
  const TAG = 'geister-falle';
  if (customElements.get(TAG)) return;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeIn = t => t * t * t;

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Geister-Sprites (einmal vorgerendert) ---------- */
  const SPRITE = 220;
  function makeGhost(variant) {
    const w = SPRITE, h = SPRITE * 1.45, pad = SPRITE * 0.45;
    const c = document.createElement('canvas');
    c.width = w + pad * 2; c.height = h + pad * 2;
    const g = c.getContext('2d');
    g.translate(pad, pad);
    const r = w / 2;
    const sway = variant === 1 ? w * 0.14 : variant === 2 ? -w * 0.1 : w * 0.03;

    const body = new Path2D();
    body.moveTo(0, r);
    body.arc(r, r, r, Math.PI, 0);
    body.bezierCurveTo(w, h * 0.55, w + sway, h * 0.72, w * 0.93 + sway, h * 0.9);
    const n = variant === 2 ? 9 : 7;
    const x0 = w * 0.93 + sway, x1 = w * 0.06 + sway * 0.4;
    for (let k = 1; k <= n; k++) {
      const x = lerp(x0, x1, k / n);
      const deep = 0.9 + ((k * 37 + variant * 11) % 9) / 100;
      const y = k % 2 ? h * 0.78 : h * deep;
      body.lineTo(x, y);
    }
    body.bezierCurveTo(-w * 0.03, h * 0.7, 0, h * 0.52, 0, r);

    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(238,247,244,0.96)');
    grad.addColorStop(0.55, 'rgba(206,232,228,0.78)');
    grad.addColorStop(1, 'rgba(170,215,205,0.05)');
    g.shadowColor = 'rgba(160,255,210,0.55)';
    g.shadowBlur = SPRITE * 0.32;
    g.fillStyle = grad;
    g.fill(body);
    g.shadowBlur = 0;

    // hohle Augen
    const eye = (x, y, rx, ry, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(8,14,18,0.92)';
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(175,255,215,0.95)';
      g.beginPath(); g.arc(0, ry * 0.25, rx * 0.16, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    const tilt = variant === 1 ? 0.35 : variant === 2 ? -0.12 : 0.15;
    eye(w * 0.33, h * 0.29, w * 0.085, w * 0.15, tilt);
    eye(w * 0.65, h * 0.29, w * 0.085, w * 0.15, -tilt);

    // Mund
    g.fillStyle = 'rgba(8,14,18,0.88)';
    g.beginPath();
    if (variant === 2) {
      g.moveTo(w * 0.32, h * 0.47);
      for (let k = 0; k <= 6; k++) g.lineTo(w * (0.32 + k * 0.06), h * (k % 2 ? 0.52 : 0.47));
      g.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.32, h * 0.47);
    } else {
      g.ellipse(w * 0.5, h * 0.5, w * (variant === 1 ? 0.06 : 0.08), w * (variant === 1 ? 0.17 : 0.13), 0, 0, Math.PI * 2);
    }
    g.fill();
    return { img: c, cx: pad + w / 2, cy: pad + h * 0.38 };
  }

  const STYLE = `
    :host{display:block;position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;contain:content}
    .wrap{position:absolute;inset:0}
    canvas{display:block;width:100%;height:100%}
    .hud{position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:4px;
      font:500 12px/1.2 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;
      color:rgba(190,240,215,.9);text-shadow:0 0 8px rgba(120,255,190,.35);pointer-events:none;font-variant-numeric:tabular-nums}
    .hud b{font-weight:700;font-size:20px;letter-spacing:.04em;color:#e6fff2}
    .hud .st{opacity:.7;font-size:11px}
    :host([hud="aus"]) .hud{display:none}
  `;

  class GeisterFalle extends HTMLElement {
    static get observedAttributes() { return ['geister', 'start', 'ende', 'hintergrund']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${STYLE}</style><div class="wrap"><canvas></canvas>
        <div class="hud" aria-live="polite"><span>Gefangen</span><span><b class="num">0</b> / <span class="tot">0</span></span><span class="st">Bereit</span></div></div>`;
      this.cv = root.querySelector('canvas');
      this.ctx = this.cv.getContext('2d');
      this.elNum = root.querySelector('.num');
      this.elTot = root.querySelector('.tot');
      this.elSt = root.querySelector('.st');
      this.sprites = [makeGhost(0), makeGhost(1), makeGhost(2)];
      this.p = 0; this.shown = 0; this.lastCount = -1; this.lastSt = '';
      this.visible = true; this.raf = 0; this.w = 0; this.h = 0;
      this.reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.tick = this.tick.bind(this);
      this.build();
    }

    attributeChangedCallback() { this.build(); }

    num(name, def, a, b) { const v = parseFloat(this.getAttribute(name)); return isNaN(v) ? def : clamp(v, a, b); }

    build() {
      const N = Math.round(this.num('geister', 36, 6, 80));
      const R = rng(1031);
      const order = Array.from({ length: N }, (_, i) => i).sort(() => R() - 0.5);
      this.ghosts = Array.from({ length: N }, (_, i) => {
        const depth = 0.45 + R() * 0.55;
        return {
          hx: 0.05 + R() * 0.9, hy: 0.06 + R() * 0.62, depth,
          v: Math.floor(R() * 3), ph: R() * Math.PI * 2,
          start: 0.03 + 0.74 * order[i] / Math.max(1, N - 1) + R() * 0.02,
          dir: R() < 0.5 ? -1 : 1
        };
      }).sort((a, b) => a.depth - b.depth);
      const FR = rng(77);
      this.fog = Array.from({ length: 7 }, () => ({ x: FR(), y: 0.25 + FR() * 0.7, r: 0.25 + FR() * 0.3, s: 0.004 + FR() * 0.01 }));
      this.motes = Array.from({ length: 42 }, () => ({ o: FR(), a: FR() * Math.PI * 2, sp: 0.6 + FR() * 0.8 }));
      this.stars = Array.from({ length: 40 }, () => ({ x: FR(), y: FR() * 0.5, r: 0.4 + FR() }));
      if (this.elTot) this.elTot.textContent = N;
      this.lastCount = -1;
    }

    connectedCallback() {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this);
      this.io = new IntersectionObserver(es => {
        this.visible = es[0].isIntersecting;
        if (this.visible) this.loop();
      }, { rootMargin: '120px' });
      this.io.observe(this);
      this.resize();
      this.p = this.shown = this.target();
      this.loop();
    }

    disconnectedCallback() {
      this.ro && this.ro.disconnect();
      this.io && this.io.disconnect();
      cancelAnimationFrame(this.raf); this.raf = 0;
    }

    resize() {
      const r = this.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw(this.shown, performance.now() / 1000);
    }

    target() {
      const r = this.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const c = r.top + r.height / 2;
      const s = this.num('start', 0.9, -1, 2) * vh, e = this.num('ende', 0.2, -1, 2) * vh;
      return s === e ? 0 : clamp((s - c) / (s - e));
    }

    loop() { if (!this.raf) this.raf = requestAnimationFrame(this.tick); }

    tick(ms) {
      this.raf = 0;
      if (!this.visible || !this.isConnected) return;
      const t = this.reduce ? 0 : ms / 1000;
      const tg = this.target();
      this.shown = this.reduce ? tg : this.shown + (tg - this.shown) * 0.14;
      if (Math.abs(tg - this.shown) < 0.0005) this.shown = tg;
      this.draw(this.shown, t);
      this.loop();
    }

    /* ---------------- Zeichnen ---------------- */
    draw(p, t) {
      const g = this.ctx, W = this.w, H = this.h;
      if (!W || !H) return;
      const k = clamp(Math.min(W / 760, H / 560), 0.42, 1.35);
      const tx = W / 2, ty = H - 34 * k;
      const mouth = { x: tx, y: ty - 250 * k };
      const beam = smooth(0.0, 0.08, p) * (1 - smooth(0.93, 0.99, p));
      const close = smooth(0.95, 1.0, p);
      const transparent = this.getAttribute('hintergrund') === 'transparent';

      g.clearRect(0, 0, W, H);
      if (!transparent) this.drawSky(g, W, H, k, t);

      // Saugstrahl
      if (beam > 0.001) this.drawBeam(g, W, H, k, t, mouth, beam);

      // Geister berechnen
      let caught = 0;
      const N = this.ghosts.length;
      const placed = [];
      for (const gh of this.ghosts) {
        const local = clamp((p - gh.start) / 0.17);
        if (local >= 0.985) { caught++; continue; }
        const wob = this.reduce ? 0 : 1;
        let hx = gh.hx * W + Math.sin(t * 0.55 + gh.ph) * 14 * k * wob;
        let hy = Math.min(gh.hy * H, mouth.y - 70 * k) + Math.sin(t * 0.9 + gh.ph * 1.7) * 9 * k * wob;
        // Zuerst zittert der Geist im Strahl, dann wird er stetig Richtung Trichter gezogen
        const e = smooth(0.08, 1, local);
        let x = lerp(hx, mouth.x, e), y = lerp(hy, mouth.y, e);
        const swirl = 45 * k * (1 - e) * smooth(0.05, 0.3, local) * gh.dir;
        x += swirl * Math.cos(local * 9 + gh.ph);
        y += swirl * 0.3 * Math.sin(local * 9 + gh.ph);
        const shiver = smooth(0, 0.08, local) * (1 - smooth(0.25, 0.45, local)) * wob;
        x += Math.sin(t * 47 + gh.ph * 5) * 3 * k * shiver;
        // Schwanz voran in den Trichter, Gesicht schaut entsetzt zurück
        const ang = Math.atan2(mouth.y - y, mouth.x - x) - Math.PI / 2;
        const idle = Math.sin(t * 0.8 + gh.ph) * 0.12 * wob;
        const rot = lerp(idle, ang, smooth(0.08, 0.35, local));
        const stretch = 1 + 1.3 * smooth(0.12, 0.75, local);
        const size = (28 + 44 * gh.depth) * k * lerp(1, 0.22, smooth(0.45, 1, local));
        const alpha = (0.45 + 0.55 * gh.depth) * (1 - smooth(0.9, 0.985, local)) *
          (0.85 + 0.15 * Math.sin(t * 3 + gh.ph * 3) * wob);
        placed.push({ gh, x, y, rot, stretch, size, alpha, local });
      }
      placed.sort((a, b) => a.local - b.local);
      for (const q of placed) this.drawGhost(g, q);

      this.drawTrap(g, k, tx, ty, t, p, beam, close, caught / N, caught);
      if (!transparent) this.drawGroundFog(g, W, H, t);

      // HUD
      if (caught !== this.lastCount) { this.elNum.textContent = caught; this.lastCount = caught; }
      const st = close > 0.5 ? 'Versiegelt' : beam > 0.05 ? 'Saugstrahl aktiv' : 'Bereit';
      if (st !== this.lastSt) { this.elSt.textContent = st; this.lastSt = st; }
    }

    drawSky(g, W, H, k, t) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#081014'); sky.addColorStop(0.7, '#10201f'); sky.addColorStop(1, '#0b1513');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(220,240,235,0.55)';
      for (const s of this.stars) {
        g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.x * 40);
        g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      // Mond
      const mx = W * 0.83, my = H * 0.17, mr = 34 * k;
      const halo = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4);
      halo.addColorStop(0, 'rgba(200,235,220,0.22)'); halo.addColorStop(1, 'rgba(200,235,220,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(mx, my, mr * 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d9ebe2'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(8,16,20,0.9)'; g.beginPath(); g.arc(mx + mr * 0.42, my - mr * 0.18, mr * 0.92, 0, Math.PI * 2); g.fill();
      // Nebel
      for (const f of this.fog) {
        const x = ((f.x + t * f.s) % 1.4 - 0.2) * W, y = f.y * H, r = f.r * Math.max(W, H);
        const fg = g.createRadialGradient(x, y, 0, x, y, r);
        fg.addColorStop(0, 'rgba(150,185,180,0.07)'); fg.addColorStop(1, 'rgba(150,185,180,0)');
        g.fillStyle = fg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // Boden
      const gy = H - 40 * k;
      const gr = g.createLinearGradient(0, gy - 30 * k, 0, H);
      gr.addColorStop(0, 'rgba(6,12,12,0)'); gr.addColorStop(0.4, '#071010'); gr.addColorStop(1, '#050b0b');
      g.fillStyle = gr; g.fillRect(0, gy - 30 * k, W, H - gy + 30 * k);
    }

    drawGroundFog(g, W, H, t) {
      const y = H * 0.92;
      for (let i = 0; i < 3; i++) {
        const x = ((i * 0.37 + t * 0.012 * (i + 1)) % 1.3 - 0.15) * W, r = W * 0.35;
        const fg = g.createRadialGradient(x, y, 0, x, y, r);
        fg.addColorStop(0, 'rgba(160,195,190,0.09)'); fg.addColorStop(1, 'rgba(160,195,190,0)');
        g.fillStyle = fg; g.fillRect(x - r, y - r * 0.4, r * 2, r * 0.8);
      }
    }

    drawBeam(g, W, H, k, t, m, beam) {
      const flick = this.reduce ? 1 : 0.86 + 0.14 * Math.sin(t * 23) * Math.sin(t * 7.3);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const spread = Math.max(W * 0.42, 260 * k);
      const cone = g.createLinearGradient(0, m.y, 0, 0);
      cone.addColorStop(0, `rgba(150,255,200,${0.3 * beam * flick})`);
      cone.addColorStop(0.5, `rgba(120,230,190,${0.1 * beam * flick})`);
      cone.addColorStop(1, 'rgba(120,230,190,0)');
      g.fillStyle = cone;
      g.beginPath();
      g.moveTo(m.x - 88 * k, m.y); g.lineTo(m.x + 88 * k, m.y);
      g.lineTo(m.x + spread, 0); g.lineTo(m.x - spread, 0); g.closePath(); g.fill();
      // Partikel, die hinabgesogen werden
      for (const d of this.motes) {
        const f = (d.o + t * 0.22 * d.sp) % 1;
        const yy = lerp(0, m.y, f * f);
        const wdt = lerp(spread, 70 * k, f);
        const xx = m.x + Math.sin(d.a + f * 9) * wdt * 0.8;
        g.fillStyle = `rgba(200,255,225,${0.55 * beam * Math.sin(f * Math.PI)})`;
        g.beginPath(); g.arc(xx, yy, (1 + 1.6 * (1 - f)) * k, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    drawGhost(g, q) {
      const sp = this.sprites[q.gh.v];
      const s = q.size / SPRITE;
      g.save();
      g.globalAlpha = q.alpha;
      g.translate(q.x, q.y);
      g.rotate(q.rot);
      g.scale(s / Math.sqrt(q.stretch), s * q.stretch);
      g.drawImage(sp.img, -sp.cx, -sp.cy);
      g.restore();
    }

    drawTrap(g, k, tx, ty, t, p, beam, close, fill, caught) {
      g.save();
      g.translate(tx, ty);
      g.scale(k, k);

      // Lichtpfütze + Schatten
      const pool = g.createRadialGradient(0, 6, 10, 0, 6, 190);
      pool.addColorStop(0, `rgba(140,255,200,${0.18 * beam + 0.08 * fill})`); pool.addColorStop(1, 'rgba(140,255,200,0)');
      g.fillStyle = pool; g.beginPath(); g.ellipse(0, 6, 190, 30, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(0, 4, 130, 12, 0, 0, Math.PI * 2); g.fill();

      const copper = (x0, x1) => {
        const c = g.createLinearGradient(x0, 0, x1, 0);
        c.addColorStop(0, '#4a2413'); c.addColorStop(0.3, '#c47a45'); c.addColorStop(0.42, '#eab184');
        c.addColorStop(0.6, '#a65a2e'); c.addColorStop(1, '#3d1d10');
        return c;
      };
      const brass = (x0, x1) => {
        const c = g.createLinearGradient(x0, 0, x1, 0);
        c.addColorStop(0, '#5b4416'); c.addColorStop(0.35, '#d8b45a'); c.addColorStop(0.5, '#f4dc94');
        c.addColorStop(0.7, '#a7802f'); c.addColorStop(1, '#4a3510');
        return c;
      };
      const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

      // Füße
      g.fillStyle = brass(-110, 110);
      rr(-92, -8, 34, 12, 4); g.fill(); rr(58, -8, 34, 12, 4); g.fill();

      // Trichter (hinter dem Korpus)
      const hornY = -252, neckY = -168;
      g.fillStyle = copper(-96, 96);
      g.beginPath();
      g.moveTo(-28, neckY);
      g.quadraticCurveTo(-34, -215, -96, hornY);
      g.lineTo(96, hornY);
      g.quadraticCurveTo(34, -215, 28, neckY);
      g.closePath(); g.fill();
      // Nieten-Naht am Trichter
      g.strokeStyle = 'rgba(40,18,8,0.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, neckY); g.lineTo(0, hornY + 10); g.stroke();
      g.fillStyle = '#e9c27a';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(0, neckY - 12 - i * 16, 2, 0, Math.PI * 2); g.fill(); }

      // Hals
      g.fillStyle = brass(-34, 34); rr(-34, neckY - 2, 68, 22, 5); g.fill();

      // Mündung
      g.fillStyle = '#04090a';
      g.beginPath(); g.ellipse(0, hornY, 92, 17, 0, 0, Math.PI * 2); g.fill();
      const throat = g.createRadialGradient(0, hornY, 2, 0, hornY, 92);
      throat.addColorStop(0, `rgba(170,255,210,${0.75 * beam})`); throat.addColorStop(1, 'rgba(170,255,210,0)');
      g.fillStyle = throat; g.beginPath(); g.ellipse(0, hornY, 92, 17, 0, 0, Math.PI * 2); g.fill();

      // Iris-Verschluss
      if (close > 0) {
        g.save();
        g.beginPath(); g.ellipse(0, hornY, 92, 17, 0, 0, Math.PI * 2); g.clip();
        g.translate(0, hornY); g.scale(1, 17 / 92);
        g.fillStyle = brass(-92, 92);
        const blades = 8;
        for (let i = 0; i < blades; i++) {
          const a = (i / blades) * Math.PI * 2 + close * 0.9;
          g.save();
          g.rotate(a);
          g.beginPath();
          g.moveTo(0, -92); g.arc(0, 0, 92, -Math.PI / 2, -Math.PI / 2 + 0.9);
          const inner = 92 * (1 - close);
          g.lineTo(Math.cos(-Math.PI / 2 + 1.6) * inner, Math.sin(-Math.PI / 2 + 1.6) * inner);
          g.closePath(); g.fill();
          g.strokeStyle = 'rgba(60,40,10,0.6)'; g.lineWidth = 2; g.stroke();
          g.restore();
        }
        g.restore();
      }
      g.strokeStyle = brass(-96, 96); g.lineWidth = 6;
      g.beginPath(); g.ellipse(0, hornY, 94, 18, 0, 0, Math.PI * 2); g.stroke();

      // Korpus
      g.fillStyle = copper(-112, 112); rr(-112, -150, 224, 148, 24); g.fill();
      // Bänder
      g.fillStyle = brass(-118, 118);
      rr(-118, -154, 236, 15, 6); g.fill(); rr(-118, -18, 236, 15, 6); g.fill();
      g.fillStyle = '#3a2a0a';
      for (let x = -104; x <= 104; x += 26) {
        g.beginPath(); g.arc(x, -146.5, 2.4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x, -10.5, 2.4, 0, Math.PI * 2); g.fill();
      }

      // Bullauge
      const pr = 38, py = -80;
      g.fillStyle = brass(-50, 50); g.beginPath(); g.arc(0, py, pr + 10, 0, Math.PI * 2); g.fill();
      g.save();
      g.beginPath(); g.arc(0, py, pr, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#071514'; g.fillRect(-pr, py - pr, pr * 2, pr * 2);
      const glow = g.createRadialGradient(0, py, 2, 0, py, pr);
      glow.addColorStop(0, `rgba(150,255,205,${0.15 + 0.6 * fill})`); glow.addColorStop(1, `rgba(60,160,130,${0.1 + 0.25 * fill})`);
      g.fillStyle = glow; g.fillRect(-pr, py - pr, pr * 2, pr * 2);
      const inside = Math.min(caught, 22);
      for (let j = 0; j < inside; j++) {
        const sp = this.sprites[j % 3];
        const a = t * (0.7 + (j % 4) * 0.25) + j * 2.4;
        const rad = 6 + ((j * 7) % 26);
        const s = 18 / SPRITE;
        g.save();
        g.translate(Math.cos(a) * rad, py + Math.sin(a) * rad * 0.8);
        g.rotate(a + Math.PI / 2);
        g.globalAlpha = 0.85;
        g.scale(s, s);
        g.drawImage(sp.img, -sp.cx, -sp.cy);
        g.restore();
      }
      g.restore();
      // Glasreflex
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, py, pr - 8, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
      g.fillStyle = '#3a2a0a';
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * (pr + 5), py + Math.sin(a) * (pr + 5), 2, 0, Math.PI * 2); g.fill(); }

      // Druckanzeige
      const gx = 80, gyy = -100, gr2 = 19;
      g.fillStyle = brass(gx - 24, gx + 24); g.beginPath(); g.arc(gx, gyy, gr2 + 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(gx, gyy, gr2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#a3261b'; g.lineWidth = 3;
      g.beginPath(); g.arc(gx, gyy, gr2 - 4, -0.25, 0.85); g.stroke();
      g.strokeStyle = '#222'; g.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        const a = lerp(-Math.PI * 1.25, Math.PI * 0.25, i / 8);
        g.beginPath(); g.moveTo(gx + Math.cos(a) * (gr2 - 2), gyy + Math.sin(a) * (gr2 - 2));
        g.lineTo(gx + Math.cos(a) * (gr2 - 6), gyy + Math.sin(a) * (gr2 - 6)); g.stroke();
      }
      const shake = this.reduce ? 0 : Math.sin(t * 40) * 0.05 * beam;
      const na = lerp(-Math.PI * 1.25, Math.PI * 0.25, fill) + shake;
      g.strokeStyle = '#111'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(gx, gyy); g.lineTo(gx + Math.cos(na) * (gr2 - 3), gyy + Math.sin(na) * (gr2 - 3)); g.stroke();
      g.fillStyle = '#111'; g.beginPath(); g.arc(gx, gyy, 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a2a0a'; g.font = '700 6px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('ψ', gx, gyy + 11);

      // Ventilrad
      const vx = -80, vy = -104, vr = 17;
      g.save(); g.translate(vx, vy); g.rotate(p * Math.PI * 8);
      g.strokeStyle = brass(-vr, vr); g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, vr, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-vr, 0); g.lineTo(vr, 0); g.stroke(); }
      g.fillStyle = '#c99a3c'; g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
      g.restore();

      // Statuslampe
      const lx = 92, ly = -164;
      const full = close > 0.6;
      const on = full ? 1 : beam;
      const col = full ? '255,70,50' : '120,255,180';
      const blink = full || this.reduce ? 1 : 0.6 + 0.4 * Math.sin(t * 9);
      g.fillStyle = brass(lx - 9, lx + 9); rr(lx - 9, ly + 2, 18, 8, 2); g.fill();
      const lg = g.createRadialGradient(lx, ly, 1, lx, ly, 24);
      lg.addColorStop(0, `rgba(${col},${0.7 * on * blink})`); lg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, 24, 0, Math.PI * 2); g.fill();
      g.fillStyle = on > 0.05 ? `rgba(${col},${0.5 + 0.5 * blink})` : '#3b3b36';
      g.beginPath(); g.arc(lx, ly, 6, Math.PI, 0); g.lineTo(lx + 6, ly + 3); g.lineTo(lx - 6, ly + 3); g.fill();

      // Typenschild
      g.fillStyle = 'rgba(30,14,6,0.55)'; rr(-30, -36, 60, 12, 2); g.fill();
      g.fillStyle = '#e9c27a'; g.font = '700 7px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('SPUK-SAUGER No. 7', 0, -27.5);

      g.restore();
    }
  }

  customElements.define(TAG, GeisterFalle);
})();
