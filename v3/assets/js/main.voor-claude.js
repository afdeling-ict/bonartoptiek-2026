/* ============================================================
   Bon Art Optiek — interactie (v2)
   JS maakt geen HTML-elementen aan; alleen gedrag:
   header/sticky-status · reveal-fallback · menu sluiten · iris-shader
   ============================================================ */
(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.getElementById("siteHeader");
  const stickyBar = document.getElementById("stickyBar");
  const hero = document.querySelector(".hero");

  /* ---------- 1. Header en sticky balk ---------- */
  let ticking = false;
  function updateBars() {
    const past = scrollY > (hero ? hero.offsetHeight - 90 : 40);
    header.classList.toggle("on-light", past);
    stickyBar.classList.toggle("show", past);
    ticking = false;
  }
  addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateBars); }
  }, { passive: true });
  updateBars();

  /* ---------- 2. Mobiel menu: sluiten na kiezen van een link ---------- */
  const menu = document.getElementById("menu");
  if (menu && typeof menu.hidePopover === "function") {
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) menu.hidePopover();
    });
  }

  /* ---------- 3. Reveal-fallback (zonder scroll-driven animations) ---------- */
  if (!CSS.supports("animation-timeline: view()") && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  /* ---------- 4. Iris-shader (WebGL2) in merkkleuren ---------- */
  const canvas = document.getElementById("iris");
  if (!canvas || !hero) return;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, powerPreference: "low-power" });
  if (!gl) { canvas.hidden = true; return; } /* CSS-verloop blijft als achtergrond */

  const VERT = `#version 300 es
  layout(location=0) in vec2 p;
  void main(){ gl_Position = vec4(p, 0., 1.); }`;

  /* Kleuren = logo: antraciet #231f20, oranje #f7931d (sRGB → lineair benaderd in de mix) */
  const FRAG = `#version 300 es
  precision highp float;
  uniform vec2 u_res;
  uniform float u_time;
  uniform vec2 u_mouse;
  out vec4 outColor;

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
    vec2 c  = u_mouse * 0.06 - vec2(0.0, 0.32);
    vec2 d  = uv - c;
    float r = max(length(d), 1e-3);
    vec2 dir = d / r;
    float t = u_time * 0.05;

    /* irisvezels, naadloos (geen atan) */
    float fibers = fbm(vec2(dir.x * 3.5 + fbm(d * 3.0 + t * 0.3) * 2.0, dir.y * 3.5 + r * 3.0 - t * 0.6));
    fibers = pow(fibers, 1.6);
    float iris  = smoothstep(0.12, 0.62, r) * (1.0 - smoothstep(0.78, 1.25, r));
    float fiber = fibers * iris * 0.55;
    float rings = pow(sin(r * 28.0 - fibers * 7.0 + t * 0.8) * 0.5 + 0.5, 2.6) * iris * 0.3;

    float pupil = smoothstep(0.17, 0.09, r);
    float rim   = smoothstep(0.028, 0.0, abs(r - 0.19)) * 0.55;

    vec3 ink    = vec3(0.137, 0.122, 0.125);   /* #231f20 */
    vec3 orange = vec3(0.969, 0.576, 0.114);   /* #f7931d */
    vec3 warm   = mix(ink, orange, 0.18);

    vec3 col = ink;
    col = mix(col, mix(warm, orange, 0.85), clamp(fiber, 0.0, 1.0));
    col = mix(col, orange, rings * 0.28);
    col = mix(col, ink * 0.5, pupil);
    col += orange * rim;

    /* reflectiepunt: de oranje punt uit het logo */
    float glint = smoothstep(0.035, 0.0, length(d - vec2(0.055, 0.06)));
    col = mix(col, orange * 1.1, glint);

    float vig = smoothstep(1.5, 0.3, length(uv));
    col *= mix(0.7, 1.08, vig);
    col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.01;
    outColor = vec4(col, 1.0);
  }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.hidden = true; return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.hidden = true; return; }
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
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
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const start = performance.now();
  let raf = 0;
  let visible = false;

  function draw(now) {
    mx += (tmx - mx) * 0.04;
    my += (tmy - my) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    draw(now);
    raf = visible && !reduceMotion.matches ? requestAnimationFrame(loop) : 0;
  }
  function kick() {
    resize();
    if (reduceMotion.matches) { draw(start + 4000); return; } /* één stilstaand beeld */
    if (visible && !raf) raf = requestAnimationFrame(loop);
  }

  /* alleen tekenen als de hero in beeld is en het tabblad zichtbaar is */
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && !document.hidden;
    kick();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden && hero.getBoundingClientRect().bottom > 0;
    kick();
  });
  addEventListener("resize", kick, { passive: true });
  reduceMotion.addEventListener("change", kick);
  kick();
})();
