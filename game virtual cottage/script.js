(function(){
  const app = document.getElementById('app');
  const loginScreen = document.getElementById('login-screen');
  const menuScreen = document.getElementById('menu-screen');
  const roomScreen = document.getElementById('room-screen');
  const room = document.getElementById('room');

  function hideAll(){
    loginScreen.classList.remove('active');
    menuScreen.classList.remove('active');
    roomScreen.classList.remove('active');
  }
  function showLogin(){ hideAll(); loginScreen.classList.add('active'); }
  function showMenu(){ hideAll(); menuScreen.classList.add('active'); renderGreeting(); }
  function showRoom(){ hideAll(); roomScreen.classList.add('active'); renderProfile(); }

  document.getElementById('playBtn').onclick = showRoom;
  document.getElementById('homeBtn').onclick = showMenu;

  // ================= LOGIN / ACCOUNTS =================
  // Accounts live in this published page's shared "db" capability (an
  // "accounts" collection any signed-in viewer of this page can read/write),
  // and each viewer's current session is kept in their own private
  // data/users/<id>/ subtree via the "user" capability. This is a lightweight
  // profile gate for the app itself, not a secure authentication system —
  // don't reuse real passwords.
  let db = null, userCap = null, hasStorage = false;
  let currentUser = null; // username string, or null for guest
  let mode = 'login'; // 'login' | 'signup'

  function simpleHash(str){
    let h = 0;
    for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
    return h.toString(36);
  }

  // localStorage fallback: used when the page runs outside Claude (own browser/host)
  let useLocal = false;
  function lsGet(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  async function initCapabilities(){
    try{
      if(window.claude && typeof window.claude.use === 'function'){
        db = await window.claude.use('db');
        userCap = await window.claude.use('user');
      }
    }catch(e){ db = null; userCap = null; }
    if(!db){
      try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); useLocal = true; }catch(e){ useLocal = false; }
    }
    hasStorage = !!db || useLocal;
  }

  async function loadUsers(){
    if(!hasStorage) return {};
    if(useLocal) return lsGet('cottage-users', {});
    try{
      const snap = await db.collection('accounts').get();
      const users = {};
      snap.docs.forEach(d => { users[d.id] = d.data(); });
      return users;
    }catch(e){ return {}; }
  }
  async function saveUser(username, record){
    if(!hasStorage) return;
    if(useLocal){ const u = lsGet('cottage-users', {}); u[username] = record; lsSet('cottage-users', u); return; }
    try{ await db.collection('accounts').doc(username).set(record); }catch(e){}
  }
  async function saveSession(username){
    if(!hasStorage) return;
    if(useLocal){ lsSet('cottage-session', username || ''); return; }
    if(!userCap) return;
    try{
      const uid = await userCap.id();
      if(!uid) return;
      await db.doc('data/users/' + uid + '/session').set({ username: username || '' });
    }catch(e){}
  }
  async function loadSession(){
    if(!hasStorage) return '';
    if(useLocal) return lsGet('cottage-session', '');
    if(!userCap) return '';
    try{
      const uid = await userCap.id();
      if(!uid) return '';
      const snap = await db.doc('data/users/' + uid + '/session').get();
      return snap.exists && snap.data().username ? snap.data().username : '';
    }catch(e){ return ''; }
  }

  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginSubmit = document.getElementById('loginSubmit');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  function setMode(next){
    mode = next;
    tabLogin.classList.toggle('active', mode==='login');
    tabSignup.classList.toggle('active', mode==='signup');
    loginSubmit.textContent = mode==='login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี';
    loginError.textContent = '';
  }
  tabLogin.onclick = ()=> setMode('login');
  tabSignup.onclick = ()=> setMode('signup');

  loginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const uname = usernameInput.value.trim();
    const pass = passwordInput.value;
    loginError.textContent = '';

    if(uname.length < 2){ loginError.textContent = 'ชื่อผู้ใช้สั้นเกินไป'; return; }
    if(pass.length < 4){ loginError.textContent = 'รหัสผ่านอย่างน้อย 4 ตัวอักษร'; return; }
    if(!hasStorage){ loginError.textContent = 'ระบบล็อกอินไม่พร้อมใช้งานในหน้านี้ตอนนี้'; return; }

    const users = await loadUsers();

    if(mode === 'signup'){
      if(users[uname]){ loginError.textContent = 'มีชื่อผู้ใช้นี้แล้ว ลองชื่ออื่นดูนะ'; return; }
      await saveUser(uname, { hash: simpleHash(pass), createdAt: Date.now() });
      await saveSession(uname);
      currentUser = uname;
      loginForm.reset();
      showMenu();
    } else {
      const acc = users[uname];
      if(!acc || acc.hash !== simpleHash(pass)){ loginError.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'; return; }
      await saveSession(uname);
      currentUser = uname;
      loginForm.reset();
      showMenu();
    }
  });

  document.getElementById('guestBtn').onclick = async ()=>{
    currentUser = null;
    await saveSession('');
    showMenu();
  };

  function renderGreeting(){
    const el = document.getElementById('greeting');
    if(currentUser){
      el.innerHTML = `สวัสดี, <b style="color:var(--amber);">${escapeHtml(currentUser)}</b> · <button id="logoutFromMenu">ออกจากระบบ</button>`;
      document.getElementById('logoutFromMenu').onclick = doLogout;
    } else {
      el.innerHTML = `กำลังเล่นแบบ Guest`;
    }
  }
  function renderProfile(){
    document.getElementById('profileWho').textContent = currentUser ? currentUser : 'Guest';
  }
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function doLogout(){
    currentUser = null;
    await saveSession('');
    document.getElementById('profilePop').classList.remove('show');
    showLogin();
  }

  const avatarBtn = document.getElementById('avatarBtn');
  const profilePop = document.getElementById('profilePop');
  avatarBtn.addEventListener('click', ()=>{
    renderProfile();
    profilePop.classList.toggle('show');
  });
  document.getElementById('logoutBtn').onclick = doLogout;
  document.addEventListener('click', (e)=>{
    if(!profilePop.contains(e.target) && e.target!==avatarBtn){ profilePop.classList.remove('show'); }
  });

  // try to resume a previous session on load
  (async function initSession(){
    await initCapabilities();
    if(!hasStorage){ showLogin(); return; }
    const saved = await loadSession();
    if(saved){
      const users = await loadUsers();
      if(users[saved]){ currentUser = saved; showMenu(); return; }
    }
    showLogin();
  })();

  // ---- stars ----
  const starsWrap = document.getElementById('stars');
  for(let i=0;i<18;i++){
    const s = document.createElement('div');
    s.className='star';
    s.style.left = (Math.random()*90+5)+'%';
    s.style.top = (Math.random()*80+5)+'%';
    s.style.animationDelay = (Math.random()*3)+'s';
    starsWrap.appendChild(s);
  }

  // ---- rain drops (visual) ----
  const rainWrap = document.getElementById('rain');
  for(let i=0;i<14;i++){
    const d = document.createElement('div');
    d.className='raindrop';
    d.style.left = (Math.random()*95)+'%';
    d.style.animationDuration = (0.6+Math.random()*0.6)+'s';
    d.style.animationDelay = (Math.random()*1.5)+'s';
    rainWrap.appendChild(d);
  }

  // ---- floating dust motes ----
  const particles = document.getElementById('particles');
  for(let i=0;i<24;i++){
    const m = document.createElement('div');
    m.className='mote';
    m.style.left = (Math.random()*100)+'%';
    m.style.bottom = (Math.random()*30)+'%';
    m.style.animationDuration = (6+Math.random()*8)+'s';
    m.style.animationDelay = (Math.random()*8)+'s';
    particles.appendChild(m);
  }

  // ---- live clock ----
  function pad(n){return n.toString().padStart(2,'0');}
  function tick(){
    const now = new Date();
    document.getElementById('clock').textContent = pad(now.getHours())+':'+pad(now.getMinutes());
    const h = now.getHours();
    // day/night tint of the room based on real time
    if(h>=6 && h<17){
      room.style.filter = 'brightness(1.05) saturate(1)';
    } else if(h>=17 && h<20){
      room.style.filter = 'brightness(1) saturate(1.1) hue-rotate(-4deg)';
    } else {
      room.style.filter = 'brightness(0.9) saturate(1)';
    }
  }
  tick();
  setInterval(tick, 15000);

  // ================= AUDIO (synthesized, no files needed) =================
  let ctx = null;
  let musicState = null, ambState = null;
  let musicOn = true, playing = true, ambType = null;
  let musicVol = 0.6, ambVol = 0.6, trackIdx = 0;
  const MUSIC_GAIN = 0.12, AMB_GAIN = 0.1;
  const AMB_MULT = { rain: 1, wind: 1.3, bird: 1.8 };

  // Each track = chord progression (one bar per chord) + arpeggio pattern
  const TRACKS = [
    { title:'Rainy Night Lo-fi', sub:'ambient / cottage radio', bpm:60, skip:0.15, arp:[0,2,1,3,2,1,3,2],
      chords:[[220,261.63,329.63,392],[174.61,220,261.63,329.63],[196,246.94,293.66,392],[164.81,207.65,246.94,329.63]] },
    { title:'Warm Window Light', sub:'cozy afternoon', bpm:72, skip:0.25, arp:[0,1,2,3,2,1,2,3],
      chords:[[261.63,329.63,392,493.88],[220,261.63,329.63,392],[174.61,261.63,349.23,440],[196,293.66,392,493.88]] },
    { title:'Sunday Morning', sub:'slow coffee', bpm:82, skip:0.3, arp:[0,2,3,2,1,3,2,1],
      chords:[[146.83,220,293.66,369.99],[123.47,246.94,293.66,369.99],[196,293.66,392,493.88],[220,277.18,329.63,440]] },
    { title:'Midnight Cat', sub:'jazzy late night', bpm:54, skip:0.35, arp:[3,1,2,0,2,3,1,2],
      chords:[[146.83,220,261.63,349.23],[196,233.08,293.66,349.23],[233.08,293.66,349.23,440],[220,277.18,329.63,392]] }
  ];

  function getCtx(){
    if(!ctx){ ctx = new (window.AudioContext||window.webkitAudioContext)(); }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  let noiseBuf = null;
  function getNoise(c){
    if(!noiseBuf){
      const n = 2*c.sampleRate;
      noiseBuf = c.createBuffer(1, n, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<n;i++){ d[i] = (Math.random()*2-1)*0.6; }
    }
    return noiseBuf;
  }

  // ---------- music ----------
  function startMusic(){
    stopMusic();
    const c = getCtx();
    const tr = TRACKS[trackIdx];
    const master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    master.gain.setTargetAtTime(MUSIC_GAIN*musicVol, c.currentTime, 0.3);
    const st = { master, timer:null, step:0, next:c.currentTime+0.1, dead:false };

    function bar(){
      if(st.dead) return;
      const chord = tr.chords[st.step % tr.chords.length];
      const beat = 60/tr.bpm, dur = beat*4, t = st.next;
      // soft pad
      chord.forEach(f=>{
        const o = c.createOscillator(); o.type='sine'; o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5/chord.length, t+1);
        g.gain.setValueAtTime(0.5/chord.length, t+dur-0.3);
        g.gain.linearRampToValueAtTime(0, t+dur+0.8);
        o.connect(g).connect(master);
        o.start(t); o.stop(t+dur+1);
      });
      // gentle arpeggio plucks
      tr.arp.forEach((idx,i)=>{
        if(Math.random() < tr.skip) return;
        const pt = t + i*beat/2;
        const o = c.createOscillator(); o.type='triangle';
        o.frequency.value = chord[idx % chord.length] * 2;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, pt);
        g.gain.exponentialRampToValueAtTime(0.22, pt+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, pt+0.9);
        o.connect(g).connect(master);
        o.start(pt); o.stop(pt+1);
      });
      st.next += dur; st.step++;
      st.timer = setTimeout(bar, Math.max(0, (st.next - c.currentTime - 1.5))*1000);
    }
    bar();
    musicState = st;
  }
  function stopMusic(){
    if(!musicState) return;
    const st = musicState; musicState = null;
    st.dead = true; clearTimeout(st.timer);
    try{ st.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15); }catch(e){}
    setTimeout(()=>{ try{ st.master.disconnect(); }catch(e){} }, 900);
  }

  // ---------- ambience: rain / bird / wind ----------
  function startAmb(type){
    stopAmb();
    const c = getCtx();
    const mult = AMB_MULT[type] || 1;
    const master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    master.gain.setTargetAtTime(AMB_GAIN*ambVol*mult, c.currentTime, 0.4);
    const st = { master, type, mult, sources:[], timer:null, dead:false };

    if(type === 'rain'){
      const n = c.createBufferSource(); n.buffer = getNoise(c); n.loop = true;
      const bp = c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1200; bp.Q.value=0.6;
      n.connect(bp).connect(master); n.start();
      st.sources.push(n);
    } else if(type === 'wind'){
      const n = c.createBufferSource(); n.buffer = getNoise(c); n.loop = true;
      const lp = c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=450; lp.Q.value=1.2;
      const swell = c.createGain(); swell.gain.value = 1;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
      const lfoF = c.createGain(); lfoF.gain.value = 280;
      lfo.connect(lfoF).connect(lp.frequency);
      const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.07;
      const lfoG = c.createGain(); lfoG.gain.value = 0.5;
      lfo2.connect(lfoG).connect(swell.gain);
      n.connect(lp).connect(swell).connect(master);
      n.start(); lfo.start(); lfo2.start();
      st.sources.push(n, lfo, lfo2);
    } else if(type === 'bird'){
      const loop = ()=>{
        if(st.dead) return;
        const t0 = c.currentTime + 0.05;
        const notes = 2 + Math.floor(Math.random()*4);
        const base = 2200 + Math.random()*1800;
        for(let i=0;i<notes;i++){
          const t = t0 + i*0.12;
          const f = base*(1 + (i%2)*0.08);
          const o = c.createOscillator(); o.type='sine';
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f*(1.25+Math.random()*0.3), t+0.07);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.8, t+0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t+0.1);
          o.connect(g).connect(master);
          o.start(t); o.stop(t+0.12);
        }
        st.timer = setTimeout(loop, 1200 + Math.random()*3200);
      };
      loop();
    }
    ambState = st;
  }
  function stopAmb(){
    if(!ambState) return;
    const st = ambState; ambState = null;
    st.dead = true; clearTimeout(st.timer);
    try{ st.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15); }catch(e){}
    setTimeout(()=>{
      st.sources.forEach(s=>{ try{ s.stop(); }catch(e){} });
      try{ st.master.disconnect(); }catch(e){}
    }, 900);
  }

  // ---------- UI wiring ----------
  const musicToggle = document.getElementById('musicToggle');
  const playToggle = document.getElementById('playToggle');
  const playIcon = document.getElementById('playIcon');
  const ambBtns = document.querySelectorAll('[data-amb]');

  function renderTrack(){
    const tr = TRACKS[trackIdx];
    document.getElementById('trackTitle').textContent = tr.title;
    document.getElementById('trackSub').textContent = tr.sub;
  }
  function changeTrack(delta){
    trackIdx = (trackIdx + delta + TRACKS.length) % TRACKS.length;
    renderTrack();
    if(musicOn && playing && audioStarted) startMusic();
  }
  function refreshAmbUI(){
    ambBtns.forEach(b => b.classList.toggle('on', b.dataset.amb === ambType));
    room.classList.toggle('rain-on', ambType === 'rain');
    room.classList.toggle('bird-on', ambType === 'bird');
    room.classList.toggle('wind-on', ambType === 'wind');
    app.classList.toggle('amb-wind', ambType === 'wind');
  }

  musicToggle.addEventListener('click', ()=>{
    musicOn = !musicOn;
    musicToggle.classList.toggle('on', musicOn);
    if(musicOn && playing) startMusic(); else stopMusic();
  });
  playToggle.addEventListener('click', ()=>{
    playing = !playing;
    playIcon.innerHTML = playing
      ? '<path d="M8 5v14l11-7z"></path>'
      : '<path d="M6 5h4v14H6zM14 5h4v14h-4z"></path>';
    if(playing && musicOn) startMusic(); else stopMusic();
  });
  document.getElementById('prevBtn').addEventListener('click', ()=> changeTrack(-1));
  document.getElementById('nextBtn').addEventListener('click', ()=> changeTrack(1));
  ambBtns.forEach(b => b.addEventListener('click', ()=>{
    const t = b.dataset.amb;
    if(ambType === t){ ambType = null; stopAmb(); }
    else { ambType = t; startAmb(t); }
    refreshAmbUI();
  }));
  renderTrack();

  // start ambient music on first user interaction (browser audio policy)
  let audioStarted = false;
  function initAudioOnce(){
    if(audioStarted) return;
    audioStarted = true;
    getCtx();
    if(musicOn && playing && !musicState) startMusic();
  }
  document.getElementById('playBtn').addEventListener('click', initAudioOnce);
  document.addEventListener('click', initAudioOnce, {once:true});

  // ================= modal (settings / help) =================
  const backdrop = document.getElementById('modalBackdrop');
  const modalContent = document.getElementById('modalContent');
  function openModal(html){
    modalContent.innerHTML = html;
    backdrop.classList.add('show');
    const btn = modalContent.querySelector('.close-btn');
    if(btn) btn.onclick = ()=> backdrop.classList.remove('show');
  }
  backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) backdrop.classList.remove('show'); });

  function settingsHtml(){
    return `
      <h3>Settings</h3>
      <div class="row"><label>เสียงเพลง</label><input type="range" min="0" max="100" value="${Math.round(musicVol*100)}" id="volMusic"></div>
      <div class="row"><label>เสียงบรรยากาศ</label><input type="range" min="0" max="100" value="${Math.round(ambVol*100)}" id="volAmb"></div>
      <p style="opacity:.65; font-size:.8rem;">ปรับระดับเสียงตามที่คุณสบายใจ แล้วปิดหน้าต่างนี้เพื่อกลับไปพักผ่อนต่อ</p>
      <button class="close-btn">Close</button>
    `;
  }
  function openSettings(){
    openModal(settingsHtml());
    document.getElementById('volMusic').addEventListener('input', (e)=>{
      musicVol = e.target.value/100;
      if(musicState){ musicState.master.gain.setTargetAtTime(MUSIC_GAIN*musicVol, ctx.currentTime, 0.1); }
    });
    document.getElementById('volAmb').addEventListener('input', (e)=>{
      ambVol = e.target.value/100;
      if(ambState){ ambState.master.gain.setTargetAtTime(AMB_GAIN*ambVol*ambState.mult, ctx.currentTime, 0.1); }
    });
  }
  function helpHtml(){
    return `
      <h3>Help</h3>
      <p>🏠 <b>Home</b> — กลับไปหน้าเมนูหลัก</p>
      <p>🎵 ไอคอนโน้ตดนตรี — เปิด/ปิดเพลง ใช้ปุ่ม ⏮ ⏭ ในเพลเยอร์เพื่อเปลี่ยนเพลง (4 เพลง)</p>
      <p>🌧️ 🐦 🌬️ — เลือกเสียงบรรยากาศ ฝน / นก / ลม กดซ้ำเพื่อปิด</p>
      <p>🛋️ <b>Change</b> — เปลี่ยนธีมห้อง</p>
      <p>นั่งพักผ่อนในบ้านหลังน้อยนี้ได้เรื่อย ๆ ไม่มีเป้าหมาย ไม่มีเวลาจำกัด</p>
      <button class="close-btn">Close</button>
    `;
  }

  // ================= ROOM THEMES =================
  const THEMES = [
    { id:'night',   name:'ห้องกลางคืน',   desc:'โคมไฟอุ่นๆ ดาวพราว', colors:['#241a44','#3c2a46'] },
    { id:'morning', name:'เช้าวันใหม่',    desc:'แดดอ่อน ท้องฟ้าใส',   colors:['#7ec3ee','#c9a88c'] },
    { id:'sunset',  name:'พระอาทิตย์ตก',  desc:'ฟ้าสีส้มอมม่วง',       colors:['#ff9a5e','#5a3550'] },
    { id:'forest',  name:'ป่าสีเขียว',     desc:'เงียบสงบกลางป่า',      colors:['#1f4d3c','#2f4a3c'] }
  ];
  let currentTheme = 'night';
  function setTheme(id, save){
    if(!THEMES.some(t => t.id === id)) id = 'night';
    currentTheme = id;
    room.dataset.theme = id;
    if(save) lsSet('cottage-theme', id);
    document.querySelectorAll('.theme-card').forEach(el => el.classList.toggle('active', el.dataset.theme === id));
  }
  function openRooms(){
    openModal(`
      <h3>Change room</h3>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <button class="theme-card${t.id===currentTheme?' active':''}" data-theme="${t.id}">
            <div class="theme-swatch" style="background:linear-gradient(135deg,${t.colors[0]},${t.colors[1]});"></div>
            <div class="theme-name">${t.name}</div>
            <div class="theme-desc">${t.desc}</div>
          </button>`).join('')}
      </div>
      <button class="close-btn">Close</button>
    `);
    modalContent.querySelectorAll('.theme-card').forEach(el => {
      el.addEventListener('click', ()=> setTheme(el.dataset.theme, true));
    });
  }
  setTheme(lsGet('cottage-theme', 'night'), false);

  document.getElementById('settingBtn').onclick = openSettings;
  document.getElementById('menuSettingsBtn').onclick = openSettings;
  document.getElementById('helpBtn').onclick = ()=>openModal(helpHtml());
  document.getElementById('menuHelpBtn').onclick = ()=>openModal(helpHtml());
  document.getElementById('changeBtn').onclick = openRooms;
})();
