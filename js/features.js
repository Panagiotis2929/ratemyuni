/* ═══════════════════════════════════════════════════════════════════
   RateMyUni — Features Module v1.0
   Feature 1: Helpful Votes
   Feature 2: XP & Level System
   Feature 3: Achievement Badges
   Feature 4: Pass Rate System
═══════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────
   CONSTANTS
──────────────────────────────────────────────────────────────── */
const XP_RULES = {
  first_review:    50,
  new_review:      10,
  helpful_vote:     5,
  verified_email:  20,
  ten_reviews:    100,
};

const LEVELS = [
  { level:1,  xp:0,    name:'Νεοεισερχόμενος', icon:'🌱' },
  { level:2,  xp:50,   name:'Φοιτητής',         icon:'📚' },
  { level:3,  xp:150,  name:'Αξιολογητής',      icon:'⭐' },
  { level:4,  xp:300,  name:'Εμπειρογνώμονας',  icon:'🔥' },
  { level:5,  xp:600,  name:'Trusted Reviewer',  icon:'💎' },
  { level:6,  xp:1000, name:'Campus Expert',     icon:'🏆' },
  { level:7,  xp:2000, name:'Θρύλος',            icon:'👑' },
];

const ACHIEVEMENTS = [
  { id:'first_review',   icon:'🥉', name:'Πρώτη Κριτική',        desc:'Έγραψες την πρώτη σου κριτική!',         condition: u => u.reviewCount >= 1  },
  { id:'five_reviews',   icon:'🥈', name:'Ενεργός Αξιολογητής',  desc:'5 κριτικές — συνέχισε έτσι!',            condition: u => u.reviewCount >= 5  },
  { id:'ten_reviews',    icon:'🥇', name:'Trusted Reviewer',      desc:'10 κριτικές — αξιόπιστη γνώμη!',         condition: u => u.reviewCount >= 10 },
  { id:'fifty_reviews',  icon:'🏆', name:'Campus Expert',         desc:'50 κριτικές — θρυλική παρουσία!',        condition: u => u.reviewCount >= 50 },
  { id:'most_helpful',   icon:'💎', name:'Most Helpful',          desc:'Λαβες 20+ helpful votes συνολικά!',       condition: u => u.helpfulReceived >= 20 },
  { id:'verified',       icon:'✅', name:'Verified Student',       desc:'Επαλήθευση με πανεπιστημιακό email!',    condition: u => u.verified === true },
];

/* ────────────────────────────────────────────────────────────────
   GAMIFICATION STATE (localStorage with Supabase sync)
──────────────────────────────────────────────────────────────── */
const GS = {
  xp: 0,
  level: 1,
  badges: [],
  reviewCount: 0,
  helpfulReceived: 0,
  verified: false,
  passYes: 0,
  passNo: 0,
};

function loadGamification() {
  if (!S.user || S.user.role === 'guest') return;
  const key = `rmu_gs_${S.user.username}`;
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  Object.assign(GS, {
    xp:              stored.xp              || 0,
    level:           stored.level           || 1,
    badges:          stored.badges          || [],
    reviewCount:     stored.reviewCount     || 0,
    helpfulReceived: stored.helpfulReceived || 0,
    verified:        S.user.verified        || false,
    passYes:         stored.passYes         || 0,
    passNo:          stored.passNo          || 0,
  });
  // Award verified XP if not already done
  if (GS.verified && !stored.verifiedAwarded) {
    addXP(XP_RULES.verified_email, false);
    stored.verifiedAwarded = true;
    saveGamification();
  }
}

function saveGamification() {
  if (!S.user || S.user.role === 'guest') return;
  const key = `rmu_gs_${S.user.username}`;
  localStorage.setItem(key, JSON.stringify({
    xp:              GS.xp,
    level:           GS.level,
    badges:          GS.badges,
    reviewCount:     GS.reviewCount,
    helpfulReceived: GS.helpfulReceived,
    verified:        GS.verified,
    passYes:         GS.passYes,
    passNo:          GS.passNo,
    verifiedAwarded: true,
  }));
}

/* ────────────────────────────────────────────────────────────────
   XP SYSTEM
──────────────────────────────────────────────────────────────── */
function getLevelInfo(xp) {
  let current = LEVELS[0];
  let next    = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) { current = LEVELS[i]; next = LEVELS[i+1] || null; break; }
  }
  const progress = next
    ? Math.round(((xp - current.xp) / (next.xp - current.xp)) * 100)
    : 100;
  return { current, next, progress };
}

function addXP(amount, showAnim = true) {
  if (!S.user || S.user.role === 'guest') return;
  const oldLevel = getLevelInfo(GS.xp).current.level;
  GS.xp += amount;
  const newInfo = getLevelInfo(GS.xp);
  GS.level = newInfo.current.level;
  saveGamification();

  if (showAnim && GS.level > oldLevel) {
    setTimeout(() => showLevelUp(GS.level, newInfo.current.name), 800);
  }
  checkAchievements();
}

function showLevelUp(level, name) {
  const ov = document.getElementById('levelUpOverlay');
  const nm = document.getElementById('levelUpNum');
  const mg = document.getElementById('levelUpMsg');
  if (!ov) return;
  nm.textContent = level;
  mg.textContent = `${LEVELS.find(l=>l.level===level)?.icon || '⭐'} ${name}`;
  ov.classList.remove('hidden');
  ov.style.display = 'flex';
}

function closeLevelUp() {
  const ov = document.getElementById('levelUpOverlay');
  if (ov) { ov.classList.add('hidden'); ov.style.display = ''; }
}

/* ────────────────────────────────────────────────────────────────
   ACHIEVEMENT SYSTEM
──────────────────────────────────────────────────────────────── */
function checkAchievements() {
  if (!S.user || S.user.role === 'guest') return;
  const userData = {
    reviewCount:     GS.reviewCount,
    helpfulReceived: GS.helpfulReceived,
    verified:        GS.verified,
  };
  ACHIEVEMENTS.forEach(ach => {
    if (!GS.badges.includes(ach.id) && ach.condition(userData)) {
      GS.badges.push(ach.id);
      saveGamification();
      setTimeout(() => showBadgeUnlock(ach), 1400);
    }
  });
}

function showBadgeUnlock(ach) {
  const ov = document.getElementById('badgeUnlockOverlay');
  if (!ov) return;
  document.getElementById('badgeUnlockIcon').textContent = ach.icon;
  document.getElementById('badgeUnlockName').textContent = ach.name;
  document.getElementById('badgeUnlockDesc').textContent = ach.desc;
  ov.classList.remove('hidden');
  ov.style.display = 'flex';
}

function closeBadgeUnlock() {
  const ov = document.getElementById('badgeUnlockOverlay');
  if (ov) { ov.classList.add('hidden'); ov.style.display = ''; }
}

function getUnlockedBadges() {
  return ACHIEVEMENTS.filter(a => GS.badges.includes(a.id));
}

function getBadgeChips(max = 3) {
  return getUnlockedBadges()
    .slice(0, max)
    .map(b => `<span class="user-badge-chip" title="${b.name}">${b.icon}</span>`)
    .join('');
}

/* ────────────────────────────────────────────────────────────────
   PASS RATE SYSTEM
──────────────────────────────────────────────────────────────── */
let selectedPass = null; // true=passed, false=failed, null=not selected

function selectPass(passed) {
  selectedPass = passed;
  const yesBtn = document.getElementById('passYes');
  const noBtn  = document.getElementById('passNo');
  if (!yesBtn || !noBtn) return;
  yesBtn.classList.toggle('selected-yes', passed === true);
  yesBtn.classList.toggle('selected-no',  false);
  noBtn.classList.toggle('selected-no',   passed === false);
  noBtn.classList.toggle('selected-yes',  false);
}

function getPassRateForProf(prof) {
  const revWithPass = (prof.reviews || []).filter(r => r.passed !== undefined && r.passed !== null);
  if (!revWithPass.length) return null;
  const passed = revWithPass.filter(r => r.passed === true).length;
  const failed = revWithPass.filter(r => r.passed === false).length;
  const pct    = Math.round((passed / revWithPass.length) * 100);
  return { passed, failed, total: revWithPass.length, pct };
}

function renderPassRateCard(prof) {
  const data = getPassRateForProf(prof);
  if (!data) return `
    <div class="pass-rate-card">
      <div class="pass-rate-title">📈 Ποσοστό Επιτυχίας</div>
      <div class="pass-rate-msg">Δεν υπάρχουν ακόμα δεδομένα — γίνε ο πρώτος που δηλώνει!</div>
    </div>`;

  const cls = data.pct >= 70 ? 'green' : data.pct >= 40 ? 'mid' : 'low';
  return `
    <div class="pass-rate-card">
      <div class="pass-rate-header">
        <div class="pass-rate-title">📈 Ποσοστό Επιτυχίας</div>
        <div class="pass-rate-pct ${cls}">${data.pct}%</div>
      </div>
      <div class="pass-rate-bar-bg">
        <div class="pass-rate-bar-fill" style="width:${data.pct}%"></div>
      </div>
      <div class="pass-rate-stats">
        <div class="prs"><div class="prs-v">${data.total}</div><div class="prs-l">Συμμετοχές</div></div>
        <div class="prs"><div class="prs-v green">${data.passed}</div><div class="prs-l">✅ Πέρασαν</div></div>
        <div class="prs"><div class="prs-v red">${data.failed}</div><div class="prs-l">❌ Κόπηκαν</div></div>
      </div>
      <div class="pass-rate-msg">
        <b>${data.pct}%</b> των φοιτητών που αξιολόγησαν δήλωσαν ότι <b>πέρασαν</b> το μάθημα.
      </div>
    </div>`;
}

/* ────────────────────────────────────────────────────────────────
   HELPFUL VOTES
──────────────────────────────────────────────────────────────── */
const VOTES_KEY = 'rmu_votes'; // localStorage: { reviewId: 'up'|'down' }

function getVotes() {
  return JSON.parse(localStorage.getItem(VOTES_KEY) || '{}');
}

function saveVote(reviewId, type) {
  const votes = getVotes();
  votes[reviewId] = type;
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

function voteHelpful(reviewId, profId, type, authorUid) {
  if (!S.user || S.user.role === 'guest') { toast('Συνδέσου για να ψηφίσεις','err'); return; }
  if (authorUid === S.user.username)       { toast('Δεν μπορείς να ψηφίσεις δική σου κριτική','err'); return; }

  const votes = getVotes();
  if (votes[reviewId]) { toast('Έχεις ήδη ψηφίσει αυτή την κριτική','info'); return; }

  // Find the review and update votes
  const prof = S.professors.find(p => p.id === profId);
  if (!prof) return;
  const rev = prof.reviews.find(r => r.id === reviewId);
  if (!rev) return;

  if (type === 'up') {
    rev.helpfulUp = (rev.helpfulUp || 0) + 1;
    // Award XP to review author
    if (authorUid !== 'seed') {
      const authorKey = `rmu_gs_${authorUid}`;
      const authorGS  = JSON.parse(localStorage.getItem(authorKey) || '{}');
      authorGS.helpfulReceived = (authorGS.helpfulReceived || 0) + 1;
      authorGS.xp = (authorGS.xp || 0) + XP_RULES.helpful_vote;
      localStorage.setItem(authorKey, JSON.stringify(authorGS));
    }
    // Award voter XP too
    addXP(1, false);
  } else {
    rev.helpfulDown = (rev.helpfulDown || 0) + 1;
  }

  saveVote(reviewId, type);

  // Persist extra reviews
  const er = JSON.parse(localStorage.getItem('rmu_extra_reviews') || '{}');
  if (!er[profId]) er[profId] = [];
  const idx = er[profId].findIndex(r => r.id === reviewId);
  if (idx >= 0) er[profId][idx] = rev;
  else er[profId].push(rev);
  localStorage.setItem('rmu_extra_reviews', JSON.stringify(er));

  toast(type === 'up' ? '👍 Ψήφος καταγράφηκε!' : '👎 Ψήφος καταγράφηκε!', 'ok');

  // Re-render current detail page
  if (S.currentProf && S.currentProf.id === profId) {
    renderProfDetail(S.currentProf);
  }
}

function renderHelpfulBtns(rev, profId) {
  const votes    = getVotes();
  const myVote   = votes[rev.id];
  const isOwn    = S.user && rev.uid === S.user.username;
  const upCnt    = rev.helpfulUp   || 0;
  const downCnt  = rev.helpfulDown || 0;
  const ownCls   = isOwn ? 'own-review' : '';
  const upCls    = myVote === 'up'   ? 'voted-up'   : '';
  const downCls  = myVote === 'down' ? 'voted-down' : '';
  const disabled = isOwn ? 'disabled' : '';
  return `
    <div class="helpful-btns">
      <button class="helpful-btn ${upCls} ${ownCls}"
        onclick="voteHelpful('${rev.id}','${profId}','up','${rev.uid}')"
        ${disabled} type="button" title="${isOwn?'Δεν μπορείς να ψηφίσεις δική σου κριτική':'Χρήσιμο'}">
        👍 ${upCnt > 0 ? upCnt : ''} Χρήσιμο
      </button>
      <button class="helpful-btn ${downCls} ${ownCls}"
        onclick="voteHelpful('${rev.id}','${profId}','down','${rev.uid}')"
        ${disabled} type="button" title="${isOwn?'':'Όχι χρήσιμο'}">
        👎 ${downCnt > 0 ? downCnt : ''}
      </button>
    </div>`;
}

/* Review sort */
let currentRevSort = 'helpful';

function sortReviews(reviews) {
  const arr = [...reviews];
  if (currentRevSort === 'helpful') {
    return arr.sort((a,b) => (b.helpfulUp||0) - (a.helpfulUp||0));
  } else if (currentRevSort === 'newest') {
    return arr.sort((a,b) => new Date(b.date) - new Date(a.date));
  } else if (currentRevSort === 'highest') {
    return arr.sort((a,b) => b.rating - a.rating);
  }
  return arr;
}

function setRevSort(type, el) {
  currentRevSort = type;
  document.querySelectorAll('.rev-sort-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  if (S.currentProf) renderProfDetail(S.currentProf);
}

/* ────────────────────────────────────────────────────────────────
   PROFILE PAGE UPGRADE
──────────────────────────────────────────────────────────────── */
function renderProfileUpgraded() {
  const el = document.getElementById('profileContent');
  if (!S.user || S.user.role === 'guest') {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔒</div>
      <div class="empty-ttl">Συνδέσου για το προφίλ σου</div></div>`; return;
  }
  const u = S.user;
  loadGamification();
  const lvInfo  = getLevelInfo(GS.xp);
  const myRevs  = S.professors.flatMap(p => p.reviews.filter(r => r.uid === u.username));
  const avgR    = myRevs.length ? (myRevs.reduce((a,r) => a+r.rating, 0)/myRevs.length).toFixed(1) : '—';
  const totalUp = myRevs.reduce((a,r) => a + (r.helpfulUp||0), 0);
  const passTotal = myRevs.filter(r => r.passed !== null && r.passed !== undefined).length;
  const passYes   = myRevs.filter(r => r.passed === true).length;
  const unlockedBadges = getUnlockedBadges();
  const reputationScore = GS.xp + totalUp * 3 + GS.reviewCount * 5;

  el.innerHTML = `
    <!-- HERO -->
    <div class="profile-hero">
      <div class="profile-hero-top">
        <div class="profile-avatar-big">${u.avatar || u.username[0].toUpperCase()}</div>
        <div class="profile-hero-info">
          <div class="profile-hero-name">
            ${u.username}
            <span style="font-size:18px;margin-left:6px">${getBadgeChips(4)}</span>
          </div>
          <div class="profile-hero-sub">
            ${u.dept||''}${u.dept&&u.uni?' · ':''}${u.uni||''}
            ${u.verified ? ' · <span style="color:#10B981;font-size:12px">✅ Verified</span>' : ''}
          </div>
          <div class="profile-hero-badges">
            <span class="level-badge">${lvInfo.current.icon} Level ${lvInfo.current.level} — ${lvInfo.current.name}</span>
            <span class="level-badge" style="background:linear-gradient(135deg,#F59E0B,#EF4444)">
              ⭐ ${reputationScore} Rep
            </span>
          </div>
        </div>
      </div>
      <!-- XP BAR -->
      <div class="profile-xp-section">
        <div class="profile-xp-top">
          <div class="profile-level-label">${lvInfo.current.icon} Level ${lvInfo.current.level}</div>
          <div class="profile-xp-nums">${GS.xp} XP${lvInfo.next ? ` / ${lvInfo.next.xp} XP` : ' (MAX)'}</div>
        </div>
        <div class="profile-xp-bar-bg">
          <div class="profile-xp-bar-fill" style="width:${lvInfo.progress}%"></div>
        </div>
        <div class="profile-level-label" style="margin-top:5px;font-size:11px;opacity:.6">
          ${lvInfo.next ? `${lvInfo.next.xp - GS.xp} XP για Level ${lvInfo.next.level}` : 'Μέγιστο Επίπεδο! 👑'}
        </div>
      </div>
    </div>

    <!-- STATS -->
    <div class="profile-stats-row">
      <div class="profile-stat-box">
        <div class="psb-v">${GS.reviewCount}</div>
        <div class="psb-l">📝 Κριτικές</div>
      </div>
      <div class="profile-stat-box">
        <div class="psb-v">${totalUp}</div>
        <div class="psb-l">👍 Helpful Votes</div>
      </div>
      <div class="profile-stat-box">
        <div class="psb-v">${avgR}</div>
        <div class="psb-l">⭐ Μέση Βαθμ.</div>
      </div>
      <div class="profile-stat-box">
        <div class="psb-v">${passTotal > 0 ? Math.round((passYes/passTotal)*100)+'%' : '—'}</div>
        <div class="psb-l">📈 Pass Rate</div>
      </div>
    </div>

    <!-- ACHIEVEMENTS -->
    <div class="profile-form" style="margin-bottom:18px">
      <div class="profile-section-title">🏅 Achievements (${unlockedBadges.length}/${ACHIEVEMENTS.length})</div>
      <div class="achievements-grid">
        ${ACHIEVEMENTS.map(ach => {
          const unlocked = GS.badges.includes(ach.id);
          return `<div class="achievement-item ${unlocked?'unlocked':'locked'}">
            <span class="achievement-icon">${ach.icon}</span>
            <div class="achievement-name">${ach.name}</div>
            <div class="achievement-desc">${ach.desc}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- RECENT REVIEWS -->
    <div class="profile-form">
      <div class="profile-section-title">📝 Πρόσφατες Κριτικές μου</div>
      ${myRevs.length === 0
        ? `<div class="empty"><div class="empty-ico">📝</div>
           <div class="empty-ttl">Δεν έχεις γράψει κριτικές ακόμα</div>
           <div class="empty-sub"><button class="btn-primary" onclick="openModal('addReview')">Γράψε τώρα →</button></div></div>`
        : myRevs.slice(0,5).map(r => {
            const prof = S.professors.find(p => p.reviews.some(x => x.id === r.id));
            return `<div class="rev-item">
              <div class="rev-top">
                <div class="rev-meta">
                  <div class="rev-av">✏️</div>
                  <div>
                    <div class="rev-author" style="cursor:pointer;color:var(--primary)"
                      onclick="navigate('professor','${prof?.id||''}')">${prof?.name||'Καθηγητής'}</div>
                    <div class="rev-date">${fmtDate(r.date)}${r.course?' · '+r.course:''}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="rev-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                  ${r.helpfulUp > 0 ? `<span style="font-size:12px;color:var(--green)">👍 ${r.helpfulUp}</span>` : ''}
                  ${r.passed !== null && r.passed !== undefined
                    ? `<span style="font-size:12px">${r.passed?'✅':'❌'}</span>` : ''}
                </div>
              </div>
              <div class="rev-text">${r.text}</div>
            </div>`;
          }).join('')}
    </div>

    <!-- SETTINGS -->
    <div class="profile-form" style="margin-top:18px">
      <div class="profile-section-title">⚙️ Ρυθμίσεις</div>
      <div class="frow">
        <div class="fg"><label>Πανεπιστήμιο</label>
          <select onchange="saveProfileField('uni',this.value)">
            <option ${u.uni==='ΑΠΘ'?'selected':''}>ΑΠΘ</option>
            <option ${u.uni==='ΕΚΠΑ'?'selected':''}>ΕΚΠΑ</option>
            <option ${u.uni==='ΕΜΠ'?'selected':''}>ΕΜΠ</option>
            <option ${u.uni==='ΟΠΑ'?'selected':''}>ΟΠΑ</option>
            <option>Άλλο</option>
          </select>
        </div>
        <div class="fg"><label>Αλλαγή Κωδικού</label>
          <div class="pass-wrap">
            <input type="password" id="newPass" placeholder="Νέος κωδικός"/>
            <button class="pass-eye" onclick="togglePass('newPass',this)" type="button">👁</button>
          </div>
        </div>
      </div>
      <button class="btn-primary" style="margin-top:10px" onclick="savePassword()" type="button">💾 Αποθήκευση</button>
    </div>`;
}

/* ────────────────────────────────────────────────────────────────
   OVERRIDE renderProfile to use upgraded version
──────────────────────────────────────────────────────────────── */
window.renderProfile = renderProfileUpgraded;

/* ────────────────────────────────────────────────────────────────
   PATCH renderProfDetail to inject pass rate + helpful votes
──────────────────────────────────────────────────────────────── */
const _origRenderProfDetail = window.renderProfDetail;
window.renderProfDetail = function(p) {
  _origRenderProfDetail(p);
  // Inject pass rate card after breakdown card
  const breakdownCard = document.querySelector('.breakdown-card');
  if (breakdownCard) {
    const passCard = document.createElement('div');
    passCard.innerHTML = renderPassRateCard(p);
    breakdownCard.parentNode.insertBefore(passCard.firstElementChild, breakdownCard.nextSibling);
  }
  // Inject sort bar + helpful votes into reviews
  const revHead = document.querySelector('.rev-head');
  if (revHead) {
    const sortBar = document.createElement('div');
    sortBar.className = 'rev-sort-bar';
    sortBar.innerHTML = `
      <button class="rev-sort-btn ${currentRevSort==='helpful'?'active':''}"
        onclick="setRevSort('helpful',this)" type="button">🔥 Most Helpful</button>
      <button class="rev-sort-btn ${currentRevSort==='newest'?'active':''}"
        onclick="setRevSort('newest',this)" type="button">🕐 Newest</button>
      <button class="rev-sort-btn ${currentRevSort==='highest'?'active':''}"
        onclick="setRevSort('highest',this)" type="button">⭐ Highest Rated</button>`;
    revHead.parentNode.insertBefore(sortBar, revHead.nextSibling);
  }
  // Re-render reviews with sort + helpful buttons
  const sorted = sortReviews(p.reviews || []);
  const revContainer = document.querySelector('.reviews-card');
  if (!revContainer || !sorted.length) return;
  const existingItems = revContainer.querySelectorAll('.rev-item');
  existingItems.forEach(el => el.remove());
  sorted.forEach(r => {
    const div = document.createElement('div');
    div.className = 'rev-item';
    div.innerHTML = `
      <div class="rev-top">
        <div class="rev-meta">
          <div class="rev-av">👤</div>
          <div>
            <div class="rev-author">Ανώνυμος Φοιτητής</div>
            <div class="rev-date">${fmtDate(r.date)}</div>
          </div>
          ${r.course ? `<span class="rev-course">${r.course}</span>` : ''}
          ${r.sem    ? `<span class="rev-sem">${r.sem}ο Εξ.</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="rev-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
          ${r.passed !== null && r.passed !== undefined
            ? `<span title="${r.passed?'Πέρασε':'Κόπηκε'}" style="font-size:14px">${r.passed?'✅':'❌'}</span>`
            : ''}
        </div>
      </div>
      <div class="rev-text">${r.text}</div>
      ${r.chips?.length ? `<div class="rev-chips">${r.chips.map(c=>`<span class="bdg bdg-easy">${c}</span>`).join('')}</div>` : ''}
      <div class="rev-actions">
        ${renderHelpfulBtns(r, p.id)}
        <div style="font-size:11px;color:var(--t3)">${r.helpfulUp > 0 ? `👍 ${r.helpfulUp} βρήκαν χρήσιμο` : ''}</div>
      </div>`;
    revContainer.appendChild(div);
  });
};

/* ────────────────────────────────────────────────────────────────
   PATCH submitReview to award XP + handle pass rate
──────────────────────────────────────────────────────────────── */
const _origSubmitReview = window.submitReview;
window.submitReview = function() {
  // Validate pass rate
  if (selectedPass === null) {
    toast('Απάντησε αν πέρασες το μάθημα','err'); return;
  }
  // Call original submit
  _origSubmitReview();
  // After submit: award XP
  if (!S.user || S.user.role === 'guest') return;
  loadGamification();
  const wasFirst = GS.reviewCount === 0;
  GS.reviewCount++;
  if (selectedPass === true)  GS.passYes++;
  else                        GS.passNo++;

  // Inject passed field into the last review
  const allRevs = S.professors.flatMap(p => p.reviews.filter(r => r.uid === S.user.username));
  if (allRevs.length > 0) {
    allRevs[allRevs.length - 1].passed = selectedPass;
  }

  saveGamification();
  addXP(XP_RULES.new_review);
  if (wasFirst) addXP(XP_RULES.first_review);
  if (GS.reviewCount === 10) addXP(XP_RULES.ten_reviews);
  checkAchievements();
  selectedPass = null;
};

/* ────────────────────────────────────────────────────────────────
   INIT — called after app loads
──────────────────────────────────────────────────────────────── */
function initFeatures() {
  loadGamification();
  // Update nav user pill with badges
  const navUsername = document.getElementById('navUsername');
  if (navUsername && S.user && S.user.role !== 'guest') {
    const chips = getBadgeChips(2);
    if (chips) navUsername.innerHTML = `${S.user.username} ${chips}`;
  }
}

// Hook into app init
const _origInitApp = window.initApp;
window.initApp = function() {
  _origInitApp();
  setTimeout(initFeatures, 500);
};

// Expose globals
window.selectPass        = selectPass;
window.voteHelpful       = voteHelpful;
window.setRevSort        = setRevSort;
window.closeLevelUp      = closeLevelUp;
window.closeBadgeUnlock  = closeBadgeUnlock;
window.loadGamification  = loadGamification;
