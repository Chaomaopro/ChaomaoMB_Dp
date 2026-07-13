const DEFAULT_DATA = {
  profile: { owner: 'Nghệ nhân', phone: '', version: '2.0.0', notificationsEnabled: false, notifiedTaskKeys: [] },
  birds: [],
  tasks: [],
  performances: [],
  healthLogs: [],
  nutritionLogs: [],
  trainingLogs: [],
  tournamentSessions: []
};

let data = structuredClone(DEFAULT_DATA);
let currentUser = null;
let currentProfile = null;
const VALID_VIEWS = ['dashboard','birds','schedule','tournament','more'];
const initialHashView = location.hash.replace('#','');
let currentView = VALID_VIEWS.includes(initialHashView) ? initialHashView : 'dashboard';
let deferredInstallPrompt = null;
let timerState = { seconds: 0, running: false, interval: null, heatMinutes: 5 };
let counters = { sanCau:0, che:0, bungCanh:0, raBong:0, loi:0 };
let syncState = { state: 'connecting', message: 'Đang kết nối…' };

const $ = s => document.querySelector(s);
const appContent = $('#app-content');
const pageTitle = $('#page-title');
const modalBackdrop = $('#modal-backdrop');
const modalBody = $('#modal-body');
const modalTitle = $('#modal-title');
const authScreen = $('#auth-screen');
const authCard = $('#auth-card');
const setupCard = $('#setup-card');
const appShell = $('#app-shell');
const loadingScreen = $('#loading-screen');
const authMessage = $('#auth-message');
const syncIndicator = $('#sync-indicator');

function saveData(){
  window.CMCSCloud?.save(data);
  updateSyncIndicator();
}
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); }
function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function dateToLocalISO(date=new Date()){ const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function todayISO(){ return dateToLocalISO(new Date()); }
function formatDate(value){ if(!value) return 'Chưa cập nhật'; const d=new Date(value+'T00:00:00'); return d.toLocaleDateString('vi-VN'); }
function showToast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._to); t._to=setTimeout(()=>t.classList.add('hidden'),2400); }
function openModal(title, html){ modalTitle.textContent=title; modalBody.innerHTML=html; modalBackdrop.classList.remove('hidden'); }
function closeModal(){ modalBackdrop.classList.add('hidden'); modalBody.innerHTML=''; }
function avg(values){ const valid=values.filter(v=>Number.isFinite(v)); return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 0; }
function birdName(id){ return data.birds.find(b=>b.id===id)?.name || 'Chim chưa xác định'; }
function getBirdScore(id){
  const rows=data.performances.filter(x=>x.birdId===id).sort((a,b)=>b.date.localeCompare(a.date));
  return rows[0]?.total || 0;
}
function statusBadge(stage='Dưỡng ổn định'){
  const danger=['Điều trị','Cách ly'].includes(stage), warning=['Thay lông','Lên lửa','Sau thi'].includes(stage);
  return `<span class="badge ${danger?'danger':warning?'warning':'success'}">${esc(stage)}</span>`;
}

function setLoading(show){
  loadingScreen.classList.toggle('hidden', !show);
}

function setAuthMessage(message='', type='info'){
  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
  authMessage.classList.toggle('hidden', !message);
}

function switchAuthMode(mode){
  document.querySelectorAll('.auth-tab').forEach(btn=>btn.classList.toggle('active', btn.dataset.authMode===mode));
  document.querySelectorAll('.auth-form').forEach(form=>form.classList.add('hidden'));
  $(`#${mode}-form`)?.classList.remove('hidden');
  setAuthMessage('');
}

function showAuthScreen(message=''){
  setLoading(false);
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  setupCard.classList.add('hidden');
  authCard.classList.remove('hidden');
  switchAuthMode('login');
  if(message) setAuthMessage(message, 'error');
}

function showSetupScreen(){
  setLoading(false);
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  setupCard.classList.remove('hidden');
  authCard.classList.add('hidden');
}

function showApp(payload){
  currentUser = payload.user;
  currentProfile = payload.profile;
  data = payload.data || structuredClone(DEFAULT_DATA);
  data.profile ||= structuredClone(DEFAULT_DATA.profile);
  data.profile.owner = currentProfile.full_name || data.profile.owner || 'Nghệ nhân';
  data.profile.version = '2.0.0';
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  setLoading(false);
  updateSyncIndicator();
  setView(currentView);
}

function handleCloudAuthEvent(event){
  if(event.type==='setup_required') return showSetupScreen();
  if(event.type==='signed_out') return showAuthScreen();
  if(event.type==='auth_error') return showAuthScreen(event.error?.message || 'Không thể đăng nhập.');
  if(event.type==='password_recovery'){
    setLoading(false);
    appShell.classList.add('hidden');
    authScreen.classList.remove('hidden');
    setupCard.classList.add('hidden');
    authCard.classList.remove('hidden');
    switchAuthMode('password');
    setAuthMessage('Hãy đặt mật khẩu mới cho tài khoản.', 'info');
    return;
  }
  if(event.type==='signed_in') return showApp(event);
}

function updateSyncIndicator(){
  if(!syncIndicator) return;
  const labels={
    connecting:'● Đang kết nối…',
    syncing:'● Đang đồng bộ…',
    synced:'● Đã đồng bộ',
    offline:'● Ngoại tuyến',
    error:'● Lỗi đồng bộ'
  };
  syncIndicator.textContent=labels[syncState.state] || '● Đồng bộ';
  syncIndicator.dataset.state=syncState.state;
  syncIndicator.title=syncState.message || '';
}

function handleSyncChange(next){
  syncState=next;
  updateSyncIndicator();
}

function accountHtml(){
  const expires=currentProfile?.plan_expires_at ? new Date(currentProfile.plan_expires_at).toLocaleDateString('vi-VN') : 'Không giới hạn';
  return `<div class="card account-card">
    <div class="list-item" style="border:0;padding:0">
      <div class="avatar">👤</div>
      <div class="grow"><h3>${esc(currentProfile?.full_name||'Nghệ nhân')}</h3><p>${esc(currentUser?.email||'')}</p></div>
      <span class="badge ${currentProfile?.plan==='free'?'':'success'}">${esc((currentProfile?.plan||'free').toUpperCase())}</span>
    </div>
    <div class="data-row"><span>Vai trò</span><strong>${currentProfile?.role==='admin'?'Quản trị viên':'Người dùng'}</strong></div>
    <div class="data-row"><span>Trạng thái</span><strong>${esc(currentProfile?.status||'active')}</strong></div>
    <div class="data-row"><span>Hạn gói</span><strong>${expires}</strong></div>
    <div class="data-row"><span>Đồng bộ</span><strong>${esc(syncState.message||'')}</strong></div>
  </div>
  <form id="profile-form" class="form-grid section">
    <div class="field"><label>Tên hiển thị</label><input name="fullName" required maxlength="120" value="${esc(currentProfile?.full_name||'')}"></div>
    <button class="fab-action" type="submit">Cập nhật tài khoản</button>
  </form>
  <div class="button-row section"><button class="secondary-btn" data-action="force-sync">Đồng bộ ngay</button><button class="danger-btn" data-action="logout">Đăng xuất</button></div>`;
}

async function openAdminUsers(){
  openModal('Quản trị người dùng', '<div class="empty">Đang tải danh sách tài khoản…</div>');
  try{
    const users=await window.CMCSCloud.listUsers();
    const active=users.filter(u=>u.status==='active').length;
    const pro=users.filter(u=>['pro','owner'].includes(u.plan)).length;
    modalBody.innerHTML=`<div class="grid-3-desktop">
      <div class="card kpi-card"><small>Tổng tài khoản</small><strong>${users.length}</strong></div>
      <div class="card kpi-card"><small>Đang hoạt động</small><strong>${active}</strong></div>
      <div class="card kpi-card"><small>Pro/Owner</small><strong>${pro}</strong></div>
    </div>
    <section class="section"><div class="list">${users.map(adminUserCard).join('') || '<div class="empty">Chưa có tài khoản.</div>'}</div></section>`;
  }catch(error){
    modalBody.innerHTML=`<div class="empty">${esc(error.message)}</div>`;
  }
}

function adminUserCard(user){
  const last=user.last_seen_at?new Date(user.last_seen_at).toLocaleString('vi-VN'):'Chưa đăng nhập';
  return `<div class="list-item">
    <div class="avatar">${user.role==='admin'?'★':'👤'}</div>
    <div class="grow"><h3>${esc(user.full_name||'Nghệ nhân')}</h3><p>${esc(user.email||'')} · ${esc(user.plan)} · ${esc(user.status)}<br>Hoạt động: ${esc(last)}</p></div>
    <button class="secondary-btn admin-edit-btn" data-admin-edit="${user.id}" data-admin-email="${esc(user.email||'')}" data-admin-status="${esc(user.status)}" data-admin-plan="${esc(user.plan)}" data-admin-expires="${user.plan_expires_at?String(user.plan_expires_at).slice(0,10):''}">Sửa</button>
  </div>`;
}

function adminEditForm(button){
  return `<form id="admin-user-form" class="form-grid">
    <input type="hidden" name="userId" value="${esc(button.dataset.adminEdit)}">
    <div class="card"><strong>${esc(button.dataset.adminEmail)}</strong></div>
    <div class="field"><label>Trạng thái</label><select name="status"><option value="active" ${button.dataset.adminStatus==='active'?'selected':''}>Hoạt động</option><option value="locked" ${button.dataset.adminStatus==='locked'?'selected':''}>Khóa</option><option value="inactive" ${button.dataset.adminStatus==='inactive'?'selected':''}>Ngừng hoạt động</option></select></div>
    <div class="field"><label>Gói sử dụng</label><select name="plan"><option value="free" ${button.dataset.adminPlan==='free'?'selected':''}>Free</option><option value="pro" ${button.dataset.adminPlan==='pro'?'selected':''}>Pro</option><option value="owner" ${button.dataset.adminPlan==='owner'?'selected':''}>Owner</option></select></div>
    <div class="field"><label>Ngày hết hạn (để trống = không giới hạn)</label><input type="date" name="plan_expires_at" value="${esc(button.dataset.adminExpires||'')}"></div>
    <button class="fab-action" type="submit">Lưu thay đổi</button>
  </form>`;
}

function setView(view){
  currentView=view; location.hash=view;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={dashboard:'Hôm nay',birds:'Giàn chim',schedule:'Lịch chăm',tournament:'Trợ lý thi đấu',more:'Quản lý'};
  pageTitle.textContent=titles[view]||'Chào Mào Pro';
  render();
}

function render(){
  if(currentView==='birds') return renderBirds();
  if(currentView==='schedule') return renderSchedule();
  if(currentView==='tournament') return renderTournament();
  if(currentView==='more') return renderMore();
  renderDashboard();
}

function renderDashboard(){
  const today=todayISO();
  const todayTasks=data.tasks.filter(t=>t.date===today);
  const completed=todayTasks.filter(t=>t.done).length;
  const alertBirds=data.birds.filter(b=>['Điều trị','Cách ly'].includes(b.stage)).length;
  const readyBirds=data.birds.filter(b=>getBirdScore(b.id)>=8).length;
  const recentBirds=[...data.birds].sort((a,b)=>getBirdScore(b.id)-getBirdScore(a.id)).slice(0,3);
  appContent.innerHTML=`
    <section class="hero">
      <h2>Giữ đúng nhịp chăm, chốt đúng điểm rơi</h2>
      <p>${new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}</p>
      <div class="hero-grid">
        <div class="hero-stat"><strong>${data.birds.length}</strong><small>Tổng chim</small></div>
        <div class="hero-stat"><strong>${readyBirds}</strong><small>Sẵn sàng</small></div>
        <div class="hero-stat"><strong>${alertBirds}</strong><small>Cảnh báo</small></div>
      </div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>Việc hôm nay</h2><button class="text-btn" data-action="add-task">＋ Thêm việc</button></div>
      <div class="card kpi-card"><small>Tiến độ chăm sóc</small><strong>${completed}/${todayTasks.length}</strong><div class="progress"><span style="width:${todayTasks.length?completed/todayTasks.length*100:0}%"></span></div></div>
      <div class="list" style="margin-top:10px">${todayTasks.length?todayTasks.sort((a,b)=>a.time.localeCompare(b.time)).map(taskHtml).join(''):`<div class="empty"><span class="emoji">☀️</span>Chưa có công việc hôm nay.</div>`}</div>
    </section>
    <section class="section">
      <div class="section-heading"><h2>Chim nổi bật</h2><button class="text-btn" data-view-link="birds">Xem giàn chim</button></div>
      <div class="list">${recentBirds.length?recentBirds.map(birdCardHtml).join(''):`<div class="empty"><span class="emoji">🪶</span>Thêm hồ sơ chim đầu tiên để bắt đầu.</div>`}</div>
    </section>
    <section class="section grid-2">
      <button class="card" data-action="add-performance" style="text-align:left;border:1px solid var(--line)"><span class="badge">📈 Phong độ</span><h3 style="margin:10px 0 4px">Chấm điểm tuần</h3><p style="color:var(--muted);font-size:13px">Lông, lửa, bộ, bền và tâm lý.</p></button>
      <button class="card" data-action="add-health" style="text-align:left;border:1px solid var(--line)"><span class="badge danger">🩺 Sức khỏe</span><h3 style="margin:10px 0 4px">Ghi bất thường</h3><p style="color:var(--muted);font-size:13px">Phân, hô hấp, chân và thể trạng.</p></button>
    </section>`;
}
function taskHtml(t){ return `<div class="list-item ${t.done?'task-done':''}"><button class="check-btn ${t.done?'done':''}" data-task-toggle="${t.id}">${t.done?'✓':''}</button><div class="grow"><h3>${esc(t.time)} · ${esc(t.title)}</h3><p>${esc(t.birdId?birdName(t.birdId):'Toàn giàn')} ${t.note?'· '+esc(t.note):''}</p></div><button class="icon-btn" data-task-delete="${t.id}" style="width:34px;height:34px">⋯</button></div>`; }
function birdCardHtml(b){ const score=getBirdScore(b.id); return `<div class="list-item" data-bird-open="${b.id}"><div class="avatar">${b.photo?`<img src="${b.photo}" alt="">`:'🪶'}</div><div class="grow"><h3>${esc(b.name)}</h3><p>${esc(b.origin||'Chưa rõ vùng')} · ${esc(b.ageGroup||'Chưa rõ tuổi')}</p><div style="margin-top:6px">${statusBadge(b.stage)}</div></div><div class="score">${score?score.toFixed(1):'–'}</div></div>`; }

function renderBirds(){
  appContent.innerHTML=`
    <section class="section" style="margin-top:0">
      <div class="section-heading"><h2>${data.birds.length} hồ sơ chim</h2><button class="text-btn" data-action="add-bird">＋ Thêm chim</button></div>
      <div class="filters"><button class="filter-chip active">Tất cả</button><button class="filter-chip">Đang lên lửa</button><button class="filter-chip">Sắp thi</button><button class="filter-chip">Điều trị</button></div>
    </section>
    <section class="section"><div class="list">${data.birds.length?data.birds.map(birdCardHtml).join(''):`<div class="empty"><span class="emoji">🪶</span>Chưa có hồ sơ chim.<br><button class="text-btn" data-action="add-bird">Tạo hồ sơ đầu tiên</button></div>`}</div></section>`;
}

function renderSchedule(){
  const days=[...Array(7)].map((_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); return dateToLocalISO(d); });
  appContent.innerHTML=`
    <section class="section" style="margin-top:0"><div class="section-heading"><h2>7 ngày tới</h2><button class="text-btn" data-action="add-task">＋ Thêm lịch</button></div></section>
    ${days.map(date=>{
      const tasks=data.tasks.filter(t=>t.date===date).sort((a,b)=>a.time.localeCompare(b.time));
      return `<section class="section"><div class="section-heading"><h2>${date===todayISO()?'Hôm nay · ':''}${formatDate(date)}</h2><span class="badge">${tasks.length} việc</span></div><div class="list">${tasks.length?tasks.map(taskHtml).join(''):`<div class="empty">Không có lịch chăm.</div>`}</div></section>`;
    }).join('')}`;
}

function renderTournament(){
  appContent.innerHTML=`
    <section class="card timer">
      <span class="badge">HIỆP ${timerState.heatMinutes} PHÚT</span>
      <div class="timer-value" id="timer-value">${formatTime(timerState.seconds)}</div>
      <div class="button-row"><button class="fab-action" data-timer="toggle">${timerState.running?'Tạm dừng':'Bắt đầu'}</button><button class="secondary-btn" data-timer="reset">Đặt lại</button></div>
      <div class="filters" style="justify-content:center;margin-top:12px"><button class="filter-chip ${timerState.heatMinutes===5?'active':''}" data-heat="5">5 phút</button><button class="filter-chip ${timerState.heatMinutes===7?'active':''}" data-heat="7">7 phút</button><button class="filter-chip ${timerState.heatMinutes===10?'active':''}" data-heat="10">10 phút</button></div>
    </section>
    <section class="section"><div class="section-heading"><h2>Bộ đếm nhịp chơi</h2><button class="text-btn" data-counter-reset>Đặt lại</button></div><div class="counter-board">
      ${counterButton('sanCau','Sàn cầu')}${counterButton('che','Sàn cầu chẻ')}${counterButton('bungCanh','Bung cánh')}${counterButton('raBong','Ra bọng')}
    </div></section>
    <section class="section"><button class="counter-btn" data-counter="loi" style="width:100%;min-height:78px;background:#fff6f6"><strong>${counters.loi}</strong><span>Ghi lỗi thi đấu</span></button></section>
    <section class="section"><div class="button-row"><button class="fab-action" data-action="save-session">Lưu phiên chấm</button><button class="secondary-btn" data-action="session-history">Lịch sử</button></div></section>`;
}
function counterButton(key,label){ return `<button class="counter-btn" data-counter="${key}"><strong>${counters[key]}</strong><span>${label}</span></button>`; }
function formatTime(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function updateTimerDisplay(){ const el=$('#timer-value'); if(el) el.textContent=formatTime(timerState.seconds); }
function startTimer(){
  if(timerState.running) return;
  timerState.running=true;
  timerState.interval=setInterval(()=>{ timerState.seconds++; updateTimerDisplay(); if(timerState.seconds===timerState.heatMinutes*60 && navigator.vibrate) navigator.vibrate([300,150,300]); },1000);
}
function stopTimer(){ timerState.running=false; clearInterval(timerState.interval); timerState.interval=null; }

function renderMore(){
  const latestHealth=[...data.healthLogs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  const isAdmin=currentProfile?.role==='admin';
  const syncBadge=syncState.state==='synced'?'success':syncState.state==='error'?'danger':syncState.state==='offline'?'warning':'';
  appContent.innerHTML=`
    <section class="card" style="margin-top:0">
      <div class="list-item" style="border:0;padding:0">
        <div class="avatar">👤</div>
        <div class="grow"><h3>${esc(currentProfile?.full_name||'Nghệ nhân')}</h3><p>${esc(currentUser?.email||'')}</p></div>
        <span class="badge ${currentProfile?.plan==='free'?'':'success'}">${esc((currentProfile?.plan||'free').toUpperCase())}</span>
      </div>
      <div class="data-row"><span>Trạng thái cloud</span><strong><span class="badge ${syncBadge}">${esc(syncState.message||'')}</span></strong></div>
      <div class="button-row"><button class="secondary-btn" data-action="account">Tài khoản</button><button class="secondary-btn" data-action="force-sync">Đồng bộ ngay</button></div>
    </section>
    ${isAdmin?`<section class="section"><button class="card admin-entry" data-action="admin-users"><span class="badge warning">★ Chủ hệ thống</span><h3>Quản trị người dùng</h3><p>Xem tài khoản, khóa/mở và cấp gói sử dụng.</p></button></section>`:''}
    <section class="grid-2 section">
      <button class="card" data-action="add-health" style="text-align:left"><span class="badge danger">🩺</span><h3 style="margin:10px 0 4px">Sổ tay y tế</h3><p style="font-size:13px;color:var(--muted)">${data.healthLogs.length} bản ghi</p></button>
      <button class="card" data-action="add-performance" style="text-align:left"><span class="badge success">📊</span><h3 style="margin:10px 0 4px">Phong độ</h3><p style="font-size:13px;color:var(--muted)">${data.performances.length} lần chấm</p></button>
      <button class="card" data-action="add-nutrition" style="text-align:left"><span class="badge">🍌</span><h3 style="margin:10px 0 4px">Dinh dưỡng</h3><p style="font-size:13px;color:var(--muted)">${data.nutritionLogs.length} nhật ký</p></button>
      <button class="card" data-action="add-training" style="text-align:left"><span class="badge warning">🏃</span><h3 style="margin:10px 0 4px">Tập luyện</h3><p style="font-size:13px;color:var(--muted)">${data.trainingLogs.length} buổi tập</p></button>
    </section>
    <section class="section"><div class="section-heading"><h2>Sức khỏe gần đây</h2></div><div class="list">${latestHealth.length?latestHealth.map(h=>`<div class="list-item"><div class="avatar">🩺</div><div class="grow"><h3>${esc(birdName(h.birdId))}</h3><p>${formatDate(h.date)} · ${esc(h.symptom)} · Cấp ${esc(h.level)}</p></div></div>`).join(''):`<div class="empty">Chưa có nhật ký sức khỏe.</div>`}</div></section>
    <section class="section"><div class="card"><h3>Dữ liệu và cài đặt</h3><div class="button-row"><button class="secondary-btn" data-action="export-data">Xuất sao lưu</button><button class="secondary-btn" data-action="import-data">Nhập dữ liệu</button></div><div style="height:10px"></div><button class="secondary-btn" data-action="enable-notifications">${data.profile.notificationsEnabled?'Đã bật nhắc việc':'Bật nhắc việc trên máy'}</button><div style="height:10px"></div><button class="danger-btn" data-action="reset-data">Xóa dữ liệu của tài khoản</button><p style="font-size:12px;color:var(--muted);margin:12px 0 0">Dữ liệu được lưu trên thiết bị và tự đồng bộ lên Supabase khi có mạng.</p></div></section>
    <section class="section"><div class="card"><div class="data-row"><span>Phiên bản</span><strong>${esc(data.profile.version)}</strong></div><div class="data-row"><span>Chế độ</span><strong>PWA Cloud đa người dùng</strong></div><div class="data-row"><span>Tác giả</span><strong>Minh Đức</strong></div></div></section>`;
}

function birdForm(){ return `<form id="bird-form" class="form-grid"><div class="field"><label>Tên chim *</label><input name="name" required placeholder="Ví dụ: Chiến Tướng"></div><div class="form-row"><div class="field"><label>Vùng miền</label><select name="origin"><option>Huế</option><option>Trung Mang</option><option>Bình Điền</option><option>Quảng Nam</option><option>Quảng Ngãi</option><option>Tây Nguyên</option><option>Không xác định</option></select></div><div class="field"><label>Lứa tuổi</label><select name="ageGroup"><option>Chim tơ</option><option>Tơ một mùa</option><option>Hai mùa</option><option>Ba mùa trở lên</option><option>Chim già rừng</option></select></div></div><div class="field"><label>Giai đoạn hiện tại</label><select name="stage"><option>Dưỡng ổn định</option><option>Thay lông</option><option>Khô lông</option><option>Lên lửa</option><option>Đạt điểm rơi</option><option>Sau thi</option><option>Điều trị</option><option>Cách ly</option></select></div><div class="field"><label>Lối chơi nổi bật</label><input name="style" placeholder="Sàn cầu nhanh, bung cánh, ra bọng đều..."></div><div class="field"><label>Thành tích</label><textarea name="achievements" placeholder="Top 10, cờ, cúp..."></textarea></div><button class="fab-action" type="submit">Lưu hồ sơ chim</button></form>`; }
function taskForm(){ return `<form id="task-form" class="form-grid"><div class="field"><label>Công việc *</label><input name="title" required placeholder="Phơi nắng, tắm nước, tập lực..."></div><div class="form-row"><div class="field"><label>Ngày</label><input type="date" name="date" value="${todayISO()}" required></div><div class="field"><label>Giờ</label><input type="time" name="time" value="07:00" required></div></div><div class="field"><label>Áp dụng cho chim</label><select name="birdId"><option value="">Toàn giàn</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ghi chú</label><textarea name="note"></textarea></div><button class="fab-action" type="submit">Tạo lịch chăm</button></form>`; }
function performanceForm(){ return `<form id="performance-form" class="form-grid"><div class="field"><label>Chọn chim *</label><select name="birdId" required><option value="">-- Chọn chim --</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ngày đánh giá</label><input type="date" name="date" value="${todayISO()}"></div>${['Lông','Lửa','Thái độ đấu','Giọng','Bộ chơi','Thể lực','Độ bền','Tâm lý','Tiêu hóa','Phục hồi'].map((x,i)=>`<div class="field"><label>${x}: <strong id="score-${i}">7</strong>/10</label><input type="range" min="1" max="10" value="7" name="s${i}" data-score-label="score-${i}"></div>`).join('')}<div class="field"><label>Nhận xét</label><textarea name="note"></textarea></div><button class="fab-action" type="submit">Lưu điểm phong độ</button></form>`; }
function healthForm(){ return `<form id="health-form" class="form-grid"><div class="field"><label>Chọn chim *</label><select name="birdId" required><option value="">-- Chọn chim --</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ngày ghi nhận</label><input type="date" name="date" value="${todayISO()}"></div><div class="field"><label>Triệu chứng chính *</label><select name="symptom" required><option>Phân nát/phân nước</option><option>Ho/khè</option><option>Xù lông</option><option>Đau chân</option><option>Rận mạt</option><option>Cắn đuôi/cắn cánh</option><option>Bỏ ăn</option><option>Khác</option></select></div><div class="field"><label>Mức cảnh báo</label><select name="level"><option>Xanh - theo dõi</option><option>Vàng - cần điều chỉnh</option><option>Cam - cách ly/đánh giá</option><option>Đỏ - cần hỗ trợ thú y</option></select></div><div class="field"><label>Ghi chú xử lý</label><textarea name="note" placeholder="Mô tả phân, mức ăn, hô hấp, thay đổi khẩu phần..."></textarea></div><button class="fab-action" type="submit">Lưu nhật ký sức khỏe</button></form>`; }
function simpleLogForm(type){
  const nutrition=type==='nutrition';
  return `<form id="${type}-form" class="form-grid"><div class="field"><label>Chọn chim *</label><select name="birdId" required><option value="">-- Chọn chim --</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ngày</label><input type="date" name="date" value="${todayISO()}"></div><div class="field"><label>${nutrition?'Nội dung khẩu phần':'Hình thức tập luyện'}</label>${nutrition?'<textarea name="detail" required placeholder="Cám chính, mồi tươi, trái cây, vitamin..."></textarea>':'<select name="detail"><option>Tắm nắng</option><option>Tắm nước</option><option>Lồng lực</option><option>Dợt nhẹ</option><option>Dợt vừa sức</option><option>Dợt căng</option><option>Mô phỏng thi đấu</option></select>'}</div><div class="field"><label>${nutrition?'Phản ứng của chim':'Thời lượng và kết quả'}</label><textarea name="note"></textarea></div><button class="fab-action" type="submit">Lưu nhật ký</button></form>`;
}

function openBirdDetail(id){
  const b=data.birds.find(x=>x.id===id); if(!b) return;
  const perf=data.performances.filter(x=>x.birdId===id).sort((a,b)=>a.date.localeCompare(b.date));
  const latest=perf.at(-1);
  openModal(b.name,`<div class="card"><div class="list-item" style="border:0;padding:0"><div class="avatar">🪶</div><div class="grow"><h3>${esc(b.name)}</h3><p>${esc(b.origin)} · ${esc(b.ageGroup)}</p>${statusBadge(b.stage)}</div><strong class="score">${latest?latest.total.toFixed(1):'–'}</strong></div></div><section class="section"><div class="card"><div class="data-row"><span>Lối chơi</span><strong>${esc(b.style||'Chưa cập nhật')}</strong></div><div class="data-row"><span>Thành tích</span><strong>${esc(b.achievements||'Chưa có')}</strong></div></div></section><section class="section"><div class="section-heading"><h2>Biểu đồ phong độ</h2></div><div class="card chart-wrap"><canvas id="performance-chart"></canvas></div></section><section class="section"><div class="button-row"><button class="secondary-btn" data-add-performance-bird="${b.id}">Chấm phong độ</button><button class="danger-btn" data-delete-bird="${b.id}">Xóa hồ sơ</button></div></section>`);
  requestAnimationFrame(()=>drawPerformanceChart(perf));
}
function drawPerformanceChart(rows){
  const canvas=$('#performance-chart'); if(!canvas) return;
  const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1; canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const w=rect.width,h=rect.height,p=28; ctx.clearRect(0,0,w,h); ctx.strokeStyle='#eadfd7'; ctx.lineWidth=1;
  for(let i=0;i<=5;i++){ const y=p+(h-2*p)*i/5; ctx.beginPath(); ctx.moveTo(p,y); ctx.lineTo(w-p,y); ctx.stroke(); }
  if(!rows.length){ ctx.fillStyle='#76675f'; ctx.textAlign='center'; ctx.fillText('Chưa có dữ liệu phong độ',w/2,h/2); return; }
  const points=rows.slice(-8).map((r,i)=>({x:p+(w-2*p)*(rows.slice(-8).length===1?0.5:i/(Math.max(1,rows.slice(-8).length-1))),y:h-p-(r.total/10)*(h-2*p)}));
  ctx.strokeStyle='#7f1d1d'; ctx.lineWidth=3; ctx.beginPath(); points.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y)); ctx.stroke();
  ctx.fillStyle='#d4a017'; points.forEach(pt=>{ctx.beginPath();ctx.arc(pt.x,pt.y,4,0,Math.PI*2);ctx.fill();});
}

function handleAction(action){
  if(action==='add-bird') openModal('Thêm hồ sơ chim',birdForm());
  if(action==='add-task') openModal('Thêm lịch chăm',taskForm());
  if(action==='add-performance') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Chấm phong độ tuần',performanceForm()); }
  if(action==='add-health') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Nhật ký sức khỏe',healthForm()); }
  if(action==='add-nutrition') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Nhật ký dinh dưỡng',simpleLogForm('nutrition')); }
  if(action==='add-training') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Nhật ký tập luyện',simpleLogForm('training')); }
  if(action==='save-session') saveTournamentSession();
  if(action==='session-history') showSessionHistory();
  if(action==='export-data') exportData();
  if(action==='import-data') importData();
  if(action==='reset-data') resetData();
  if(action==='enable-notifications') enableNotifications();
  if(action==='account') openModal('Tài khoản cloud',accountHtml());
  if(action==='admin-users') openAdminUsers();
  if(action==='logout') window.CMCSCloud.signOut().catch(error=>showToast(error.message));
  if(action==='force-sync'){
    window.CMCSCloud.forceSync(data)
      .then(()=>{showToast('Đã đồng bộ dữ liệu lên Supabase.'); render();})
      .catch(error=>showToast(error.message));
  }
}

function saveTournamentSession(){
  if(Object.values(counters).every(v=>v===0) && timerState.seconds===0) return showToast('Chưa có dữ liệu phiên chấm.');
  data.tournamentSessions.push({id:uid(),date:new Date().toISOString(),duration:timerState.seconds,counters:{...counters}}); saveData(); showToast('Đã lưu phiên chấm thi đấu.');
}
function showSessionHistory(){
  const rows=[...data.tournamentSessions].reverse(); openModal('Lịch sử phiên chấm',rows.length?`<div class="list">${rows.map(s=>`<div class="card"><h3>${new Date(s.date).toLocaleString('vi-VN')}</h3><p>Thời gian: ${formatTime(s.duration)}</p><div class="data-row"><span>Sàn cầu</span><strong>${s.counters.sanCau}</strong></div><div class="data-row"><span>Chẻ</span><strong>${s.counters.che}</strong></div><div class="data-row"><span>Bung cánh</span><strong>${s.counters.bungCanh}</strong></div><div class="data-row"><span>Ra bọng</span><strong>${s.counters.raBong}</strong></div><div class="data-row"><span>Lỗi</span><strong>${s.counters.loi}</strong></div></div>`).join('')}</div>`:`<div class="empty">Chưa có phiên chấm đã lưu.</div>`);
}
function exportData(){ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`CMCS-Pro-sao-luu-${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href); showToast('Đã tạo file sao lưu.'); }
function importData(){ const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json'; input.onchange=()=>{ const f=input.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{try{data={...structuredClone(DEFAULT_DATA),...JSON.parse(r.result)};saveData();render();showToast('Đã nhập dữ liệu thành công.')}catch{showToast('File sao lưu không hợp lệ.')}};r.readAsText(f)}; input.click(); }
function resetData(){ if(confirm('Xóa toàn bộ dữ liệu của tài khoản này trên thiết bị và cloud?')){data=structuredClone(DEFAULT_DATA);data.profile.owner=currentProfile?.full_name||'Nghệ nhân';saveData();render();showToast('Đã xóa dữ liệu tài khoản.');} }

async function enableNotifications(){
  if(!('Notification' in window)) return showToast('Trình duyệt này chưa hỗ trợ thông báo.');
  const permission = await Notification.requestPermission();
  data.profile.notificationsEnabled = permission === 'granted';
  saveData(); render();
  if(permission === 'granted'){
    new Notification('Chào Mào Chiến Suốt Pro', { body: 'Đã bật nhắc việc. Ứng dụng sẽ báo các việc đến giờ khi đang hoạt động.', icon: 'assets/icons/icon-192.png' });
    showToast('Đã bật nhắc việc trên thiết bị.');
  } else showToast('Chưa được cấp quyền thông báo.');
}
function checkDueTasks(){
  if(!data.profile.notificationsEnabled || Notification.permission !== 'granted') return;
  const now=new Date();
  const date=dateToLocalISO(now);
  const hhmm=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  data.profile.notifiedTaskKeys ||= [];
  const due=data.tasks.filter(t=>t.date===date && t.time===hhmm && !t.done);
  due.forEach(t=>{
    const key=`${t.id}-${date}-${hhmm}`;
    if(data.profile.notifiedTaskKeys.includes(key)) return;
    new Notification(t.title, { body: `${t.birdId?birdName(t.birdId):'Toàn giàn'}${t.note?' · '+t.note:''}`, icon:'assets/icons/icon-192.png', tag:key });
    data.profile.notifiedTaskKeys.push(key);
  });
  data.profile.notifiedTaskKeys=data.profile.notifiedTaskKeys.slice(-100);
  saveData();
}


appContent.addEventListener('click',e=>{
  const a=e.target.closest('[data-action]'); if(a) handleAction(a.dataset.action);
  const v=e.target.closest('[data-view-link]'); if(v) setView(v.dataset.viewLink);
  const taskToggle=e.target.closest('[data-task-toggle]'); if(taskToggle){ const t=data.tasks.find(x=>x.id===taskToggle.dataset.taskToggle); if(t){t.done=!t.done;saveData();render();} }
  const taskDelete=e.target.closest('[data-task-delete]'); if(taskDelete){ if(confirm('Xóa công việc này?')){data.tasks=data.tasks.filter(x=>x.id!==taskDelete.dataset.taskDelete);saveData();render();} }
  const bird=e.target.closest('[data-bird-open]'); if(bird) openBirdDetail(bird.dataset.birdOpen);
  const counter=e.target.closest('[data-counter]'); if(counter){ counters[counter.dataset.counter]++; if(navigator.vibrate) navigator.vibrate(25); renderTournament(); }
  if(e.target.closest('[data-counter-reset]')){ counters={sanCau:0,che:0,bungCanh:0,raBong:0,loi:0};renderTournament(); }
  const heat=e.target.closest('[data-heat]'); if(heat){ timerState.heatMinutes=Number(heat.dataset.heat);renderTournament(); }
  const timer=e.target.closest('[data-timer]'); if(timer){ if(timer.dataset.timer==='toggle'){timerState.running?stopTimer():startTimer();renderTournament();} else {stopTimer();timerState.seconds=0;renderTournament();} }
});

modalBody.addEventListener('input',e=>{ if(e.target.matches('[data-score-label]')) $('#'+e.target.dataset.scoreLabel).textContent=e.target.value; });
modalBody.addEventListener('click',e=>{
  const del=e.target.closest('[data-delete-bird]'); if(del&&confirm('Xóa hồ sơ chim và dữ liệu liên quan?')){ const id=del.dataset.deleteBird; data.birds=data.birds.filter(x=>x.id!==id); data.performances=data.performances.filter(x=>x.birdId!==id);data.healthLogs=data.healthLogs.filter(x=>x.birdId!==id);saveData();closeModal();render(); }
  const perf=e.target.closest('[data-add-performance-bird]'); if(perf){ openModal('Chấm phong độ tuần',performanceForm().replace(`value="${perf.dataset.addPerformanceBird}"`,`value="${perf.dataset.addPerformanceBird}" selected`)); }
  const adminEdit=e.target.closest('[data-admin-edit]'); if(adminEdit){ openModal('Cập nhật tài khoản',adminEditForm(adminEdit)); }
});
modalBody.addEventListener('submit',async e=>{
  e.preventDefault(); const fd=Object.fromEntries(new FormData(e.target).entries());
  if(e.target.id==='profile-form'){
    try{
      currentProfile=await window.CMCSCloud.updateMyProfile(fd.fullName);
      data.profile.owner=currentProfile.full_name;
      saveData(); closeModal(); render(); showToast('Đã cập nhật tên hiển thị.');
    }catch(error){ showToast(error.message); }
    return;
  }
  if(e.target.id==='admin-user-form'){
    if(fd.userId===currentUser?.id && fd.status!=='active') return showToast('Không thể tự khóa tài khoản quản trị đang dùng.');
    try{
      await window.CMCSCloud.updateUser(fd.userId,{status:fd.status,plan:fd.plan,plan_expires_at:fd.plan_expires_at});
      showToast('Đã cập nhật tài khoản.');
      await openAdminUsers();
    }catch(error){ showToast(error.message); }
    return;
  }
  if(e.target.id==='bird-form'){ data.birds.push({id:uid(),...fd,createdAt:new Date().toISOString()}); saveData(); closeModal(); setView('birds'); showToast('Đã thêm hồ sơ chim.'); }
  if(e.target.id==='task-form'){ data.tasks.push({id:uid(),...fd,done:false}); saveData(); closeModal(); render(); showToast('Đã tạo lịch chăm.'); }
  if(e.target.id==='performance-form'){
    const scores=[...Array(10)].map((_,i)=>Number(fd['s'+i])); const weights=[.05,.15,.15,.10,.10,.15,.15,.10,.05,.10]; const total=scores.reduce((sum,v,i)=>sum+v*weights[i],0);
    data.performances.push({id:uid(),birdId:fd.birdId,date:fd.date,note:fd.note,scores,total});saveData();closeModal();render();showToast(`Đã lưu điểm phong độ ${total.toFixed(1)}/10.`);
  }
  if(e.target.id==='health-form'){ data.healthLogs.push({id:uid(),...fd}); saveData(); closeModal(); render(); showToast('Đã lưu nhật ký sức khỏe.'); }
  if(e.target.id==='nutrition-form'){ data.nutritionLogs.push({id:uid(),...fd}); saveData(); closeModal(); render(); showToast('Đã lưu nhật ký dinh dưỡng.'); }
  if(e.target.id==='training-form'){ data.trainingLogs.push({id:uid(),...fd}); saveData(); closeModal(); render(); showToast('Đã lưu buổi tập luyện.'); }
});

document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#quick-add-btn').addEventListener('click',()=>openModal('Thêm nhanh',`<div class="grid-2"><button class="card" data-action="add-bird">🪶<h3>Hồ sơ chim</h3></button><button class="card" data-action="add-task">▣<h3>Lịch chăm</h3></button><button class="card" data-action="add-performance">📈<h3>Phong độ</h3></button><button class="card" data-action="add-health">🩺<h3>Sức khỏe</h3></button></div>`));
$('#account-btn').addEventListener('click',()=>handleAction('account'));
syncIndicator.addEventListener('click',()=>handleAction('force-sync'));
$('#modal-close').addEventListener('click',closeModal); modalBackdrop.addEventListener('click',e=>{if(e.target===modalBackdrop)closeModal();});
modalBody.addEventListener('click',e=>{ const a=e.target.closest('[data-action]'); if(a)handleAction(a.dataset.action); });

document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>switchAuthMode(button.dataset.authMode)));
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=Object.fromEntries(new FormData(e.target).entries());
  setAuthMessage('Đang đăng nhập…','info'); setLoading(true);
  try{
    const payload=await window.CMCSCloud.signIn(fd.email,fd.password);
    showApp(payload);
  }catch(error){ setLoading(false); setAuthMessage(error.message,'error'); }
});
$('#register-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=Object.fromEntries(new FormData(e.target).entries());
  if(fd.password!==fd.confirmPassword) return setAuthMessage('Hai mật khẩu chưa khớp.','error');
  setAuthMessage('Đang tạo tài khoản…','info');
  try{
    const result=await window.CMCSCloud.signUp(fd.email,fd.password,fd.fullName);
    if(result.payload){
      showApp(result.payload);
    }else{
      switchAuthMode('login');
      setAuthMessage('Đã tạo tài khoản. Hãy mở email xác nhận rồi quay lại đăng nhập.','success');
    }
  }catch(error){ setAuthMessage(error.message,'error'); }
});
$('#reset-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=Object.fromEntries(new FormData(e.target).entries());
  try{ await window.CMCSCloud.resetPassword(fd.email); setAuthMessage('Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra email.','success'); }
  catch(error){ setAuthMessage(error.message,'error'); }
});
$('#password-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=Object.fromEntries(new FormData(e.target).entries());
  if(fd.password!==fd.confirmPassword) return setAuthMessage('Hai mật khẩu chưa khớp.','error');
  try{
    await window.CMCSCloud.updatePassword(fd.password);
    setAuthMessage('Đã đổi mật khẩu. Anh có thể tiếp tục sử dụng ứng dụng.','success');
    location.hash='dashboard';
    location.reload();
  }catch(error){ setAuthMessage(error.message,'error'); }
});

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; $('#install-btn').classList.remove('hidden'); });
$('#install-btn').addEventListener('click',async()=>{ if(!deferredInstallPrompt)return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; $('#install-btn').classList.add('hidden'); });
window.addEventListener('appinstalled',()=>showToast('Đã cài Chào Mào Chiến Suốt Pro.'));
window.addEventListener('hashchange',()=>{ const v=location.hash.replace('#',''); if(currentUser && VALID_VIEWS.includes(v) && v!==currentView) setView(v); });
window.addEventListener('visibilitychange',async()=>{
  if(document.visibilityState==='visible' && currentUser){
    try{
      const refreshed=await window.CMCSCloud.refreshFromCloud(DEFAULT_DATA,data);
      if(refreshed!==data){ data=refreshed; render(); }
    }catch(error){ console.warn(error); }
  }
});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));

setInterval(checkDueTasks, 30000);
checkDueTasks();
setLoading(true);
window.CMCSCloud.init({defaultData:DEFAULT_DATA,onAuthChange:handleCloudAuthEvent,onSyncChange:handleSyncChange})
  .catch(error=>showAuthScreen(error.message));
