// app.js
(() => {
  "use strict";

  // ---- CSS load check banner
  const cssOk = getComputedStyle(document.documentElement).getPropertyValue("--css-ok").trim();
  const cssWarn = document.getElementById("cssWarn");
  if (cssOk !== "1") cssWarn.style.display = "block";

  // ---- DOM
  const $ = (s) => document.querySelector(s);

  const hudTop = $("#hudTop");
  const hudMini = $("#hudMini");
  const settingsDrawer = $("#settingsDrawer");

  const srcLabel = $("#srcLabel");
  const stateLabel = $("#stateLabel");
  const visLabel = $("#visLabel");
  const visName = $("#visName");

  const vizCanvas = $("#viz");
  const ctx = vizCanvas.getContext("2d", { alpha: true });

  const importBtn = $("#importBtn");
  const micBtn = $("#micBtn");
  const colorBtn = $("#colorBtn");
  const randPalBtn = $("#randPalBtn");
  const settingsBtn = $("#settingsBtn");

  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const playBtn = $("#playBtn");
  const hideBtn = $("#hideBtn");

  const palPill = $("#palPill");
  const lvlPill = $("#lvlPill");

  const fileInput = $("#fileInput");

  const paletteModal = $("#paletteModal");
  const paletteGrid = $("#paletteGrid");
  const closePaletteBtn = $("#closePaletteBtn");
  const genPaletteBtn = $("#genPaletteBtn");

  const intensity = $("#intensity");
  const gain = $("#gain");
  const bass = $("#bass");
  const intensityVal = $("#intensityVal");
  const gainVal = $("#gainVal");
  const bassVal = $("#bassVal");

  // ---- Helpers
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function flash(el){
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }

  // ---- Palettes (50 curated) + procedural
  const CURATED = [
    ["#00ff8a","#0a1b10","#b8ffe5"],
    ["#7CFF00","#081208","#B8FF8A"],
    ["#00ffcc","#041016","#bff7ff"],
    ["#00ffa8","#00130a","#e6fff3"],
    ["#00ff66","#06110b","#d8ffe9"],
    ["#00ff9a","#00100a","#eafff6"],
    ["#00ffdd","#041016","#d8fffb"],
    ["#42ffb8","#07140c","#f0fff9"],
    ["#00ff84","#08140b","#eafff2"],
    ["#00ffd5","#04141a","#e3fffb"],
    ["#b6ff00","#0b1406","#fbffe3"],
    ["#ffb000","#1a1204","#fff2cc"],
    ["#ff3b3b","#120607","#ffe3e3"],
    ["#ff0077","#15060e","#ffe3f0"],
    ["#ff2bd6","#120614","#ffe3fb"],
    ["#00a2ff","#05101a","#dbefff"],
    ["#6d7dff","#070a16","#e7e9ff"],
    ["#00fff0","#021012","#dbfffd"],
    ["#00ff2a","#071207","#e1ffe7"],
    ["#ffe600","#1a1603","#fff8cc"],
    ["#ff6a00","#1a0d03","#ffe7cc"],
    ["#ff0033","#17060b","#ffe0e7"],
    ["#00ffb3","#06130e","#e1fff6"],
    ["#00fffc","#041417","#e1fffe"],
    ["#00ff7b","#07110b","#e1ffef"],
    ["#a8ffea","#07120f","#f0fffb"],
    ["#a2ff00","#0b1206","#f4ffe3"],
    ["#00ffd1","#061012","#e6fffb"],
    ["#00ff55","#06100a","#e6ffef"],
    ["#00ff9f","#06120d","#e6fff5"],
    ["#00ffea","#031215","#d8fffe"],
    ["#ff2f2f","#110607","#ffdede"],
    ["#ff6ad5","#160812","#ffe3f6"],
    ["#00d1ff","#061019","#d6f7ff"],
    ["#00ffae","#06120e","#dffff4"],
    ["#67ff00","#081206","#ebffd6"],
    ["#ff00aa","#130611","#ffe3f6"],
    ["#ffd400","#191402","#fff4cc"],
    ["#00ffa0","#04110c","#d9fff2"],
    ["#00ffdc","#021114","#d7fffb"],
    ["#00ff8f","#05130c","#ddfff3"],
    ["#00ff40","#051108","#ddffea"],
    ["#00b6ff","#05101a","#d9f2ff"],
    ["#7d00ff","#0b0612","#f0e3ff"],
    ["#ff00ff","#120612","#ffe3ff"],
    ["#00ffcc","#051316","#d8fffb"],
    ["#33ff99","#05120d","#e3fff3"],
    ["#00ff66","#04110a","#d8ffea"],
    ["#00ffbb","#04110f","#d8fff7"],
    ["#00ffea","#031217","#dbfffe"]
  ];

  function hex(n){ return n.toString(16).padStart(2,"0"); }
  function randHexColor(){
    // keep it “neon-ish”: bias toward brighter channels
    const r = randInt(30, 255);
    const g = randInt(120, 255);
    const b = randInt(30, 255);
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  function generateProceduralPalette(){
    const a = randHexColor();
    const b = "#050a07";
    const c = randHexColor();
    return [a,b,c];
  }

  // ---- State
  const state = {
    hidden: false,

    // Source
    source: "import", // "import" | "mic"
    playing: false,

    // Sliders (0..1)
    intensity: 0.5,
    gain: 0.5,
    bass: 0.5,

    // Palette
    paletteIndex: -1, // curated index, -1 means procedural temp
    palette: CURATED[randInt(0, CURATED.length-1)],
    paletteName: "CURATED",

    // Visualizer
    visIndex: 50, // 0-based; default VIS 51 (Spectrum Ring)
    time: 0,
  };

  // ---- Audio engine
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

  function setStateLabel(txt){ stateLabel.textContent = txt; }
  function setSourceLabel(txt){ srcLabel.textContent = txt.toUpperCase(); }

  function stopCurrent(){
    state.playing = false;
    playBtn.textContent = "PLAY";
    setStateLabel("IDLE");

    try{
      if (mediaEl){
        mediaEl.pause();
        mediaEl.src = "";
        mediaEl.load();
      }
    }catch{}

    try{
      if (sourceNode) sourceNode.disconnect();
    }catch{}

    try{
      if (micStream){
        micStream.getTracks().forEach(t => t.stop());
      }
    }catch{}

    sourceNode = null;
    micStream = null;
  }

  function buildGraphFromNode(inputNode){
    const ctx = ensureAudio();
    if (ctx.state === "suspended") ctx.resume();

    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0.80;

    gainNode = ctx.createGain();
    gainNode.gain.value = sliderToGain(state.gain) * (state.source === "mic" ? 1 : 1);

    // Connect: input -> gain -> analyser -> destination
    inputNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);

    sourceNode = inputNode;
  }

  function sliderToGain(v01){
    // 0..1 -> ~0..2.2 (slightly boosted at top)
    return Math.pow(v01 * 1.5, 1.2);
  }

  async function startImportFlow(file){
    stopCurrent();
    state.source = "import";
    setSourceLabel("IMPORT");
    micBtn.classList.add("ghost");
    importBtn.classList.remove("ghost");
    setStateLabel("LOADING");

    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();

    mediaEl = new Audio();
    mediaEl.crossOrigin = "anonymous";
    mediaEl.preload = "auto";
    mediaEl.loop = true;

    const url = URL.createObjectURL(file);
    mediaEl.src = url;

    await mediaEl.play().catch(()=>{ /* iOS requires gesture; playBtn will handle */ });

    const node = ctx.createMediaElementSource(mediaEl);
    buildGraphFromNode(node);

    state.playing = !mediaEl.paused;
    playBtn.textContent = state.playing ? "PAUSE" : "PLAY";
    setStateLabel(state.playing ? "PLAYING" : "READY");

    // cleanup URL later
    mediaEl.onended = () => { try{ URL.revokeObjectURL(url); }catch{} };
  }

  async function startMicFlow(){
    stopCurrent();
    state.source = "mic";
    setSourceLabel("MIC");
    micBtn.classList.remove("ghost");
    importBtn.classList.add("ghost");
    setStateLabel("REQUEST");

    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const micNode = ctx.createMediaStreamSource(micStream);
    buildGraphFromNode(micNode);

    // Start “playing” as unmuted by default, but our PLAY button controls mute/unmute (per your pick)
    state.playing = true;
    playBtn.textContent = "PAUSE"; // PAUSE = mute in MIC mode
    setStateLabel("LIVE");
    applyMuteState(false);
  }

  function applyMuteState(muted){
    if (!gainNode) return;
    // In MIC mode, play/pause = mute/unmute
    if (state.source === "mic"){
      gainNode.gain.value = muted ? 0.0001 : sliderToGain(state.gain);
    } else {
      // In import mode, play/pause controls media element, gain still applies
      gainNode.gain.value = sliderToGain(state.gain);
    }
  }

  function updateGain(){
    if (!gainNode) return;
    gainNode.gain.value = sliderToGain(state.gain);
  }

  // ---- Analysis features
  function getAudio(){
    if (!analyser) return { ok:false, lvl:0, bass:0, mid:0, tre:0 };
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(waveData);

    // Overall level estimate (RMS-ish from waveform)
    let sum = 0;
    for (let i=0;i<waveData.length;i++){
      const v = (waveData[i] - 128) / 128;
      sum += v*v;
    }
    const rms = Math.sqrt(sum / waveData.length);

    // Bands (very rough)
    const n = freqData.length;
    const bassEnd = Math.floor(n * 0.10);
    const midEnd  = Math.floor(n * 0.35);

    let b=0,m=0,t=0;
    for (let i=0;i<bassEnd;i++) b += freqData[i];
    for (let i=bassEnd;i<midEnd;i++) m += freqData[i];
    for (let i=midEnd;i<n;i++) t += freqData[i];

    b /= Math.max(1,bassEnd);
    m /= Math.max(1,midEnd-bassEnd);
    t /= Math.max(1,n-midEnd);

    // Normalize 0..1
    const lvl = clamp(rms * 1.8, 0, 1);
    const bassN = clamp((b/255) * (0.75 + state.bass*1.25), 0, 1);
    const midN  = clamp(m/255, 0, 1);
    const treN  = clamp(t/255, 0, 1);

    return { ok:true, lvl, bass:bassN, mid:midN, tre:treN };
  }

  // ---- Canvas sizing
  function fitCanvas(){
    const rect = vizCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(rect.width * dpr));
    const h = Math.max(260, Math.floor(rect.height * dpr));
    if (vizCanvas.width !== w || vizCanvas.height !== h){
      vizCanvas.width = w;
      vizCanvas.height = h;
    }
  }

  // ---- Visualizers (51)
  // All visualizers use: draw(ctx,w,h,features,palette,params,t)
  function parsePalette(p){
    // [fg,bg,alt]
    return { fg:p[0], bg:p[1], alt:p[2] };
  }

  function clearBG(c, w, h, bg){
    c.clearRect(0,0,w,h);
    c.fillStyle = bg;
    c.fillRect(0,0,w,h);
  }

  function drawHUDGrid(c,w,h, color, alpha=0.06, step=48){
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = 1;
    for (let x=0;x<=w;x+=step){
      c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke();
    }
    for (let y=0;y<=h;y+=step){
      c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke();
    }
    c.restore();
  }

  // ---- Core draw routines
  function visSpectrumRing(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);
    drawHUDGrid(c,w,h, alt, 0.05, 56);

    const cx=w/2, cy=h/2;
    const base = Math.min(w,h)*0.22;
    const intensity = 0.35 + state.intensity*1.35;

    // ring “breath”
    const breath = base + f.bass * (Math.min(w,h)*0.08) * intensity;

    // spectrum spokes
    const bins = freqData.length;
    const spokes = 160;
    const step = Math.max(1, Math.floor(bins / spokes));
    for (let i=0;i<spokes;i++){
      const v = (freqData[i*step] / 255);
      const ang = (i/spokes) * Math.PI*2;

      const inner = breath;
      const outer = breath + v * (Math.min(w,h)*0.18) * intensity;

      const x0=cx+Math.cos(ang)*inner;
      const y0=cy+Math.sin(ang)*inner;
      const x1=cx+Math.cos(ang)*outer;
      const y1=cy+Math.sin(ang)*outer;

      c.strokeStyle = fg;
      c.globalAlpha = 0.10 + v*0.75;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0,y0); c.lineTo(x1,y1); c.stroke();
    }
    c.globalAlpha = 1;

    // inner ring
    c.strokeStyle = alt;
    c.globalAlpha = 0.18;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx,cy,breath*0.78,0,Math.PI*2);
    c.stroke();

    // playhead arc
    c.strokeStyle = fg;
    c.globalAlpha = 0.55;
    c.lineWidth = 3;
    const arc = 0.95;
    const a0 = (t*0.7) % (Math.PI*2);
    c.beginPath();
    c.arc(cx,cy,breath*0.92,a0,a0+arc);
    c.stroke();
    c.globalAlpha = 1;
  }

  function visBars(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);
    drawHUDGrid(c,w,h, alt, 0.04, 52);

    const n = 64;
    const margin = w*0.06;
    const usable = w - margin*2;
    const barW = usable / n;
    const baseY = h*0.88;
    const maxH = h*0.58;
    const intensity = 0.25 + state.intensity*1.55;

    for (let i=0;i<n;i++){
      const idx = Math.floor((i/n) * (freqData.length-1));
      const v = freqData[idx]/255;
      const hh = v*maxH*intensity;
      const x = margin + i*barW;

      c.fillStyle = fg;
      c.globalAlpha = 0.10 + v*0.85;
      c.fillRect(x, baseY-hh, Math.max(1,barW*0.72), hh);

      // “cap”
      c.fillStyle = alt;
      c.globalAlpha = 0.10 + v*0.50;
      c.fillRect(x, baseY-hh-2, Math.max(1,barW*0.72), 2);
    }
    c.globalAlpha = 1;

    // bass pulse line
    c.strokeStyle = fg;
    c.globalAlpha = 0.18 + f.bass*0.30;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(margin, baseY+10);
    c.lineTo(margin + usable*(0.25 + f.bass*0.75), baseY+10);
    c.stroke();
    c.globalAlpha = 1;
  }

  function visWaveform(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);
    drawHUDGrid(c,w,h, alt, 0.035, 56);

    const intensity = 0.35 + state.intensity*1.25;
    const midY = h*0.52;
    const amp = h*0.22*intensity;

    c.strokeStyle = fg;
    c.lineWidth = 2;
    c.globalAlpha = 0.85;
    c.beginPath();
    for (let i=0;i<waveData.length;i++){
      const x = (i/(waveData.length-1))*w;
      const v = (waveData[i]-128)/128;
      const y = midY + v*amp;
      if (i===0) c.moveTo(x,y);
      else c.lineTo(x,y);
    }
    c.stroke();

    // secondary ghost
    c.strokeStyle = alt;
    c.globalAlpha = 0.22;
    c.lineWidth = 1;
    c.beginPath();
    for (let i=0;i<waveData.length;i+=2){
      const x = (i/(waveData.length-1))*w;
      const v = (waveData[i]-128)/128;
      const y = midY + v*amp*0.65 + Math.sin(t*1.6 + i*0.02)*2;
      if (i===0) c.moveTo(x,y);
      else c.lineTo(x,y);
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  function visParticles(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);

    // persistent particle field
    const count = params.count;
    const intensity = 0.2 + state.intensity*1.6;
    const speed = (0.2 + f.lvl*2.0 + f.bass*2.0) * intensity;

    // init storage on params
    if (!params._parts){
      params._parts = Array.from({length:count}, ()=>({
        x: Math.random()*w,
        y: Math.random()*h,
        vx: (Math.random()*2-1)*0.35,
        vy: (Math.random()*2-1)*0.35,
        r: 1 + Math.random()*2.5,
        a: 0.35 + Math.random()*0.65
      }));
    }

    // fade layer
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(0,0,w,h);
    ctx.globalAlpha = 1;

    for (const pt of params._parts){
      pt.x += pt.vx*speed;
      pt.y += pt.vy*speed;

      // bass “wind”
      pt.x += Math.cos(t*0.8 + pt.y*0.01) * f.bass * 2.2 * intensity;
      pt.y += Math.sin(t*0.9 + pt.x*0.01) * f.bass * 1.6 * intensity;

      if (pt.x< -20) pt.x = w+20;
      if (pt.x> w+20) pt.x = -20;
      if (pt.y< -20) pt.y = h+20;
      if (pt.y> h+20) pt.y = -20;

      ctx.fillStyle = Math.random() < 0.12 ? alt : fg;
      ctx.globalAlpha = pt.a * (0.22 + f.lvl*0.78);
      ctx.beginPath();
      ctx.arc(pt.x,pt.y,pt.r*(0.8+f.tre*1.2),0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function visTunnelRings(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);

    const cx=w/2, cy=h/2;
    const intensity = 0.25 + state.intensity*1.55;

    // depth rings
    const rings = params.rings;
    for (let i=0;i<rings;i++){
      const z = (i/(rings-1)); // 0 near, 1 far
      const phase = (t*0.7 + z*3.2);
      const wob = (Math.sin(phase)*0.5 + Math.cos(phase*1.3)*0.35);
      const r = lerp(Math.min(w,h)*0.07, Math.min(w,h)*0.55, z) + wob*(10+f.bass*30)*intensity;
      const alpha = lerp(0.55, 0.03, z);

      c.strokeStyle = (i%3===0) ? alt : fg;
      c.globalAlpha = alpha * (0.30 + f.mid*0.70);
      c.lineWidth = lerp(3, 1, z);

      c.beginPath();
      c.ellipse(cx + Math.sin(phase)*12*(1-z), cy + Math.cos(phase*0.9)*10*(1-z), r, r*0.68, phase*0.25, 0, Math.PI*2);
      c.stroke();
    }
    c.globalAlpha = 1;

    // bass pulse “gate”
    c.fillStyle = fg;
    c.globalAlpha = 0.10 + f.bass*0.25;
    c.fillRect(0, h*0.86, w*(0.2 + f.bass*0.8), 2);
    c.globalAlpha = 1;
  }

  function visMorphSphere(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);
    drawHUDGrid(c,w,h, alt, 0.03, 64);

    const cx=w/2, cy=h/2;
    const base = Math.min(w,h)*0.19;
    const intensity = 0.25 + state.intensity*1.65;

    // fake lighting
    const grad = c.createRadialGradient(cx - base*0.3, cy - base*0.35, base*0.2, cx, cy, base*1.55);
    grad.addColorStop(0, "rgba(255,255,255,0.18)");
    grad.addColorStop(0.35, fg);
    grad.addColorStop(1, "rgba(0,0,0,0.85)");

    // Build a noisy “sphere edge” from spectrum
    const points = 220;
    c.beginPath();
    for (let i=0;i<=points;i++){
      const a = (i/points)*Math.PI*2;
      const idx = Math.floor((i/points) * (freqData.length-1));
      const v = freqData[idx]/255;
      const wob = (Math.sin(a*3 + t*1.1) + Math.cos(a*5 - t*0.9))*0.5;
      const r = base + (v*base*0.55 + wob*base*0.12 + f.bass*base*0.25) * intensity;

      const x = cx + Math.cos(a)*r;
      const y = cy + Math.sin(a)*r*0.92;
      if (i===0) c.moveTo(x,y);
      else c.lineTo(x,y);
    }
    c.closePath();

    // fill
    c.fillStyle = grad;
    c.globalAlpha = 0.90;
    c.fill();

    // rim highlight
    c.strokeStyle = alt;
    c.globalAlpha = 0.18 + f.tre*0.25;
    c.lineWidth = 2;
    c.stroke();

    // inner “core”
    c.beginPath();
    c.arc(cx,cy, base*0.25 + f.bass*base*0.16*intensity, 0, Math.PI*2);
    c.fillStyle = alt;
    c.globalAlpha = 0.08 + f.bass*0.14;
    c.fill();

    c.globalAlpha = 1;
  }

  function visPS2Stacks(c,w,h,f,p,params,t){
    const {fg,bg,alt} = parsePalette(p);
    clearBG(c,w,h,bg);

    const cx=w/2, cy=h*0.56;
    const bands = params.bands;
    const intensity = 0.20 + state.intensity*1.75;

    // fake depth: draw from back to front
    for (let i=bands-1;i>=0;i--){
      const z = i/(bands-1); // 0 front, 1 far
      const idx = Math.floor(lerp(3, freqData.length-1, z));
      const v = (freqData[idx]/255);

      const depth = lerp(1.0, 0.12, z);
      const x = cx + Math.sin(t*0.6 + z*4.2)* (w*0.10) * (1-z);
      const y = cy + Math.cos(t*0.5 + z*3.7)* (h*0.06) * (1-z);

      const bw = lerp(w*0.46, w*0.12, z);
      const bh = lerp(h*0.12, h*0.04, z) + v*(h*0.22)*intensity*depth;

      const px = x - bw/2;
      const py = y - bh/2 - z*h*0.16;

      // “chrome frame” shadow
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.globalAlpha = 0.20 * depth;
      c.fillRect(px+6, py+6, bw, bh);

      // main block
      c.fillStyle = (i%4===0) ? alt : fg;
      c.globalAlpha = (0.08 + v*0.70) * depth;
      c.fillRect(px, py, bw, bh);

      // edge lines
      c.strokeStyle = fg;
      c.globalAlpha = 0.10 * depth;
      c.lineWidth = 1;
      c.strokeRect(px, py, bw, bh);
    }
    c.globalAlpha = 1;

    // baseline grid
    drawHUDGrid(c,w,h, alt, 0.03, 70);
  }

  // ---- Variations generator (to reach 51)
  // We’ll create a list with: many parameterized variants of bars/wave/particles/tunnel/sphere/stacks plus the ring.
  function makeVisList(){
    const list = [];

    // 1) Bars family (16)
    for (let i=0;i<16;i++){
      list.push({
        name: `BARS ${String(i+1).padStart(2,"0")}`,
        draw: (c,w,h,f,p,t)=>visBars(c,w,h,f,p,{variant:i},t)
      });
    }

    // 2) Wave family (10)
    for (let i=0;i<10;i++){
      list.push({
        name: `WAVE ${String(i+1).padStart(2,"0")}`,
        draw: (c,w,h,f,p,t)=>visWaveform(c,w,h,f,p,{variant:i},t)
      });
    }

    // 3) Particles family (8)
    for (let i=0;i<8;i++){
      const count = 120 + i*60;
      list.push({
        name: `PARTICLES ${String(i+1).padStart(2,"0")}`,
        _params: { count },
        draw: (c,w,h,f,p,t, self)=>visParticles(c,w,h,f,p,self._params,t)
      });
    }

    // 4) Tunnel rings family (7)
    for (let i=0;i<7;i++){
      const rings = 10 + i*4;
      list.push({
        name: `TUNNEL ${String(i+1).padStart(2,"0")}`,
        draw: (c,w,h,f,p,t)=>visTunnelRings(c,w,h,f,p,{rings},t)
      });
    }

    // 5) Morph sphere family (6)
    for (let i=0;i<6;i++){
      list.push({
        name: `MORPH SPHERE ${String(i+1).padStart(2,"0")}`,
        draw: (c,w,h,f,p,t)=>visMorphSphere(c,w,h,f,p,{variant:i},t)
      });
    }

    // 6) PS2 stacks family (3) (hero + 2 variants)
    list.push({ name: "PS2 STACKS 01", draw:(c,w,h,f,p,t)=>visPS2Stacks(c,w,h,f,p,{bands:26},t) });
    list.push({ name: "PS2 STACKS 02", draw:(c,w,h,f,p,t)=>visPS2Stacks(c,w,h,f,p,{bands:34},t) });
    list.push({ name: "PS2 STACKS 03", draw:(c,w,h,f,p,t)=>visPS2Stacks(c,w,h,f,p,{bands:18},t) });

    // Total so far: 16+10+8+7+6+3 = 50

    // 7) Spectrum Ring (VIS 51)
    list.push({ name: "SPECTRUM RING", draw:(c,w,h,f,p,t)=>visSpectrumRing(c,w,h,f,p,{},t) });

    return list; // 51
  }

  const VIS = makeVisList();

  function setVis(index){
    state.visIndex = (index + VIS.length) % VIS.length;
    const human = state.visIndex + 1;
    const label = `VIS ${human} / ${VIS[state.visIndex].name}`;
    visName.textContent = label;
    visLabel.textContent = `#${human}`;
    flash(visName);
  }

  // ---- UI: palette modal
  function renderPaletteGrid(){
    paletteGrid.innerHTML = "";
    for (let i=0;i<CURATED.length;i++){
      const p = CURATED[i];
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.title = `CURATED ${i+1}`;
      sw.style.background = `linear-gradient(90deg, ${p[0]}, ${p[2]})`;
      sw.addEventListener("click", ()=>{
        state.paletteIndex = i;
        state.palette = p;
        state.paletteName = `CURATED ${i+1}`;
        palPill.textContent = `PAL: ${state.paletteName}`;
        flash(palPill);
        closePalette();
      });
      paletteGrid.appendChild(sw);
    }
  }

  function openPalette(){
    paletteModal.classList.remove("hidden");
    flash(colorBtn);
  }
  function closePalette(){
    paletteModal.classList.add("hidden");
  }

  // ---- Hide behavior
  function setHidden(hidden){
    state.hidden = hidden;
    hudTop.classList.toggle("hidden", hidden);
    hudMini.classList.toggle("hidden", hidden);
    settingsDrawer.classList.toggle("hidden", true); // sliders always hidden during HIDE
    hideBtn.textContent = hidden ? "SHOW" : "HIDE";
    flash(hideBtn);

    // When hidden, also hide the COLOR/RANDOM/SETTINGS controls (per your E1)
    // Always bar stays visible.
  }

  // ---- Sliders
  function syncSliderLabels(){
    intensityVal.textContent = `${Math.round(state.intensity*100)}%`;
    gainVal.textContent = `${Math.round(state.gain*100)}%`;
    bassVal.textContent = `${Math.round(state.bass*100)}%`;
  }

  function updateLevelPill(f){
    const pct = Math.round(f.lvl * 100);
    lvlPill.textContent = `LVL: ${pct}%`;
  }

  // ---- Render loop
  let last = performance.now();
  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.time += dt;

    fitCanvas();
    const w = vizCanvas.width;
    const h = vizCanvas.height;

    const f = getAudio();
    if (!f.ok){
      // idle screen
      ctx.fillStyle = "#050a07";
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "rgba(140,255,190,0.22)";
      ctx.font = `${Math.max(12, Math.floor(h*0.04))}px ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("IMPORT AUDIO OR START MIC", w/2, h/2);
    } else {
      updateLevelPill(f);
      const pal = state.palette;
      const v = VIS[state.visIndex];
      // Some visualizers store params on themselves (particles)
      v.draw(ctx, w, h, f, pal, state.time, v);
    }

    requestAnimationFrame(tick);
  }

  // ---- Events
  // Import
  importBtn.addEventListener("click", () => {
    flash(importBtn);
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try{
      setSourceLabel("IMPORT");
      await startImportFlow(file);
    }catch(err){
      console.error(err);
      setStateLabel("ERROR");
      alert("Import failed. Try another file.");
    }finally{
      fileInput.value = "";
    }
  });

  // Mic
  micBtn.addEventListener("click", async () => {
    flash(micBtn);
    try{
      await startMicFlow();
    }catch(err){
      console.error(err);
      setStateLabel("DENIED");
      alert("Mic permission denied or unavailable.");
    }
  });

  // Play / Pause
  playBtn.addEventListener("click", async () => {
    flash(playBtn);
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();

    // If no source yet, force user to import or mic
    if (!analyser){
      alert("Tap IMPORT to load audio, or tap MIC.");
      return;
    }

    if (state.source === "mic"){
      // per your pick: A = mute/unmute
      state.playing = !state.playing;
      if (state.playing){
        applyMuteState(false);
        playBtn.textContent = "PAUSE"; // PAUSE = mute
        setStateLabel("LIVE");
      } else {
        applyMuteState(true);
        playBtn.textContent = "PLAY"; // PLAY = unmute
        setStateLabel("MUTED");
      }
      return;
    }

    // import mode: actual play/pause audio
    if (mediaEl){
      if (mediaEl.paused){
        await mediaEl.play().catch(()=>{});
        state.playing = true;
        playBtn.textContent = "PAUSE";
        setStateLabel("PLAYING");
      } else {
        mediaEl.pause();
        state.playing = false;
        playBtn.textContent = "PLAY";
        setStateLabel("PAUSED");
      }
    }
  });

  // Hide / Show
  hideBtn.addEventListener("click", () => setHidden(!state.hidden));

  // Settings drawer toggles sliders (only when not hidden)
  settingsBtn.addEventListener("click", () => {
    flash(settingsBtn);
    if (state.hidden) return;
    settingsDrawer.classList.toggle("hidden");
  });

  // Palette picker
  colorBtn.addEventListener("click", () => {
    if (state.hidden) return;
    openPalette();
  });
  closePaletteBtn.addEventListener("click", closePalette);
  paletteModal.querySelector(".modalBackdrop").addEventListener("click", closePalette);

  genPaletteBtn.addEventListener("click", () => {
    flash(genPaletteBtn);
    state.paletteIndex = -1;
    state.palette = generateProceduralPalette();
    state.paletteName = "PROC";
    palPill.textContent = `PAL: ${state.paletteName}`;
    closePalette();
  });

  // Random palette only (your spec)
  randPalBtn.addEventListener("click", () => {
    if (state.hidden) return;
    flash(randPalBtn);
    const i = randInt(0, CURATED.length-1);
    state.paletteIndex = i;
    state.palette = CURATED[i];
    state.paletteName = `CURATED ${i+1}`;
    palPill.textContent = `PAL: ${state.paletteName}`;
  });

  // Visualizer switching
  prevBtn.addEventListener("click", () => { flash(prevBtn); setVis(state.visIndex - 1); });
  nextBtn.addEventListener("click", () => { flash(nextBtn); setVis(state.visIndex + 1); });

  // Sliders
  function setSliderFromUI(){
    state.intensity = parseInt(intensity.value,10)/100;
    state.gain = parseInt(gain.value,10)/100;
    state.bass = parseInt(bass.value,10)/100;
    syncSliderLabels();
    updateGain();
    applyMuteState(!state.playing && state.source==="mic");
  }
  intensity.addEventListener("input", ()=>{ flash(intensity); setSliderFromUI(); });
  gain.addEventListener("input", ()=>{ flash(gain); setSliderFromUI(); });
  bass.addEventListener("input", ()=>{ flash(bass); setSliderFromUI(); });

  // Resize
  window.addEventListener("resize", fitCanvas, { passive:true });

  // ---- Init (your defaults)
  function init(){
    // Default palette: D = random curated per session load
    const idx = randInt(0, CURATED.length-1);
    state.paletteIndex = idx;
    state.palette = CURATED[idx];
    state.paletteName = `CURATED ${idx+1}`;
    palPill.textContent = `PAL: ${state.paletteName}`;

    // Defaults
    setSourceLabel("IMPORT");
    setStateLabel("IDLE");

    // Default visualizer: Spectrum Ring (VIS 51)
    setVis(50);

    // Slider defaults mid
    setSliderFromUI();

    renderPaletteGrid();
    fitCanvas();
    requestAnimationFrame(tick);
  }

  init();
})();
