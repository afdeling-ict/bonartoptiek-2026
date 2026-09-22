/* ============================================================
   Bon Art Optiek — interactie
   WebGL-iris · progress · header · reveal-fallback · sticky bar
   ============================================================ */
(() => {
  "use strict";

  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Header & sticky bar state ---------- */
  const header = document.getElementById("siteHeader");
  const stickyBar = document.getElementById("stickyBar");
  const hero = document.querySelector(".hero");
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const past = hero ? scrollY > hero.offsetHeight - 120 : scrollY > 40;
      header.classList.toggle("on-light", past);
      stickyBar.classList.toggle("show", past);
      ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 2. Reveal fallback (no scroll-driven CSS) ---------- */
  const supportsSDT = CSS.supports("animation-timeline: view()");
  if (!supportsSDT) {
    document.documentElement.classList.add("js-reveal");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  /* ---------- 3. Iris shader ---------- */
  const canvas = document.getElementById("iris");
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, powerPreference: "low-power" });

  if (!gl) { canvas.remove(); return; } /* hero keeps its CSS-gradient backdrop */

  const VERT = `#version 300 es
  layout(location=0) in vec2 p;
  void main(){ gl_Position = vec4(p, 0., 1.); }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform vec2 u_res;
  uniform float u_time;
  uniform vec2 u_mouse;
  out vec4 outColor;

  /* hash & fbm */
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
    vec2 c  = u_mouse * 0.08 - vec2(0.0, 0.30);  /* iris onder de tekstband */
    vec2 d  = uv - c;
    float r = max(length(d), 1e-3);
    vec2 dir = d / r; /* richting zonder atan-naad */

    float t = u_time * 0.05;

    /* irisvezels: radiale strepen, naadloos (geen atan) */
    float fibers = fbm(vec2(dir.x * 3.5 + fbm(d * 3.0 + t * 0.3) * 2.0, r * 3.5 - t * 0.6));
    fibers = pow(fibers, 1.5);
    float iris   = smoothstep(0.10, 0.66, r) * (1.0 - smoothstep(0.80, 1.26, r));
    float fiber  = fibers * iris * 0.60;

    /* ringen in de iris */
    float rings = sin(r * 30.0 - fibers * 7.0 + t * 0.8) * 0.5 + 0.5;
    rings = pow(rings, 2.4) * iris * 0.35;

    /* lichtinval: zachte caustische schittering rechtsboven */
    float glint = fbm(d * 4.0 + vec2(2.0, 5.0) + t * 0.4);
    float beam  = smoothstep(0.45, 0.0, length(uv - vec2(0.40, -0.32))) * (0.35 + 0.65 * glint);

    /* pupil */
    float pupil = smoothstep(0.16, 0.08, r);
    /* lichtkrans om de pupil */
    float rim = smoothstep(0.030, 0.0, abs(r - 0.18)) * 0.5;

    /* samenstellen */
    vec3 ink    = vec3(0.085, 0.062, 0.045);
    vec3 warm   = vec3(0.190, 0.125, 0.082);
    vec3 amber  = vec3(0.930, 0.610, 0.240);

    vec3 col = mix(ink, warm, 0.5);
    col = mix(col, mix(warm, amber, 0.9), clamp(fiber, 0.0, 1.0));
    col = mix(col, amber, rings * 0.30);
    col += amber * beam * 0.22;
    col = mix(col, ink * 0.45, pupil);
    col += vec3(1.0, 0.82, 0.55) * rim;

    /* algehele vignette + lichte korrel */
    float vig = smoothstep(1.5, 0.30, length(uv));
    col *= mix(0.72, 1.12, vig);
    col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.012;

    /* doorzichtigheid: buiten de iris zacht naar transparant */
    float alpha = mix(0.78, 1.0, smoothstep(1.2, 0.4, length(uv - c * 0.5)));
    outColor = vec4(col, alpha);
  }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uRes   = gl.getUniformLocation(prog, "u_res");
  const uTime  = gl.getUniformLocation(prog, "u_time");
  const uMouse = gl.getUniformLocation(prog, "u_mouse");

  let mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener("pointermove", (e) => {
    tmx = (e.clientX / innerWidth) * 2 - 1;
    tmy = -((e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const start = performance.now();
  function frame(now) {
    mx += (tmx - mx) * 0.04;
    my += (tmy - my) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!prefersReduced) raf = requestAnimationFrame(frame);
  }

  /* teken alleen wanneer de hero in beeld is */
  let raf = null;
  const visibility = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  });
  visibility.observe(hero);

  addEventListener("resize", resize, { passive: true });
  resize();
  if (prefersReduced) {
    frame(start); /* één statisch beeld */
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }
})();
