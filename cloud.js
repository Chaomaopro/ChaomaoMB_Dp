(function () {
  'use strict';

  const LEGACY_STORE_KEY = 'cmcs-pro-data-v1';
  const LOCAL_PREFIX = 'cmcs-pro-cloud-v2:';
  const PROFILE_PREFIX = 'cmcs-profile-cloud-v2:';
  const EMPTY_ARRAY_FIELDS = [
    'birds', 'tasks', 'performances', 'healthLogs',
    'nutritionLogs', 'trainingLogs', 'tournamentSessions', 'carePlans'
  ];

  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let saveTimer = null;
  let syncListener = () => {};
  let authListener = () => {};
  let lastCloudUpdatedAt = null;
  let appDefaultData = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function isConfigured() {
    const cfg = window.CMCS_CONFIG || {};
    return Boolean(
      cfg.supabaseUrl &&
      cfg.supabaseKey &&
      !cfg.supabaseUrl.includes('YOUR_PROJECT_REF') &&
      !cfg.supabaseKey.includes('REPLACE_ME')
    );
  }

  function getConfig() {
    return window.CMCS_CONFIG || {};
  }

  function getLocalKey(userId) {
    return `${LOCAL_PREFIX}${userId}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeDefault(defaultData, candidate) {
    const value = candidate && typeof candidate === 'object' ? candidate : {};
    const result = { ...clone(defaultData), ...value };
    EMPTY_ARRAY_FIELDS.forEach((field) => {
      if (!Array.isArray(result[field])) result[field] = [];
    });
    result.profile = { ...clone(defaultData.profile || {}), ...(value.profile || {}) };
    return result;
  }

  function isMeaningfulData(value) {
    if (!value || typeof value !== 'object') return false;
    return EMPTY_ARRAY_FIELDS.some((field) => Array.isArray(value[field]) && value[field].length > 0);
  }

  function readEnvelope(userId) {
    if (!userId) return null;
    try {
      return JSON.parse(localStorage.getItem(getLocalKey(userId)) || 'null');
    } catch {
      return null;
    }
  }

  function writeEnvelope(userId, data, options = {}) {
    if (!userId) return;
    const existing = readEnvelope(userId) || {};
    const envelope = {
      data,
      updatedAt: options.updatedAt || nowIso(),
      dirty: options.dirty ?? existing.dirty ?? false
    };
    localStorage.setItem(getLocalKey(userId), JSON.stringify(envelope));
  }

  function readLegacyData() {
    try {
      if (localStorage.getItem(`${LEGACY_STORE_KEY}-migrated`)) return null;
      return JSON.parse(localStorage.getItem(LEGACY_STORE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setSyncState(state, message) {
    syncListener({ state, message, at: nowIso() });
  }

  async function createClient() {
    if (!isConfigured()) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Không tải được thư viện Supabase. Hãy kiểm tra kết nối mạng rồi tải lại trang.');
    }
    if (!client) {
      const cfg = getConfig();
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return client;
  }

  function readCachedProfile(userId) {
    try { return JSON.parse(localStorage.getItem(`${PROFILE_PREFIX}${userId}`) || 'null'); }
    catch { return null; }
  }

  function writeCachedProfile(profile) {
    if (profile?.id) localStorage.setItem(`${PROFILE_PREFIX}${profile.id}`, JSON.stringify(profile));
  }

  async function fetchProfile(userId) {
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id,email,full_name,phone,role,status,plan,plan_expires_at,created_at,last_seen_at,created_by')
        .eq('id', userId)
        .single();
      if (error) throw error;
      writeCachedProfile(data);
      return data;
    } catch (error) {
      const cached = readCachedProfile(userId);
      if (cached) {
        setSyncState('offline', 'Ngoại tuyến – đang dùng hồ sơ đã lưu');
        return cached;
      }
      throw error;
    }
  }

  async function fetchCloudRecord(userId) {
    const { data, error } = await client
      .from('user_data')
      .select('data,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function upsertCloudData(userId, appData) {
    const { data, error } = await client
      .from('user_data')
      .upsert({ user_id: userId, data: appData }, { onConflict: 'user_id' })
      .select('updated_at')
      .single();
    if (error) throw error;
    lastCloudUpdatedAt = data.updated_at;
    writeEnvelope(userId, appData, { dirty: false, updatedAt: data.updated_at });
    setSyncState('synced', 'Đã đồng bộ lên Supabase');
    return data.updated_at;
  }

  async function resolveInitialData(defaultData) {
    const userId = currentUser.id;
    const local = readEnvelope(userId);
    let cloud = null;
    try {
      cloud = await fetchCloudRecord(userId);
    } catch (error) {
      if (local?.data) {
        setSyncState('offline', 'Ngoại tuyến – dữ liệu được lấy từ máy');
        return mergeDefault(defaultData, local.data);
      }
      throw error;
    }
    const cloudData = cloud?.data;
    const legacyData = readLegacyData();

    lastCloudUpdatedAt = cloud?.updated_at || null;

    if (local?.dirty && local?.data) {
      const localTime = Date.parse(local.updatedAt || 0);
      const cloudTime = Date.parse(cloud?.updated_at || 0);
      if (!cloud || localTime >= cloudTime) {
        const merged = mergeDefault(defaultData, local.data);
        await upsertCloudData(userId, merged);
        return merged;
      }
    }

    if (isMeaningfulData(cloudData)) {
      const merged = mergeDefault(defaultData, cloudData);
      writeEnvelope(userId, merged, { dirty: false, updatedAt: cloud.updated_at });
      setSyncState('synced', 'Đã tải dữ liệu từ Supabase');
      return merged;
    }

    if (local?.data && isMeaningfulData(local.data)) {
      const merged = mergeDefault(defaultData, local.data);
      await upsertCloudData(userId, merged);
      return merged;
    }

    if (legacyData && isMeaningfulData(legacyData)) {
      const merged = mergeDefault(defaultData, legacyData);
      await upsertCloudData(userId, merged);
      localStorage.setItem(`${LEGACY_STORE_KEY}-migrated`, nowIso());
      setSyncState('synced', 'Đã chuyển dữ liệu bản cũ lên tài khoản cloud');
      return merged;
    }

    const fresh = mergeDefault(defaultData, cloudData || {});
    await upsertCloudData(userId, fresh);
    return fresh;
  }

  async function completeSignIn(user, defaultData) {
    currentUser = user;
    currentProfile = await fetchProfile(user.id);

    if (currentProfile.status !== 'active') {
      const status = currentProfile.status;
      await client.auth.signOut();
      currentUser = null;
      currentProfile = null;
      throw new Error(status === 'locked'
        ? 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên.'
        : 'Tài khoản hiện không hoạt động.');
    }

    try {
      await client.rpc('touch_last_seen');
    } catch (error) {
      console.warn('Không cập nhật được thời gian hoạt động:', error.message);
    }

    const appData = await resolveInitialData(defaultData);
    return { user: currentUser, profile: currentProfile, data: appData };
  }

  async function init({ defaultData, onAuthChange, onSyncChange }) {
    appDefaultData = defaultData;
    authListener = onAuthChange || (() => {});
    syncListener = onSyncChange || (() => {});

    if (!isConfigured()) {
      authListener({ type: 'setup_required' });
      return;
    }

    await createClient();
    const { data: sessionData, error } = await client.auth.getSession();
    if (error) throw error;

    if (sessionData.session?.user) {
      try {
        const payload = await completeSignIn(sessionData.session.user, defaultData);
        authListener({ type: 'signed_in', ...payload });
      } catch (signInError) {
        authListener({ type: 'auth_error', error: signInError });
      }
    } else {
      authListener({ type: 'signed_out' });
    }

    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentProfile = null;
        authListener({ type: 'signed_out' });
        return;
      }

      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        currentUser = session.user;
        authListener({ type: 'password_recovery', user: session.user });
        return;
      }

    });
  }

  async function signUp(email, password, fullName) {
    await createClient();
    const redirectTo = `${location.origin}${location.pathname}`;
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName.trim() }
      }
    });
    if (error) throw error;
    if (data.session?.user) {
      const payload = await completeSignIn(data.session.user, appDefaultData);
      return { ...data, payload };
    }
    return data;
  }

  async function signIn(email, password) {
    await createClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) throw error;
    if (!data.user) throw new Error('Không nhận được thông tin tài khoản.');
    return completeSignIn(data.user, appDefaultData);
  }

  async function resetPassword(email) {
    await createClient();
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(password) {
    await createClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }

  async function signOut() {
    if (!client) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  function save(appData) {
    if (!currentUser) return;
    const snapshot = clone(appData);
    writeEnvelope(currentUser.id, snapshot, { dirty: true, updatedAt: nowIso() });
    setSyncState(
      navigator.onLine ? 'syncing' : 'offline',
      navigator.onLine ? 'Đang lưu thay đổi lên cloud…' : 'Đã lưu trên máy, chờ có mạng'
    );

    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!navigator.onLine || !currentUser) return;
      try {
        await upsertCloudData(currentUser.id, snapshot);
      } catch (error) {
        console.error(error);
        setSyncState('error', `Lỗi đồng bộ: ${error.message}`);
      }
    }, 650);
  }

  async function pushToCloud(appData) {
    if (!currentUser) throw new Error('Chưa đăng nhập.');
    if (!navigator.onLine) throw new Error('Thiết bị đang ngoại tuyến.');

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const snapshot = clone(appData);
    writeEnvelope(currentUser.id, snapshot, { dirty: true, updatedAt: nowIso() });
    setSyncState('syncing', 'Đang gửi dữ liệu thiết bị lên cloud…');

    await upsertCloudData(currentUser.id, snapshot);

    const verified = await fetchCloudRecord(currentUser.id);
    if (!verified?.data) throw new Error('Đã gửi nhưng không đọc lại được dữ liệu từ cloud.');

    const merged = mergeDefault(appDefaultData, verified.data);
    lastCloudUpdatedAt = verified.updated_at;
    writeEnvelope(currentUser.id, merged, {
      dirty: false,
      updatedAt: verified.updated_at
    });
    setSyncState('synced', 'Đã gửi và kiểm tra dữ liệu trên cloud');

    return {
      direction: 'upload',
      data: merged,
      updatedAt: verified.updated_at
    };
  }

  async function pullFromCloud(defaultData = appDefaultData) {
    if (!currentUser) throw new Error('Chưa đăng nhập.');
    if (!navigator.onLine) throw new Error('Thiết bị đang ngoại tuyến.');

    setSyncState('syncing', 'Đang tải dữ liệu mới từ cloud…');
    const record = await fetchCloudRecord(currentUser.id);
    if (!record?.data) throw new Error('Cloud chưa có dữ liệu cho tài khoản này.');

    const merged = mergeDefault(defaultData, record.data);
    lastCloudUpdatedAt = record.updated_at;
    writeEnvelope(currentUser.id, merged, {
      dirty: false,
      updatedAt: record.updated_at
    });
    setSyncState('synced', 'Đã tải dữ liệu mới từ cloud');

    return {
      direction: 'download',
      data: merged,
      updatedAt: record.updated_at
    };
  }

  async function forceSync(appData) {
    if (!currentUser) throw new Error('Chưa đăng nhập.');
    if (!navigator.onLine) throw new Error('Thiết bị đang ngoại tuyến.');

    const envelope = readEnvelope(currentUser.id);
    const record = await fetchCloudRecord(currentUser.id);

    // Có thay đổi chưa gửi trên thiết bị: ưu tiên gửi lên cloud.
    if (envelope?.dirty) {
      return pushToCloud(appData);
    }

    // Cloud chưa có bản ghi: tạo từ dữ liệu thiết bị.
    if (!record?.data) {
      return pushToCloud(appData);
    }

    const cloudTime = Date.parse(record.updated_at || 0);
    const knownCloudTime = Date.parse(lastCloudUpdatedAt || 0);
    const cloudMerged = mergeDefault(appDefaultData, record.data);

    // Có bản mới hơn từ điện thoại/máy khác: tải về.
    if (!lastCloudUpdatedAt || cloudTime > knownCloudTime) {
      return pullFromCloud(appDefaultData);
    }

    // Nếu dữ liệu sạch nhưng khác cloud, lấy cloud để tránh thiết bị cũ ghi đè.
    if (JSON.stringify(cloudMerged) !== JSON.stringify(appData)) {
      return pullFromCloud(appDefaultData);
    }

    setSyncState('synced', 'Dữ liệu trên thiết bị và cloud đã giống nhau');
    return {
      direction: 'none',
      data: clone(appData),
      updatedAt: record.updated_at
    };
  }

  async function refreshFromCloud(defaultData, localData) {
    if (!currentUser || !navigator.onLine) return localData;
    const envelope = readEnvelope(currentUser.id);
    if (envelope?.dirty) return localData;

    const record = await fetchCloudRecord(currentUser.id);
    if (!record?.data) return localData;
    if (lastCloudUpdatedAt && Date.parse(record.updated_at) <= Date.parse(lastCloudUpdatedAt)) return localData;

    lastCloudUpdatedAt = record.updated_at;
    const merged = mergeDefault(defaultData, record.data);
    writeEnvelope(currentUser.id, merged, { dirty: false, updatedAt: record.updated_at });
    setSyncState('synced', 'Đã nhận dữ liệu mới từ cloud');
    return merged;
  }

  async function updateMyProfile(fullName) {
    if (!currentUser) throw new Error('Chưa đăng nhập.');
    const { error } = await client.rpc('update_my_profile', { p_full_name: fullName.trim() });
    if (error) throw error;
    currentProfile = await fetchProfile(currentUser.id);
    return currentProfile;
  }

  function requireAdmin() {
    if (currentProfile?.role !== 'admin' || currentProfile?.status !== 'active') {
      throw new Error('Không có quyền quản trị.');
    }
  }

  async function listUsers(filters = {}) {
    requireAdmin();
    const { data, error } = await client.rpc('admin_list_users', {
      p_search: filters.search?.trim() || null,
      p_status: filters.status || null,
      p_plan: filters.plan || null,
      p_limit: filters.limit || 200
    });
    if (error) throw error;
    return data || [];
  }

  async function getAdminDashboard() {
    requireAdmin();
    const { data, error } = await client.rpc('admin_dashboard_stats');
    if (error) throw error;
    return data || {};
  }

  async function updateUser(userId, patch) {
    requireAdmin();
    const { data, error } = await client.rpc('admin_update_user', {
      p_user_id: userId,
      p_status: patch.status,
      p_plan: patch.plan,
      p_plan_expires_at: patch.plan_expires_at || null,
      p_role: patch.role || null,
      p_reason: patch.reason?.trim() || null
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function listAuditLogs(limit = 100) {
    requireAdmin();
    const { data, error } = await client.rpc('admin_list_audit_logs', { p_limit: limit });
    if (error) throw error;
    return data || [];
  }

  async function createAdminUser(payload) {
    requireAdmin();
    const { data, error } = await client.functions.invoke('clever-endpoint', {
      body: {
        email: payload.email?.trim(),
        password: payload.password,
        fullName: payload.fullName?.trim(),
        phone: payload.phone?.trim() || null,
        plan: payload.plan || 'free',
        role: payload.role || 'user',
        planExpiresAt: payload.planExpiresAt || null
      }
    });
    if (error) {
      let message = error.message || 'Không gọi được Edge Function clever-endpoint.';
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          if (body?.error) message = body.error;
        }
      } catch (_) { /* giữ thông báo gốc */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data?.user || data;
  }

  async function sendPasswordReset(email) {
    requireAdmin();
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  }

  async function getLatestRelease() {
    if (!currentUser) return null;
    const { data, error } = await client
      .from('app_releases')
      .select('version,title,notes,published_at,is_required')
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('Không đọc được thông tin phiên bản:', error.message);
      return null;
    }
    return data;
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getCurrentProfile() {
    return currentProfile;
  }

  window.addEventListener('online', () => {
    const userId = currentUser?.id;
    const envelope = userId ? readEnvelope(userId) : null;
    if (envelope?.dirty && envelope.data) {
      forceSync(envelope.data).catch((error) => setSyncState('error', error.message));
    } else {
      setSyncState('synced', 'Đã kết nối mạng');
    }
  });

  window.addEventListener('offline', () => {
    setSyncState('offline', 'Ngoại tuyến – dữ liệu vẫn lưu trên máy');
  });

  window.CMCSCloud = {
    init,
    isConfigured,
    signUp,
    signIn,
    resetPassword,
    updatePassword,
    signOut,
    save,
    forceSync,
    pushToCloud,
    pullFromCloud,
    refreshFromCloud,
    updateMyProfile,
    listUsers,
    getAdminDashboard,
    updateUser,
    listAuditLogs,
    createAdminUser,
    sendPasswordReset,
    getLatestRelease,
    getCurrentUser,
    getCurrentProfile
  };
})();
