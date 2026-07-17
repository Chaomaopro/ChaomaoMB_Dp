const APP_VERSION = '2.4.0';
const PLAN_LIMITS = { free: 3, pro: 30, owner: 500 };

const DEFAULT_DATA = {
  profile: { owner: 'Nghệ nhân', phone: '', version: APP_VERSION, notificationsEnabled: false, notifiedTaskKeys: [] },
  birds: [],
  tasks: [],
  performances: [],
  healthLogs: [],
  nutritionLogs: [],
  trainingLogs: [],
  tournamentSessions: [],
  carePlans: []
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
let serviceWorkerRegistration = null;
let refreshingForUpdate = false;
let adminUsersCache = [];

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
const updateBanner = $('#update-banner');
const updateBannerText = $('#update-banner-text');
const updateNowBtn = $('#update-now-btn');

function saveData(){
  window.CMCSCloud?.save(data);
  updateSyncIndicator();
}
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); }
function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function dateToLocalISO(date=new Date()){ const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function todayISO(){ return dateToLocalISO(new Date()); }
function formatDate(value){ if(!value) return 'Chưa cập nhật'; const d=new Date(value+'T00:00:00'); return d.toLocaleDateString('vi-VN'); }

function parseLocalDate(value){ return value ? new Date(`${value}T00:00:00`) : null; }
function addDaysISO(value,days){ const d=parseLocalDate(value)||new Date(); d.setDate(d.getDate()+Number(days||0)); return dateToLocalISO(d); }
function daysBetween(start,end=todayISO()){ const a=parseLocalDate(start),b=parseLocalDate(end); if(!a||!b)return null; return Math.floor((b-a)/86400000); }
function cycleStageOptions(selected=''){
  return ['Chưa theo dõi','Bắt đầu rụng lông','Rụng lông mạnh','Ra lông ống','Hoàn thiện lông','Khô lông','Xong lông']
    .map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join('');
}
function birdCycleText(b){
  if(b.fireCareStartDate){
    const days=daysBetween(b.fireCareStartDate);
    return `Chăm lửa sau lông${Number.isFinite(days)?` · ngày ${days+1}`:''}`;
  }
  if(b.moltCompleteDate){
    const dry=Number(b.featherDryPercent||0);
    return `Xong lông ${formatDate(b.moltCompleteDate)}${dry?` · khô ${dry}%`:''}`;
  }
  if(b.moltStartDate){
    const days=daysBetween(b.moltStartDate);
    return `${b.moltStage||'Đang thay lông'}${Number.isFinite(days)?` · ngày ${days+1}`:''}`;
  }
  return 'Chưa khai báo chu kỳ lông';
}

function planTypeLabel(type,subtype=''){
  if(type==='molt') return 'Thay lông';
  if(type==='post_molt_fire') return 'Chăm lửa';
  if(type==='guided'){
    const labels={
      safe_molt:'Người mới · chăm lông',
      finish_feather:'Người mới · khô lông',
      recovery:'Người mới · hồi nền',
      fire_base:'Người mới · lên lửa',
      maintain_fire:'Giữ lửa ổn định',
      stabilize:'Theo dõi ổn định'
    };
    return labels[subtype]||'Trợ lý người mới';
  }
  return 'Giáo án';
}
function planTypeClass(type,subtype=''){
  if(subtype==='stabilize')return 'danger';
  if(type==='molt'||subtype==='safe_molt'||subtype==='finish_feather')return 'warning';
  return 'success';
}
function guidedGoalInfo(goal){
  const map={
    safe_molt:{
      title:'Chăm thay lông an toàn',
      plain:'Giữ chim ổn định, ra lông đều, không ép lửa và không làm rối tiêu hóa.',
      rules:['Giữ cám quen; không đổi cám đột ngột.','Không dợt căng hoặc tập lực trong giai đoạn rụng lông mạnh.','Chỉ tăng một yếu tố mỗi lần: nắng, mồi hoặc vận động.']
    },
    finish_feather:{
      title:'Hoàn thiện và làm khô lông',
      plain:'Giúp lông ống hoàn thiện, lông ôm dần và xây lại nếp sinh hoạt.',
      rules:['Không coi lông mọc đủ là đã khô hoàn toàn.','Tăng nắng rất chậm và chỉ khi phân, mức ăn ổn định.','Không ép cội khi còn tuyết cánh, đuôi chưa khô hoặc chim xù.']
    },
    recovery:{
      title:'Hồi nền sau khi xong lông',
      plain:'Khôi phục tiêu hóa, thể lực và tinh thần trước khi bắt đầu chăm lửa.',
      rules:['Hai tuần đầu ưu tiên nền khỏe hơn biểu hiện căng.','Tập rất nhẹ, có ngày nghỉ xen kẽ.','Chỉ tăng tải khi chim hồi trong 24 giờ và phân không xấu đi.']
    },
    fire_base:{
      title:'Lên lửa cơ bản cho người mới',
      plain:'Tăng từ từ nắng, lực và dợt để chim có lửa bền, tránh lửa ảo.',
      rules:['Không tăng cám, mồi, nắng và lực cùng một lúc.','Dợt vừa sức; dừng khi chậm cầu, xù, bỏ đấu hoặc thở gấp.','Không đổi cám hoặc thử sản phẩm mới sát ngày dợt.']
    },
    maintain_fire:{
      title:'Giữ lửa ổn định',
      plain:'Giữ chim ở mức lửa tốt, chơi đều và hồi nhanh mà không bị căng bức hoặc lửa ảo.',
      rules:[
        'Chim đã đạt lửa thì ưu tiên giữ nhịp, không tiếp tục tăng đồng thời cám, mồi, nắng và lực.',
        'Mỗi tuần chỉ cần một buổi dợt chính vừa sức; sau dợt phải có ngày hồi và đánh giá phân, mức ăn, giọng, bộ.',
        'Khi xuất hiện móc đít, cắn lông, nhảy loạn, rít nhiều nhưng ít bọng hoặc hồi chậm, phải giảm tải thay vì tiếp tục kích.'
      ]
    }
  };
  return map[goal]||map.safe_molt;
}
function guidedStageWeeks(goal,stage){
  if(goal==='finish_feather')return 4;
  if(goal==='recovery')return 3;
  if(goal==='fire_base')return 6;
  if(goal==='maintain_fire')return 4;
  const map={'Bắt đầu rụng lông':8,'Rụng lông mạnh':7,'Ra lông ống':6,'Hoàn thiện lông':4,'Khô lông':2,'Xong lông':2};
  return map[stage]||8;
}
function severeGuidedCondition(fd){
  return ['difficulty','bottom','blood'].includes(fd.healthSignal);
}
function yellowGuidedCondition(fd){
  return fd.appetite==='low'||['soft','watery'].includes(fd.droppings)||['cough','xu','leg','tail'].includes(fd.healthSignal);
}
function showToast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._to); t._to=setTimeout(()=>t.classList.add('hidden'),2400); }
function openModal(title, html){ modalTitle.textContent=title; modalBody.innerHTML=html; modalBackdrop.classList.remove('hidden'); }
function closeModal(){ modalBackdrop.classList.add('hidden'); modalBody.innerHTML=''; }
function avg(values){ const valid=values.filter(v=>Number.isFinite(v)); return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 0; }
function formatBytes(bytes=0){ const n=Number(bytes)||0; if(n<1024)return `${n} B`; if(n<1024**2)return `${(n/1024).toFixed(1)} KB`; return `${(n/1024**2).toFixed(1)} MB`; }
function getEffectivePlan(profile=currentProfile){ if(!profile)return 'free'; if(profile.plan==='owner')return 'owner'; if(profile.plan_expires_at && new Date(profile.plan_expires_at).getTime()<Date.now())return 'free'; return profile.plan||'free'; }
function getBirdLimit(){ return PLAN_LIMITS[getEffectivePlan()] || PLAN_LIMITS.free; }
function canAddBird(){ return data.birds.length < getBirdLimit(); }
function versionParts(value){ return String(value||'0').split('.').map(x=>Number.parseInt(x,10)||0); }
function isNewerVersion(latest,current=APP_VERSION){ const a=versionParts(latest),b=versionParts(current); for(let i=0;i<Math.max(a.length,b.length);i++){ if((a[i]||0)>(b[i]||0))return true; if((a[i]||0)<(b[i]||0))return false; } return false; }
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
  data.carePlans ||= [];
  data.profile.owner = currentProfile.full_name || data.profile.owner || 'Nghệ nhân';
  data.profile.version = APP_VERSION;
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  setLoading(false);
  updateSyncIndicator();
  setView(currentView);
  checkForAppUpdate(true).catch(console.warn);
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
  <div class="button-row section">
    <button class="secondary-btn" data-action="force-sync">Đồng bộ 2 chiều</button>
    <button class="secondary-btn" data-action="push-cloud">Gửi lên cloud</button>
    <button class="secondary-btn" data-action="pull-cloud">Nhận từ cloud</button>
    <button class="danger-btn" data-action="logout">Đăng xuất</button>
  </div>`;
}

async function openAdminDashboard(){
  openModal('Trung tâm quản trị', '<div class="empty">Đang tổng hợp dữ liệu hệ thống…</div>');
  try{
    const stats=await window.CMCSCloud.getAdminDashboard();
    modalBody.innerHTML=`
      <div class="admin-kpi-grid">
        <div class="card kpi-card"><small>Tổng tài khoản</small><strong>${Number(stats.total_users||0)}</strong></div>
        <div class="card kpi-card"><small>Hoạt động 7 ngày</small><strong>${Number(stats.active_7d||0)}</strong></div>
        <div class="card kpi-card"><small>Người dùng mới 7 ngày</small><strong>${Number(stats.new_users_7d||0)}</strong></div>
        <div class="card kpi-card"><small>Tổng hồ sơ chim</small><strong>${Number(stats.total_birds||0)}</strong></div>
        <div class="card kpi-card"><small>Sắp hết hạn 7 ngày</small><strong>${Number(stats.expiring_7d||0)}</strong></div>
        <div class="card kpi-card"><small>Tài khoản bị khóa</small><strong>${Number(stats.locked_users||0)}</strong></div>
      </div>
      <section class="section"><div class="card">
        <div class="data-row"><span>Gói Free</span><strong>${Number(stats.free_users||0)}</strong></div>
        <div class="data-row"><span>Gói Pro</span><strong>${Number(stats.pro_users||0)}</strong></div>
        <div class="data-row"><span>Gói Owner</span><strong>${Number(stats.owner_users||0)}</strong></div>
        <div class="data-row"><span>Dung lượng dữ liệu JSON</span><strong>${formatBytes(stats.total_data_bytes)}</strong></div>
      </div></section>
      <section class="section admin-action-grid">
        <button class="card admin-entry" data-action="admin-create-user"><span class="badge success">＋ Tài khoản</span><h3>Tạo tài khoản mới</h3><p>Đặt mật khẩu tạm và cấp gói ngay trong ứng dụng.</p></button>
        <button class="card admin-entry" data-action="admin-users"><span class="badge warning">👥 Người dùng</span><h3>Quản lý tài khoản</h3><p>Tìm kiếm, khóa/mở, cấp gói và quyền quản trị.</p></button>
        <button class="card admin-entry" data-action="admin-audit"><span class="badge">🧾 Nhật ký</span><h3>Nhật ký quản trị</h3><p>Xem ai đã tạo hoặc thay đổi tài khoản.</p></button>
        <button class="card admin-entry" data-action="admin-dashboard"><span class="badge">↻ Làm mới</span><h3>Cập nhật thống kê</h3><p>Tải lại số liệu mới nhất từ Supabase.</p></button>
      </section>`;
  }catch(error){
    modalBody.innerHTML=`<div class="empty">${esc(error.message)}<br><small>Hãy chạy file migration v2.1 trong Supabase trước.</small></div>`;
  }
}

function adminCreateUserForm(){
  return `<form id="admin-create-user-form" class="form-grid">
    <div class="notice">Tài khoản được tạo qua Supabase Edge Function. Mật khẩu tạm không được lưu trong ứng dụng.</div>
    <div class="field"><label>Họ tên/biệt danh *</label><input name="fullName" required maxlength="120" placeholder="Ví dụ: Nguyễn Văn A"></div>
    <div class="field"><label>Email đăng nhập *</label><input type="email" name="email" required autocomplete="off"></div>
    <div class="field"><label>Số điện thoại</label><input name="phone" maxlength="30" inputmode="tel"></div>
    <div class="field"><label>Mật khẩu tạm *</label><input type="password" name="password" required minlength="8" autocomplete="new-password"><small class="form-help">Ít nhất 8 ký tự. Nên yêu cầu người dùng đổi mật khẩu sau lần đăng nhập đầu.</small></div>
    <div class="form-row">
      <div class="field"><label>Gói sử dụng</label><select name="plan"><option value="free">Free · 3 chim</option><option value="pro">Pro · 30 chim</option><option value="owner">Owner · 500 chim</option></select></div>
      <div class="field"><label>Vai trò</label><select name="role"><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></div>
    </div>
    <div class="field"><label>Ngày hết hạn (để trống = không giới hạn)</label><input type="date" name="planExpiresAt"></div>
    <button class="fab-action" type="submit">Tạo tài khoản</button>
  </form>`;
}

async function openAdminUsers(filters={}){
  openModal('Quản trị người dùng', '<div class="empty">Đang tải danh sách tài khoản…</div>');
  try{
    const users=await window.CMCSCloud.listUsers(filters);
    adminUsersCache=users;
    const active=users.filter(u=>u.status==='active').length;
    const pro=users.filter(u=>['pro','owner'].includes(u.plan)).length;
    modalBody.innerHTML=`
      <form id="admin-user-search-form" class="admin-search-bar">
        <input name="search" value="${esc(filters.search||'')}" placeholder="Tìm tên, email, số điện thoại…">
        <select name="status"><option value="">Mọi trạng thái</option><option value="active" ${filters.status==='active'?'selected':''}>Hoạt động</option><option value="locked" ${filters.status==='locked'?'selected':''}>Đã khóa</option><option value="inactive" ${filters.status==='inactive'?'selected':''}>Ngừng hoạt động</option></select>
        <select name="plan"><option value="">Mọi gói</option><option value="free" ${filters.plan==='free'?'selected':''}>Free</option><option value="pro" ${filters.plan==='pro'?'selected':''}>Pro</option><option value="owner" ${filters.plan==='owner'?'selected':''}>Owner</option></select>
        <button class="secondary-btn" type="submit">Tìm</button>
      </form>
      <div class="grid-3-desktop section">
        <div class="card kpi-card"><small>Kết quả</small><strong>${users.length}</strong></div>
        <div class="card kpi-card"><small>Đang hoạt động</small><strong>${active}</strong></div>
        <div class="card kpi-card"><small>Pro/Owner</small><strong>${pro}</strong></div>
      </div>
      <div class="button-row section"><button class="fab-action" data-action="admin-create-user">＋ Tạo tài khoản</button><button class="secondary-btn" data-action="admin-dashboard">Tổng quan</button></div>
      <section class="section"><div class="list">${users.map(adminUserCard).join('') || '<div class="empty">Không tìm thấy tài khoản.</div>'}</div></section>`;
  }catch(error){
    modalBody.innerHTML=`<div class="empty">${esc(error.message)}</div>`;
  }
}

function adminUserCard(user){
  const last=user.last_seen_at?new Date(user.last_seen_at).toLocaleString('vi-VN'):'Chưa đăng nhập';
  const expiry=user.plan_expires_at?new Date(user.plan_expires_at).toLocaleDateString('vi-VN'):'Không giới hạn';
  return `<div class="list-item admin-user-item">
    <div class="avatar">${user.role==='admin'?'★':'👤'}</div>
    <div class="grow"><h3>${esc(user.full_name||'Nghệ nhân')}</h3><p>${esc(user.email||'')}${user.phone?` · ${esc(user.phone)}`:''}<br>${esc((user.plan||'free').toUpperCase())} · ${esc(user.status)} · ${Number(user.bird_count||0)} chim · ${formatBytes(user.data_bytes)}<br>Hết hạn: ${esc(expiry)} · Hoạt động: ${esc(last)}</p></div>
    <button class="secondary-btn admin-edit-btn" data-admin-edit="${user.id}">Sửa</button>
  </div>`;
}

function adminEditForm(user){
  return `<form id="admin-user-form" class="form-grid">
    <input type="hidden" name="userId" value="${esc(user.id)}">
    <div class="card"><strong>${esc(user.full_name||'Nghệ nhân')}</strong><p class="form-help">${esc(user.email||'')}${user.phone?` · ${esc(user.phone)}`:''}</p></div>
    <div class="form-row">
      <div class="field"><label>Trạng thái</label><select name="status"><option value="active" ${user.status==='active'?'selected':''}>Hoạt động</option><option value="locked" ${user.status==='locked'?'selected':''}>Khóa</option><option value="inactive" ${user.status==='inactive'?'selected':''}>Ngừng hoạt động</option></select></div>
      <div class="field"><label>Vai trò</label><select name="role"><option value="user" ${user.role==='user'?'selected':''}>Người dùng</option><option value="admin" ${user.role==='admin'?'selected':''}>Quản trị viên</option></select></div>
    </div>
    <div class="field"><label>Gói sử dụng</label><select name="plan"><option value="free" ${user.plan==='free'?'selected':''}>Free · tối đa 3 chim</option><option value="pro" ${user.plan==='pro'?'selected':''}>Pro · tối đa 30 chim</option><option value="owner" ${user.plan==='owner'?'selected':''}>Owner · tối đa 500 chim</option></select></div>
    <div class="field"><label>Ngày hết hạn (để trống = không giới hạn)</label><input type="date" name="plan_expires_at" value="${user.plan_expires_at?String(user.plan_expires_at).slice(0,10):''}"></div>
    <div class="field"><label>Lý do thay đổi</label><textarea name="reason" placeholder="Ví dụ: Đã thanh toán gia hạn gói Pro"></textarea></div>
    <button class="fab-action" type="submit">Lưu thay đổi</button>
    <button class="secondary-btn" type="button" data-admin-reset="${esc(user.email||'')}">Gửi email đặt lại mật khẩu</button>
  </form>`;
}

async function openAdminAuditLogs(){
  openModal('Nhật ký quản trị', '<div class="empty">Đang tải nhật ký…</div>');
  try{
    const logs=await window.CMCSCloud.listAuditLogs(150);
    modalBody.innerHTML=`<div class="list">${logs.map(log=>{
      const when=new Date(log.created_at).toLocaleString('vi-VN');
      const action=log.action==='create_user'?'Tạo tài khoản':log.action==='update_user'?'Cập nhật tài khoản':log.action;
      const reason=log.details?.reason?` · Lý do: ${esc(log.details.reason)}`:'';
      return `<div class="list-item"><div class="avatar">🧾</div><div class="grow"><h3>${esc(action)}</h3><p>${esc(log.admin_email||'Hệ thống')} → ${esc(log.target_email||'')}${reason}<br>${esc(when)}</p></div></div>`;
    }).join('')||'<div class="empty">Chưa có thao tác quản trị.</div>'}</div>`;
  }catch(error){ modalBody.innerHTML=`<div class="empty">${esc(error.message)}</div>`; }
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
    <section class="section">
      <button class="card" data-action="guided-plan-builder" style="width:100%;text-align:left;border:1px solid var(--line)">
        <span class="badge warning">🧭 Dành cho người mới</span>
        <h3 style="margin:10px 0 4px">Trợ lý xây giáo án chăm chim</h3>
        <p style="color:var(--muted);font-size:13px">Chỉ cần trả lời tình trạng chim; ứng dụng tự tạo lịch và giải thích từng việc phải làm.</p>
      </button>
    </section>
    <section class="section grid-2">
      <button class="card" data-action="add-performance" style="text-align:left;border:1px solid var(--line)"><span class="badge">📈 Phong độ</span><h3 style="margin:10px 0 4px">Chấm điểm tuần</h3><p style="color:var(--muted);font-size:13px">Lông, lửa, bộ, bền và tâm lý.</p></button>
      <button class="card" data-action="add-health" style="text-align:left;border:1px solid var(--line)"><span class="badge danger">🩺 Sức khỏe</span><h3 style="margin:10px 0 4px">Ghi bất thường</h3><p style="color:var(--muted);font-size:13px">Phân, hô hấp, chân và thể trạng.</p></button>
    </section>`;
}
function taskHtml(t){
  const plan=data.carePlans.find(p=>p.id===t.planId);
  const label=t.planType?planTypeLabel(t.planType,plan?.subtype):'';
  const planBadge=t.planType?`<span class="badge ${planTypeClass(t.planType,plan?.subtype)}">${esc(label)}</span> `:'';
  const pausedBadge=t.paused?'<span class="badge danger">Tạm dừng</span> ':'';
  return `<div class="list-item ${t.done?'task-done':''} ${t.paused?'task-paused':''}">
    <button class="check-btn ${t.done?'done':''}" data-task-toggle="${t.id}" ${t.paused?'disabled':''}>${t.done?'✓':''}</button>
    <div class="grow"><h3>${esc(t.time)} · ${esc(t.title)}</h3><p>${pausedBadge}${planBadge}${esc(t.birdId?birdName(t.birdId):'Toàn giàn')} ${t.note?'· '+esc(t.note):''}</p></div>
    <button class="icon-btn" data-task-delete="${t.id}" style="width:34px;height:34px">⋯</button>
  </div>`;
}
function birdCardHtml(b){ const score=getBirdScore(b.id); return `<div class="list-item" data-bird-open="${b.id}"><div class="avatar">🪶</div><div class="grow"><h3>${esc(b.name)}</h3><p>${esc(b.origin||'Chưa rõ vùng')} · ${esc(b.ageGroup||'Chưa rõ tuổi')}</p><p style="margin-top:5px;font-size:12px">${esc(birdCycleText(b))}</p><div style="margin-top:6px">${statusBadge(b.stage)}</div></div><div class="score">${score?score.toFixed(1):'–'}</div></div>`; }

function renderBirds(){
  appContent.innerHTML=`
    <section class="section" style="margin-top:0">
      <div class="section-heading"><h2>${data.birds.length}/${getBirdLimit()} hồ sơ chim</h2><button class="text-btn" data-action="add-bird">＋ Thêm chim</button></div><p class="form-help">Gói ${esc(getEffectivePlan().toUpperCase())}: tối đa ${getBirdLimit()} hồ sơ chim.</p>
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
        <span class="badge ${getEffectivePlan()==='free'?'':'success'}">${esc(getEffectivePlan().toUpperCase())}</span>
      </div>
      <div class="data-row"><span>Trạng thái cloud</span><strong><span class="badge ${syncBadge}">${esc(syncState.message||'')}</span></strong></div>
      <div class="data-row"><span>Giới hạn hồ sơ chim</span><strong>${data.birds.length}/${getBirdLimit()}</strong></div>
      <div class="button-row"><button class="secondary-btn" data-action="account">Tài khoản</button><button class="secondary-btn" data-action="force-sync">Đồng bộ 2 chiều</button></div>
    </section>
    ${isAdmin?`<section class="section"><button class="card admin-entry" data-action="admin-dashboard"><span class="badge warning">★ Chủ hệ thống</span><h3>Trung tâm quản trị</h3><p>Dashboard, tạo tài khoản, quản lý gói và nhật ký thao tác.</p></button></section>`:''}
    <section class="section"><button class="card" data-action="guided-plan-builder" style="width:100%;text-align:left"><span class="badge warning">🧭 Trợ lý người mới</span><h3 style="margin:10px 0 4px">Tự xây giáo án chăm lông</h3><p style="font-size:13px;color:var(--muted)">Ứng dụng hỏi từng bước và tự tạo lịch phù hợp với tình trạng thực tế.</p></button></section>
    <section class="grid-2 section">
      <button class="card" data-action="add-health" style="text-align:left"><span class="badge danger">🩺</span><h3 style="margin:10px 0 4px">Sổ tay y tế</h3><p style="font-size:13px;color:var(--muted)">${data.healthLogs.length} bản ghi</p></button>
      <button class="card" data-action="add-performance" style="text-align:left"><span class="badge success">📊</span><h3 style="margin:10px 0 4px">Phong độ</h3><p style="font-size:13px;color:var(--muted)">${data.performances.length} lần chấm</p></button>
      <button class="card" data-action="add-nutrition" style="text-align:left"><span class="badge">🍌</span><h3 style="margin:10px 0 4px">Dinh dưỡng</h3><p style="font-size:13px;color:var(--muted)">${data.nutritionLogs.length} nhật ký</p></button>
      <button class="card" data-action="add-training" style="text-align:left"><span class="badge warning">🏃</span><h3 style="margin:10px 0 4px">Tập luyện</h3><p style="font-size:13px;color:var(--muted)">${data.trainingLogs.length} buổi tập</p></button>
    </section>
    <section class="section"><div class="section-heading"><h2>Sức khỏe gần đây</h2></div><div class="list">${latestHealth.length?latestHealth.map(h=>`<div class="list-item"><div class="avatar">🩺</div><div class="grow"><h3>${esc(birdName(h.birdId))}</h3><p>${formatDate(h.date)} · ${esc(h.symptom)} · Cấp ${esc(h.level)}</p></div></div>`).join(''):`<div class="empty">Chưa có nhật ký sức khỏe.</div>`}</div></section>
    <section class="section"><div class="card"><h3>Dữ liệu và cài đặt</h3><div class="button-row"><button class="secondary-btn" data-action="export-data">Xuất sao lưu</button><button class="secondary-btn" data-action="import-data">Nhập dữ liệu</button></div><div style="height:10px"></div><button class="secondary-btn" data-action="enable-notifications">${data.profile.notificationsEnabled?'Đã bật nhắc việc':'Bật nhắc việc trên máy'}</button><div style="height:10px"></div><button class="secondary-btn" data-action="check-update">Kiểm tra cập nhật ứng dụng</button><div style="height:10px"></div><button class="danger-btn" data-action="reset-data">Xóa dữ liệu của tài khoản</button><p style="font-size:12px;color:var(--muted);margin:12px 0 0">Dữ liệu được lưu trên thiết bị và tự đồng bộ lên Supabase khi có mạng. Bản v2.1 không sử dụng Supabase Storage và không lưu ảnh người dùng.</p></div></section>
    <section class="section"><div class="card"><div class="data-row"><span>Phiên bản</span><strong>${esc(APP_VERSION)}</strong></div><div class="data-row"><span>Chế độ</span><strong>PWA Cloud đa người dùng</strong></div><div class="data-row"><span>Lưu ảnh cloud</span><strong>Đã tắt</strong></div><div class="data-row"><span>Tác giả</span><strong>Minh Đức</strong></div></div></section>`;
}

function birdForm(){ return `<form id="bird-form" class="form-grid">
  <div class="field"><label>Tên chim *</label><input name="name" required placeholder="Ví dụ: Chiến Tướng"></div>
  <div class="form-row">
    <div class="field"><label>Vùng miền</label><select name="origin"><option>Huế</option><option>Trung Mang</option><option>Bình Điền</option><option>Quảng Nam</option><option>Quảng Ngãi</option><option>Tây Nguyên</option><option>Không xác định</option></select></div>
    <div class="field"><label>Lứa tuổi</label><select name="ageGroup"><option>Chim tơ</option><option>Tơ một mùa</option><option>Hai mùa</option><option>Ba mùa trở lên</option><option>Chim già rừng</option></select></div>
  </div>
  <div class="field"><label>Giai đoạn hiện tại</label><select name="stage"><option>Dưỡng ổn định</option><option>Thay lông</option><option>Khô lông</option><option>Lên lửa</option><option>Đạt điểm rơi</option><option>Sau thi</option><option>Điều trị</option><option>Cách ly</option></select></div>
  <details class="card">
    <summary><strong>Chu kỳ lông và chăm lửa</strong></summary>
    <div class="form-grid" style="margin-top:14px">
      <div class="form-row">
        <div class="field"><label>Ngày bắt đầu thay lông</label><input type="date" name="moltStartDate"></div>
        <div class="field"><label>Giai đoạn lông</label><select name="moltStage">${cycleStageOptions('Chưa theo dõi')}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Ngày xong lông</label><input type="date" name="moltCompleteDate"></div>
        <div class="field"><label>Độ khô lông (%)</label><input type="number" min="0" max="100" name="featherDryPercent" value="0"></div>
      </div>
      <div class="field"><label>Ngày bắt đầu chăm lửa sau lông</label><input type="date" name="fireCareStartDate"></div>
      <div class="field"><label>Ghi chú chu kỳ</label><textarea name="moltNotes" placeholder="Ví dụ: còn tuyết cánh, đuôi chưa khô, phân ổn định..."></textarea></div>
    </div>
  </details>
  <div class="field"><label>Lối chơi nổi bật</label><input name="style" placeholder="Sàn cầu nhanh, bung cánh, ra bọng đều..."></div>
  <div class="field"><label>Thành tích</label><textarea name="achievements" placeholder="Top 10, cờ, cúp..."></textarea></div>
  <button class="fab-action" type="submit">Lưu hồ sơ chim</button>
</form>`; }
function taskForm(){ return `<form id="task-form" class="form-grid"><div class="field"><label>Công việc *</label><input name="title" required placeholder="Phơi nắng, tắm nước, tập lực..."></div><div class="form-row"><div class="field"><label>Ngày</label><input type="date" name="date" value="${todayISO()}" required></div><div class="field"><label>Giờ</label><input type="time" name="time" value="07:00" required></div></div><div class="field"><label>Áp dụng cho chim</label><select name="birdId"><option value="">Toàn giàn</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ghi chú</label><textarea name="note"></textarea></div><button class="fab-action" type="submit">Tạo lịch chăm</button></form>`; }
function performanceForm(){ return `<form id="performance-form" class="form-grid"><div class="field"><label>Chọn chim *</label><select name="birdId" required><option value="">-- Chọn chim --</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ngày đánh giá</label><input type="date" name="date" value="${todayISO()}"></div>${['Lông','Lửa','Thái độ đấu','Giọng','Bộ chơi','Thể lực','Độ bền','Tâm lý','Tiêu hóa','Phục hồi'].map((x,i)=>`<div class="field"><label>${x}: <strong id="score-${i}">7</strong>/10</label><input type="range" min="1" max="10" value="7" name="s${i}" data-score-label="score-${i}"></div>`).join('')}<div class="field"><label>Nhận xét</label><textarea name="note"></textarea></div><button class="fab-action" type="submit">Lưu điểm phong độ</button></form>`; }
function healthForm(){ return `<form id="health-form" class="form-grid"><div class="field"><label>Chọn chim *</label><select name="birdId" required><option value="">-- Chọn chim --</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ngày ghi nhận</label><input type="date" name="date" value="${todayISO()}"></div><div class="field"><label>Triệu chứng chính *</label><select name="symptom" required><option>Phân nát/phân nước</option><option>Ho/khè</option><option>Xù lông</option><option>Đau chân</option><option>Rận mạt</option><option>Cắn đuôi/cắn cánh</option><option>Bỏ ăn</option><option>Khác</option></select></div><div class="field"><label>Mức cảnh báo</label><select name="level"><option>Xanh - theo dõi</option><option>Vàng - cần điều chỉnh</option><option>Cam - cách ly/đánh giá</option><option>Đỏ - cần hỗ trợ thú y</option></select></div><div class="field"><label>Ghi chú xử lý</label><textarea name="note" placeholder="Mô tả phân, mức ăn, hô hấp, thay đổi khẩu phần..."></textarea></div><button class="fab-action" type="submit">Lưu nhật ký sức khỏe</button></form>`; }
function simpleLogForm(type){
  const nutrition=type==='nutrition';
  return `<form id="${type}-form" class="form-grid"><div class="field"><label>Chọn chim *</label><select name="birdId" required><option value="">-- Chọn chim --</option>${data.birds.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Ngày</label><input type="date" name="date" value="${todayISO()}"></div><div class="field"><label>${nutrition?'Nội dung khẩu phần':'Hình thức tập luyện'}</label>${nutrition?'<textarea name="detail" required placeholder="Cám chính, mồi tươi, trái cây, vitamin..."></textarea>':'<select name="detail"><option>Tắm nắng</option><option>Tắm nước</option><option>Lồng lực</option><option>Dợt nhẹ</option><option>Dợt vừa sức</option><option>Dợt căng</option><option>Mô phỏng thi đấu</option></select>'}</div><div class="field"><label>${nutrition?'Phản ứng của chim':'Thời lượng và kết quả'}</label><textarea name="note"></textarea></div><button class="fab-action" type="submit">Lưu nhật ký</button></form>`;
}



function guidedPlanWizardForm(preBirdId='',preGoal=''){
  if(!data.birds.length)return `<div class="empty">Chưa có hồ sơ chim. Hãy thêm chim trước khi tạo giáo án.</div>`;
  const selectedBird=data.birds.find(b=>b.id===preBirdId)||data.birds[0];
  return `<form id="guided-plan-form" class="form-grid">
    <div class="notice"><strong>Không cần biết thuật ngữ chuyên sâu.</strong><br>Hãy chọn đúng những gì anh đang nhìn thấy. Ứng dụng sẽ tự chọn mức chăm an toàn.</div>

    <div class="card">
      <span class="badge">Bước 1</span>
      <h3 style="margin:10px 0">Chọn chim và mục tiêu</h3>
      <div class="field"><label>Chọn chim *</label><select name="birdId" required>${data.birds.map(b=>`<option value="${b.id}" ${b.id===selectedBird.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Anh muốn ứng dụng giúp việc gì?</label><select name="goal">
        <option value="safe_molt" ${preGoal==='safe_molt'||(!preGoal&&['Thay lông','Dưỡng ổn định'].includes(selectedBird.stage))?'selected':''}>Chăm thay lông an toàn</option>
        <option value="finish_feather" ${preGoal==='finish_feather'||(!preGoal&&selectedBird.stage==='Khô lông')?'selected':''}>Hoàn thiện và làm khô lông</option>
        <option value="recovery" ${preGoal==='recovery'?'selected':''}>Hồi nền sau khi xong lông</option>
        <option value="fire_base" ${preGoal==='fire_base'||(!preGoal&&selectedBird.stage==='Lên lửa')?'selected':''}>Lên lửa cơ bản, tránh lửa ảo</option>
        <option value="maintain_fire" ${preGoal==='maintain_fire'||(!preGoal&&selectedBird.stage==='Đạt điểm rơi')?'selected':''}>Giữ lửa ổn định cho chim đang đạt lửa</option>
      </select></div>
      <div class="form-row">
        <div class="field"><label>Ngày bắt đầu</label><input type="date" name="startDate" value="${todayISO()}" required></div>
        <div class="field"><label>Giai đoạn lông đang thấy</label><select name="moltStage">${cycleStageOptions(selectedBird.moltStage||'Chưa theo dõi')}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Mức lửa hiện tại</label><select name="fireLevel">
          <option value="7">Khoảng 7/10 · vừa vào lửa</option>
          <option value="8" selected>Khoảng 8/10 · lửa tốt</option>
          <option value="9">Khoảng 9/10 · gần điểm rơi</option>
          <option value="10">Khoảng 10/10 · đang rất căng</option>
        </select></div>
        <div class="field"><label>Mục tiêu gần nhất</label><select name="nearTarget">
          <option value="maintain">Giữ ổn định, chưa có giải gần</option>
          <option value="weekly_dai" selected>Duy trì dợt thứ Bảy</option>
          <option value="competition_14">Có giải trong khoảng 8–14 ngày</option>
          <option value="competition_7">Có giải trong 7 ngày</option>
        </select></div>
      </div>
    </div>

    <div class="card">
      <span class="badge">Bước 2</span>
      <h3 style="margin:10px 0">Kiểm tra nền sức khỏe</h3>
      <div class="form-row">
        <div class="field"><label>Mức ăn</label><select name="appetite"><option value="normal">Ăn bình thường</option><option value="low">Ăn ít hơn thường ngày</option></select></div>
        <div class="field"><label>Tình trạng phân</label><select name="droppings"><option value="normal">Khuôn tương đối ổn</option><option value="soft">Phân mềm/nát nhẹ</option><option value="watery">Nhiều nước kéo dài</option><option value="blood">Có dấu hiệu máu</option></select></div>
      </div>
      <div class="field"><label>Dấu hiệu cần chú ý nhất</label><select name="healthSignal">
        <option value="normal">Không có dấu hiệu bất thường rõ</option>
        <option value="cough">Ho/khè nhẹ hoặc ho sau tắm</option>
        <option value="xu">Xù lông, ít vận động</option>
        <option value="leg">Đau chân hoặc bám cầu kém</option>
        <option value="tail">Cắn đuôi/cắn cánh</option>
        <option value="difficulty">Há mỏ, khó thở rõ</option>
        <option value="bottom">Nằm đáy lồng/mất thăng bằng</option>
      </select></div>
    </div>

    <div class="card">
      <span class="badge">Bước 3</span>
      <h3 style="margin:10px 0">Điều kiện chăm thực tế</h3>
      <div class="form-row">
        <div class="field"><label>Khả năng phơi nắng</label><select name="sunAccess"><option value="none">Hầu như không có nắng</option><option value="light">Có nắng nhẹ 10–15 phút</option><option value="normal">Có nắng sáng 20–30 phút</option></select></div>
        <div class="field"><label>Khả năng tắm nước</label><select name="bathAccess"><option value="0">Chưa thể tắm ổn định</option><option value="1" selected>Khoảng 1 lần/tuần</option><option value="2">Khoảng 2 lần/tuần</option></select></div>
      </div>
      <div class="field"><label>Cách dùng mồi và trái cây hiện tại</label><select name="foodLevel"><option value="basic">Tôi chưa biết điều chỉnh, cần lịch đơn giản</option><option value="stable">Đang dùng khẩu phần quen, phân ổn định</option><option value="sensitive">Chim dễ phân nát khi đổi đồ ăn</option></select></div>
      <div class="field"><label>Ghi chú thêm</label><textarea name="notes" placeholder="Ví dụ: không phơi nắng được, chim vừa đổi cám, còn tuyết cánh..."></textarea></div>
    </div>

    <div class="notice">Trợ lý chỉ tạo lịch chăm hỗ trợ, không kê thuốc. Khi có khó thở, nằm đáy lồng, mất thăng bằng hoặc phân có máu, ứng dụng sẽ dừng tạo giáo án và yêu cầu xử lý sức khỏe trước.</div>
    <button class="fab-action" type="submit">Tạo giáo án tự động</button>
  </form>`;
}

function guidedSunInstruction(access,goal,week){
  if(access==='none')return 'Đặt chim ở nơi sáng, thoáng nhưng không gió lùa trong 15–20 phút. Không dùng nắng gắt để bù.';
  if(access==='light')return `Nắng nhẹ ${goal==='fire_base'?Math.min(10+week*2,20):10}–${goal==='fire_base'?Math.min(15+week*2,25):15} phút. Quan sát liên tục, dừng khi há mỏ hoặc xù.`;
  return `Nắng sáng ${goal==='fire_base'?Math.min(15+week*3,30):15}–${goal==='fire_base'?Math.min(20+week*3,35):20} phút; luôn có phần bóng râm và nước sạch.`;
}
function guidedBathInstruction(access,goal){
  if(access==='0')return 'Chưa ép tắm. Vệ sinh cầu, cóng và đáy lồng; chỉ cho tắm khi chim chủ động và thời tiết ấm.';
  const count=Number(access);
  return `Tắm nước khoảng ${count} lần/tuần khi thời tiết phù hợp. Tránh gió lùa; để khô lông hoàn toàn và ghi nhận nếu ho sau tắm.`;
}
function guidedFoodInstruction(level,goal){
  if(level==='sensitive')return 'Giữ nguyên cám và trái cây chim đã quen; không đổi hai loại thức ăn trong cùng một tuần. Khi phân xấu, quay về khẩu phần quen.';
  if(goal==='maintain_fire')return 'Giữ nguyên cám đang giúp chim đạt lửa. Không tăng mồi chỉ vì thấy chim chơi tốt; trái cây và mồi tươi dùng theo nhịp quen, theo dõi phân mỗi sáng.';
  if(level==='basic')return goal==='fire_base'
    ? 'Giữ cám đang ăn ổn định. Chưa tự tăng mồi nóng; chỉ ghi mức ăn và phản ứng của phân.'
    : 'Giữ cám đang ăn ổn định; dùng trái cây quen với lượng vừa. Không chạy theo nhiều loại vitamin hoặc phụ gia.';
  return 'Duy trì khẩu phần quen thuộc. Mỗi thay đổi chỉ thực hiện một yếu tố và theo dõi ít nhất 2–3 ngày.';
}
function guidedWeeklyTheme(goal,week,weeks){
  const themes={
    safe_molt:['Ổn định nếp sinh hoạt','Theo dõi rụng lông','Nuôi lông ống','Giữ tiêu hóa ổn định','Hoàn thiện cánh và đuôi','Làm khô lông từ từ','Củng cố bộ lông','Đánh giá kết thúc chu kỳ'],
    finish_feather:['Kiểm tra lông ống và tuyết cánh','Tăng nhẹ nắng và vận động','Củng cố độ ôm lông','Đánh giá nền trước khi chăm lửa'],
    recovery:['Ổn định ăn, phân và giấc ngủ','Vận động nhẹ, theo dõi hồi phục','Chốt nền khỏe trước khi lên lửa'],
    fire_base:['Hồi nền và làm quen vận động','Tăng lực rất nhẹ','Vào lửa nhẹ','Củng cố lửa và tâm lý','Xây độ bền vừa sức','Giảm tải và đánh giá điểm rơi'],
    maintain_fire:['Chốt nhịp giữ lửa','Duy trì bộ và tâm lý','Kiểm tra độ bền nhưng không ép','Giảm tải và đánh giá lại điểm rơi']
  };
  const arr=themes[goal]||themes.safe_molt;
  return arr[Math.min(week-1,arr.length-1)]||`Tuần ${week}`;
}
function createStabilizePlan(fd,bird){
  if(!removeExistingPlan(bird.id,'guided'))return;
  const info={
    id:uid(),birdId:bird.id,type:'guided',subtype:'stabilize',
    name:'Theo dõi ổn định nền 7 ngày',
    startDate:fd.startDate,endDate:addDaysISO(fd.startDate,6),
    createdAt:new Date().toISOString(),status:'review',
    beginner:true,
    summary:'Chim đang có dấu hiệu cần ổn định trước. Tạm thời không tăng nắng, mồi, lực hoặc dợt.',
    assessment:{...fd},
    rules:[
      'Giữ khẩu phần quen thuộc và nước sạch.',
      'Không ép tắm, ép nắng hoặc dợt cội trong thời gian theo dõi.',
      'Ghi mức ăn, phân, hô hấp và tư thế đứng cầu mỗi ngày.',
      'Nếu biểu hiện nặng lên hoặc kéo dài, cần hỗ trợ thú y.'
    ],
    phases:[{from:1,to:1,name:'Ổn định và theo dõi',note:'Mục tiêu là xác định chim có hồi lại nền bình thường hay không.'}]
  };
  const tasks=[];
  for(let d=0;d<7;d++){
    tasks.push(planTask(info,bird,addDaysISO(fd.startDate,d),'06:30',`Ngày ${d+1}: kiểm tra sức khỏe 3 phút`,
      'Quan sát trước khi mở áo lồng: tư thế đứng, mức xù, nhịp thở, phân qua đêm và mức ăn. Không bắt chim nếu không cần thiết.','Ổn định nền'));
  }
  tasks.push(planTask(info,bird,addDaysISO(fd.startDate,6),'17:00','Đánh giá có thể tạo lại giáo án hay chưa',
    'Chỉ tạo giáo án chăm lông/lửa khi chim ăn bình thường, phân ổn định hơn, không xù kéo dài và không có vấn đề hô hấp.','Ổn định nền'));
  data.carePlans.push(info); data.tasks.push(...tasks); saveData();
  openPlanDetail(info.id);
  showToast('Đã tạo lịch ổn định 7 ngày trước khi xây giáo án.');
}

function maintainFireLoad(fd,week){
  const level=Math.max(7,Math.min(10,Number(fd.fireLevel||8)));
  const forceBase={7:25,8:20,9:15,10:10}[level];
  const daiBase={7:45,8:40,9:30,10:20}[level];
  const weekAdjust=[0,5,5,-10][Math.min(week-1,3)];
  const target=fd.nearTarget||'weekly_dai';

  let force=Math.max(10,forceBase+(week===2?5:0)+(week===4?-5:0));
  let dai=Math.max(15,daiBase+weekAdjust);

  if(target==='maintain'){
    dai=Math.max(15,dai-10);
  }else if(target==='competition_7'){
    force=Math.max(10,force-5);
    dai=week===1?20:15;
  }else if(target==='competition_14'){
    dai=week===1?35:week===2?25:20;
  }
  return {level,force,dai,target};
}
function maintainFireWeekNote(fd,week){
  const load=maintainFireLoad(fd,week);
  const targetText={
    maintain:'chưa có giải gần',
    weekly_dai:'duy trì dợt thứ Bảy',
    competition_14:'có giải trong 8–14 ngày',
    competition_7:'có giải trong 7 ngày'
  }[load.target]||'giữ ổn định';
  return `Mức lửa khai báo ${load.level}/10, mục tiêu ${targetText}. Tuần này ưu tiên giữ nhịp, không tiếp tục kích thêm.`;
}

function createGuidedPlan(fd){
  const bird=data.birds.find(b=>b.id===fd.birdId); if(!bird)return showToast('Không tìm thấy hồ sơ chim.');
  if(severeGuidedCondition(fd)||fd.droppings==='blood'){
    openModal('Cần xử lý sức khỏe trước',`<div class="notice danger"><strong>Chưa tạo giáo án chăm lông.</strong><br>Dấu hiệu anh chọn thuộc nhóm cần đánh giá sức khỏe sớm. Hãy giữ chim yên, tránh gió lùa, không ép tắm/nắng/lực và liên hệ người có chuyên môn thú y.</div><div class="button-row section"><button class="secondary-btn" data-action="add-health">Ghi vào sổ sức khỏe</button></div>`);
    return;
  }
  if(yellowGuidedCondition(fd))return createStabilizePlan(fd,bird);
  if(!removeExistingPlan(bird.id,'guided'))return;

  const goal=fd.goal||'safe_molt';
  const goalInfo=guidedGoalInfo(goal);
  const weeks=guidedStageWeeks(goal,fd.moltStage);
  const plan={
    id:uid(),birdId:bird.id,type:'guided',subtype:goal,
    name:`Trợ lý người mới · ${goalInfo.title}`,
    startDate:fd.startDate,endDate:addDaysISO(fd.startDate,weeks*7-1),
    createdAt:new Date().toISOString(),status:'active',beginner:true,
    summary:goalInfo.plain,
    assessment:{...fd},
    rules:[
      ...goalInfo.rules,
      'Bấm “Báo bất thường” ngay khi phân xấu, giảm ăn, ho, xù, đau chân hoặc cắn lông tăng.',
      'Không tự dùng thuốc hoặc phối nhiều sản phẩm theo phỏng đoán.'
    ],
    phases:[]
  };
  const tasks=[];
  for(let week=1;week<=weeks;week++){
    const base=addDaysISO(fd.startDate,(week-1)*7);
    const theme=guidedWeeklyTheme(goal,week,weeks);
    plan.phases.push({
      from:week,to:week,name:`Tuần ${week}: ${theme}`,
      note:goal==='maintain_fire'
        ? maintainFireWeekNote(fd,week)
        : `Mục tiêu tuần: ${theme}. Chỉ tăng tuần sau nếu chim ăn, phân và tinh thần ổn định.`
    });
    tasks.push(planTask(plan,bird,base,'06:30',`Tuần ${week}: kiểm tra chim 3 phút`,
      'Làm theo thứ tự: nhìn phân qua đêm → kiểm tra lượng cám → quan sát xù lông/nhịp thở → nghe giọng. Ghi bất thường trước khi thay khẩu phần.',theme));
    tasks.push(planTask(plan,bird,addDaysISO(base,1),'07:00',`Tuần ${week}: ánh sáng và nắng`,
      guidedSunInstruction(fd.sunAccess,goal,week),theme));
    tasks.push(planTask(plan,bird,addDaysISO(base,2),'07:30',`Tuần ${week}: kiểm tra thức ăn và nước`,
      guidedFoodInstruction(fd.foodLevel,goal),theme));
    tasks.push(planTask(plan,bird,addDaysISO(base,3),'14:30',`Tuần ${week}: tắm và vệ sinh`,
      guidedBathInstruction(fd.bathAccess,goal),theme));

    if(goal==='fire_base'){
      const forceMinutes=[10,15,20,25,30,20][Math.min(week-1,5)];
      const daiMinutes=[0,15,20,30,45,20][Math.min(week-1,5)];
      tasks.push(planTask(plan,bird,addDaysISO(base,4),'08:00',`Tuần ${week}: vận động ${forceMinutes} phút`,
        `Tập ở mức rất nhẹ đến vừa, khoảng ${forceMinutes} phút. Dừng ngay khi chim thở gấp, xù, đứng cóng hoặc mất bộ.`,theme));
      tasks.push(planTask(plan,bird,addDaysISO(base,5),'08:00',`Tuần ${week}: ${daiMinutes?'dợt vừa sức':'nghỉ cội'}`,
        daiMinutes?`Dợt tối đa khoảng ${daiMinutes} phút, chọn vị trí dễ chịu. Mục tiêu là giữ tâm lý và bộ, không ép chim kiệt sức.`:'Chưa dợt. Chỉ quan sát phản ứng với nắng và vận động nhẹ trong tuần đầu.',theme));
    }else if(goal==='maintain_fire'){
      const load=maintainFireLoad(fd,week);
      tasks.push(planTask(plan,bird,addDaysISO(base,4),'08:00',`Tuần ${week}: giữ lực ${load.force} phút`,
        `Tập khoảng ${load.force} phút ở mức quen thuộc, không tăng tốc hoặc kéo dài chỉ vì chim đang căng. Dừng khi chim thở gấp, chậm cầu, xù hoặc hồi lâu.`,theme));
      tasks.push(planTask(plan,bird,addDaysISO(base,5),'08:00',`Tuần ${week}: dợt giữ lửa ${load.dai} phút`,
        `Dợt tối đa khoảng ${load.dai} phút. Mục tiêu: vào giàn nhanh, ra bọng và giữ bộ; không ép đến khi chim xuống lực. Nếu vừa thi hoặc vừa dợt dài, thay bằng nghỉ hoàn toàn.`,theme));
      tasks.push(planTask(plan,bird,addDaysISO(base,6),'07:00',`Tuần ${week}: ngày hồi bắt buộc`,
        'Nghỉ cội và lực. Giữ khẩu phần quen, quan sát phân, mức ăn, giọng sáng và thời gian hồi. Không tăng mồi để bù sau dợt.',theme));
    }else{
      tasks.push(planTask(plan,bird,addDaysISO(base,5),'08:00',`Tuần ${week}: ngày nghỉ dưỡng`,
        'Không ra cội và không ép lực. Giữ môi trường yên, vệ sinh sạch và quan sát tốc độ hoàn thiện lông.',theme));
    }

    tasks.push(planTask(plan,bird,addDaysISO(base,6),'16:30',`Tuần ${week}: tự đánh giá 5 câu hỏi`,
      goal==='maintain_fire'
        ? '1) Phân và mức ăn có giữ nguyên? 2) Bọng và bộ có đều? 3) Có móc đít/cắn lông/nhảy loạn? 4) Có chậm cầu hoặc đứng cóng? 5) Hồi sau dợt trong 24 giờ? Có từ 2 dấu hiệu xấu thì bấm “Báo bất thường”.'
        : '1) Ăn có bình thường? 2) Phân có xấu hơn? 3) Có xù/ho? 4) Lông tiến triển? 5) Hồi sau vận động trong 24 giờ? Nếu có từ 2 câu trả lời xấu, bấm “Báo bất thường”.',theme));
  }
  data.carePlans.push(plan); data.tasks.push(...tasks); saveData();
  showToast('Đã tạo giáo án có hướng dẫn từng việc.');
  openPlanDetail(plan.id);
}
function planAdjustmentForm(plan){
  return `<form id="plan-adjust-form" class="form-grid">
    <input type="hidden" name="planId" value="${plan.id}">
    <div class="notice">Chọn biểu hiện thực tế. Ứng dụng sẽ tạm dừng các việc gây tải trong 3 ngày và tạo lịch theo dõi.</div>
    <div class="field"><label>Tình trạng hiện tại</label><select name="issue">
      <option value="normal">Chim đã ổn định, tiếp tục giáo án</option>
      <option value="soft">Phân mềm/nát</option>
      <option value="watery">Phân nhiều nước</option>
      <option value="low">Giảm ăn</option>
      <option value="cough">Ho/khè</option>
      <option value="xu">Xù lông, ít vận động</option>
      <option value="leg">Đau chân/bám cầu kém</option>
      <option value="tail">Cắn đuôi/cắn cánh tăng</option>
      <option value="overfire">Dấu hiệu quá lửa/lửa ảo: móc đít, nhảy loạn, rít nhiều nhưng ít bọng</option>
      <option value="slowRecovery">Hồi chậm sau dợt hoặc thi</option>
      <option value="severe">Khó thở, nằm đáy hoặc mất thăng bằng</option>
    </select></div>
    <div class="field"><label>Ghi chú</label><textarea name="note" placeholder="Biểu hiện xuất hiện từ khi nào, sau tắm/đổi cám/dợt hay không..."></textarea></div>
    <button class="fab-action" type="submit">Điều chỉnh giáo án</button>
  </form>`;
}
function applyPlanAdjustment(fd){
  const plan=data.carePlans.find(p=>p.id===fd.planId); if(!plan)return;
  const bird=data.birds.find(b=>b.id===plan.birdId); if(!bird)return;
  plan.adjustments ||= [];
  plan.adjustments.push({id:uid(),date:new Date().toISOString(),issue:fd.issue,note:fd.note||''});
  if(fd.issue==='severe'){
    plan.status='review';
    saveData();
    openModal('Cần đánh giá sức khỏe sớm',`<div class="notice danger">Dừng các hoạt động nắng, tắm, lực và dợt. Giữ chim yên, tránh gió lùa và liên hệ người có chuyên môn thú y. Trợ lý không tự kê thuốc.</div>`);
    return;
  }
  if(fd.issue==='normal'){
    plan.status='active';
    data.tasks.filter(t=>t.planId===plan.id&&t.date>=todayISO()).forEach(t=>t.paused=false);
    saveData();closeModal();render();showToast('Đã tiếp tục giáo án.');
    return;
  }
  plan.status='review';
  const pauseUntil=addDaysISO(todayISO(),3);
  data.tasks.filter(t=>t.planId===plan.id&&t.date>=todayISO()&&t.date<=pauseUntil).forEach(t=>t.paused=true);
  const issueLabels={soft:'phân mềm/nát',watery:'phân nhiều nước',low:'giảm ăn',cough:'ho/khè',xu:'xù lông',leg:'đau chân',tail:'cắn lông tăng',overfire:'dấu hiệu quá lửa/lửa ảo',slowRecovery:'hồi chậm sau dợt'};
  for(let d=0;d<3;d++){
    data.tasks.push(planTask(plan,bird,addDaysISO(todayISO(),d),'06:30',`Theo dõi hồi phục ngày ${d+1}`,
      `Đang theo dõi ${issueLabels[fd.issue]||'bất thường'}. Giữ khẩu phần quen, không tăng tải; ghi phân, mức ăn, hô hấp và tư thế đứng cầu.`, 'Điều chỉnh giáo án'));
  }
  data.tasks.push(planTask(plan,bird,pauseUntil,'17:00','Đánh giá để tiếp tục hoặc dừng giáo án',
    'Nếu chim đã ăn và hoạt động bình thường, phân ổn định hơn, không ho/xù kéo dài thì mở giáo án và chọn “Chim đã ổn định”. Nếu chưa ổn, ghi vào sổ sức khỏe.', 'Điều chỉnh giáo án'));
  saveData();closeModal();render();showToast('Đã giảm tải và tạo lịch theo dõi 3 ngày.');
}
function beginnerHelpHtml(){
  return `<div class="card">
    <h3>5 nguyên tắc dành cho người mới</h3>
    <div class="data-row"><span>1</span><strong>Ổn định trước, tăng sau</strong></div>
    <p>Phân, mức ăn và tinh thần phải ổn trước khi tăng nắng, mồi hoặc vận động.</p>
    <div class="data-row"><span>2</span><strong>Mỗi lần chỉ đổi một yếu tố</strong></div>
    <p>Không đổi cám và tăng mồi trong cùng thời điểm vì sẽ không biết yếu tố nào làm chim xấu đi.</p>
    <div class="data-row"><span>3</span><strong>Thay lông không ép cội</strong></div>
    <p>Giai đoạn rụng mạnh và ra lông ống ưu tiên nghỉ, yên tĩnh và tiêu hóa ổn định.</p>
    <div class="data-row"><span>4</span><strong>Khô lông là một quá trình</strong></div>
    <p>Lông mọc đủ chưa có nghĩa chim đã sẵn sàng dợt căng.</p>
    <div class="data-row"><span>5</span><strong>Bất thường thì giảm tải</strong></div>
    <p>Phân nước, giảm ăn, ho, xù, đau chân hoặc cắn lông tăng là tín hiệu cần dừng tăng tải.</p>
    <div class="data-row"><span>6</span><strong>Đã đạt lửa thì không tiếp tục kích</strong></div>
    <p>Giữ lửa bằng nhịp ổn định, một buổi dợt chính và ngày hồi; không tăng đồng thời mồi, cám, nắng và lực.</p>
  </div>`;
}

function birdCycleForm(b){
  return `<form id="bird-cycle-form" class="form-grid">
    <input type="hidden" name="birdId" value="${b.id}">
    <div class="field"><label>Trạng thái tổng quát</label><select name="stage">
      ${['Dưỡng ổn định','Thay lông','Khô lông','Lên lửa','Đạt điểm rơi','Sau thi','Điều trị','Cách ly'].map(x=>`<option ${x===b.stage?'selected':''}>${x}</option>`).join('')}
    </select></div>
    <div class="form-row">
      <div class="field"><label>Ngày bắt đầu thay lông</label><input type="date" name="moltStartDate" value="${esc(b.moltStartDate||'')}"></div>
      <div class="field"><label>Giai đoạn lông</label><select name="moltStage">${cycleStageOptions(b.moltStage||'Chưa theo dõi')}</select></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Ngày xong lông</label><input type="date" name="moltCompleteDate" value="${esc(b.moltCompleteDate||'')}"></div>
      <div class="field"><label>Độ khô lông (%)</label><input type="number" min="0" max="100" name="featherDryPercent" value="${Number(b.featherDryPercent||0)}"></div>
    </div>
    <div class="field"><label>Ngày bắt đầu chăm lửa sau lông</label><input type="date" name="fireCareStartDate" value="${esc(b.fireCareStartDate||'')}"></div>
    <div class="field"><label>Ghi chú chu kỳ</label><textarea name="moltNotes" placeholder="Tình trạng lông ống, tuyết cánh, đuôi, phân và mức ăn...">${esc(b.moltNotes||'')}</textarea></div>
    <div class="notice">Ngày bắt đầu là mốc để ứng dụng tự tạo giáo án. Có thể cập nhật lại bất cứ lúc nào theo tiến độ thực tế của từng con.</div>
    <button class="fab-action" type="submit">Lưu chu kỳ lông</button>
  </form>`;
}

function removeExistingPlan(birdId,type){
  const existing=data.carePlans.filter(p=>p.birdId===birdId && p.type===type);
  if(!existing.length) return true;
  const label=type==='molt'?'thay lông':type==='guided'?'do Trợ lý người mới tạo':'chăm lửa sau lông';
  if(!confirm(`Chim đã có giáo án ${label}. Tạo lại sẽ xóa lịch cũ của giáo án này. Tiếp tục?`)) return false;
  const ids=new Set(existing.map(p=>p.id));
  data.tasks=data.tasks.filter(t=>!ids.has(t.planId));
  data.carePlans=data.carePlans.filter(p=>!ids.has(p.id));
  return true;
}

function planTask(plan,bird,date,time,title,note,phase){
  return {id:uid(),planId:plan.id,planType:plan.type,birdId:bird.id,date,time,title,note,phase,done:false};
}

function createMoltPlan(birdId){
  const bird=data.birds.find(b=>b.id===birdId); if(!bird)return;
  if(!bird.moltStartDate){
    showToast('Hãy nhập ngày bắt đầu thay lông trước.');
    return openModal(`Chu kỳ lông · ${bird.name}`,birdCycleForm(bird));
  }
  if(!removeExistingPlan(birdId,'molt'))return;

  const phases=[
    {from:1,to:2,name:'Bắt đầu rụng lông',note:'Giữ cám quen và nhịp sinh hoạt ổn định; hạn chế cội, lồng lực và mọi thay đổi mạnh.'},
    {from:3,to:5,name:'Rụng lông mạnh',note:'Ưu tiên nghỉ, môi trường yên; theo dõi phân, mức ăn và tốc độ rụng lông. Không ép lửa.'},
    {from:6,to:8,name:'Ra lông ống',note:'Duy trì dinh dưỡng quen thuộc; mồi tươi và trái cây điều chỉnh theo cơ địa, không tăng đồng thời nhiều yếu tố.'},
    {from:9,to:10,name:'Hoàn thiện lông',note:'Nắng nhẹ và tắm phù hợp thời tiết; chỉ vận động rất nhẹ khi chim khỏe, phân ổn định.'},
    {from:11,to:12,name:'Khô lông',note:'Cập nhật phần trăm khô lông mỗi tuần; chưa dợt căng khi lông chưa khô và chim chưa hồi nền.'}
  ];
  const plan={id:uid(),birdId,type:'molt',name:'Giáo án thay lông 12 tuần',startDate:bird.moltStartDate,endDate:addDaysISO(bird.moltStartDate,83),createdAt:new Date().toISOString(),status:'active',phases};
  const tasks=[];
  for(let week=1;week<=12;week++){
    const phase=phases.find(p=>week>=p.from&&week<=p.to);
    const base=addDaysISO(plan.startDate,(week-1)*7);
    const prefix=`Tuần ${week} · ${phase.name}`;
    tasks.push(planTask(plan,bird,base,'06:30',`${prefix}: đánh giá đầu tuần`,`${phase.note} Ghi nhận phân, lượng ăn, lông rụng và biểu hiện xù/ngủ ngày.`,phase.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,2),'07:00',`${prefix}: nắng nhẹ`,`Phơi nắng nhẹ theo thời tiết, tránh nắng gắt và gió lùa. Dừng nếu chim há mỏ, xù hoặc mệt.`,phase.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,4),'14:30',`${prefix}: tắm và vệ sinh`,`Tắm nước khi nhiệt độ phù hợp; để khô lông hoàn toàn, vệ sinh lồng/cóng và theo dõi ho sau tắm.`,phase.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,6),'16:30',`${prefix}: tổng kết`,`Cập nhật giai đoạn lông, phần trăm khô lông và ghi chú phản ứng với khẩu phần trong tuần.`,phase.name));
  }
  data.carePlans.push(plan); data.tasks.push(...tasks); saveData();
  showToast('Đã tạo giáo án thay lông 12 tuần.');
  openPlanDetail(plan.id);
}

function createFirePlan(birdId){
  const bird=data.birds.find(b=>b.id===birdId); if(!bird)return;
  const start=bird.fireCareStartDate||bird.moltCompleteDate;
  if(!start){
    showToast('Hãy nhập ngày xong lông hoặc ngày bắt đầu chăm lửa.');
    return openModal(`Chu kỳ lông · ${bird.name}`,birdCycleForm(bird));
  }
  if(Number(bird.featherDryPercent||0)<70 && !confirm('Độ khô lông đang dưới 70%. Chỉ nên tạo kế hoạch để tham khảo và chưa tăng tải cho đến khi chim ổn định. Tiếp tục?'))return;
  if(!removeExistingPlan(birdId,'post_molt_fire'))return;

  const weeks=[
    {name:'Hồi nền sau lông',force:'Lồng lực rất nhẹ 10–15 phút hoặc vận động tự nhiên.',dai:'Không dợt căng; có thể treo xa cội ngắn nếu chim hoàn toàn ổn định.',note:'Giữ cám quen, ổn định tiêu hóa và giấc ngủ.'},
    {name:'Củng cố thể lực',force:'Lồng lực nhẹ 15–20 phút, 1–2 buổi tùy sức.',dai:'Làm quen cội 15–20 phút, treo vị trí dễ chịu.',note:'Chỉ tăng một yếu tố mỗi lần; theo dõi hồi phục trong 24 giờ.'},
    {name:'Vào lửa nhẹ',force:'Lồng lực 20–25 phút, có ngày nghỉ xen kẽ.',dai:'Dợt vừa sức 20–30 phút; dừng khi chậm cầu, xù hoặc bỏ đấu.',note:'Giữ khẩu phần ổn định, tránh đổi cám hoặc tăng mồi đột ngột.'},
    {name:'Củng cố lửa',force:'Lồng lực 25–30 phút nếu chim hồi tốt.',dai:'Dợt 30–45 phút, ưu tiên giữ bộ và tâm lý hơn ép thời gian.',note:'Đánh giá bọng, sàn cầu, phân và thời gian hồi sau cội.'},
    {name:'Xây độ bền',force:'Hai buổi lực vừa, cách nhau ít nhất một ngày nghỉ.',dai:'Dợt 45–60 phút nếu các tuần trước hồi tốt.',note:'Không tăng tải khi phân xấu, giảm ăn, ho, đau chân hoặc xù lông.'},
    {name:'Chốt điểm rơi',force:'Giảm khối lượng, giữ nhịp vận động quen thuộc.',dai:'Một buổi kiểm tra ngắn 20–30 phút; không dợt sát ngày mục tiêu.',note:'Không đổi cám, không thử thuốc/vitamin/mồi mới; ưu tiên ngủ và hồi phục.'}
  ];
  const plan={id:uid(),birdId,type:'post_molt_fire',name:'Giáo án chăm lửa sau lông 6 tuần',startDate:start,endDate:addDaysISO(start,41),createdAt:new Date().toISOString(),status:'active',phases:weeks.map((w,i)=>({from:i+1,to:i+1,name:w.name,note:w.note}))};
  const tasks=[];
  weeks.forEach((w,index)=>{
    const week=index+1, base=addDaysISO(start,index*7), prefix=`Tuần ${week} · ${w.name}`;
    tasks.push(planTask(plan,bird,base,'06:30',`${prefix}: kiểm tra nền`,`${w.note} Ghi phân, mức ăn, giọng sáng, bộ lông và tinh thần.`,w.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,1),'07:00',`${prefix}: nắng sáng`,`Nắng nhẹ theo thời tiết; tăng dần rất chậm, không ép khi chim đang yếu hoặc hô hấp bất thường.`,w.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,3),'08:00',`${prefix}: tập lực`,w.force,w.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,5),'08:00',`${prefix}: dợt thứ Bảy`,w.dai,w.name));
    tasks.push(planTask(plan,bird,addDaysISO(base,6),'16:30',`${prefix}: đánh giá hồi phục`,`So sánh trước/sau dợt: phân, ăn, xù lông, giọng, bộ chơi và thời gian hồi. Chỉ tăng tuần kế tiếp nếu hồi tốt.`,w.name));
  });
  data.carePlans.push(plan); data.tasks.push(...tasks); saveData();
  showToast('Đã tạo giáo án chăm lửa sau lông 6 tuần.');
  openPlanDetail(plan.id);
}

function openBirdPlans(birdId){
  const bird=data.birds.find(b=>b.id===birdId); if(!bird)return;
  const plans=data.carePlans.filter(p=>p.birdId===birdId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  openModal(`Giáo án · ${bird.name}`,plans.length?`<div class="list">${plans.map(p=>{
    const count=data.tasks.filter(t=>t.planId===p.id).length;
    return `<div class="list-item"><div class="avatar">${p.type==='molt'?'🪶':p.type==='guided'?'🧭':'🔥'}</div><div class="grow"><h3>${esc(p.name)}</h3><p><span class="badge ${planTypeClass(p.type,p.subtype)}">${esc(planTypeLabel(p.type,p.subtype))}</span> ${formatDate(p.startDate)} → ${formatDate(p.endDate)} · ${count} công việc</p></div><button class="secondary-btn" data-plan-open="${p.id}">Xem</button></div>`;
  }).join('')}</div>`:`<div class="empty">Chưa có giáo án cho chim này.</div>`);
}

function openPlanDetail(planId){
  const plan=data.carePlans.find(p=>p.id===planId); if(!plan)return;
  const bird=data.birds.find(b=>b.id===plan.birdId);
  const tasks=data.tasks.filter(t=>t.planId===planId).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const upcoming=tasks.filter(t=>t.date>=todayISO()).slice(0,12);
  openModal(plan.name,`
    <div class="card">
      <div class="data-row"><span>Chim</span><strong>${esc(bird?.name||'')}</strong></div>
      <div class="data-row"><span>Loại giáo án</span><strong><span class="badge ${planTypeClass(plan.type,plan.subtype)}">${esc(planTypeLabel(plan.type,plan.subtype))}</span></strong></div>
      <div class="data-row"><span>Trạng thái</span><strong>${plan.status==='review'?'Cần đánh giá lại':'Đang thực hiện'}</strong></div>
      <div class="data-row"><span>Thời gian</span><strong>${formatDate(plan.startDate)} → ${formatDate(plan.endDate)}</strong></div>
      <div class="data-row"><span>Tổng công việc</span><strong>${tasks.length}</strong></div>
    </div>
    ${plan.summary?`<section class="section"><div class="notice"><strong>Mục tiêu dễ hiểu:</strong><br>${esc(plan.summary)}</div></section>`:''}
    ${plan.rules?.length?`<section class="section"><div class="section-heading"><h2>Quy tắc an toàn</h2></div><div class="card">${plan.rules.map((r,i)=>`<p style="margin:${i?'10px':'0'} 0 0"><strong>${i+1}.</strong> ${esc(r)}</p>`).join('')}</div></section>`:''}
    <section class="section"><div class="section-heading"><h2>Các giai đoạn</h2></div>
      <div class="list">${(plan.phases||[]).map(p=>`<div class="list-item"><div class="avatar">▣</div><div class="grow"><h3>${esc(p.name)}</h3><p>${esc(p.note||'')}</p></div></div>`).join('')}</div>
    </section>
    <section class="section"><div class="section-heading"><h2>Lịch sắp tới</h2></div>
      <div class="list">${upcoming.length?upcoming.map(taskHtml).join(''):`<div class="empty">Không còn công việc sắp tới.</div>`}</div>
    </section>
    <div class="button-row section">
      <button class="secondary-btn" data-plan-schedule>Đến lịch chăm</button>
      ${plan.beginner?`<button class="secondary-btn" data-adjust-plan="${plan.id}">Báo bất thường</button><button class="secondary-btn" data-beginner-help>Giải thích cho người mới</button>`:''}
      <button class="danger-btn" data-plan-delete="${plan.id}">Xóa giáo án</button>
    </div>
  `);
}

function openBirdDetail(id){
  const b=data.birds.find(x=>x.id===id); if(!b) return;
  const perf=data.performances.filter(x=>x.birdId===id).sort((a,b)=>a.date.localeCompare(b.date));
  const latest=perf.at(-1);
  const planCount=data.carePlans.filter(p=>p.birdId===id).length;
  openModal(b.name,`
    <div class="card"><div class="list-item" style="border:0;padding:0"><div class="avatar">🪶</div><div class="grow"><h3>${esc(b.name)}</h3><p>${esc(b.origin)} · ${esc(b.ageGroup)}</p>${statusBadge(b.stage)}</div><strong class="score">${latest?latest.total.toFixed(1):'–'}</strong></div></div>
    <section class="section"><div class="card">
      <div class="data-row"><span>Lối chơi</span><strong>${esc(b.style||'Chưa cập nhật')}</strong></div>
      <div class="data-row"><span>Thành tích</span><strong>${esc(b.achievements||'Chưa có')}</strong></div>
    </div></section>
    <section class="section"><div class="section-heading"><h2>Chu kỳ lông và lửa</h2><span class="badge warning">${planCount} giáo án</span></div>
      <div class="card">
        <div class="data-row"><span>Ngày bắt đầu thay lông</span><strong>${formatDate(b.moltStartDate)}</strong></div>
        <div class="data-row"><span>Giai đoạn lông</span><strong>${esc(b.moltStage||'Chưa theo dõi')}</strong></div>
        <div class="data-row"><span>Ngày xong lông</span><strong>${formatDate(b.moltCompleteDate)}</strong></div>
        <div class="data-row"><span>Độ khô lông</span><strong>${Number(b.featherDryPercent||0)}%</strong></div>
        <div class="data-row"><span>Bắt đầu chăm lửa</span><strong>${formatDate(b.fireCareStartDate)}</strong></div>
        <div class="data-row"><span>Ghi chú</span><strong>${esc(b.moltNotes||'Chưa có')}</strong></div>
      </div>
      <div class="grid-2 section">
        <button class="secondary-btn" data-bird-cycle="${b.id}">Cập nhật chu kỳ</button>
        <button class="secondary-btn" data-bird-plans="${b.id}">Xem giáo án</button>
        <button class="secondary-btn" data-generate-molt="${b.id}">Tạo giáo án thay lông</button>
        <button class="secondary-btn" data-generate-fire="${b.id}">Chăm lửa sau lông</button>
      </div>
      <div class="grid-2" style="margin-top:10px">
        <button class="fab-action" style="width:100%" data-guided-bird="${b.id}">🧭 Trợ lý giáo án</button>
        <button class="fab-action" style="width:100%" data-maintain-fire="${b.id}">🔥 Giữ lửa ổn định</button>
      </div>
    </section>
    <section class="section"><div class="section-heading"><h2>Biểu đồ phong độ</h2></div><div class="card chart-wrap"><canvas id="performance-chart"></canvas></div></section>
    <section class="section"><div class="button-row"><button class="secondary-btn" data-add-performance-bird="${b.id}">Chấm phong độ</button><button class="danger-btn" data-delete-bird="${b.id}">Xóa hồ sơ</button></div></section>
  `);
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
  if(action==='add-bird'){ if(!canAddBird()) return openModal('Đã đạt giới hạn gói',`<div class="notice">Gói <strong>${esc(getEffectivePlan().toUpperCase())}</strong> chỉ cho phép tối đa <strong>${getBirdLimit()}</strong> hồ sơ chim. Hãy xóa hồ sơ không dùng hoặc liên hệ quản trị viên để nâng gói.</div>`); openModal('Thêm hồ sơ chim',birdForm()); }
  if(action==='add-task') openModal('Thêm lịch chăm',taskForm());
  if(action==='add-performance') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Chấm phong độ tuần',performanceForm()); }
  if(action==='add-health') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Nhật ký sức khỏe',healthForm()); }
  if(action==='add-nutrition') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Nhật ký dinh dưỡng',simpleLogForm('nutrition')); }
  if(action==='add-training') { if(!data.birds.length) return showToast('Hãy thêm hồ sơ chim trước.'); openModal('Nhật ký tập luyện',simpleLogForm('training')); }
  if(action==='guided-plan-builder') {
    if(!data.birds.length) return openModal('Trợ lý xây giáo án','<div class="empty">Hãy tạo ít nhất một hồ sơ chim trước.</div>');
    openModal('Trợ lý xây giáo án cho người mới',guidedPlanWizardForm());
  }
  if(action==='save-session') saveTournamentSession();
  if(action==='session-history') showSessionHistory();
  if(action==='export-data') exportData();
  if(action==='import-data') importData();
  if(action==='reset-data') resetData();
  if(action==='enable-notifications') enableNotifications();
  if(action==='account') openModal('Tài khoản cloud',accountHtml());
  if(action==='admin-dashboard') openAdminDashboard();
  if(action==='admin-users') openAdminUsers();
  if(action==='admin-create-user') openModal('Tạo tài khoản mới',adminCreateUserForm());
  if(action==='admin-audit') openAdminAuditLogs();
  if(action==='check-update') checkForAppUpdate(false);
  if(action==='logout') window.CMCSCloud.signOut().catch(error=>showToast(error.message));
  if(action==='force-sync'){
    window.CMCSCloud.forceSync(data)
      .then(result=>{
        if(result?.data) data=result.data;
        const message=result?.direction==='upload'
          ? 'Đã gửi dữ liệu thiết bị lên cloud.'
          : result?.direction==='download'
            ? 'Đã nhận dữ liệu mới từ cloud.'
            : 'Dữ liệu thiết bị và cloud đã giống nhau.';
        showToast(message);
        render();
      })
      .catch(error=>showToast(error.message));
  }
  if(action==='push-cloud'){
    window.CMCSCloud.pushToCloud(data)
      .then(result=>{
        if(result?.data) data=result.data;
        showToast('Đã gửi và kiểm tra dữ liệu trên cloud.');
        render();
      })
      .catch(error=>showToast(error.message));
  }
  if(action==='pull-cloud'){
    if(!confirm('Nhận dữ liệu từ cloud sẽ thay dữ liệu hiện có trên thiết bị. Tiếp tục?')) return;
    window.CMCSCloud.pullFromCloud(DEFAULT_DATA)
      .then(result=>{
        if(result?.data) data=result.data;
        showToast('Đã nhận dữ liệu mới từ cloud.');
        render();
      })
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
  const taskToggle=e.target.closest('[data-task-toggle]'); if(taskToggle){ const t=data.tasks.find(x=>x.id===taskToggle.dataset.taskToggle); if(t){ if(t.paused)return showToast('Công việc đang tạm dừng do giáo án cần đánh giá lại.'); t.done=!t.done;saveData();render();} }
  const taskDelete=e.target.closest('[data-task-delete]'); if(taskDelete){ if(confirm('Xóa công việc này?')){data.tasks=data.tasks.filter(x=>x.id!==taskDelete.dataset.taskDelete);saveData();render();} }
  const bird=e.target.closest('[data-bird-open]'); if(bird) openBirdDetail(bird.dataset.birdOpen);
  const counter=e.target.closest('[data-counter]'); if(counter){ counters[counter.dataset.counter]++; if(navigator.vibrate) navigator.vibrate(25); renderTournament(); }
  if(e.target.closest('[data-counter-reset]')){ counters={sanCau:0,che:0,bungCanh:0,raBong:0,loi:0};renderTournament(); }
  const heat=e.target.closest('[data-heat]'); if(heat){ timerState.heatMinutes=Number(heat.dataset.heat);renderTournament(); }
  const timer=e.target.closest('[data-timer]'); if(timer){ if(timer.dataset.timer==='toggle'){timerState.running?stopTimer():startTimer();renderTournament();} else {stopTimer();timerState.seconds=0;renderTournament();} }
});

modalBody.addEventListener('input',e=>{ if(e.target.matches('[data-score-label]')) $('#'+e.target.dataset.scoreLabel).textContent=e.target.value; });
modalBody.addEventListener('click',e=>{
  const del=e.target.closest('[data-delete-bird]'); if(del&&confirm('Xóa hồ sơ chim và toàn bộ lịch/giáo án liên quan?')){
    const id=del.dataset.deleteBird;
    const planIds=new Set(data.carePlans.filter(p=>p.birdId===id).map(p=>p.id));
    data.birds=data.birds.filter(x=>x.id!==id);
    data.performances=data.performances.filter(x=>x.birdId!==id);
    data.healthLogs=data.healthLogs.filter(x=>x.birdId!==id);
    data.nutritionLogs=data.nutritionLogs.filter(x=>x.birdId!==id);
    data.trainingLogs=data.trainingLogs.filter(x=>x.birdId!==id);
    data.tasks=data.tasks.filter(x=>x.birdId!==id && !planIds.has(x.planId));
    data.carePlans=data.carePlans.filter(x=>x.birdId!==id);
    saveData();closeModal();render();
  }
  const perf=e.target.closest('[data-add-performance-bird]'); if(perf){ openModal('Chấm phong độ tuần',performanceForm().replace(`value="${perf.dataset.addPerformanceBird}"`,`value="${perf.dataset.addPerformanceBird}" selected`)); }
  const cycle=e.target.closest('[data-bird-cycle]'); if(cycle){ const bird=data.birds.find(b=>b.id===cycle.dataset.birdCycle); if(bird)openModal(`Chu kỳ lông · ${bird.name}`,birdCycleForm(bird)); }
  const guidedBird=e.target.closest('[data-guided-bird]'); if(guidedBird)openModal('Trợ lý xây giáo án cho người mới',guidedPlanWizardForm(guidedBird.dataset.guidedBird));
  const maintainFire=e.target.closest('[data-maintain-fire]'); if(maintainFire)openModal('Giáo án giữ lửa ổn định',guidedPlanWizardForm(maintainFire.dataset.maintainFire,'maintain_fire'));
  const adjustPlan=e.target.closest('[data-adjust-plan]'); if(adjustPlan){ const plan=data.carePlans.find(p=>p.id===adjustPlan.dataset.adjustPlan); if(plan)openModal('Điều chỉnh giáo án',planAdjustmentForm(plan)); }
  if(e.target.closest('[data-beginner-help]'))openModal('Giải thích cho người mới',beginnerHelpHtml());
  const molt=e.target.closest('[data-generate-molt]'); if(molt)createMoltPlan(molt.dataset.generateMolt);
  const fire=e.target.closest('[data-generate-fire]'); if(fire)createFirePlan(fire.dataset.generateFire);
  const plans=e.target.closest('[data-bird-plans]'); if(plans)openBirdPlans(plans.dataset.birdPlans);
  const planOpen=e.target.closest('[data-plan-open]'); if(planOpen)openPlanDetail(planOpen.dataset.planOpen);
  const planDelete=e.target.closest('[data-plan-delete]'); if(planDelete&&confirm('Xóa giáo án và toàn bộ lịch do giáo án tạo ra?')){
    const id=planDelete.dataset.planDelete;
    data.tasks=data.tasks.filter(t=>t.planId!==id);
    data.carePlans=data.carePlans.filter(p=>p.id!==id);
    saveData();closeModal();render();showToast('Đã xóa giáo án.');
  }
  if(e.target.closest('[data-plan-schedule]')){ closeModal();setView('schedule'); }
  const adminEdit=e.target.closest('[data-admin-edit]'); if(adminEdit){ const user=adminUsersCache.find(x=>x.id===adminEdit.dataset.adminEdit); if(user)openModal('Cập nhật tài khoản',adminEditForm(user)); }
  const adminReset=e.target.closest('[data-admin-reset]'); if(adminReset&&confirm(`Gửi email đặt lại mật khẩu tới ${adminReset.dataset.adminReset}?`)){ window.CMCSCloud.sendPasswordReset(adminReset.dataset.adminReset).then(()=>showToast('Đã gửi email đặt lại mật khẩu.')).catch(error=>showToast(error.message)); }
});
modalBody.addEventListener('submit',async e=>{
  e.preventDefault(); const fd=Object.fromEntries(new FormData(e.target).entries());
  if(e.target.id==='admin-user-search-form'){
    await openAdminUsers({search:fd.search,status:fd.status,plan:fd.plan});
    return;
  }
  if(e.target.id==='admin-create-user-form'){
    try{
      const created=await window.CMCSCloud.createAdminUser(fd);
      showToast(`Đã tạo tài khoản ${created.email||fd.email}.`);
      await openAdminUsers({search:fd.email});
    }catch(error){ showToast(error.message); }
    return;
  }
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
      await window.CMCSCloud.updateUser(fd.userId,{status:fd.status,plan:fd.plan,role:fd.role,plan_expires_at:fd.plan_expires_at,reason:fd.reason});
      showToast('Đã cập nhật tài khoản.');
      await openAdminUsers();
    }catch(error){ showToast(error.message); }
    return;
  }
  if(e.target.id==='guided-plan-form'){
    createGuidedPlan(fd);
    return;
  }
  if(e.target.id==='plan-adjust-form'){
    applyPlanAdjustment(fd);
    return;
  }
  if(e.target.id==='bird-cycle-form'){
    const bird=data.birds.find(b=>b.id===fd.birdId); if(!bird)return;
    bird.stage=fd.stage;
    bird.moltStartDate=fd.moltStartDate||'';
    bird.moltStage=fd.moltStage||'Chưa theo dõi';
    bird.moltCompleteDate=fd.moltCompleteDate||'';
    bird.featherDryPercent=Math.max(0,Math.min(100,Number(fd.featherDryPercent||0)));
    bird.fireCareStartDate=fd.fireCareStartDate||'';
    bird.moltNotes=fd.moltNotes||'';
    saveData();closeModal();render();showToast('Đã cập nhật chu kỳ lông và lửa.');
    return;
  }
  if(e.target.id==='bird-form'){ if(!canAddBird()) return showToast(`Đã đạt giới hạn ${getBirdLimit()} chim của gói ${getEffectivePlan().toUpperCase()}.`); data.birds.push({id:uid(),...fd,featherDryPercent:Math.max(0,Math.min(100,Number(fd.featherDryPercent||0))),createdAt:new Date().toISOString()}); saveData(); closeModal(); setView('birds'); showToast('Đã thêm hồ sơ chim.'); }
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
$('#quick-add-btn').addEventListener('click',()=>openModal('Thêm nhanh',`<div class="grid-2"><button class="card" data-action="add-bird">🪶<h3>Hồ sơ chim</h3></button><button class="card" data-action="guided-plan-builder">🧭<h3>Trợ lý giáo án</h3></button><button class="card" data-action="add-task">▣<h3>Lịch chăm</h3></button><button class="card" data-action="add-health">🩺<h3>Sức khỏe</h3></button></div>`));
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
setupServiceWorker();


function showUpdateBanner(message='Đã có phiên bản ứng dụng mới.'){
  if(!updateBanner)return;
  updateBannerText.textContent=message;
  updateBanner.classList.remove('hidden');
}
function hideUpdateBanner(){ updateBanner?.classList.add('hidden'); }
async function checkForAppUpdate(silent=false){
  try{
    const latest=await window.CMCSCloud.getLatestRelease();
    if(latest&&isNewerVersion(latest.version,APP_VERSION)){
      showUpdateBanner(`${latest.title} · Phiên bản ${latest.version}`);
    }
    if(serviceWorkerRegistration){
      await serviceWorkerRegistration.update();
      if(serviceWorkerRegistration.waiting) showUpdateBanner('Bản cập nhật đã sẵn sàng để cài.');
    }
    if(!silent&&!latest?.version) showToast('Không đọc được thông tin phiên bản từ Supabase.');
    else if(!silent&&!isNewerVersion(latest?.version,APP_VERSION)&&!serviceWorkerRegistration?.waiting) showToast(`Anh đang dùng phiên bản mới nhất ${APP_VERSION}.`);
  }catch(error){ if(!silent)showToast(error.message); }
}
function installWaitingServiceWorker(){
  if(serviceWorkerRegistration?.waiting) serviceWorkerRegistration.waiting.postMessage({type:'SKIP_WAITING'});
  else location.reload();
}
function setupServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  window.addEventListener('load',async()=>{
    try{
      serviceWorkerRegistration=await navigator.serviceWorker.register('./sw.js');
      if(serviceWorkerRegistration.waiting) showUpdateBanner('Bản cập nhật đã sẵn sàng để cài.');
      serviceWorkerRegistration.addEventListener('updatefound',()=>{
        const worker=serviceWorkerRegistration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller) showUpdateBanner('Đã tải xong phiên bản mới.');
        });
      });
    }catch(error){ console.warn('Không đăng ký được Service Worker:',error); }
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshingForUpdate)return;
    refreshingForUpdate=true;
    location.reload();
  });
}
updateNowBtn?.addEventListener('click',installWaitingServiceWorker);
$('#update-later-btn')?.addEventListener('click',hideUpdateBanner);

setInterval(checkDueTasks, 30000);
checkDueTasks();
setLoading(true);
window.CMCSCloud.init({defaultData:DEFAULT_DATA,onAuthChange:handleCloudAuthEvent,onSyncChange:handleSyncChange})
  .catch(error=>showAuthScreen(error.message));
