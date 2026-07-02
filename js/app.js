const SUPABASE_URL = 'https://rncttqwxsejvlymojhgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuY3R0cXd4c2Vqdmx5bW9qaGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjU5MDEsImV4cCI6MjA5ODM0MTkwMX0.mPsHlNZsVJ7ZdX1jQ9x2dww-Y4Yl0svHxFFjwCoFdaM';
let appSupabase = null;

function initSupabase() {
  const url = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.startsWith('ΒΑΛΕ'))
    ? SUPABASE_URL : localStorage.getItem('sb_url');
  const key = (typeof SUPABASE_KEY !== 'undefined' && SUPABASE_KEY && !SUPABASE_KEY.startsWith('ΒΑΛΕ'))
    ? SUPABASE_KEY : localStorage.getItem('sb_key');
  if (url && key && window.supabase) {
    try {
      appSupabase = window.supabase.createClient(url, key);
      const notice = document.getElementById('supabaseNotice');
      if (notice) {
        notice.textContent = '✅ Supabase Auth έτοιμο';
        notice.classList.remove('hidden');
      }
      console.log('[Supabase] Connected ✅');
      return true;
    } catch(e) { console.warn('[Supabase] Init failed:', e); }
  }
  return false;
}

async function syncSupabaseReviews() {
  if (!appSupabase) return;
  const { data, error } = await appSupabase.from('reviews').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('[Supabase] Could not load reviews:', error);
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    // Supabase has no reviews yet: use seed demo reviews as a fallback so totals are not zero.
    S.professors.forEach(prof => {
      const seedProf = SEED_PROFESSORS.find(p => p.id === prof.id);
      prof.reviews = seedProf ? [...(seedProf.reviews || [])] : [];
      recalc(prof);
    });
  } else {
    rows.forEach(row => {
      const professorId = row.professor_id?.toString().trim();
      const prof = S.professors.find(p => p.id?.toString().trim().toLowerCase() === professorId?.toLowerCase());
      if (!prof) return;

      const normalized = {
        id: row.id,
        uid: row.username || (row.user_id ? `sb:${row.user_id}` : 'anon'),
        author: row.username || 'Ανώνυμος Φοιτητής',
        date: row.created_at ? row.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        rating: Number(row.rating) || 0,
        course: row.course || '',
        sem: row.semester || '',
        text: row.review_text || '',
        chips: Array.isArray(row.chips) ? row.chips : [],
        passed: row.passed,
        helpfulUp: row.helpful_up || 0,
        helpfulDown: row.helpful_down || 0,
        fromSupabase: true,
        professorId: row.professor_id
      };

      const exists = prof.reviews.some(r => r.id === normalized.id || (r.fromSupabase && r.text === normalized.text && r.date === normalized.date));
      if (!exists) {
        prof.reviews.unshift(normalized);
      }
    });
    S.professors.forEach(recalc);
  }

  S.filtered = [...S.professors];
  if (document.getElementById('mainApp') && !document.getElementById('mainApp').classList.contains('hidden')) {
    renderPOTM();
    renderTrending();
    applyFilters();
    renderStats();
    renderRecent();
    renderMyReviews();
    renderProfile();
    if (S.currentProf) renderProfDetail(S.currentProf);
  }
}

async function syncSupabaseProfile() {
  if (!appSupabase || !S.user || S.user.role === 'guest') return;
  const uid = S.user.sbId || S.user.username;
  const { data, error } = await appSupabase.from('profiles').select('*').eq('id', uid).single();
  if (error) {
    if (error.code !== 'PGRST116') console.warn('[Supabase] Could not load profile:', error);
    return;
  }

  if (data) {
    S.user.profile = data;
    S.user.verified = Boolean(data?.xp >= 0 || S.user.verified);
    if (typeof data?.xp === 'number') {
      GS.xp = data.xp;
      GS.level = data.level || 1;
      GS.badges = data.badges || [];
      GS.reviewCount = data.review_count || 0;
      GS.helpfulReceived = data.helpful_received || 0;
      GS.passYes = data.pass_yes || 0;
      GS.passNo = data.pass_no || 0;
      saveGamification();
    }
  }
}

async function persistReviewToSupabase(review, professor) {
  if (!appSupabase || !S.user || S.user.role === 'guest') return null;
  const payload = {
    professor_id: professor?.id || review.professorId || '',
    user_id: S.user.sbId || null,
    username: S.user.username,
    rating: review.rating,
    difficulty: review.difficulty ?? null,
    organization: review.organization ?? null,
    inspiration: review.inspiration ?? null,
    course: review.course || null,
    semester: review.sem || null,
    review_text: review.text,
    chips: review.chips || [],
    passed: review.passed ?? null
  };

  const { data, error } = await appSupabase.from('reviews').insert(payload).select('*').single();
  if (error) {
    console.warn('[Supabase] Review save failed:', error);
    return null;
  }
  return data;
}

function openSupabaseModal() {
  const urlEl = document.getElementById('sbUrl');
  const keyEl = document.getElementById('sbKey');
  const res = document.getElementById('sbResult');
  if (urlEl) urlEl.value = localStorage.getItem('sb_url') || '';
  if (keyEl) keyEl.value = localStorage.getItem('sb_key') || '';
  if (res) {
    res.textContent = '';
    res.classList.add('hidden');
  }
  openModal('supabase');
}

async function saveSupabaseConfig() {
  const url = document.getElementById('sbUrl')?.value.trim() || '';
  const key = document.getElementById('sbKey')?.value.trim() || '';
  const res = document.getElementById('sbResult');
  if (!url || !key) { showEl(res,'Συμπλήρωσε και τα δύο πεδία','err'); return; }
  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  const ok = initSupabase();
  if (ok) { showEl(res,'✅ Supabase συνδέθηκε! Ανανέωσε τη σελίδα.','success'); }
  else     { showEl(res,'❌ Αποτυχία σύνδεσης. Έλεγξε τα credentials.','err'); }
}

/* ── Department options per university ── */
const UNI_DEPTS = {
  AUTH:    ['Πληροφορική','Μαθηματικά','Φυσική','Χημεία','Βιολογία','Φιλολογία','Ψυχολογία','Μηχανολόγοι Μηχανικοί','Ηλεκτρολόγοι Μηχ. & Μηχ. Υπολ.','Αρχιτεκτονική','Ιατρική','Νομική','Οικονομικές Επιστήμες'],
  EKPA:    ['Πληροφορική & Τηλεπικοινωνίες','Μαθηματικά','Φυσική','Χημεία','Βιολογία','Φιλολογία','Ψυχολογία','Ιατρική','Νομική','Οικονομική Επιστήμη','Φιλοσοφία'],
  NTUA:    ['Ηλεκτρολόγοι Μηχ. & Μηχ. Υπολ.','Μηχανολόγοι Μηχανικοί','Αρχιτεκτονική','Χημικοί Μηχανικοί','Αγρονόμοι & Τοπογράφοι','Πολιτικοί Μηχανικοί','Ναυπηγοί Μηχανολόγοι'],
  OPA:     ['Οικονομική Επιστήμη','Διοικητική Επιστήμη & Τεχνολογία','Λογιστική & Χρηματοοικονομική','Μάρκετινγκ & Επικοινωνία','Στατιστική'],
  UOM:     ['Εφαρμοσμένη Πληροφορική','Οικονομικές Επιστήμες','Βαλκανικές Σλαβικές & Ανατολικές Σπουδές','Εκπαιδευτική & Κοινωνική Πολιτική','Μουσικής Επιστήμης & Τέχνης'],
  UPATRAS: ['Μηχανική Η/Υ & Πληροφορικής','Μαθηματικά','Φυσική','Χημεία','Βιολογία','Ιατρική','Φαρμακευτική','Μηχανολόγοι Μηχανικοί','Πολιτικοί Μηχανικοί'],
  FORTH:   ['Επιστήμη Υπολογιστών','Μαθηματικά & Εφαρμοσμένα Μαθηματικά','Φυσική','Βιολογία','Ψυχολογία','Ιατρική','Κοινωνιολογία'],
  UOI:     ['Μαθηματικά','Φυσική','Χημεία','Βιολογία','Πληροφορική & Τηλεπικοινωνίες','Ιατρική','Φιλοσοφία','Ψυχολογία'],
  DUTH:    ['Ηλεκτρολόγοι Μηχ. & Μηχ. Υπολ.','Πολιτικοί Μηχανικοί','Αρχιτεκτονική','Νομική','Κοινωνική Διοίκηση & Πολιτική Επιστήμη'],
  PANTEION:['Κοινωνιολογία','Πολιτική Επιστήμη & Ιστορία','Επικοινωνία & Μέσα Μαζικής Ενημέρωσης','Διεθνείς & Ευρωπαϊκές Σπουδές','Ψυχολογία'],
  OTHER:   ['Άλλο τμήμα']
};

function updateDeptOptions() {
  const uni = document.getElementById('regUni').value;
  const sel = document.getElementById('regDept');
  const depts = UNI_DEPTS[uni] || ['Άλλο'];
  sel.innerHTML = '<option value="">Επιλογή...</option>' +
    depts.map(d=>`<option>${d}</option>`).join('');
}

/* ── Accepted .edu.gr domains ── */
const EDU_DOMAINS = [
  'auth.gr','csd.auth.gr','uoa.gr','di.uoa.gr','ntua.gr','aueb.gr',
  'uom.edu.gr','upatras.gr','uoc.gr','uoi.gr','duth.gr','panteion.gr',
  'ihu.edu.gr','unipi.gr','uth.gr','uowm.gr','aegean.gr','ionio.gr',
  'hua.gr','tuc.gr','ect.gr','teiath.gr','teilar.gr','teikav.gr',
  'edu.gr' // catch-all
];

function isEduEmail(email) {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return EDU_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

/* ── STATE ── */
const S = {
  user: null, professors: [], filtered: [],
  currentProf: null, sort: 'rating',
  modal: null, shareTarget: null, chart: null,
  deferredPWA: null,
  stars: { overall:0, difficulty:0, organization:0, inspiration:0 },
  recentlyViewed: [],
  searchTimer: null,
  cmpProf: [null, null],
  cmpTimers: [null, null],
};

/* ── BOOT ── */
// Start immediately when DOM is ready, don't wait for all resources
async function bootApp() {
  initSupabase();
  await loadData();
  // Shorter splash: 1.2s (faster feel on mobile)
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('out');
    setTimeout(() => {
      if (splash) splash.style.display = 'none';
      checkAuth();
    }, 400);
  }, 1200);
  initPWA();
}

// Fire as soon as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
// Fallback: force hide splash after 5s no matter what
setTimeout(() => {
  const splash = document.getElementById('splash');
  if (splash && splash.style.display !== 'none') {
    splash.style.display = 'none';
    checkAuth();
  }
}, 5000);

async function loadData() {
  // Safety check: if data.js failed to load
  if (typeof SEED_PROFESSORS === 'undefined' || !SEED_PROFESSORS) {
    console.error('data.js not loaded!');
    S.professors = [];
    S.filtered = [];
    return;
  }

  const useSupabase = Boolean(appSupabase);
  const extra   = useSupabase ? [] : JSON.parse(localStorage.getItem('rmu_extra_profs')   || '[]');
  const extraRv = useSupabase ? {} : JSON.parse(localStorage.getItem('rmu_extra_reviews') || '{}');

  S.professors = SEED_PROFESSORS.map(p => {
    const reviews = useSupabase ? [] : [...p.reviews, ...(extraRv[p.id] || [])];
    return { ...p, reviews, reviewCount: reviews.length, badges: computeBadges({...p,reviews:reviews}) };
  });

  if (!useSupabase) {
    extra.forEach(p => S.professors.push(p));
  }

  S.recentlyViewed = JSON.parse(localStorage.getItem('rmu_recent') || '[]');
  S.filtered = [...S.professors];
  const t = localStorage.getItem('rmu_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);

  if (useSupabase) {
    await syncSupabaseReviews();
  }
}

/* ── AUTH ── */
async function checkAuth() {
  // Try Supabase first
  if (appSupabase) {
    const { data: { session } } = await appSupabase.auth.getSession();
    if (session?.user) {
      S.user = buildUser(session.user);
      showScreen('app'); return;
    }
  }
  // Fallback: localStorage session
  const remember = localStorage.getItem('rmu_remember');
  const session  = sessionStorage.getItem('rmu_session');
  const token    = remember || session;
  if (token) {
    const users = getUsers();
    const u = users.find(u => u.username === token);
    if (u) { loginUser(u, false); return; }
  }
  showScreen('auth');
}

function buildUser(sbUser) {
  return {
    username: sbUser.user_metadata?.username || sbUser.email?.split('@')[0] || 'user',
    email: sbUser.email,
    uni: sbUser.user_metadata?.uni || '',
    dept: sbUser.user_metadata?.dept || '',
    role: 'student',
    verified: Boolean(sbUser.email_confirmed_at),
    avatar: (sbUser.user_metadata?.username || sbUser.email || '?')[0].toUpperCase(),
    reviewIds: [],
    sbId: sbUser.id
  };
}

function getUsers() { return JSON.parse(localStorage.getItem('rmu_users') || '[]'); }
function saveUsers(u) { localStorage.setItem('rmu_users', JSON.stringify(u)); }

function showScreen(which) {
  document.getElementById('authScreen').classList.toggle('hidden', which !== 'auth');
  document.getElementById('mainApp').classList.toggle('hidden', which !== 'app');
  if (which === 'app') initApp();
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('formLogin');
  const registerForm = document.getElementById('formRegister');
  const loginTab = document.getElementById('tabLogin');
  const registerTab = document.getElementById('tabRegister');

  if (loginForm) loginForm.classList.toggle('hidden', tab !== 'login');
  if (registerForm) registerForm.classList.toggle('hidden', tab !== 'register');
  if (loginTab) loginTab.classList.toggle('active', tab === 'login');
  if (registerTab) registerTab.classList.toggle('active', tab === 'register');
}

window.openSupabaseModal = openSupabaseModal;
window.saveSupabaseConfig = saveSupabaseConfig;

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  if (!email || !pass) return showEl(document.getElementById('loginError'),'Συμπλήρωσε όλα τα πεδία.','err');
  if (!isEduEmail(email)) return showEl(document.getElementById('loginError'),'Απαιτείται πανεπιστημιακό email (.edu.gr).','err');

  // Try Supabase
  if (appSupabase) {
    const { data, error } = await appSupabase.auth.signInWithPassword({ email, password: pass });
    if (error) return showEl(document.getElementById('loginError'), error.message,'err');
    S.user = buildUser(data.user);
    if (document.getElementById('rememberMe').checked) localStorage.setItem('rmu_remember', S.user.username);
    loginUser(S.user, true); return;
  }

  // Fallback local auth
  const users = getUsers();
  const u = users.find(u => u.email === email && u.password === hashPass(pass));
  if (!u) return showEl(document.getElementById('loginError'),'Λάθος στοιχεία.','err');
  if (document.getElementById('rememberMe').checked) localStorage.setItem('rmu_remember', u.username);
  else sessionStorage.setItem('rmu_session', u.username);
  loginUser(u, true);
}

async function doRegister() {
  const email    = document.getElementById('regEmail').value.trim();
  const uniKey   = document.getElementById('regUni').value;
  const dept     = document.getElementById('regDept').value;
  const username = document.getElementById('regUser').value.trim();
  const pass     = document.getElementById('regPass').value;
  const pass2    = document.getElementById('regPass2').value;
  const errEl    = document.getElementById('registerError');

  if (!email)    return showEl(errEl,'Εισάγαγε email.','err');
  if (!isEduEmail(email)) return showEl(errEl,'Απαιτείται πανεπιστημιακό email (.edu.gr). Π.χ. p21xxxxx@uom.edu.gr','err');
  if (!uniKey || !dept) return showEl(errEl,'Επίλεξε πανεπιστήμιο και τμήμα.','err');
  if (!username || username.length < 3) return showEl(errEl,'Username τουλάχιστον 3 χαρακτήρες.','err');
  if (pass.length < 8) return showEl(errEl,'Κωδικός τουλάχιστον 8 χαρακτήρες.','err');
  if (pass !== pass2)  return showEl(errEl,'Οι κωδικοί δεν ταιριάζουν.','err');

  const uniName = document.querySelector('#regUni option:checked')?.textContent || uniKey;

  // Try Supabase
  if (appSupabase) {
    const { data, error } = await appSupabase.auth.signUp({
      email, password: pass,
      options: {
        data: { username, uni: uniName, dept },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`
      }
    });
    if (error) return showEl(errEl, error.message,'err');

    if (data?.session) {
      S.user = buildUser(data.user);
      loginUser(S.user, true);
      return;
    }

    const users = getUsers();
    const existing = users.find(u => u.email === email);
    const localUser = existing || {
      username, email, uni: uniName, dept,
      password: hashPass(pass), role:'student',
      verified: false, avatar: username[0].toUpperCase(),
      reviewIds: [], createdAt: new Date().toISOString()
    };

    if (!existing) users.push(localUser);
    saveUsers(users);
    sessionStorage.setItem('rmu_session', username);
    loginUser(localUser, true);
    showEl(errEl,'✅ Η εγγραφή δημιουργήθηκε. Έλεγξε το email σου για επιβεβαίωση και αν δεν φτάσει, ενεργοποίησε το email provider στο Supabase project settings.','success');
    return;
  }

  // Fallback local
  const users = getUsers();
  if (users.find(u => u.email === email)) return showEl(errEl,'Το email χρησιμοποιείται ήδη.','err');
  if (users.find(u => u.username === username)) return showEl(errEl,'Το username χρησιμοποιείται ήδη.','err');
  const newU = {
    username, email, uni: uniName, dept,
    password: hashPass(pass), role:'student',
    verified: true, avatar: username[0].toUpperCase(),
    reviewIds:[], createdAt: new Date().toISOString()
  };
  users.push(newU); saveUsers(users);
  sessionStorage.setItem('rmu_session', username);
  loginUser(newU, true);
}

function loginGuest() {
  S.user = { username:'guest', email:'', uni:'', dept:'', role:'guest', verified:false, reviewIds:[], avatar:'?' };
  showScreen('app');
}

function loginUser(u, welcome) {
  S.user = u;
  showScreen('app');
  if (welcome) setTimeout(()=>toast(`👋 Καλωσόρισες, ${u.username}!`,'ok'), 300);
  if (appSupabase) {
    void syncSupabaseProfile();
    void syncSupabaseReviews();
  }
}

async function doLogout() {
  if (appSupabase) await appSupabase.auth.signOut();
  localStorage.removeItem('rmu_remember');
  sessionStorage.removeItem('rmu_session');
  S.user = null;
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  switchAuthTab('login');
  toast('👋 Αποσυνδέθηκες','info');
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  const res   = document.getElementById('forgotResult');
  if (!email) return showEl(res,'Εισάγαγε email.','err');
  if (appSupabase) {
    const { error } = await appSupabase.auth.resetPasswordForEmail(email);
    if (error) return showEl(res, error.message,'err');
    showEl(res,'✅ Στάλθηκε email επαναφοράς!','success');
  } else {
    showEl(res,'✅ (Demo) Θα στέλναμε email στο ' + email,'success');
  }
}

function hashPass(p) {
  let h=0; for(let i=0;i<p.length;i++) h=(Math.imul(31,h)+p.charCodeAt(i))|0;
  return 'h'+Math.abs(h).toString(36)+p.length;
}

function togglePass(id,btn) {
  const i=document.getElementById(id);
  i.type=i.type==='password'?'text':'password';
  btn.textContent=i.type==='password'?'👁':'🙈';
}

function checkPassStrength(v) {
  const el=document.getElementById('passStrength'); el.className='pass-strength';
  if(v.length<8){el.classList.add('ps-weak');return;}
  const s=/[A-Z]/.test(v)&&/[0-9]/.test(v)&&/[^a-zA-Z0-9]/.test(v);
  const m=/[A-Z]/.test(v)||/[0-9]/.test(v);
  el.classList.add(s?'ps-strong':m?'ps-ok':'ps-weak');
}

/* ── APP INIT ── */
function initApp() {
  updateNavUser();
  renderPOTM(); renderTrending(); applyFilters();
  initStars(); animateCounters();
  window.addEventListener('scroll',()=>document.getElementById('navbar').classList.toggle('scrolled',window.scrollY>20));
  document.addEventListener('click',e=>{
    if(!e.target.closest('.search-bar')) closeDrop();
    if(!e.target.closest('.user-menu-wrap')) closeUserMenu();
    if(!e.target.closest('.compare-picker')) { closeCmpDrop(1); closeCmpDrop(2); }
  });
  const p=new URLSearchParams(window.location.search);
  if(p.get('action')==='review') setTimeout(()=>openModal('addReview'),300);
  if(p.get('page')==='rankings') setTimeout(()=>navigate('rankings'),300);
  if(p.get('prof')) setTimeout(()=>navigate('professor',p.get('prof')),300);
  if(p.get('compare')) setTimeout(()=>navigate('compare'),300);
}

function updateNavUser() {
  if(!S.user) return;
  const g=S.user.role==='guest';
  document.getElementById('navUsername').textContent=g?'Επισκέπτης':S.user.username;
  document.getElementById('navAvatar').textContent=S.user.avatar||'?';
  document.getElementById('userDropHeader').textContent=g?'Επισκέπτης':`@${S.user.username}${S.user.dept?' · '+S.user.dept:''}`;
}

/* ── NAVIGATE ── */
function navigate(page, id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if(page==='professor'&&id){
    const p=S.professors.find(x=>x.id===id); if(!p) return;
    S.currentProf=p; addToRecent(p); renderProfDetail(p);
  }
  if(page==='rankings')  renderRankings();
  if(page==='stats')     renderStats();
  if(page==='recent')    renderRecent();
  if(page==='myreviews') renderMyReviews();
  if(page==='profile')   renderProfile();
  if(page==='compare')   initCompare();
}

/* ── FILTERS ── */
function applyFilters() {
  const uni    = document.getElementById('fUni')?.value||'';
  const dept   = document.getElementById('fDept')?.value||'';
  const course = (document.getElementById('fCourse')?.value||'').toLowerCase().trim();
  const diff   = parseInt(document.getElementById('fDiff')?.value||'5');
  S.filtered = S.professors.filter(p=>{
    if(uni  && p.uni  !== uni)  return false;
    if(dept && p.dept !== dept) return false;
    if(diff<5 && Math.round(p.difficulty)>diff+1) return false;
    if(course){
      if(!p.courses.some(c=>c.toLowerCase().includes(course)) && !p.name.toLowerCase().includes(course)) return false;
    }
    return true;
  });
  sortAndRender();
}

function setSort(t,el){
  S.sort=t;
  document.querySelectorAll('.sp').forEach(b=>b.classList.remove('active'));
  el.classList.add('active'); sortAndRender();
}

function sortAndRender(){
  S.filtered.sort((a,b)=>{
    if(S.sort==='rating') return b.overall-a.overall;
    if(S.sort==='alpha')  return a.name.localeCompare(b.name,'el');
    if(S.sort==='recent') return new Date(b.lastReviewed)-new Date(a.lastReviewed);
    return 0;
  });
  renderProfsGrid();
}

/* ── POTM ── */
function renderPOTM(){
  const now=new Date(),ms=new Date(now.getFullYear(),now.getMonth(),1);
  let best=null,bc=-1;
  S.professors.forEach(p=>{
    const cnt=p.reviews.filter(r=>new Date(r.date)>=ms).length;
    if(cnt>bc||(cnt===bc&&p.overall>(best?.overall||0))){bc=cnt;best=p;}
  });
  if(!best) best=[...S.professors].sort((a,b)=>b.overall-a.overall)[0];
  if(!best) return;
  const months=['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
  document.getElementById('potmWrap').innerHTML=`
    <div class="potm" onclick="navigate('professor','${best.id}')" style="cursor:pointer">
      <div class="potm-crown">👑</div>
      <div class="potm-av">${best.emoji}</div>
      <div class="potm-info">
        <div class="potm-lbl">Καθηγητής του Μήνα · ${months[now.getMonth()]} ${now.getFullYear()}</div>
        <div class="potm-name">${best.name}</div>
        <div class="potm-dept">${best.title||''} · ${best.dept} · ${best.uni}</div>
        <div class="potm-badges">${renderBadges(best.badges,true)}</div>
      </div>
      <div class="potm-score"><div class="potm-big">${best.overall.toFixed(1)}</div>
        <div class="potm-sub">/ 5.0 · ${best.reviewCount} κριτικές</div>
      </div>
    </div>`;
}

/* ── TRENDING ── */
function renderTrending(){
  const w=new Date(); w.setDate(w.getDate()-7);
  const top=[...S.professors].map(p=>({...p,wc:p.reviews.filter(r=>new Date(r.date)>=w).length}))
    .sort((a,b)=>b.wc-a.wc||b.overall-a.overall).slice(0,5);
  document.getElementById('trendPill').textContent='Τελευταία 7 μέρες';
  document.getElementById('trendingRow').innerHTML=`<div class="trending-row">
    ${top.map((p,i)=>`<div class="tr-card" onclick="navigate('professor','${p.id}')">
      <div class="tr-rank">#${i+1}</div><div class="tr-av">${p.emoji}</div>
      <div class="tr-info"><div class="tr-name">${p.name}</div>
        <div class="tr-dept">${p.dept} · ${p.uni}</div></div>
      <div class="tr-fire"><div class="tr-fire-n">${p.wc>0?'+'+p.wc:p.overall.toFixed(1)}</div>
        <div class="tr-fire-l">${p.wc>0?'κριτικές':'/ 5.0'}</div></div>
    </div>`).join('')}</div>`;
}

/* ── PROFESSORS GRID ── */
function renderProfsGrid(){
  const grid=document.getElementById('profsGrid');
  const cnt=document.getElementById('profCount');
  if(cnt) cnt.textContent=`${S.filtered.length} αποτελέσματα`;
  if(!S.filtered.length){
    grid.innerHTML=`<div class="empty" style="grid-column:1/-1">
      <div class="empty-ico">🔍</div><div class="empty-ttl">Δεν βρέθηκαν αποτελέσματα</div>
      <div class="empty-sub">Δοκίμασε διαφορετικά φίλτρα</div></div>`;
    return;
  }
  grid.innerHTML=S.filtered.map((p,i)=>`
    <div class="pcard" onclick="navigate('professor','${p.id}')" style="animation-delay:${i*.04}s">
      <div class="pc-top">
        <div class="pc-av">${p.emoji}</div>
        <div class="pc-info">
          <div class="pc-name">${p.name}</div>
          <div class="pc-dept">${p.title?p.title+' · ':''}${p.dept}</div>
          <div class="pc-uni-badge">${p.uni}</div>
          <div class="pc-bdgs">${renderBadges(p.badges)}</div>
        </div>
        <div class="pc-score">
          <div class="pc-score-big">${p.overall.toFixed(1)}</div>
          <div class="pc-stars">${starsStr(p.overall)}</div>
        </div>
      </div>
      <div class="pc-stats">
        <div class="pcs"><div class="pcs-l">Δυσκολία</div><div class="pcs-v">${p.difficulty.toFixed(1)}</div></div>
        <div class="pcs"><div class="pcs-l">Οργάνωση</div><div class="pcs-v">${p.organization.toFixed(1)}</div></div>
        <div class="pcs"><div class="pcs-l">Εμπνέει</div><div class="pcs-v">${p.inspiration.toFixed(1)}</div></div>
      </div>
      <div class="pc-foot">
        <div class="pc-revs">💬 ${p.reviewCount} κριτικές</div>
        <div class="pc-actions">
          <button class="pc-btn" title="Σύγκριση" onclick="event.stopPropagation();addToCompare('${p.id}')">⚖️</button>
          <button class="pc-btn" onclick="event.stopPropagation();openShare('${p.id}')">📤</button>
          <button class="pc-btn" onclick="event.stopPropagation();openReviewFor('${p.id}')">✏️</button>
        </div>
      </div>
    </div>`).join('');
}

/* ── PROFESSOR DETAIL ── */
function renderProfDetail(p){
  document.getElementById('profDetail').innerHTML=`
    <div class="prof-hdr">
      <div class="ph-av">${p.emoji}</div>
      <div class="ph-info">
        <div class="ph-name">${p.name}</div>
        <div class="ph-dept">${p.title?p.title+' · ':''}${p.dept}</div>
        <div class="ph-uni"><span class="uni-badge-big">${p.uni}</span>${p.web?`<a href="${p.web}" target="_blank" class="web-link">🔗 Προφίλ</a>`:''}</div>
        ${p.email?`<div class="ph-email">📧 <a href="mailto:${p.email}">${p.email}</a></div>`:''}
        <div class="ph-bdgs">${renderBadges(p.badges)}</div>
        <div class="ph-actions">
          <button class="btn-primary btn-sm" onclick="openReviewFor('${p.id}')">✏️ Κριτική</button>
          <button class="btn-secondary btn-sm" onclick="openShare('${p.id}')">📤 Κοινοποίηση</button>
          <button class="btn-secondary btn-sm" onclick="addToCompare('${p.id}');navigate('compare')">⚖️ Σύγκριση</button>
          <button class="btn-export" onclick="exportPDF('${p.id}')">📄 PDF</button>
        </div>
      </div>
      <div class="ph-score">
        <div class="ph-big">${p.overall.toFixed(1)}</div>
        <div class="ph-max">/ 5.0</div>
        <div class="ph-stars">${starsStr(p.overall)}</div>
        <div class="ph-revs">${p.reviewCount} κριτικές</div>
      </div>
    </div>
    <div class="breakdown-card">
      <div class="bc-title">📊 Αναλυτική Βαθμολογία</div>
      <div class="bc-grid">
        ${[['Συνολική',p.overall],['Δυσκολία',p.difficulty],['Οργάνωση',p.organization],['Εμπνέει',p.inspiration]]
          .map(([l,v])=>`<div class="bc-item">
            <div class="bc-lbl">${l}</div>
            <div class="bc-bar-bg"><div class="bc-bar" style="width:${(v/5)*100}%"></div></div>
            <div class="bc-val">${v.toFixed(1)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="chart-card">
      <div class="chart-title">📈 Εξέλιξη Βαθμολογίας ανά Εξάμηνο</div>
      <div class="chart-wrap"><canvas id="semChart"></canvas></div>
    </div>
    <div class="reviews-card">
      <div class="rev-head">
        <div class="rev-title">💬 Κριτικές (${p.reviews.length})</div>
      </div>
      ${p.reviews.length===0?`<div class="empty"><div class="empty-ico">💬</div>
        <div class="empty-ttl">Δεν υπάρχουν κριτικές ακόμα</div>
        <div class="empty-sub">Γίνε ο πρώτος!</div></div>`
      :p.reviews.map(r=>`
        <div class="rev-item">
          <div class="rev-top">
            <div class="rev-meta">
              <div class="rev-av">👤</div>
              <div>
                <div class="rev-author">Ανώνυμος Φοιτητής</div>
                <div class="rev-date">${fmtDate(r.date)}</div>
              </div>
              ${r.course?`<span class="rev-course">${r.course}</span>`:''}
              ${r.sem?`<span class="rev-sem">${r.sem}ο Εξ.</span>`:''}
            </div>
            <div class="rev-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
          </div>
          <div class="rev-text">${r.text}</div>
          ${r.chips?.length?`<div class="rev-chips">${r.chips.map(c=>`<span class="bdg bdg-easy">${c}</span>`).join('')}</div>`:''}
        </div>`).join('')}
    </div>`;
  setTimeout(()=>renderSemChart(p),80);
}

/* ── SEMESTER CHART ── */
function renderSemChart(p){
  const cv=document.getElementById('semChart'); if(!cv) return;
  if(S.chart){S.chart.destroy();S.chart=null;}
  const dk=document.documentElement.getAttribute('data-theme')==='dark';
  S.chart=new Chart(cv,{
    type:'line',
    data:{
      labels:p.semRatings.map(x=>x.s+' Εξ.'),
      datasets:[{label:'Βαθμολογία',data:p.semRatings.map(x=>x.r),
        borderColor:'#6C3EFF',backgroundColor:'rgba(108,62,255,.1)',
        borderWidth:3,pointBackgroundColor:'#6C3EFF',
        pointBorderColor:'#fff',pointBorderWidth:2,
        pointRadius:6,pointHoverRadius:9,fill:true,tension:.4}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{
        backgroundColor:dk?'#1A1330':'#fff',
        borderColor:'rgba(108,62,255,.3)',borderWidth:1,
        titleColor:dk?'#F0EDFF':'#0F0A1E',bodyColor:'#6C3EFF',
        padding:12,cornerRadius:10,
        callbacks:{label:ctx=>` ${ctx.parsed.y.toFixed(1)} / 5.0`}
      }},
      scales:{
        y:{min:0,max:5,grid:{color:dk?'rgba(108,62,255,.15)':'rgba(108,62,255,.08)'},
           ticks:{color:dk?'#A89FCC':'#5B5474',stepSize:1},border:{display:false}},
        x:{grid:{display:false},ticks:{color:dk?'#A89FCC':'#5B5474'},border:{display:false}}
      }
    }
  });
}

/* ════════════════════════════════════════
   COMPARE 1v1
════════════════════════════════════════ */
function initCompare(){
  renderCompareResult();
}

function addToCompare(profId){
  const p=S.professors.find(x=>x.id===profId); if(!p) return;
  if(!S.cmpProf[0]){ S.cmpProf[0]=p; }
  else if(!S.cmpProf[1] && S.cmpProf[0].id!==profId){ S.cmpProf[1]=p; }
  else { S.cmpProf[0]=p; S.cmpProf[1]=null; }
  toast(`⚖️ ${p.name} προστέθηκε στη σύγκριση`,'info');
}

function cmpSearch(slot, val){
  clearTimeout(S.cmpTimers[slot-1]);
  const drop=document.getElementById(`cmpDrop${slot}`);
  if(val.trim().length<2){ drop.classList.add('hidden'); return; }
  S.cmpTimers[slot-1]=setTimeout(()=>{
    const hits=S.professors.filter(p=>
      p.name.toLowerCase().includes(val.toLowerCase())||
      p.dept.toLowerCase().includes(val.toLowerCase())
    ).slice(0,6);
    if(!hits.length){ drop.classList.add('hidden'); return; }
    drop.innerHTML=hits.map(p=>`
      <div class="cmp-drop-item" onclick="selectCmp(${slot},'${p.id}')">
        <span>${p.emoji}</span>
        <div><div style="font-weight:700;font-size:14px">${p.name}</div>
          <div style="font-size:12px;color:var(--t3)">${p.dept} · ${p.uni}</div></div>
        <span style="font-weight:800;color:var(--primary)">${p.overall.toFixed(1)}</span>
      </div>`).join('');
    drop.classList.remove('hidden');
  },200);
}

function closeCmpDrop(slot){
  document.getElementById(`cmpDrop${slot}`)?.classList.add('hidden');
}

function selectCmp(slot, profId){
  const p=S.professors.find(x=>x.id===profId); if(!p) return;
  S.cmpProf[slot-1]=p;
  document.getElementById(`cmp${slot}Input`).value=p.name;
  closeCmpDrop(slot);
  renderCompareResult();
}

function renderCompareResult(){
  const [a,b]=S.cmpProf;
  const el=document.getElementById('compareResult');
  if(!a&&!b){ el.classList.add('hidden'); return; }
  if(!a||!b){
    el.classList.remove('hidden');
    el.innerHTML=`<div class="empty"><div class="empty-ico">⚖️</div>
      <div class="empty-ttl">Επίλεξε και τους δύο καθηγητές</div>
      <div class="empty-sub">Χρησιμοποίησε την αναζήτηση παραπάνω</div></div>`;
    return;
  }

  const metrics=[
    {key:'overall',      label:'Συνολική Εκτίμηση', icon:'⭐'},
    {key:'difficulty',   label:'Δυσκολία',           icon:'💀'},
    {key:'organization', label:'Οργάνωση',            icon:'📚'},
    {key:'inspiration',  label:'Εμπνέει',             icon:'💡'},
  ];

  const winner=(k)=> a[k]>b[k]?'A': a[k]<b[k]?'B':'tie';
  const winsA = metrics.filter(m=>winner(m.key)==='A').length;
  const winsB = metrics.filter(m=>winner(m.key)==='B').length;

  el.classList.remove('hidden');
  el.innerHTML=`
    <div class="cmp-result">
      <!-- Headers -->
      <div class="cmp-headers">
        <div class="cmp-prof-card ${winsA>winsB?'cmp-winner':''}">
          <div class="cmp-av">${a.emoji}</div>
          <div class="cmp-pname">${a.name}</div>
          <div class="cmp-pdept">${a.dept}</div>
          <div class="cmp-puni">${a.uni}</div>
          ${winsA>winsB?'<div class="cmp-crown">🏆 Νικητής</div>':''}
        </div>
        <div class="cmp-vs-big">VS</div>
        <div class="cmp-prof-card ${winsB>winsA?'cmp-winner':''}">
          <div class="cmp-av">${b.emoji}</div>
          <div class="cmp-pname">${b.name}</div>
          <div class="cmp-pdept">${b.dept}</div>
          <div class="cmp-puni">${b.uni}</div>
          ${winsB>winsA?'<div class="cmp-crown">🏆 Νικητής</div>':''}
        </div>
      </div>

      <!-- Metrics -->
      <div class="cmp-metrics">
        ${metrics.map(m=>{
          const w=winner(m.key);
          const pctA=(a[m.key]/5)*100, pctB=(b[m.key]/5)*100;
          return `<div class="cmp-row">
            <div class="cmp-val ${w==='A'?'cmp-win':''}">${a[m.key].toFixed(1)}</div>
            <div class="cmp-metric-center">
              <div class="cmp-metric-label">${m.icon} ${m.label}</div>
              <div class="cmp-bars">
                <div class="cmp-bar-left-wrap">
                  <div class="cmp-bar-left ${w==='A'?'cmp-bar-win':''}" style="width:${pctA}%"></div>
                </div>
                <div class="cmp-bar-right-wrap">
                  <div class="cmp-bar-right ${w==='B'?'cmp-bar-win':''}" style="width:${pctB}%"></div>
                </div>
              </div>
            </div>
            <div class="cmp-val ${w==='B'?'cmp-win':''}">${b[m.key].toFixed(1)}</div>
          </div>`;
        }).join('')}
        <!-- Reviews -->
        <div class="cmp-row">
          <div class="cmp-val ${a.reviewCount>b.reviewCount?'cmp-win':''}">${a.reviewCount}</div>
          <div class="cmp-metric-center"><div class="cmp-metric-label">💬 Κριτικές</div>
            <div class="cmp-bars">
              <div class="cmp-bar-left-wrap">
                <div class="cmp-bar-left ${a.reviewCount>b.reviewCount?'cmp-bar-win':''}"
                  style="width:${(a.reviewCount/Math.max(a.reviewCount,b.reviewCount))*100}%"></div>
              </div>
              <div class="cmp-bar-right-wrap">
                <div class="cmp-bar-right ${b.reviewCount>a.reviewCount?'cmp-bar-win':''}"
                  style="width:${(b.reviewCount/Math.max(a.reviewCount,b.reviewCount))*100}%"></div>
              </div>
            </div>
          </div>
          <div class="cmp-val ${b.reviewCount>a.reviewCount?'cmp-win':''}">${b.reviewCount}</div>
        </div>
      </div>

      <!-- Verdict -->
      <div class="cmp-verdict">
        ${winsA===winsB
          ? `<div class="verdict-tie">🤝 Ισοπαλία! Και οι δύο καθηγητές είναι εξίσου καλοί.</div>`
          : `<div class="verdict-win">
              🏆 <strong>${winsA>winsB?a.name:b.name}</strong> κερδίζει σε ${Math.max(winsA,winsB)} από ${metrics.length} κατηγορίες!
              <button class="btn-primary btn-sm" style="margin-left:12px"
                onclick="navigate('professor','${winsA>winsB?a.id:b.id}')">Δες Προφίλ →</button>
            </div>`}
      </div>
    </div>`;
}

/* ── RANKINGS ── */
function renderRankings(){
  const uni  = document.getElementById('rankUni')?.value||'';
  const dept = document.getElementById('rankDept')?.value||'';
  const list=[...S.professors]
    .filter(p=>(!uni||p.uni===uni)&&(!dept||p.dept===dept))
    .sort((a,b)=>b.overall-a.overall);
  const medals=['🥇','🥈','🥉'],nc=['gold','silver','bronze'];
  document.getElementById('rankList').innerHTML=list.map((p,i)=>`
    <div class="rank-item" onclick="navigate('professor','${p.id}')">
      <div class="rk-num ${nc[i]||''}">${medals[i]||(i+1)}</div>
      <div class="rk-av">${p.emoji}</div>
      <div class="rk-info">
        <div class="rk-name">${p.name}</div>
        <div class="rk-dept">${p.title?p.title+' · ':''}${p.dept} · ${p.uni}</div>
        <div class="rk-bdgs">${renderBadges(p.badges)}</div>
      </div>
      <div class="rk-bar"><div class="rk-bar-f" style="width:${(p.overall/5)*100}%"></div></div>
      <div class="rk-score">${p.overall.toFixed(1)}</div>
    </div>`).join('');
}

/* ── STATS ── */
function renderStats(){
  const profs=S.professors;
  const totalR=profs.reduce((a,p)=>a+p.reviewCount,0);
  const avgR=profs.reduce((a,p)=>a+p.overall,0)/profs.length;
  const dm={},um={};
  profs.forEach(p=>{dm[p.dept]=(dm[p.dept]||0)+p.reviewCount; um[p.uni]=(um[p.uni]||0)+p.reviewCount;});
  const topD=Object.entries(dm).sort((a,b)=>b[1]-a[1])[0];
  const top=[...profs].sort((a,b)=>b.overall-a.overall)[0];
  const uEntries=Object.entries(um).sort((a,b)=>b[1]-a[1]);
  const dEntries=Object.entries(dm).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxU=uEntries[0]?.[1]||1, maxD=dEntries[0]?.[1]||1;
  document.getElementById('statsContent').innerHTML=`
    <div class="stats-grid">
      <div class="stat-card"><span class="sc-ico">📝</span>
        <div class="sc-val">${totalR.toLocaleString('el-GR')}</div>
        <div class="sc-lbl">Συνολικές Κριτικές</div><div class="sc-sub">από ${profs.length} καθηγητές</div></div>
      <div class="stat-card"><span class="sc-ico">⭐</span>
        <div class="sc-val">${avgR.toFixed(2)}</div><div class="sc-lbl">Μέση Βαθμολογία</div>
        <div class="sc-sub">πλατφόρμας</div></div>
      <div class="stat-card"><span class="sc-ico">🏛️</span>
        <div class="sc-val">${topD?.[0]||'—'}</div><div class="sc-lbl">Πιο Ενεργό Τμήμα</div>
        <div class="sc-sub">${topD?.[1]||0} κριτικές</div></div>
      <div class="stat-card highlight"><span class="sc-ico">🏆</span>
        <div class="sc-val">${top?.overall.toFixed(1)||'—'}</div>
        <div class="sc-lbl">Κορυφαία Βαθμολογία</div>
        <div class="sc-sub">${top?.name.split(' ').slice(-1)[0]||''}</div></div>
      <div class="stat-card"><span class="sc-ico">🎓</span>
        <div class="sc-val">${[...new Set(profs.map(p=>p.uni))].length}</div>
        <div class="sc-lbl">Πανεπιστήμια</div><div class="sc-sub">πανελλαδικά</div></div>
      <div class="stat-card"><span class="sc-ico">📚</span>
        <div class="sc-val">${[...new Set(profs.map(p=>p.dept))].length}</div>
        <div class="sc-lbl">Τμήματα</div><div class="sc-sub">όλων των ΑΕΙ</div></div>
    </div>
    <div class="dept-chart-card">
      <div class="bc-title">📊 Κριτικές ανά Πανεπιστήμιο</div>
      <div class="dept-bars">
        ${uEntries.map(([u,cnt])=>`<div class="dept-bar-row">
          <div class="dept-bar-lbl">${u}</div>
          <div class="dept-bar-bg"><div class="dept-bar-f" style="width:${(cnt/maxU)*100}%"></div></div>
          <div class="dept-bar-val">${cnt}</div></div>`).join('')}
      </div>
    </div>
    <div class="dept-chart-card" style="margin-top:18px">
      <div class="bc-title">📊 Κριτικές ανά Τμήμα</div>
      <div class="dept-bars">
        ${dEntries.map(([d,cnt])=>`<div class="dept-bar-row">
          <div class="dept-bar-lbl">${d}</div>
          <div class="dept-bar-bg"><div class="dept-bar-f" style="width:${(cnt/maxD)*100}%"></div></div>
          <div class="dept-bar-val">${cnt}</div></div>`).join('')}
      </div>
    </div>`;
}

/* ── RECENTLY VIEWED ── */
function addToRecent(p){
  S.recentlyViewed=[p.id,...S.recentlyViewed.filter(id=>id!==p.id)].slice(0,12);
  localStorage.setItem('rmu_recent',JSON.stringify(S.recentlyViewed));
}
function renderRecent(){
  const profs=S.recentlyViewed.map(id=>S.professors.find(p=>p.id===id)).filter(Boolean);
  const el=document.getElementById('recentContent');
  if(!profs.length){el.innerHTML=`<div class="empty"><div class="empty-ico">🕐</div>
    <div class="empty-ttl">Δεν έχεις δει κανέναν ακόμα</div></div>`;return;}
  el.innerHTML=profs.map((p,i)=>`<div class="rank-item" onclick="navigate('professor','${p.id}')">
    <div class="rk-num">${i+1}</div><div class="rk-av">${p.emoji}</div>
    <div class="rk-info"><div class="rk-name">${p.name}</div>
      <div class="rk-dept">${p.dept} · ${p.uni}</div></div>
    <div class="rk-score">${p.overall.toFixed(1)}</div></div>`).join('');
}

/* ── MY REVIEWS ── */
function renderMyReviews(){
  const el=document.getElementById('myReviewsContent');
  if(!S.user||S.user.role==='guest'){
    el.innerHTML=`<div class="empty"><div class="empty-ico">🔒</div>
      <div class="empty-ttl">Συνδέσου για να δεις τις κριτικές σου</div></div>`;return;
  }
  const my=[];
  S.professors.forEach(p=>p.reviews.filter(r=>r.uid===S.user.username).forEach(r=>my.push({...r,profName:p.name,profId:p.id})));
  if(!my.length){
    el.innerHTML=`<div class="empty"><div class="empty-ico">📝</div>
      <div class="empty-ttl">Δεν έχεις γράψει κριτικές ακόμα</div>
      <div class="empty-sub"><button class="btn-primary" onclick="openModal('addReview')">Γράψε τώρα →</button></div></div>`;return;
  }
  el.innerHTML=my.map(r=>`<div class="rev-item">
    <div class="rev-top">
      <div class="rev-meta"><div class="rev-av">✏️</div>
        <div><div class="rev-author" style="cursor:pointer;color:var(--primary)" onclick="navigate('professor','${r.profId}')">${r.profName}</div>
          <div class="rev-date">${fmtDate(r.date)}${r.course?' · '+r.course:''}</div></div>
      </div>
      <div class="rev-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
    </div>
    <div class="rev-text">${r.text}</div>
    ${r.chips?.length?`<div class="rev-chips">${r.chips.map(c=>`<span class="bdg bdg-easy">${c}</span>`).join('')}</div>`:''}
  </div>`).join('');
}

/* ── PROFILE ── */
function renderProfile(){
  const el=document.getElementById('profileContent');
  if(!S.user||S.user.role==='guest'){
    el.innerHTML=`<div class="empty"><div class="empty-ico">🔒</div>
      <div class="empty-ttl">Συνδέσου για το προφίλ σου</div></div>`;return;
  }
  const u=S.user;
  const my=S.professors.flatMap(p=>p.reviews.filter(r=>r.uid===u.username));
  const avg=my.length?(my.reduce((a,r)=>a+r.rating,0)/my.length).toFixed(1):'—';
  el.innerHTML=`
    <div class="profile-hdr">
      <div class="prof-av-big">${u.avatar}</div>
      <div>
        <div class="profile-name">${u.username}</div>
        <div class="profile-sub">${u.dept||''}${u.dept&&u.uni?' · ':''}${u.uni||''}${u.email?' · '+u.email:''}</div>
        <div class="profile-badges">
          ${u.verified?'<span class="bdg bdg-ver">✓ Verified .edu</span>':''}
          <span class="bdg bdg-org">🎓 Φοιτητής</span>
          ${my.length>=5?'<span class="bdg bdg-top">🔥 Active Reviewer</span>':''}
        </div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="ps-item"><div class="ps-v">${my.length}</div><div class="ps-l">Κριτικές</div></div>
      <div class="ps-item"><div class="ps-v">${avg}</div><div class="ps-l">Μέση Βαθμ.</div></div>
      <div class="ps-item"><div class="ps-v">${[...new Set(my.map(r=>r.course))].filter(Boolean).length}</div><div class="ps-l">Μαθήματα</div></div>
    </div>
    <div class="profile-form" style="margin-top:20px">
      <div class="pf-title">⚡ Supabase Auth</div>
      <p style="font-size:13px;color:var(--t2);margin-bottom:12px">
        ${appSupabase?'✅ Supabase Auth ενεργό — πανεπιστημιακή επαλήθευση ενεργοποιημένη':'⚠️ Supabase δεν έχει ρυθμιστεί. Χρησιμοποιείται τοπικός έλεγχος .edu.gr email.'}
      </p>
      <button class="btn-secondary" onclick="openSupabaseModal()">⚙️ Ρυθμίσεις Supabase</button>
    </div>`;
}

/* ── REVIEW FORM ── */
function getAllowedReviewProfessors() {
  if (!S.user || S.user.role === 'guest' || !S.user.uni || !S.user.dept) return S.professors;
  return S.professors.filter(p => p.uni === S.user.uni && p.dept === S.user.dept);
}

function openReviewFor(id){
  const p=S.professors.find(x=>x.id===id);
  const deptField=document.getElementById('rv-dept');
  const profIdField=document.getElementById('rv-profId');
  if(p) {
    document.getElementById('rv-name').value=p.name;
    if(profIdField) profIdField.value = p.id;
  }
  if (S.user && S.user.dept) {
    if (deptField) deptField.value = S.user.dept;
    if (deptField) deptField.disabled = true;
    if (p && (p.uni !== S.user.uni || p.dept !== S.user.dept)) {
      return toast('Μπορείς να γράψεις κριτική μόνο για καθηγητές του τμήματός σου.','err');
    }
  } else if (deptField) {
    deptField.disabled = false;
  }
  S.shareTarget=id; openModal('addReview');
}

function initStars(){
  ['overall','difficulty','organization','inspiration'].forEach(f=>{
    const el=document.querySelector(`.stars[data-f="${f}"]`); if(!el) return;
    el.innerHTML=[1,2,3,4,5].map(n=>`<button class="sb" data-n="${n}" onclick="setStar('${f}',${n})">☆</button>`).join('');
  });
}

function setStar(f,v){
  S.stars[f]=v;
  document.querySelector(`.stars[data-f="${f}"]`)?.querySelectorAll('.sb').forEach(b=>{
    const n=+b.dataset.n; b.textContent=n<=v?'★':'☆'; b.classList.toggle('on',n<=v);
  });
}

function updateCharCount(ta){
  const l=ta.value.length; if(l>500) ta.value=ta.value.slice(0,500);
  document.getElementById('charCnt').textContent=`${Math.min(l,500)}/500`;
}

function toggleChip(btn){ btn.classList.toggle('selected'); }

async function submitReview(){
  const name  =document.getElementById('rv-name').value.trim();
  const dept  =document.getElementById('rv-dept').value;
  const course=document.getElementById('rv-course').value.trim();
  const sem   =+document.getElementById('rv-sem').value;
  const text  =document.getElementById('rv-text').value.trim();
  const chips =[...document.querySelectorAll('.chip.selected')].map(c=>c.dataset.v);
  const {overall,difficulty,organization,inspiration}=S.stars;
  if(!name)    return toast('Εισάγεψε το όνομα καθηγητή','err');
  if(!dept)    return toast('Επίλεξε τμήμα','err');
  if(!overall) return toast('Επίλεξε συνολική βαθμολογία','err');
  if(text.length<20) return toast('Γράψε τουλάχιστον 20 χαρακτήρες','err');
  if(S.user?.role==='guest') return toast('Συνδέσου για να γράψεις κριτική','err');

  const profId = document.getElementById('rv-profId')?.value;
  let prof = profId ? S.professors.find(p => p.id === profId) : null;
  if (!prof) {
    const allowed = getAllowedReviewProfessors();
    prof = allowed.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
  }
  if (!prof) {
    if (S.user && S.user.uni && S.user.dept) {
      return toast('Βρες καθηγητή από το τμήμα σου για να γράψεις κριτική.','err');
    }
    return toast('Επίλεξε καθηγητή από τα διαθέσιμα αποτελέσματα.','err');
  }

  const uid=S.user?.username||'anon';
  const rev={id:'r'+Date.now(),uid,author:S.user?.username||'Ανώνυμος Φοιτητής',
    date:new Date().toISOString().slice(0,10),rating:overall,course,sem,text,chips,
    difficulty:difficulty||null,organization:organization||null,inspiration:inspiration||null,
    passed:typeof selectedPass === 'boolean' ? selectedPass : null};

  if(prof.reviews.some(r=>r.uid===uid&&r.course===course&&course))
    return toast('Έχεις ήδη αξιολογήσει αυτό το μάθημα','err');

  const remote = appSupabase ? await persistReviewToSupabase(rev, prof) : null;
  if (remote) {
    rev.id = remote.id;
    rev.fromSupabase = true;
    rev.professorId = prof.id;
  }
  prof.reviews.unshift(rev);
  recalc(prof);
  if (!appSupabase) {
    const er=JSON.parse(localStorage.getItem('rmu_extra_reviews')||'{}');
    if(!er[prof.id]) er[prof.id]=[];
    er[prof.id].unshift(rev);
    localStorage.setItem('rmu_extra_reviews',JSON.stringify(er));
  }

  applyFilters(); renderPOTM(); renderTrending();
  closeModal(); toast('✅ Η κριτική καταχωρήθηκε!','ok');
  ['rv-name','rv-profId','rv-dept','rv-course','rv-text'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  S.stars={overall:0,difficulty:0,organization:0,inspiration:0}; initStars();
  document.querySelectorAll('.chip.selected').forEach(c=>c.classList.remove('selected'));
  document.getElementById('charCnt').textContent='0/500';
}

function recalc(p){
  p.overall=avg(p.reviews.map(r=>r.rating));
  p.reviewCount=p.reviews.length;
  p.lastReviewed=p.reviews[0]?.date || new Date().toISOString().slice(0,10);
  p.badges=computeBadges(p);
}

function handleReviewSearch(val){
  const q=val.trim().toLowerCase();
  const drop=document.getElementById('rvSearchDrop');
  const profIdField=document.getElementById('rv-profId');
  if(profIdField) profIdField.value = '';
  if(!drop) return;
  if(q.length<2){ drop.classList.remove('open'); drop.innerHTML=''; return; }
  const hits=getAllowedReviewProfessors().filter(p=>
    p.name.toLowerCase().includes(q) || p.dept.toLowerCase().includes(q) || p.uni.toLowerCase().includes(q)
  ).slice(0,6);
  if(!hits.length){
    drop.innerHTML=`<div class="sri empty">Μόνο καθηγητές από το τμήμα σου εμφανίζονται εδώ.</div>`;
    drop.classList.add('open');
    return;
  }
  drop.innerHTML=hits.map(p=>`<div class="sri" onclick="selectReviewProf('${p.id}')">
      <div class="sri-av">${p.emoji}</div>
      <div class="sri-info">
        <div class="sri-name">${hl(p.name,q)}</div>
        <div class="sri-sub">${p.dept} · ${p.uni}</div>
      </div>
      <div class="sri-r">★ ${p.overall.toFixed(1)}</div>
    </div>`).join('');
  drop.classList.add('open');
}

function selectReviewProf(id){
  const p=S.professors.find(x=>x.id===id);
  if(!p) return;
  document.getElementById('rv-name').value=p.name;
  document.getElementById('rv-profId').value = p.id;
  document.getElementById('rv-dept').value = S.user?.dept || p.dept || '';
  document.getElementById('rvSearchDrop').classList.remove('open');
}

function computeBadges(p){
  const b=[];
  if(p.difficulty<=3.0) b.push('easy');
  if(p.inspiration>=4.3) b.push('inspiring');
  if(p.organization>=4.3) b.push('organized');
  if(p.overall>=4.5&&p.reviewCount>=20) b.push('top');
  return b;
}

/* ── SEARCH ── */
function handleSearch(val){
  clearTimeout(S.searchTimer);
  const q=val.trim().toLowerCase();
  const drop=document.getElementById('searchDrop');
  if(q.length<2){drop.classList.remove('open');return;}
  S.searchTimer=setTimeout(()=>{
    const hits=S.professors.filter(p=>
      p.name.toLowerCase().includes(q)||p.dept.toLowerCase().includes(q)||
      p.uni.toLowerCase().includes(q)||p.courses.some(c=>c.toLowerCase().includes(q))
    ).slice(0,6);
    if(!hits.length){drop.classList.remove('open');return;}
    drop.innerHTML=hits.map(p=>`<div class="sri" onclick="navigate('professor','${p.id}');clearSearch()">
      <div class="sri-av">${p.emoji}</div>
      <div class="sri-info">
        <div class="sri-name">${hl(p.name,q)}</div>
        <div class="sri-sub">${p.dept} · ${p.uni}</div>
      </div>
      <div class="sri-r">★ ${p.overall.toFixed(1)}</div>
    </div>`).join('');
    drop.classList.add('open');
  },200);
}

function hl(t,q){const i=t.toLowerCase().indexOf(q);if(i<0)return t;
  return t.slice(0,i)+`<strong style="color:var(--primary)">${t.slice(i,i+q.length)}</strong>`+t.slice(i+q.length);}
function clearSearch(){document.getElementById('searchInput').value='';document.getElementById('searchDrop').classList.remove('open');}
function closeDrop(){document.getElementById('searchDrop')?.classList.remove('open');}

/* ── SHARE ── */
function openShare(id){
  S.shareTarget=id;
  document.getElementById('shareUrl').value=`${location.origin}${location.pathname}?prof=${id}`;
  openModal('share');
}
function copyUrl(){
  navigator.clipboard.writeText(document.getElementById('shareUrl').value).catch(()=>{});
  toast('📋 Link αντιγράφηκε!','ok'); closeModal();
}
function shareTw(){
  const p=S.professors.find(x=>x.id===S.shareTarget); if(!p) return;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${p.name} στο RateMyUni ★${p.overall}/5`)}`, '_blank');
  closeModal();
}
function shareWa(){
  const p=S.professors.find(x=>x.id===S.shareTarget); if(!p) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(`${p.name} ★${p.overall}/5\n${location.href}`)}`, '_blank');
  closeModal();
}

/* ── EXPORT PDF ── */
function exportPDF(id){
  const p=S.professors.find(x=>x.id===id); if(!p) return;
  const win=window.open('','_blank','width=820,height=940');
  win.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"/>
  <title>${p.name} — RateMyUni</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e;line-height:1.5}
  .hdr{display:flex;justify-content:space-between;border-bottom:3px solid #6C3EFF;padding-bottom:18px;margin-bottom:22px}
  .logo{font-size:24px;font-weight:900;color:#6C3EFF}.big{font-size:52px;font-weight:900;color:#6C3EFF;line-height:1}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
  .box{background:#f5f3ff;border-radius:10px;padding:14px;text-align:center}
  .box-v{font-size:24px;font-weight:900;color:#6C3EFF}.box-l{font-size:10px;color:#999;text-transform:uppercase;margin-top:3px}
  .rev{background:#fafafa;border-radius:8px;padding:14px;margin:8px 0;border-left:3px solid #6C3EFF}
  .rev-h{display:flex;justify-content:space-between;font-size:12px;color:#999;margin-bottom:7px}
  .foot{margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center}
  </style></head><body>
  <div class="hdr">
    <div><div class="logo">★ RateMyUni</div>
    <div style="font-size:12px;color:#666;margin-top:4px">${p.title||''} · ${p.dept} · ${p.uni}</div>
    ${p.email?`<div style="font-size:11px;color:#999;margin-top:2px">${p.email}</div>`:''}
    <div style="font-size:11px;color:#999">Αναφορά: ${fmtDate(new Date().toISOString())}</div></div>
    <div style="text-align:right"><div class="big">${p.overall.toFixed(1)}</div>
    <div style="font-size:13px;color:#999">/ 5.0 · ${p.reviewCount} κριτικές</div></div>
  </div>
  <div style="font-size:26px;font-weight:800;margin-bottom:4px">${p.name}</div>
  <div class="grid">
    <div class="box"><div class="box-v">${p.overall.toFixed(1)}</div><div class="box-l">Συνολική</div></div>
    <div class="box"><div class="box-v">${p.difficulty.toFixed(1)}</div><div class="box-l">Δυσκολία</div></div>
    <div class="box"><div class="box-v">${p.organization.toFixed(1)}</div><div class="box-l">Οργάνωση</div></div>
    <div class="box"><div class="box-v">${p.inspiration.toFixed(1)}</div><div class="box-l">Εμπνέει</div></div>
  </div>
  <h3 style="font-size:15px;margin:16px 0 8px">Κριτικές Φοιτητών</h3>
  ${p.reviews.slice(0,6).map(r=>`<div class="rev">
    <div class="rev-h"><span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}${r.course?' · '+r.course:''}</span><span>${r.date}</span></div>
    <div style="font-size:13px">${r.text}</div></div>`).join('')}
  <div class="foot">RateMyUni · ratemyuni.gr · Δεδομένα βάσει κριτικών φοιτητών</div>
  </body></html>`);
  win.document.close(); setTimeout(()=>win.print(),600);
}

/* ── MODALS ── */
function openModal(id){
  const modal = document.getElementById(`modal-${id}`);
  const backdrop = document.getElementById('backdrop');
  if (!backdrop || !modal) {
    toast('⚠️ Αυτό το παράθυρο δεν είναι διαθέσιμο ακόμη','info');
    return;
  }
  if (id === 'addReview') {
    const deptField = document.getElementById('rv-dept');
    if (deptField) {
      if (S.user && S.user.uni && S.user.dept) {
        deptField.value = S.user.dept;
        deptField.disabled = true;
      } else {
        deptField.disabled = false;
      }
    }
    document.getElementById('rvSearchDrop')?.classList.remove('open');
  }
  S.modal=id;
  backdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeModal(){
  if(S.modal) document.getElementById(`modal-${S.modal}`)?.classList.add('hidden');
  document.getElementById('backdrop')?.classList.add('hidden');
  document.getElementById('rvSearchDrop')?.classList.remove('open');
  document.body.style.overflow=''; S.modal=null;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape') closeModal();});

/* ── USER MENU ── */
function toggleUserMenu(){document.getElementById('userDropdown').classList.toggle('hidden');}
function closeUserMenu(){document.getElementById('userDropdown')?.classList.add('hidden');}
function toggleMobileMenu(){document.getElementById('mobileMenu').classList.toggle('hidden');}
function closeMobileMenu(){document.getElementById('mobileMenu').classList.add('hidden');}

/* ── THEME ── */
function toggleTheme(){
  const c=document.documentElement.getAttribute('data-theme');
  const n=c==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',n);
  localStorage.setItem('rmu_theme',n);
  if(S.chart&&S.currentProf) setTimeout(()=>renderSemChart(S.currentProf),80);
  toast(n==='dark'?'🌙 Dark mode':'☀️ Light mode','info');
}

/* ── TOAST ── */
function toast(msg,type='info'){
  const z=document.getElementById('toastZone');
  const el=document.createElement('div');
  el.className=`toast toast-${type==='ok'?'ok':type==='err'?'err':'info'}`;
  el.textContent=msg; z.appendChild(el);
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),280);},3200);
}

/* ── COUNTERS ── */
function animateCounters(){
  document.querySelectorAll('.hs-n').forEach(el=>{
    const t=+el.dataset.t,s=Date.now();
    const tick=()=>{const p=Math.min((Date.now()-s)/1400,1),e=1-Math.pow(1-p,4);
      el.textContent=Math.round(e*t).toLocaleString('el-GR');if(p<1)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  });
}

/* ── PWA ── */
function initPWA(){
  if(localStorage.getItem('rmu_pwa_dismissed')) return;
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault(); S.deferredPWA=e;
    setTimeout(()=>document.getElementById('pwaBanner').classList.remove('hidden'),8000);
  });
}
function installPWA(){
  if(S.deferredPWA){S.deferredPWA.prompt();S.deferredPWA.userChoice.then(r=>{
    if(r.outcome==='accepted')toast('✅ Εγκαταστάθηκε!','ok');S.deferredPWA=null;dismissPWA();});}
  else{toast('📱 Χρησιμοποίησε τον browser','info');dismissPWA();}
}
function dismissPWA(){document.getElementById('pwaBanner').classList.add('hidden');localStorage.setItem('rmu_pwa_dismissed','1');}

/* ── UTILS ── */
const BADGE_MAP={easy:['bdg-easy','🎯 Εύκολος'],inspiring:['bdg-ins','💡 Εμπνέει'],organized:['bdg-org','📚 Οργανωμένος'],top:['bdg-top','🔥 Top Rated']};
function renderBadges(badges,white=false){return(badges||[]).map(b=>{const c=BADGE_MAP[b];if(!c)return'';return`<span class="bdg ${white?'bdg-wh':c[0]}">${c[1]}</span>`;}).join('');}
function avg(arr){if(!arr.length)return 0;return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10;}
function starsStr(r){const f=Math.floor(r),h=r%1>=.5?1:0;return'★'.repeat(f)+(h?'½':'')+'☆'.repeat(5-f-h);}
function fmtDate(s){try{return new Date(s).toLocaleDateString('el-GR',{day:'numeric',month:'long',year:'numeric'});}catch{return s;}}
function showEl(el,msg,type){if(!el)return;el.textContent=msg;el.classList.remove('hidden','success');if(type==='success')el.classList.add('success');}

/* ══════════════════════════════════════════════════
   AUTO-UPDATE — Κάθε Σεπτέμβρη ελέγχει για νέα data
══════════════════════════════════════════════════ */
(function autoUpdate() {
  const LAST_CHECK_KEY = 'rmu_last_update_check';
  const DATA_VERSION_KEY = 'rmu_data_version';

  // Current data version = number of professors
  const currentVersion = (typeof SEED_PROFESSORS !== 'undefined')
    ? SEED_PROFESSORS.length.toString()
    : '0';

  function checkForUpdate() {
    const now = new Date();
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    const storedVersion = localStorage.getItem(DATA_VERSION_KEY);

    // First time — save version and date
    if (!storedVersion) {
      localStorage.setItem(DATA_VERSION_KEY, currentVersion);
      localStorage.setItem(LAST_CHECK_KEY, now.toISOString());
      return;
    }

    // If September and hasn't checked this year → show reminder
    const isSeptember = now.getMonth() === 8; // 0-indexed
    const lastYear = lastCheck ? new Date(lastCheck).getFullYear() : 0;
    const isNewYear = now.getFullYear() > lastYear;

    if (isSeptember && isNewYear) {
      // Show update badge
      const badge = document.getElementById('updateBadge');
      if (badge) {
        badge.classList.remove('hidden');
        badge.innerHTML = `🔄 Αρχή ακαδ. έτους — Ελέγξτε για νέους καθηγητές
          <button onclick="applyUpdate()" type="button">Ανανέωση</button>
          <button onclick="dismissUpdate()" type="button" style="background:rgba(255,255,255,.15)">✕</button>`;
      }
    }

    // Update stored version
    localStorage.setItem(DATA_VERSION_KEY, currentVersion);
  }

  function dismissUpdate() {
    const badge = document.getElementById('updateBadge');
    if (badge) badge.classList.add('hidden');
    localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
  }

  function applyUpdate() {
    localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
    localStorage.setItem(DATA_VERSION_KEY, currentVersion);
    const badge = document.getElementById('updateBadge');
    if (badge) badge.classList.add('hidden');
    // Reload to pick up any new data.js
    window.location.reload(true);
  }

  // Expose globally
  window.applyUpdate = applyUpdate;
  window.dismissUpdate = dismissUpdate;

  // Run check after app loads
  setTimeout(checkForUpdate, 3000);
})();
