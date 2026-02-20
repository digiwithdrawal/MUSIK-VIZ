(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // DOM
  const topPanel = $("#topPanel");
  const hudControls = $("#hudControls");
  const settings = $("#settings");

  const srcLabel = $("#srcLabel");
  const stateLabel = $("#stateLabel");
  const visLabel = $("#visLabel");
  const visName = $("#visName");

  const palLabel = $("#palLabel");
  const lvlLabel = $("#lvlLabel");

  const canvas2d = $("#viz");
  const ctx2d = canvas2d.getContext("2d", { alpha: true });

  const canvasGL = $("#gl");
  let gl = null;

  const importBtn = $("#importBtn");
  const micBtn = $("#micBtn");
  const colorBtn = $("#colorBtn");
  const randBtn = $("#randBtn");
  const settingsBtn = $("#settingsBtn");

  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const playBtn = $("#playBtn");
  const hideBtn = $("#hideBtn");

  const fileInput = $("#fileInput");

  const palModal = $("#palModal");
  const palGrid = $("#palGrid");
  const closePalBtn = $("#closePalBtn");
  const genPalBtn = $("#genPalBtn");

  const intensity = $("#intensity");
  const gain = $("#gain");
  const bass = $("#bass");
  const intensityVal = $("#intensityVal");
  const gainVal = $("#gainVal");
  const bassVal = $("#bassVal");

  // Helpers
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const randInt = (a,b)=>Math.floor(a+Math.random()*(b-a+1));

  function setBtnSelected(btn, on){
    btn.classList.toggle("selected", !!on);
  }

  // Palettes (50 curated) + procedural
  const CURATED = [
    ["#00ff8a","#050a07","#b8ffe5"],["#7CFF00","#050a07","#B8FF8A"],
    ["#00ffcc","#050a07","#bff7ff"],["#00ffa8","#050a07","#e6fff3"],
    ["#00ff66","#050a07","#d8ffe9"],["#00ffd5","#050a07","#e3fffb"],
    ["#b6ff00","#050a07","#fbffe3"],["#ffb000","#050a07","#fff2cc"],
    ["#ff3b3b","#050a07","#ffe3e3"],["#ff0077","#050a07","#ffe3f0"],
    ["#00a2ff","#050a07","#dbefff"],["#6d7dff","#050a07","#e7e9ff"],
    ["#00fff0","#050a07","#dbfffd"],["#ffe600","#050a07","#fff8cc"],
    ["#ff6a00","#050a07","#ffe7cc"],["#00b6ff","#050a07","#d9f2ff"],
    ["#7d00ff","#050a07","#f0e3ff"],["#ff00ff","#050a07","#ffe3ff"],
    ["#33ff99","#050a07","#e3fff3"],["#00ffbb","#050a07","#d8fff7"],
    ["#00ffea","#050a07","#dbfffe"],["#00ff7b","#050a07","#e1ffef"],
    ["#00d1ff","#050a07","#d6f7ff"],["#ff00aa","#050a07","#ffe3f6"],
    ["#ffd400","#050a07","#fff4cc"],["#00ff40","#050a07","#ddffea"],
    ["#00ff9f","#050a07","#e6fff5"],["#00ffdc","#050a07","#d7fffb"],
    ["#00ff84","#050a07","#eafff2"],["#00ffae","#050a07","#dffff4"],
    ["#67ff00","#050a07","#ebffd6"],["#ff2bd6","#050a07","#ffe3fb"],
    ["#00ffdd","#050a07","#d8fffb"],["#42ffb8","#050a07","#f0fff9"],
    ["#00ff55","#050a07","#e6ffef"],["#a8ffea","#050a07","#f0fffb"],
    ["#a2ff00","#050a07","#f4ffe3"],["#00ffd1","#050a07","#e6fffb"],
    ["#00ff8f","#050a07","#ddfff3"],["#00ff2a","#050a07","#e1ffe7"],
    ["#ff2f2f","#050a07","#ffdede"],["#ff6ad5","#050a07","#ffe3f6"],
    ["#00ffb3","#050a07","#e1fff6"],["#00fffc","#050a07","#e1fffe"],
    ["#00ffa0","#050a07","#d9fff2"],["#00ffea","#050a07","#dbfffe"],
    ["#00ff66","#050a07","#d8ffea"],["#00ffcc","#050a07","#d8fffb"],
    ["#00ff9a","#050a07","#eafff6"],["#00ffdc","#050a07","#d8fffb"]
  ];

  function hex(n){ return n.toString(16).padStart(2,"0"); }
  function neon(){
    const r = randInt(30,255);
    const g = randInt(120,255);
    const b = randInt(30,255);
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  function procPalette(){
    return [neon(),"#050a07",neon()];
  }

  // State
  const state = {
    hidden:false,
    source:"import", // default import
    playing:false,
    paletteIndex: randInt(0, CURATED.length-1), // default random curated per session
    palette: null,
    paletteName: "",
    // sliders
    intensity: 0.5,
    gain: 0.5,
    bass: 0.5,
    // visualizer: 51 total => 17 types * 3 variants
    visIndex: 50, // default VIS 51 = last
    time: 0,
  };

  function applyPaletteFromIndex(i){
    state.paletteIndex = i;
    state.palette = CURATED[i];
    state.paletteName = `CURATED ${i+1}`;
    palLabel.textContent = state.paletteName;
  }

  applyPaletteFromIndex(state.paletteIndex);

  // Audio
  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let sourceNode = null;
  let mediaEl = null;
  let micStream = null;

  const FFT = 2048;
  const freqData = new Uint8Array(FFT/2);
  const waveData = new Uint8Array(FFT);

  function ensureAudio(){
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function sliderToGain(v01){
    return Math.pow(v01 * 1.5, 1.2); // ~0..2.2
  }

  function setLabels(){
    srcLabel.textContent = state.source.toUpperCase();
    visLabel.textContent = `VIS ${state.visIndex+1}`;
  }

  function stopAll(){
    state.playing = false;
    playBtn.textContent = "PLAY";
    stateLabel.textContent = "IDLE";

    try{ if (mediaEl){ mediaEl.pause(); mediaEl.src=""; mediaEl.load(); } }catch{}
    try{ if (sourceNode) sourceNode.disconnect(); }catch{}
    try{
      if (micStream){
        micStream.getTracks().forEach(t=>t.stop());
      }
    }catch{}

    sourceNode = null;
    micStream = null;
    analyser = null;
    gainNode = null;
  }

  function buildGraph(inputNode){
    const ctx = ensureAudio();
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0.82;

    gainNode = ctx.createGain();
    gainNode.gain.value = sliderToGain(state.gain);

    inputNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);

    sourceNode = inputNode;
  }

  function updateGain(){
    if (!gainNode) return;
    gainNode.gain.value = (state.source==="mic" && !state.playing)
      ? 0.0001
      : sliderToGain(state.gain);
  }

  function getFeatures(){
    if (!analyser) return { ok:false, lvl:0, bass:0, mid:0, tre:0 };
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);

    // RMS-ish
    let sum=0;
    for (let i=0;i<waveData.length;i++){
      const v=(waveData[i]-128)/128;
      sum+=v*v;
    }
    const rms = Math.sqrt(sum/waveData.length);
    const lvl = clamp(rms*1.9, 0, 1);

    const n=freqData.length;
    const bEnd=Math.floor(n*0.10);
    const mEnd=Math.floor(n*0.35);
    let b=0,m=0,t=0;
    for(let i=0;i<bEnd;i++) b+=freqData[i];
    for(let i=bEnd;i<mEnd;i++) m+=freqData[i];
    for(let i=mEnd;i<n;i++) t+=freqData[i];
    b/=Math.max(1,bEnd);
    m/=Math.max(1,mEnd-bEnd);
    t/=Math.max(1,n-mEnd);

    const bassN = clamp((b/255) * (0.70 + state.bass*1.40), 0, 1);
    const midN  = clamp(m/255, 0, 1);
    const treN  = clamp(t/255, 0, 1);
    return { ok:true, lvl, bass:bassN, mid:midN, tre:treN };
  }

  // iPhone-friendly Import
  async function startImport(file){
    stopAll();
    state.source = "import";
    setBtnSelected(importBtn,true);
    setBtnSelected(micBtn,false);
    stateLabel.textContent = "LOADING";

    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();

    mediaEl = new Audio();
    mediaEl.crossOrigin = "anonymous";
    mediaEl.preload = "auto";
    mediaEl.loop = true;
    mediaEl.playsInline = true;

    const url = URL.createObjectURL(file);
    mediaEl.src = url;

    const node = ctx.createMediaElementSource(mediaEl);
    buildGraph(node);

    // don’t assume autoplay works on iOS
    state.playing = false;
    playBtn.textContent = "PLAY";
    stateLabel.textContent = "READY";
  }

  async function startMic(){
    stopAll();
    state.source = "mic";
    setBtnSelected(micBtn,true);
    setBtnSelected(importBtn,false);
    stateLabel.textContent = "REQUEST";

    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:false,
        noiseSuppression:false,
        autoGainControl:false
      }
    });

    const node = ctx.createMediaStreamSource(micStream);
    buildGraph(node);

    // per your pick: play/pause = mute/unmute. start unmuted.
    state.playing = true;
    updateGain();
    playBtn.textContent = "PAUSE";
    stateLabel.textContent = "LIVE";
  }

  // Canvas sizing
  function fitCanvas(c){
    const r = c.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(r.width*dpr));
    const h = Math.max(260, Math.floor(r.height*dpr));
    if (c.width!==w || c.height!==h){
      c.width=w; c.height=h;
    }
  }

  // ======= 2D Drawing helpers =======
  function pal(){
    return { fg: state.palette[0], bg: state.palette[1], alt: state.palette[2] };
  }

  function clear2D(w,h){
    const {bg} = pal();
    ctx2d.clearRect(0,0,w,h);
    ctx2d.fillStyle = bg;
    ctx2d.fillRect(0,0,w,h);
  }

  function grid(w,h, color, a=0.06, step=48){
    ctx2d.save();
    ctx2d.globalAlpha = a;
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1;
    for (let x=0;x<=w;x+=step){ ctx2d.beginPath(); ctx2d.moveTo(x,0); ctx2d.lineTo(x,h); ctx2d.stroke(); }
    for (let y=0;y<=h;y+=step){ ctx2d.beginPath(); ctx2d.moveTo(0,y); ctx2d.lineTo(w,y); ctx2d.stroke(); }
    ctx2d.restore();
  }

  // ======= WebGL Shader Visualizers (real 3D-looking) =======
  // We compile shaders once and reuse.
  const SHADERS = {
    // Raymarched sphere + audio displacement
    sphere: {
      frag: `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_t;
      uniform float u_lvl;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_tre;
      uniform vec3 u_c1;
      uniform vec3 u_c2;
      uniform vec3 u_c3;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }

      float sdSphere(vec3 p, float r){ return length(p)-r; }

      float map(vec3 p){
        float r = 0.55 + u_bass*0.35;
        float n = sin(p.x*3.0 + u_t*1.2) * sin(p.y*4.0 - u_t*1.0) * sin(p.z*3.5 + u_t*0.8);
        r += n * (0.08 + u_mid*0.18);
        return sdSphere(p, r);
      }

      vec3 normal(vec3 p){
        vec2 e = vec2(0.001,0.0);
        float d = map(p);
        vec3 n = vec3(
          map(p+e.xyy)-d,
          map(p+e.yxy)-d,
          map(p+e.yyx)-d
        );
        return normalize(n);
      }

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
        vec3 ro = vec3(0.0, 0.0, 2.2);
        vec3 rd = normalize(vec3(uv, -1.6));

        // subtle camera orbit
        float a = 0.25*sin(u_t*0.2) + 0.10*u_bass;
        float ca = cos(a), sa = sin(a);
        ro.xz = mat2(ca,-sa,sa,ca) * ro.xz;
        rd.xz = mat2(ca,-sa,sa,ca) * rd.xz;

        float t = 0.0;
        float hit = 0.0;
        vec3 p;
        for(int i=0;i<90;i++){
          p = ro + rd*t;
          float d = map(p);
          if(d < 0.001){ hit = 1.0; break; }
          t += d * 0.85;
          if(t>6.0) break;
        }

        vec3 col = u_c2 * 0.08; // background tint
        if(hit>0.5){
          vec3 n = normal(p);
          vec3 l = normalize(vec3(0.6, 0.7, 0.5));
          float diff = clamp(dot(n,l), 0.0, 1.0);
          float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.2);

          vec3 base = mix(u_c1, u_c3, diff);
          col = base * (0.25 + diff*1.25);
          col += u_c1 * rim * (0.65 + u_tre*0.55);
          col += vec3(1.0) * pow(diff, 10.0) * (0.35 + u_lvl*0.65);
        }

        // scanline
        float scan = 0.92 + 0.08*sin(gl_FragCoord.y*1.6);
        col *= scan;

        gl_FragColor = vec4(col, 1.0);
      }`
    },

    // PS2-ish stacked blocks in depth (shader style)
    stacks: {
      frag: `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_t;
      uniform float u_lvl;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_tre;
      uniform vec3 u_c1;
      uniform vec3 u_c2;
      uniform vec3 u_c3;

      float box(vec2 p, vec2 b){
        vec2 d = abs(p) - b;
        return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
      }

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;

        vec3 col = u_c2 * 0.06;
        // faux depth layers
        for(int i=0;i<28;i++){
          float z = float(i) / 27.0;
          float depth = mix(1.0, 0.12, z);

          float wob = sin(u_t*0.6 + z*4.1)*0.12 + cos(u_t*0.45 + z*3.3)*0.08;
          vec2 p = uv + vec2(wob, -z*0.28 + sin(u_t*0.35+z*5.0)*0.04);

          float w = mix(0.55, 0.18, z);
          float h = mix(0.10, 0.05, z) + (u_mid*0.15 + u_bass*0.22) * depth;

          float d = box(p, vec2(w,h));
          float a = smoothstep(0.02, 0.0, d);

          vec3 layer = mix(u_c1, u_c3, fract(z*3.0));
          col += layer * a * (0.08 + depth*0.55) * (0.55 + u_lvl);
        }

        // center glow pulse
        float r = length(uv);
        col += u_c1 * (0.12 + u_bass*0.25) * smoothstep(0.7, 0.0, r);

        gl_FragColor = vec4(col,1.0);
      }`
    },

    // Tunnel rings (shader) with strong bass pulses
    tunnel: {
      frag: `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_t;
      uniform float u_lvl;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_tre;
      uniform vec3 u_c1;
      uniform vec3 u_c2;
      uniform vec3 u_c3;

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
        float r = length(uv);
        float a = atan(uv.y, uv.x);

        float speed = 0.35 + u_mid*0.55 + u_bass*0.65;
        float z = u_t * speed;

        float rings = sin((r*10.0 - z*2.0) + sin(a*3.0 + u_t*0.7)*0.8);
        float glow = smoothstep(0.85, 1.0, rings*0.5+0.5);

        float pulse = smoothstep(0.35, 0.0, abs(fract(z*0.25)-0.5)) * (0.2 + u_bass*0.8);

        vec3 col = u_c2 * 0.06;
        col += mix(u_c1, u_c3, r) * glow * (0.35 + u_lvl*0.95);
        col += u_c1 * pulse * (0.20 + u_bass*0.55);

        // vignette
        col *= smoothstep(1.1, 0.15, r);

        gl_FragColor = vec4(col,1.0);
      }`
    }
  };

  function initGL(){
    if (gl) return gl;
    gl = canvasGL.getContext("webgl", { antialias:true, premultipliedAlpha:false });
    if (!gl) return null;
    return gl;
  }

  function compile(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function makeProgram(gl, fragSrc){
    const vsSrc = `
      attribute vec2 a_pos;
      void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  const glCache = {};
  function useShader(name){
    const gl = initGL();
    if (!gl) return null;

    if (!glCache[name]){
      const prog = makeProgram(gl, SHADERS[name].frag);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1,  1,-1,  -1,1,
        -1,1,   1,-1,   1,1
      ]), gl.STATIC_DRAW);

      glCache[name] = { prog, buf };
    }
    return glCache[name];
  }

  function hexToRgb(h){
    const x = h.replace("#","");
    const r = parseInt(x.slice(0,2),16)/255;
    const g = parseInt(x.slice(2,4),16)/255;
    const b = parseInt(x.slice(4,6),16)/255;
    return [r,g,b];
  }

  function drawGL(shaderName, w, h, f, t){
    const gl = initGL();
    if (!gl) return;

    const pack = useShader(shaderName);
    if (!pack || !pack.prog) return;

    gl.viewport(0,0,w,h);
    gl.useProgram(pack.prog);

    const locPos = gl.getAttribLocation(pack.prog, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, pack.buf);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    const u_res = gl.getUniformLocation(pack.prog,"u_res");
    const u_t = gl.getUniformLocation(pack.prog,"u_t");
    const u_lvl = gl.getUniformLocation(pack.prog,"u_lvl");
    const u_bass = gl.getUniformLocation(pack.prog,"u_bass");
    const u_mid = gl.getUniformLocation(pack.prog,"u_mid");
    const u_tre = gl.getUniformLocation(pack.prog,"u_tre");
    const u_c1 = gl.getUniformLocation(pack.prog,"u_c1");
    const u_c2 = gl.getUniformLocation(pack.prog,"u_c2");
    const u_c3 = gl.getUniformLocation(pack.prog,"u_c3");

    const P = pal();
    const c1 = hexToRgb(P.fg);
    const c2 = hexToRgb(P.bg);
    const c3 = hexToRgb(P.alt);

    gl.uniform2f(u_res, w, h);
    gl.uniform1f(u_t, t);
    gl.uniform1f(u_lvl, f.lvl);
    gl.uniform1f(u_bass, f.bass);
    gl.uniform1f(u_mid, f.mid);
    gl.uniform1f(u_tre, f.tre);
    gl.uniform3f(u_c1, c1[0],c1[1],c1[2]);
    gl.uniform3f(u_c2, c2[0],c2[1],c2[2]);
    gl.uniform3f(u_c3, c3[0],c3[1],c3[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ======= VISUALIZER TYPES (17 distinct) =======
  // 51 = 17 * 3 variants (variant controls style)
  const TYPES = [
    { name:"SPECTRUM RING", kind:"2d", draw: visRing },
    { name:"WAVEFORM OSC", kind:"2d", draw: visWave },
    { name:"BARS HUD", kind:"2d", draw: visBars },
    { name:"WATERFALL SPEC", kind:"2d", draw: visWaterfall },
    { name:"LISSAJOUS", kind:"2d", draw: visLissajous },
    { name:"RADAR SWEEP", kind:"2d", draw: visRadar },
    { name:"VECTOR FIELD", kind:"2d", draw: visVectorField },
    { name:"GLYPH RAIN", kind:"2d", draw: visGlyphRain },
    { name:"KALEIDOSCOPE", kind:"2d", draw: visKaleido },
    { name:"METABALLS", kind:"2d", draw: visMetaballs },
    { name:"TRI MESH", kind:"2d", draw: visTriMesh },
    { name:"SPIRO RIBBON", kind:"2d", draw: visSpiro },
    { name:"PARTICLE ORBITS", kind:"2d", draw: visOrbits },
    { name:"SHADER SPHERE", kind:"gl", shader:"sphere" },
    { name:"SHADER STACKS", kind:"gl", shader:"stacks" },
    { name:"SHADER TUNNEL", kind:"gl", shader:"tunnel" },
    { name:"GEOMETRIC TILES", kind:"2d", draw: visTiles }
  ];

  function visMeta(index){
    const typeIndex = Math.floor(index / 3);
    const variant = index % 3;
    return { typeIndex, variant, type: TYPES[typeIndex] };
  }

  function setVis(i){
    state.visIndex = (i + 51) % 51;
    const { typeIndex, variant, type } = visMeta(state.visIndex);
    const human = state.visIndex + 1;
    const label = `VIS ${human} / ${type.name} ${variant+1}`;
    visName.textContent = label;
    visLabel.textContent = `VIS ${human}`;
    // toggle canvas
    const useGL = type.kind === "gl";
    canvasGL.classList.toggle("hidden", !useGL);
    canvas2d.classList.toggle("hidden", useGL);
  }

  // ======= 2D Visualizers =======
  function visRing(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);
    grid(w,h,alt,0.05, 56 - variant*8);

    const cx=w/2, cy=h/2;
    const base=Math.min(w,h)*0.22;
    const intensity=0.35+state.intensity*1.35;

    const breath = base + f.bass*(Math.min(w,h)*0.085)*intensity;
    const spokes = 140 + variant*40;
    const step = Math.max(1, Math.floor(freqData.length / spokes));

    for(let i=0;i<spokes;i++){
      const v = (freqData[i*step]/255);
      const a = (i/spokes)*Math.PI*2;

      const inner = breath * (variant===2 ? 0.72 : 0.88);
      const outer = breath + v*(Math.min(w,h)*0.18)*intensity*(variant===1 ? 1.25 : 1.0);

      const x0=cx+Math.cos(a)*inner;
      const y0=cy+Math.sin(a)*inner;
      const x1=cx+Math.cos(a)*outer;
      const y1=cy+Math.sin(a)*outer;

      ctx2d.strokeStyle = fg;
      ctx2d.globalAlpha = 0.08 + v*0.80;
      ctx2d.lineWidth = (variant===0?2:1.5);
      ctx2d.beginPath(); ctx2d.moveTo(x0,y0); ctx2d.lineTo(x1,y1); ctx2d.stroke();
    }
    ctx2d.globalAlpha=1;

    ctx2d.strokeStyle = alt;
    ctx2d.globalAlpha = 0.22;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(cx,cy, breath*(variant===2?0.65:0.78), 0, Math.PI*2);
    ctx2d.stroke();
    ctx2d.globalAlpha=1;
  }

  function visWave(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);
    grid(w,h,alt,0.035, 52+variant*10);

    const midY=h*0.52;
    const intensity=0.35+state.intensity*1.25;
    const amp=h*(variant===2?0.30:0.22)*intensity;

    ctx2d.strokeStyle = fg;
    ctx2d.lineWidth = variant===1?3:2;
    ctx2d.globalAlpha=0.9;
    ctx2d.beginPath();
    for(let i=0;i<waveData.length;i++){
      const x=(i/(waveData.length-1))*w;
      const v=(waveData[i]-128)/128;
      const y=midY + v*amp + (variant===2?Math.sin(t*2.0+i*0.01)*3:0);
      if(i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
    }
    ctx2d.stroke();
    ctx2d.globalAlpha=1;

    if(variant!==0){
      ctx2d.strokeStyle=alt;
      ctx2d.globalAlpha=0.18;
      ctx2d.lineWidth=1;
      ctx2d.beginPath();
      for(let i=0;i<waveData.length;i+=2){
        const x=(i/(waveData.length-1))*w;
        const v=(waveData[i]-128)/128;
        const y=midY + v*amp*0.6 + Math.sin(t*1.2+i*0.02)*2;
        if(i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
      }
      ctx2d.stroke();
      ctx2d.globalAlpha=1;
    }
  }

  function visBars(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);
    grid(w,h,alt,0.04, 54);

    const n = variant===0 ? 64 : variant===1 ? 96 : 48;
    const margin = w*0.06;
    const usable = w - margin*2;
    const barW = usable / n;
    const baseY = h*0.88;
    const maxH = h*0.62;
    const intensity=0.25+state.intensity*1.55;

    for(let i=0;i<n;i++){
      const idx=Math.floor((i/n)*(freqData.length-1));
      const v=freqData[idx]/255;
      let hh=v*maxH*intensity;
      if(variant===2) hh = Math.pow(v,0.65)*maxH*intensity; // more aggressive
      const x=margin + i*barW;

      ctx2d.fillStyle = (i%5===0 && variant===1) ? alt : fg;
      ctx2d.globalAlpha = 0.08 + v*0.85;
      ctx2d.fillRect(x, baseY-hh, Math.max(1,barW*0.70), hh);
    }
    ctx2d.globalAlpha=1;
  }

  // Waterfall spectrogram (scrolling)
  const wf = { img:null, y:0 };
  function visWaterfall(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    if(!wf.img || wf.img.width!==w || wf.img.height!==h){
      wf.img = ctx2d.createImageData(w,h);
      wf.y = 0;
    }

    // shift down slightly by copying pixels (cheap-ish)
    // We draw a new row at the top.
    const rowH = variant===0?2:variant===1?3:4;
    ctx2d.drawImage(canvas2d, 0, 0, w, h, 0, rowH, w, h);

    // top row based on spectrum
    for(let y=0;y<rowH;y++){
      for(let x=0;x<w;x++){
        const bin = Math.floor((x/w)*(freqData.length-1));
        const v = freqData[bin]/255;
        const bright = clamp(v*(0.35+state.intensity*1.6) + f.bass*0.15, 0, 1);

        // blend fg->alt by v
        const cA = hexToRgb2(fg);
        const cB = hexToRgb2(alt);
        const r = Math.floor(lerp(cA[0],cB[0],bright));
        const g = Math.floor(lerp(cA[1],cB[1],bright));
        const b = Math.floor(lerp(cA[2],cB[2],bright));
        ctx2d.fillStyle = `rgba(${r},${g},${b},${0.18 + bright*0.65})`;
        ctx2d.fillRect(x,y,1,1);
      }
    }

    // subtle bg
    ctx2d.fillStyle = bg;
    ctx2d.globalAlpha = 0.08;
    ctx2d.fillRect(0,0,w,h);
    ctx2d.globalAlpha = 1;

    // overlay grid
    grid(w,h,alt,0.02, 64);
  }

  function hexToRgb2(h){
    const x=h.replace("#","");
    return [parseInt(x.slice(0,2),16), parseInt(x.slice(2,4),16), parseInt(x.slice(4,6),16)];
  }

  function visLissajous(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);
    grid(w,h,alt,0.03, 72);

    const cx=w/2, cy=h/2;
    const a=2 + variant;
    const b=3 + (variant===2?2:1);
    const intensity=0.25+state.intensity*1.65;

    ctx2d.strokeStyle = fg;
    ctx2d.lineWidth = variant===1?2:1.5;
    ctx2d.globalAlpha = 0.85;
    ctx2d.beginPath();
    const N=1200;
    for(let i=0;i<=N;i++){
      const tt=(i/N)*Math.PI*2;
      const x = cx + Math.sin(tt*a + t*0.6)*(w*0.22)*(0.65+f.mid*0.9)*intensity;
      const y = cy + Math.sin(tt*b + t*0.8)*(h*0.22)*(0.65+f.tre*0.9)*intensity;
      if(i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
    }
    ctx2d.stroke();
    ctx2d.globalAlpha=1;

    if(variant===2){
      ctx2d.strokeStyle = alt;
      ctx2d.globalAlpha = 0.25;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      for(let i=0;i<=N;i+=2){
        const tt=(i/N)*Math.PI*2;
        const x = cx + Math.sin(tt*(a+1) + t*0.4)*(w*0.18)*(0.65+f.mid)*intensity;
        const y = cy + Math.sin(tt*(b+2) + t*0.5)*(h*0.18)*(0.65+f.tre)*intensity;
        if(i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
      }
      ctx2d.stroke();
      ctx2d.globalAlpha=1;
    }
  }

  function visRadar(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);

    const cx=w/2, cy=h/2;
    const R=Math.min(w,h)*0.40;
    const intensity=0.25+state.intensity*1.55;

    // rings
    ctx2d.strokeStyle = alt;
    ctx2d.globalAlpha = 0.18;
    for(let i=1;i<=5;i++){
      ctx2d.beginPath();
      ctx2d.arc(cx,cy,R*(i/5),0,Math.PI*2);
      ctx2d.stroke();
    }
    ctx2d.globalAlpha=1;

    // sweep
    const sweep = (t*(0.55+f.mid*1.2))%(Math.PI*2);
    const spread = variant===2?0.55:0.35;
    for(let i=0;i<40;i++){
      const a = sweep - spread*(i/40);
      const alpha = (1 - i/40) * (0.35 + f.lvl*0.65);
      ctx2d.strokeStyle = fg;
      ctx2d.globalAlpha = alpha*0.25;
      ctx2d.beginPath();
      ctx2d.moveTo(cx,cy);
      ctx2d.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R);
      ctx2d.stroke();
    }
    ctx2d.globalAlpha=1;

    // blips from spectrum
    const blips = 10 + variant*6;
    for(let i=0;i<blips;i++){
      const idx = Math.floor((i/blips)*(freqData.length-1));
      const v = freqData[idx]/255;
      const rr = R*(0.25 + v*0.75);
      const aa = (i/blips)*Math.PI*2 + t*0.2;
      const x=cx+Math.cos(aa)*rr;
      const y=cy+Math.sin(aa)*rr;

      ctx2d.fillStyle = (i%3===0)?alt:fg;
      ctx2d.globalAlpha = 0.15 + v*0.85;
      ctx2d.beginPath();
      ctx2d.arc(x,y, (1+v*6)*intensity, 0, Math.PI*2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha=1;
  }

  // Vector field lines
  function visVectorField(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);

    const step = variant===0?28:variant===1?22:18;
    const intensity=0.25+state.intensity*1.55;

    ctx2d.strokeStyle = fg;
    ctx2d.lineWidth = 1;
    for(let y=0;y<=h;y+=step){
      for(let x=0;x<=w;x+=step){
        const nx = x/w - 0.5;
        const ny = y/h - 0.5;
        const ang = Math.sin(nx*3 + t*0.6) + Math.cos(ny*4 - t*0.5) + f.bass*2.0;
        const len = (6 + f.mid*14 + f.tre*10) * intensity;

        const x2 = x + Math.cos(ang)*len;
        const y2 = y + Math.sin(ang)*len;

        ctx2d.globalAlpha = 0.06 + f.lvl*0.25;
        ctx2d.beginPath();
        ctx2d.moveTo(x,y);
        ctx2d.lineTo(x2,y2);
        ctx2d.stroke();
      }
    }
    ctx2d.globalAlpha=1;

    // overlay soft grid
    grid(w,h,alt,0.02, 64);
  }

  // Glyph rain (TouchDesigner-ish)
  const rain = { cols:0, drops:[] };
  function visGlyphRain(w,h,f,t,variant){
    const {fg,bg,alt}=pal();

    const fontSize = variant===0?14:variant===1?12:10;
    const cols = Math.floor(w / (fontSize*1.1));
    if (rain.cols !== cols){
      rain.cols = cols;
      rain.drops = new Array(cols).fill(0).map(()=>randInt(0,Math.floor(h/fontSize)));
    }

    // fade background
    ctx2d.fillStyle = bg;
    ctx2d.globalAlpha = 0.12;
    ctx2d.fillRect(0,0,w,h);
    ctx2d.globalAlpha = 1;

    ctx2d.font = `${fontSize}px ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace`;
    const density = 0.25 + state.intensity*0.75;

    for(let i=0;i<cols;i++){
      const x = i*fontSize*1.1;
      const y = rain.drops[i]*fontSize;

      const idx = Math.floor((i/cols)*(freqData.length-1));
      const v = (freqData[idx]/255);

      ctx2d.fillStyle = (i%5===0)?alt:fg;
      ctx2d.globalAlpha = 0.12 + v*0.88;

      const ch = String.fromCharCode(0x30A0 + randInt(0,96)); // katakana-ish
      ctx2d.fillText(ch, x, y);

      if (y > h && Math.random() < (0.01 + f.bass*0.08)) rain.drops[i] = 0;
      rain.drops[i] += (0.35 + v*2.5 + f.lvl*1.2) * density;
    }

    ctx2d.globalAlpha=1;
    grid(w,h,alt,0.02, 72);
  }

  function visKaleido(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);

    const cx=w/2, cy=h/2;
    const slices = variant===0?6:variant===1?8:12;
    const intensity = 0.25+state.intensity*1.65;

    // draw one wedge pattern then rotate
    for(let s=0;s<slices;s++){
      ctx2d.save();
      ctx2d.translate(cx,cy);
      ctx2d.rotate((s/slices)*Math.PI*2 + t*0.05);
      ctx2d.scale(1, (s%2===0)?1:-1);

      ctx2d.beginPath();
      ctx2d.moveTo(0,0);
      ctx2d.arc(0,0,Math.min(w,h)*0.45, -Math.PI/slices, Math.PI/slices);
      ctx2d.closePath();
      ctx2d.clip();

      // pattern
      for(let i=0;i<220;i++){
        const a = i/220*Math.PI*2;
        const r = (0.05 + (freqData[Math.floor((i/220)*(freqData.length-1))]/255)*0.95);
        const x = Math.cos(a)*(Math.min(w,h)*0.42*r);
        const y = Math.sin(a)*(Math.min(w,h)*0.42*r);

        ctx2d.fillStyle = (i%7===0)?alt:fg;
        ctx2d.globalAlpha = 0.03 + r*0.25;
        const size = (2 + r*10 + f.bass*8)*intensity*(variant===2?0.9:0.7);
        ctx2d.fillRect(x,y,size,size);
      }
      ctx2d.restore();
    }
    ctx2d.globalAlpha=1;
  }

  function visMetaballs(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);

    const n = 6 + variant*3;
    const intensity = 0.25+state.intensity*1.65;

    for(let i=0;i<n;i++){
      const ang = t*0.25 + i*1.7;
      const rr = Math.min(w,h)*(0.12 + f.bass*0.10) * (0.8 + i/n);
      const x = w/2 + Math.cos(ang)*Math.min(w,h)*0.22*(0.6+f.mid*0.8);
      const y = h/2 + Math.sin(ang*1.2)*Math.min(w,h)*0.18*(0.6+f.tre*0.8);

      const g = ctx2d.createRadialGradient(x,y, rr*0.15, x,y, rr);
      g.addColorStop(0, fg);
      g.addColorStop(0.6, alt);
      g.addColorStop(1, "rgba(0,0,0,0)");

      ctx2d.globalAlpha = (0.12 + f.lvl*0.25) * intensity;
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(x,y, rr, 0, Math.PI*2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha=1;

    // subtle vignette
    const vg = ctx2d.createRadialGradient(w/2,h/2, Math.min(w,h)*0.1, w/2,h/2, Math.min(w,h)*0.65);
    vg.addColorStop(0,"rgba(0,0,0,0)");
    vg.addColorStop(1,"rgba(0,0,0,0.55)");
    ctx2d.fillStyle=vg;
    ctx2d.fillRect(0,0,w,h);
  }

  function visTriMesh(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);
    grid(w,h,alt,0.02, 80);

    const rows = variant===0?8:variant===1?10:12;
    const cols = variant===0?12:variant===1?14:18;
    const intensity = 0.25+state.intensity*1.55;

    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const u = x/(cols-1);
        const v = y/(rows-1);
        const idx = Math.floor(u*(freqData.length-1));
        const amp = (freqData[idx]/255) * (0.25+f.bass*0.75) * intensity;

        const px = u*w;
        const py = v*h + Math.sin(t*0.9 + u*6.0)*10*amp;

        // connect to neighbor
        if(x<cols-1){
          const px2 = ((x+1)/(cols-1))*w;
          const py2 = py + Math.cos(t*0.7 + v*5.0)*8*amp;
          ctx2d.strokeStyle = (x%4===0)?alt:fg;
          ctx2d.globalAlpha = 0.06 + amp*0.55;
          ctx2d.beginPath(); ctx2d.moveTo(px,py); ctx2d.lineTo(px2,py2); ctx2d.stroke();
        }
        if(y<rows-1){
          const px2 = px;
          const py2 = ((y+1)/(rows-1))*h;
          ctx2d.strokeStyle = fg;
          ctx2d.globalAlpha = 0.05 + amp*0.45;
          ctx2d.beginPath(); ctx2d.moveTo(px,py); ctx2d.lineTo(px2,py2); ctx2d.stroke();
        }
      }
    }
    ctx2d.globalAlpha=1;
  }

  function visSpiro(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);

    const cx=w/2, cy=h/2;
    const intensity=0.25+state.intensity*1.65;

    ctx2d.lineWidth = variant===1?2.5:2;
    ctx2d.strokeStyle = fg;
    ctx2d.globalAlpha = 0.82;

    ctx2d.beginPath();
    const N=1400;
    for(let i=0;i<=N;i++){
      const tt=(i/N)*Math.PI*2* (variant===2?3:2);
      const R=Math.min(w,h)*0.28*(0.7+f.mid*0.9)*intensity;
      const r=R*(0.35+f.bass*0.35);
      const d=R*(0.18+f.tre*0.22);
      const x = cx + (R-r)*Math.cos(tt) + d*Math.cos((R-r)/r*tt + t*0.4);
      const y = cy + (R-r)*Math.sin(tt) - d*Math.sin((R-r)/r*tt + t*0.5);
      if(i===0) ctx2d.moveTo(x,y); else ctx2d.lineTo(x,y);
    }
    ctx2d.stroke();
    ctx2d.globalAlpha=1;

    if(variant!==0){
      ctx2d.strokeStyle=alt;
      ctx2d.globalAlpha=0.16;
      ctx2d.lineWidth=1;
      ctx2d.stroke();
      ctx2d.globalAlpha=1;
    }
  }

  // Orbits
  const orbit = { pts:null };
  function visOrbits(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    // fade
    ctx2d.fillStyle = bg;
    ctx2d.globalAlpha = 0.14;
    ctx2d.fillRect(0,0,w,h);
    ctx2d.globalAlpha = 1;

    const count = variant===0?180:variant===1?320:480;
    if(!orbit.pts || orbit.pts.length!==count){
      orbit.pts = Array.from({length:count}, ()=>({
        a: Math.random()*Math.PI*2,
        r: Math.random(),
        s: 0.2+Math.random()*1.2
      }));
    }

    const cx=w/2, cy=h/2;
    const intensity=0.25+state.intensity*1.55;

    for(let i=0;i<count;i++){
      const p=orbit.pts[i];
      const rr = Math.min(w,h)*(0.10 + p.r*0.42) * (0.7+f.bass*0.6);
      const aa = p.a + t*(0.15+p.s*0.25)*(0.6+f.mid*0.8);
      const x = cx + Math.cos(aa)*rr;
      const y = cy + Math.sin(aa*1.1)*rr*0.75;

      const v = freqData[Math.floor((i/count)*(freqData.length-1))]/255;
      ctx2d.fillStyle = (i%9===0)?alt:fg;
      ctx2d.globalAlpha = 0.04 + v*0.35;
      const sz = (1.5 + v*6 + f.tre*5)*intensity*(variant===2?1.1:0.9);
      ctx2d.fillRect(x,y,sz,sz);
    }
    ctx2d.globalAlpha=1;
  }

  function visTiles(w,h,f,t,variant){
    const {fg,bg,alt}=pal();
    clear2D(w,h);

    const step = variant===0?24:variant===1?18:14;
    const intensity=0.25+state.intensity*1.55;

    for(let y=0;y<h;y+=step){
      for(let x=0;x<w;x+=step){
        const u = x/w;
        const idx = Math.floor(u*(freqData.length-1));
        const v = freqData[idx]/255;
        const bright = clamp((v*(0.25+intensity*0.95) + f.bass*0.25), 0, 1);

        ctx2d.fillStyle = ( (x/step + y/step) % 7 === 0 ) ? alt : fg;
        ctx2d.globalAlpha = 0.02 + bright*0.55;
        const pad = (1-bright)*(variant===2?2:1);
        ctx2d.fillRect(x+pad, y+pad, step-pad*2, step-pad*2);
      }
    }
    ctx2d.globalAlpha=1;
    grid(w,h,alt,0.02, 72);
  }

  // Render
  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now-last)/1000);
    last = now;
    state.time += dt;

    // fit canvases
    fitCanvas(canvas2d);
    fitCanvas(canvasGL);

    const w2 = canvas2d.width;
    const h2 = canvas2d.height;
    const wG = canvasGL.width;
    const hG = canvasGL.height;

    const f = getFeatures();
    if (!f.ok){
      // idle
      clear2D(w2,h2);
      ctx2d.fillStyle = "rgba(140,255,190,0.25)";
      ctx2d.textAlign="center";
      ctx2d.textBaseline="middle";
      ctx2d.font = `${Math.max(14, Math.floor(h2*0.04))}px ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace`;
      ctx2d.fillText("IMPORT AUDIO OR START MIC", w2/2, h2/2);
      lvlLabel.textContent = "—";
    } else {
      lvlLabel.textContent = `${Math.round(f.lvl*100)}%`;

      const { typeIndex, variant, type } = visMeta(state.visIndex);

      // apply intensity multiplier to feel stronger everywhere
      // (some visualizers already use it)
      const t = state.time;

      if (type.kind === "gl"){
        drawGL(type.shader, wG, hG, f, t);
      } else {
        type.draw(w2,h2,f,t,variant);
      }
    }

    requestAnimationFrame(loop);
  }

  // UI + modal
  function openPal(){
    palModal.classList.remove("hidden");
  }
  function closePal(){
    palModal.classList.add("hidden");
  }

  function renderPalGrid(){
    palGrid.innerHTML = "";
    CURATED.forEach((p,i)=>{
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = `linear-gradient(90deg, ${p[0]}, ${p[2]})`;
      sw.title = `CURATED ${i+1}`;
      sw.addEventListener("click", ()=>{
        applyPaletteFromIndex(i);
        closePal();
      });
      palGrid.appendChild(sw);
    });
  }

  function setHidden(hidden){
    state.hidden = hidden;
    topPanel.classList.toggle("hidden", hidden);
    hudControls.classList.toggle("hidden", hidden);
    settings.classList.add("hidden"); // sliders hidden when HIDE
    hideBtn.textContent = hidden ? "SHOW" : "HIDE";
  }

  // Sliders
  function syncSliders(){
    intensityVal.textContent = `${Math.round(state.intensity*100)}%`;
    gainVal.textContent = `${Math.round(state.gain*100)}%`;
    bassVal.textContent = `${Math.round(state.bass*100)}%`;
  }
  function readSliders(){
    state.intensity = parseInt(intensity.value,10)/100;
    state.gain = parseInt(gain.value,10)/100;
    state.bass = parseInt(bass.value,10)/100;
    syncSliders();
    updateGain();
  }

  // Events
  importBtn.addEventListener("click", ()=>{
    fileInput.click();
  });

  fileInput.addEventListener("change", async ()=>{
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    try{
      await startImport(f);
      setLabels();
    }catch(e){
      console.error(e);
      stateLabel.textContent = "ERROR";
      alert("Import failed on iPhone? Make sure the mp3 is in the Files app (Downloads/iCloud/On My iPhone), not Apple Music.");
    }
  });

  micBtn.addEventListener("click", async ()=>{
    try{
      await startMic();
      setLabels();
    }catch(e){
      console.error(e);
      stateLabel.textContent = "DENIED";
      alert("Mic permission denied or unavailable.");
    }
  });

  playBtn.addEventListener("click", async ()=>{
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();

    if (!analyser){
      alert("Tap IMPORT to load audio, or tap MIC.");
      return;
    }

    if (state.source === "mic"){
      // mute/unmute
      state.playing = !state.playing;
      updateGain();
      playBtn.textContent = state.playing ? "PAUSE" : "PLAY";
      stateLabel.textContent = state.playing ? "LIVE" : "MUTED";
      return;
    }

    // import mode: play/pause media element
    if (!mediaEl) return;
    if (mediaEl.paused){
      await mediaEl.play().catch(()=>{});
      state.playing = true;
      playBtn.textContent = "PAUSE";
      stateLabel.textContent = "PLAYING";
    } else {
      mediaEl.pause();
      state.playing = false;
      playBtn.textContent = "PLAY";
      stateLabel.textContent = "PAUSED";
    }
  });

  hideBtn.addEventListener("click", ()=>setHidden(!state.hidden));

  settingsBtn.addEventListener("click", ()=>{
    if (state.hidden) return;
    settings.classList.toggle("hidden");
  });

  colorBtn.addEventListener("click", ()=>{
    if (state.hidden) return;
    openPal();
  });

  randBtn.addEventListener("click", ()=>{
    if (state.hidden) return;
    applyPaletteFromIndex(randInt(0, CURATED.length-1));
  });

  genPalBtn.addEventListener("click", ()=>{
    state.paletteIndex = -1;
    state.palette = procPalette();
    state.paletteName = "PROC";
    palLabel.textContent = state.paletteName;
    closePal();
  });

  closePalBtn.addEventListener("click", closePal);
  palModal.querySelector(".modalBg").addEventListener("click", closePal);

  prevBtn.addEventListener("click", ()=>setVis(state.visIndex-1));
  nextBtn.addEventListener("click", ()=>setVis(state.visIndex+1));

  intensity.addEventListener("input", readSliders);
  gain.addEventListener("input", readSliders);
  bass.addEventListener("input", readSliders);

  window.addEventListener("resize", ()=>{ fitCanvas(canvas2d); fitCanvas(canvasGL); }, { passive:true });

  // Init defaults
  function init(){
    // defaults: import, spectrum ring (VIS 51), palette random curated per session
    state.palette = CURATED[state.paletteIndex];
    state.paletteName = `CURATED ${state.paletteIndex+1}`;
    palLabel.textContent = state.paletteName;

    setHidden(false);
    setVis(50); // VIS 51
    setLabels();

    // sliders mid
    readSliders();
    intensity.value="50"; gain.value="50"; bass.value="50";
    readSliders();

    stateLabel.textContent = "IDLE";
    setBtnSelected(importBtn,true);
    setBtnSelected(micBtn,false);

    renderPalGrid();
    requestAnimationFrame(loop);
  }

  init();
})();
