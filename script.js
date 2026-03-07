// ═══════════════════════════════════════════════════════════════
//  QuizMe  script.js  v5.1
//  Stats engine · Mastery · Gist sync (differential) · Audio
//  Optimised storage · Health checks · Info TOC · Heatmap drill
// ═══════════════════════════════════════════════════════════════

/* ── Storage helpers ──────────────────────────────────────────
   Stats format (short keys, unix timestamp):
   { "Q00001": { a:12, c:9, w:3, t:1741440191, k:3, s:"biharEconomy" } }
   Flagged format:
   { "Q00023": { s:"polity", t:1741440191 } }
──────────────────────────────────────────────────────────────── */
function safeParseJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e) { return fallback; }
}
function saveStats()   { localStorage.setItem('qm-stats-v2',  JSON.stringify(questionStats)); statsDirty = true; }
function saveConfig()  { localStorage.setItem('qm-gist-config', JSON.stringify(gistConfig)); }
function saveFlagged() { localStorage.setItem('qm-flagged', JSON.stringify(flaggedQ)); }

/* ── Persistent state ────────────────────────────────────────── */
let questionStats = safeParseJSON('qm-stats-v2',   {});
let flaggedQ      = safeParseJSON('qm-flagged',     {});
let gistConfig    = safeParseJSON('qm-gist-config', { token:'', gistId:'' });
let syncQueue     = safeParseJSON('qm-sync-queue',  []);
let examConfig    = safeParseJSON('qm-exam',        { name:'', date:'' });
let negMarking    = localStorage.getItem('qm-neg-marking') === 'true';
let soundEnabled  = localStorage.getItem('qm-sound') !== 'false'; // default on

/* ── Runtime state ───────────────────────────────────────────── */
let questions            = [];
let usedIndexes          = new Set();
let currentQuestionIndex = 0;
let dataUrl              = 'data/all.json';
let currentSubject       = 'all';
let availableSheets      = [];
let quizMode             = localStorage.getItem('qm-mode') || 'normal';
let activeTab            = localStorage.getItem('qm-tab')  || 'quiz';
let filteredIndexes      = [];
let sessionAnswered      = 0;
let sessionCorrect       = 0;
let sessionBestStreak    = 0;
let sessionCurrentStreak = 0;
let sessionNewMastered   = 0;
let simScore             = 0;  // for negative marking display
let healthCheckDone      = false;
let statsDirty           = false;        // for render caching
let statsLastRendered    = -1;           // timestamp of last render
let syncTimer            = null;         // batched sync timer
let advanceTimer         = null;         // auto-advance timer

/* ── Theme (before DOMContentLoaded) ────────────────────────── */
(function initTheme() {
    const t = localStorage.getItem('quizme-theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
})();

// ═══════════════════════════════════════════════════════════════
//  AUDIO ENGINE  (Web Audio API — no files needed)
// ═══════════════════════════════════════════════════════════════
let audioCtx = null;
let audioUnlocked = false;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function unlockAudio() {
    if (audioUnlocked) return;
    try {
        const ctx = getAudioCtx();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        audioUnlocked = true;
    } catch(e) {}
}

function playSound(type) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        if (type === 'correct') {
            // Soft rising chime
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(680, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);

        } else if (type === 'wrong') {
            // Soft low thud
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.14, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.28);

        } else if (type === 'flag') {
            // Tiny click
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(900, ctx.currentTime);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);

        } else if (type === 'flip') {
            // Page flip — two-layer noise burst
            const bufSize = ctx.sampleRate * 0.06;
            const buf  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
            const src    = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain   = ctx.createGain();
            src.buffer = buf;
            filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 0.8;
            src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
            src.start(ctx.currentTime);
        }
    } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
//  STATS ENGINE  (optimised short-key format)
// ═══════════════════════════════════════════════════════════════

function recordAnswer(subject, qid, isCorrect) {
    // Never record stats in 'all' mode or revision mode
    if (subject === 'all' || quizMode === 'revision') return;
    if (!qid) return;

    if (!questionStats[qid]) {
        questionStats[qid] = { a:0, c:0, w:0, t:0, k:0, s:subject };
    }
    const s = questionStats[qid];
    s.a++;
    s.s = subject;
    s.t = Math.floor(Date.now() / 1000);
    if (isCorrect) { s.c++; s.k++; }
    else           { s.w++; s.k = 0; }

    saveStats();
    queueSync({ q:qid, s:subject, r:isCorrect?1:0, t:s.t });
}

function getAttempts(qid)  { return questionStats[qid]?.a ?? 0; }
function getCorrect(qid)   { return questionStats[qid]?.c ?? 0; }
function getWrong(qid)     { return questionStats[qid]?.w ?? 0; }
function getConsec(qid)    { return questionStats[qid]?.k ?? 0; }
function getLastSeen(qid)  { return questionStats[qid]?.t ?? 0; }

function getAccuracy(qid) {
    const s = questionStats[qid];
    if (!s || s.a === 0) return null;
    return Math.round((s.c / s.a) * 100);
}

function getMastery(qid) {
    const s = questionStats[qid];
    if (!s || s.a === 0) return 'new';
    if (s.k >= 4)        return 'mastered';
    if (s.k >= 2)        return 'familiar';
    return 'learning';
}

function isStale(qid) {
    const t = getLastSeen(qid);
    if (!t) return false;
    return (Math.floor(Date.now()/1000) - t) > 30 * 86400;
}

function getSubjectStats(subjectFile) {
    const subject = subjectFile.replace('.json', '');
    const entries = Object.entries(questionStats).filter(([,s]) => s.s === subject);
    const attempts = entries.reduce((sum,[,s]) => sum + s.a, 0);
    const correct  = entries.reduce((sum,[,s]) => sum + s.c, 0);
    const accuracy = attempts ? Math.round((correct / attempts) * 100) : null;
    return { subject, attempts, correct, accuracy, tracked: entries.length };
}

function classifyAcc(acc) {
    if (acc === null) return 'untouched';
    if (acc < 50)    return 'weak';
    if (acc < 75)    return 'average';
    return 'strong';
}

function getOverall() {
    const keys = Object.keys(questionStats);
    const attempts = keys.reduce((s,k) => s + questionStats[k].a, 0);
    const correct  = keys.reduce((s,k) => s + questionStats[k].c, 0);
    const wrong    = keys.reduce((s,k) => s + questionStats[k].w, 0);
    return { attempts, correct, wrong,
             accuracy: attempts ? Math.round((correct/attempts)*100) : 0,
             uniqueQ: keys.length };
}

function getMasteryBreakdown() {
    let mastered=0, familiar=0, learning=0;
    Object.keys(questionStats).forEach(k => {
        const m = getMastery(k);
        if (m==='mastered') mastered++;
        else if (m==='familiar') familiar++;
        else learning++;
    });
    return { mastered, familiar, learning };
}

function getExamReadiness() {
    const subjects = availableSheets.filter(s => s !== 'all.json');
    if (!subjects.length) return 0;
    let total = 0, count = 0;
    subjects.forEach(s => {
        const st = getSubjectStats(s);
        if (st.accuracy !== null) { total += st.accuracy; count++; }
    });
    const accScore = count ? total / count : 0;
    const { mastered, familiar, learning } = getMasteryBreakdown();
    const tracked = mastered + familiar + learning;
    const mastScore = tracked ? ((mastered*100 + familiar*60 + learning*30) / tracked) : 0;
    return Math.round(accScore * 0.6 + mastScore * 0.4);
}

function getFocusToday() {
    return availableSheets
        .filter(s => s !== 'all.json')
        .map(s => {
            const st   = getSubjectStats(s);
            const name = formatSubject(s.replace('.json',''));
            let reason = st.accuracy === null ? 'never attempted'
                       : st.accuracy < 50     ? `${st.accuracy}% accuracy`
                       : `${st.accuracy}% — needs work`;
            return { ...st, name, file: s, reason, score: st.accuracy ?? -1 };
        })
        .filter(s => s.accuracy === null || s.accuracy < 70)
        .sort((a,b) => a.score - b.score)
        .slice(0, 3);
}

function formatSubject(name) {
    // camelCase → Title Case with spaces
    return name.replace(/([A-Z])/g,' $1').trim()
               .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function hasAnyStats() {
    return Object.keys(questionStats).length > 0;
}

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

function runHealthCheck() {
    if (healthCheckDone || !questions.length) return;
    healthCheckDone = true;

    // Corruption check
    const raw = localStorage.getItem('qm-stats-v2');
    if (raw) {
        try { JSON.parse(raw); } catch(e) {
            showHealthAlert('critical', 'Statistics data is corrupted',
                'QuizMe cannot read your saved stats. This can happen if browser storage was partially cleared.',
                [{ label:'Reset Statistics', cls:'btn-reset', action: doReset }]);
            return;
        }
    }

    // One-time migration from old text-key format
    if (!localStorage.getItem('qm-migration-v2')) {
        const hasOldKeys = Object.keys(questionStats).some(k => k.includes('::'));
        if (hasOldKeys) {
            questionStats = {};
            saveStats();
            localStorage.setItem('qm-migration-v2', 'true');
            showHealthAlert('subtle', 'Statistics upgraded',
                'Your stats have been upgraded to a new format using stable Question IDs. Previous stats could not be migrated.',
                [{ label:'Dismiss', cls:'btn-dismiss', action: hideHealthAlert }]);
            return;
        }
        localStorage.setItem('qm-migration-v2', 'true');
    }

    // Orphan detection
    const allQIDs    = new Set(questions.map(q => q.qid).filter(Boolean));
    const tracked    = Object.keys(questionStats);
    if (!tracked.length) return;
    const orphans    = tracked.filter(k => !allQIDs.has(k));
    const orphanPct  = Math.round((orphans.length / tracked.length) * 100);
    if (orphanPct === 0) return;

    if (orphanPct <= 5) {
        // Silent cleanup
        orphans.forEach(k => delete questionStats[k]);
        saveStats();
    } else if (orphanPct <= 30) {
        showHealthBadge();
        showHealthAlert('subtle', `${orphans.length} tracked questions no longer exist`,
            'Normal after deleting questions. Stats for active questions are unaffected.',
            [
                { label:'Clean up', cls:'btn-cleanup', action: () => {
                    orphans.forEach(k => delete questionStats[k]);
                    saveStats(); hideHealthAlert(); renderStatsTab(true);
                }},
                { label:'Dismiss', cls:'btn-dismiss', action: hideHealthAlert }
            ]);
    } else {
        showHealthBadge();
        showHealthAlert('critical', `${orphanPct}% of tracked stats are outdated`,
            'Usually happens after a full QID renumber. Reset stats to clear.',
            [
                { label:'Reset Statistics', cls:'btn-reset', action: doReset },
                { label:'Keep for now',     cls:'btn-dismiss', action: hideHealthAlert }
            ]);
    }
}

function showHealthAlert(type, title, msg, btns) {
    const el = document.getElementById('stats-health-alert');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<div class="health-alert ${type}">
        <h4>${title}</h4><p>${msg}</p>
        <div class="health-alert-btns">
            ${btns.map((b,i) => `<button class="${b.cls}" data-hi="${i}">${b.label}</button>`).join('')}
        </div></div>`;
    el.querySelectorAll('button').forEach((btn,i) => btn.addEventListener('click', btns[i].action));
}
function hideHealthAlert() {
    const el = document.getElementById('stats-health-alert');
    if (el) el.style.display = 'none';
}
function showHealthBadge() {
    ['stats-nav-badge','stats-bottom-badge'].forEach(id => {
        const e = document.getElementById(id); if (e) e.style.display = 'inline-block';
    });
}
function doReset() {
    if (!confirm('Reset ALL statistics? This cannot be undone.')) return;
    questionStats = {};
    saveStats();
    hideHealthAlert();
    ['stats-nav-badge','stats-bottom-badge'].forEach(id => {
        const e = document.getElementById(id); if (e) e.style.display = 'none';
    });
    renderStatsTab(true);
}

// ═══════════════════════════════════════════════════════════════
//  GIST SYNC  (differential — sends only changed QID)
// ═══════════════════════════════════════════════════════════════

const SYNC_BATCH_INTERVAL = 30000; // 30s
const SYNC_QUEUE_CAP      = 500;

function queueSync(entry) {
    if (!gistConfig.token || !gistConfig.gistId) return;
    syncQueue.push(entry);
    if (syncQueue.length > SYNC_QUEUE_CAP) syncQueue = syncQueue.slice(-SYNC_QUEUE_CAP);
    localStorage.setItem('qm-sync-queue', JSON.stringify(syncQueue));
    // Batch: debounce to avoid hammering API
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, SYNC_BATCH_INTERVAL);
}

async function flushSync() {
    if (!gistConfig.token || !gistConfig.gistId || !syncQueue.length) return;
    clearTimeout(syncTimer);
    try {
        setSyncUI('busy');
        // Fetch existing gist
        const res = await fetch(`https://api.github.com/gists/${gistConfig.gistId}`,
            { headers: { Authorization: `token ${gistConfig.token}`, Accept: 'application/vnd.github.v3+json' } });
        if (!res.ok) throw new Error('fetch');
        const gist     = await res.json();
        const existing = gist.files['quizme-stats.json']
            ? JSON.parse(gist.files['quizme-stats.json'].content)
            : { stats:{}, history:[], flagged:{} };

        // Differential merge: only update changed QIDs from syncQueue
        const changedQIDs = [...new Set(syncQueue.map(e => e.q).filter(Boolean))];
        changedQIDs.forEach(qid => {
            if (questionStats[qid]) existing.stats[qid] = questionStats[qid];
            else delete existing.stats[qid];
        });
        existing.flagged  = flaggedQ;
        existing.history  = [...(existing.history||[]), ...syncQueue].slice(-500);
        existing.lastSync = Math.floor(Date.now()/1000);

        const upd = await fetch(`https://api.github.com/gists/${gistConfig.gistId}`,
            { method: 'PATCH',
              headers: { Authorization: `token ${gistConfig.token}`,
                         'Content-Type': 'application/json',
                         Accept: 'application/vnd.github.v3+json' },
              body: JSON.stringify({ files: { 'quizme-stats.json': {
                  content: JSON.stringify(existing, null, 2)
              }}})
            });
        if (!upd.ok) throw new Error('update');
        syncQueue = [];
        localStorage.setItem('qm-sync-queue', '[]');
        setSyncUI('ok');
    } catch(e) { setSyncUI('err'); }
}

async function createGist(token) {
    const res = await fetch('https://api.github.com/gists',
        { method: 'POST',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json',
                     Accept: 'application/vnd.github.v3+json' },
          body: JSON.stringify({
              description: 'QuizMe Statistics Backup', public: false,
              files: { 'quizme-stats.json': {
                  content: JSON.stringify({ stats: questionStats, flagged: flaggedQ,
                                            history: [], lastSync: Math.floor(Date.now()/1000) }, null, 2)
              }}
          })
        });
    if (!res.ok) throw new Error('Failed to create Gist');
    return (await res.json()).id;
}

function setSyncUI(status) {
    const dot   = document.getElementById('sync-dot');
    const badge = document.getElementById('sync-status');
    if (!dot || !badge) return;
    const map = { ok:['ok','✓ Synced'], busy:['busy','↻ Syncing…'], err:['err','⚠ Failed'], idle:['idle','Not connected'] };
    const [cls, txt] = map[status] || map.idle;
    dot.className     = `sync-dot ${cls}`;
    badge.textContent = txt;
    badge.className   = `sync-status-badge sync-${cls}`;
}

// ═══════════════════════════════════════════════════════════════
//  QUIZ MODES
// ═══════════════════════════════════════════════════════════════

function buildFiltered() {
    filteredIndexes = [];
    for (let i = 0; i < questions.length; i++) {
        const qid = questions[i].qid;
        const acc = getAccuracy(qid);
        const m   = getMastery(qid);
        if      (quizMode === 'weak')     { if (acc === null || acc < 60) filteredIndexes.push(i); }
        else if (quizMode === 'unseen')   { if (getAttempts(qid) === 0)   filteredIndexes.push(i); }
        else if (quizMode === 'revision') { if (m === 'mastered')          filteredIndexes.push(i); }
        else filteredIndexes.push(i);
    }
}

function getNextIndex() {
    const available = filteredIndexes.filter(i => !usedIndexes.has(i));
    if (!available.length) return -1;
    if (quizMode === 'normal') {
        const weights = available.map(i => {
            const acc = getAccuracy(questions[i].qid);
            return acc === null ? 2 : acc < 50 ? 4 : acc < 75 ? 2 : 1;
        });
        const total = weights.reduce((a,b) => a+b, 0);
        let rand = Math.random() * total;
        for (let i = 0; i < available.length; i++) {
            rand -= weights[i];
            if (rand <= 0) { usedIndexes.add(available[i]); return available[i]; }
        }
    }
    const idx = available[Math.floor(Math.random() * available.length)];
    usedIndexes.add(idx);
    return idx;
}

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════

function switchTab(tab) {
    activeTab = tab;
    localStorage.setItem('qm-tab', tab);
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('tab-' + tab);
    if (page) page.classList.add('active');
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (tab === 'stats') renderStatsTab();
    if (tab === 'info')  renderInfoTab();
}

// ═══════════════════════════════════════════════════════════════
//  STATS TAB RENDERER  (with caching)
// ═══════════════════════════════════════════════════════════════

function renderStatsTab(force = false) {
    const now = Date.now();
    // Only re-render if stats changed or forced or 60s passed
    if (!force && !statsDirty && (now - statsLastRendered) < 60000) return;
    statsLastRendered = now;
    statsDirty = false;

    // Toggle empty state vs content
    const empty   = document.getElementById('stats-empty');
    const content = document.getElementById('stats-content');
    if (empty && content) {
        const hasData = hasAnyStats();
        empty.style.display   = hasData ? 'none'  : 'block';
        content.style.display = hasData ? 'block' : 'none';
        if (!hasData) return;
    }

    renderExamCountdown();
    renderReadiness();
    renderOverview();
    renderMastery();
    renderFocusToday();
    renderHeatmap();
    renderBars();
    renderFlagged();
    renderQIDHealth();
    runHealthCheck();
}

function renderExamCountdown() {
    const card = document.getElementById('exam-countdown-card');
    if (!examConfig.date) { if(card) card.style.display = 'none'; return; }
    const days    = Math.max(0, Math.ceil((new Date(examConfig.date) - Date.now()) / 86400000));
    const gap     = Math.max(0, 75 - getExamReadiness());
    const daily   = days > 0 ? Math.ceil(gap / days * 3) : 0;
    const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    set('exam-days-left',    days);
    set('exam-name-display', examConfig.name || 'Exam');
    set('exam-daily-target', days > 0 ? `~${daily} questions/day to reach 75%` : 'Exam day!');
    if (card) card.style.display = 'flex';
}

function renderReadiness() {
    const score = getExamReadiness();
    const el    = document.getElementById('readiness-score');
    const bar   = document.getElementById('readiness-bar');
    const bd    = document.getElementById('readiness-breakdown');
    if (el)  el.textContent  = score + '%';
    if (bar) bar.style.width = Math.min(score, 100) + '%';
    if (bd) {
        const subjects  = availableSheets.filter(s => s !== 'all.json');
        const strong    = subjects.filter(s => { const st=getSubjectStats(s); return st.accuracy!==null&&st.accuracy>=75; }).length;
        const weak      = subjects.filter(s => { const st=getSubjectStats(s); return st.accuracy!==null&&st.accuracy<50;  }).length;
        const unseen    = subjects.filter(s => getSubjectStats(s).accuracy === null).length;
        const {mastered} = getMasteryBreakdown();
        bd.innerHTML = `
            <span class="rb-item">💪 <span>${strong}</span> strong</span>
            <span class="rb-item">⚠ <span>${weak}</span> weak</span>
            <span class="rb-item">👁 <span>${unseen}</span> untouched</span>
            <span class="rb-item">🎯 <span>${mastered}</span> mastered</span>`;
    }
}

function renderOverview() {
    const o   = getOverall();
    const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    set('ov-attempts', o.attempts);
    set('ov-correct',  o.correct);
    set('ov-wrong',    o.wrong);
    set('ov-accuracy', o.accuracy + '%');
    set('ov-unique',   o.uniqueQ);

    const subjects = availableSheets.filter(s => s !== 'all.json')
        .map(s => ({ name: formatSubject(s.replace('.json','')), ...getSubjectStats(s) }))
        .filter(s => s.accuracy !== null);
    if (subjects.length) {
        const best  = subjects.reduce((a,b) => b.accuracy > a.accuracy ? b : a);
        const worst = subjects.reduce((a,b) => b.accuracy < a.accuracy ? b : a);
        set('strongest-subject', best.name);  set('strongest-pct', best.accuracy + '%');
        set('weakest-subject',   worst.name); set('weakest-pct',   worst.accuracy + '%');
    }
}

function renderMastery() {
    const { mastered, familiar, learning } = getMasteryBreakdown();
    const total  = Object.keys(questionStats).length;
    const newQ   = Math.max(0, questions.length - total);
    const grand  = total + newQ || 1;
    const wrap   = document.getElementById('mastery-bar-wrap');
    const leg    = document.getElementById('mastery-legend');
    if (wrap) wrap.innerHTML = `
        <div class="mastery-seg seg-mastered" style="width:${mastered/grand*100}%"></div>
        <div class="mastery-seg seg-familiar" style="width:${familiar/grand*100}%"></div>
        <div class="mastery-seg seg-learning" style="width:${learning/grand*100}%"></div>
        <div class="mastery-seg seg-new"      style="width:${newQ/grand*100}%"></div>`;
    if (leg) leg.innerHTML = [
        ['seg-mastered', 'Mastered', mastered],
        ['seg-familiar', 'Familiar', familiar],
        ['seg-learning', 'Learning', learning],
        ['seg-new',      'Not seen', newQ],
    ].map(([seg,label,n]) =>
        `<span class="mastery-leg-item"><span class="mastery-dot ${seg}"></span>${label} ${n}</span>`
    ).join('');
}

function renderFocusToday() {
    const list = getFocusToday();
    const el   = document.getElementById('sp-focus-list');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = '<p class="sp-empty">All subjects looking good!</p>'; return;
    }
    el.innerHTML = list.map(f => `
        <div class="focus-item">
            <span class="focus-item-name">${f.name}</span>
            <span class="focus-item-pct ${classifyAcc(f.accuracy)}">${f.accuracy!==null?f.accuracy+'%':'New'}</span>
            <span class="focus-item-reason">${f.reason}</span>
        </div>`).join('');
}

function renderHeatmap() {
    const el = document.getElementById('sp-heatmap');
    if (!el) return;
    const subjects = availableSheets.filter(s => s !== 'all.json');
    if (!subjects.length) { el.innerHTML = '<p class="sp-empty">No subjects loaded.</p>'; return; }
    el.innerHTML = subjects.map(s => {
        const st  = getSubjectStats(s);
        const cls = classifyAcc(st.accuracy);
        const name = formatSubject(s.replace('.json',''));
        return `<div class="sp-heatmap-tile ${cls}" data-file="${s}" title="Tap to practice in Weak mode">
            <span class="sp-tile-name">${name}</span>
            <span class="sp-tile-acc">${st.accuracy!==null?st.accuracy+'%':'—'}</span>
            <span class="sp-tile-att">${st.attempts} tries</span>
            <span class="sp-tile-cov">${st.tracked} tracked</span>
            <span class="tile-tap-hint">Practice →</span>
        </div>`;
    }).join('');
    // Tap to practice
    el.querySelectorAll('.sp-heatmap-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const file = tile.dataset.file;
            if (!file) return;
            // Switch to that subject in Weak mode
            dataUrl        = 'data/' + file;
            currentSubject = file.replace('.json','');
            quizMode       = 'weak';
            localStorage.setItem('qm-mode', 'weak');
            // Update subject dropdown
            const sel = document.getElementById('subject-select');
            if (sel) sel.value = file;
            // Update mode button in settings
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('mode-weak')?.classList.add('active');
            updateModeDesc();
            loadQuestions();
            switchTab('quiz');
        });
    });
}

function renderBars() {
    const el = document.getElementById('sp-bars');
    if (!el) return;
    const subjects = availableSheets
        .filter(s => s !== 'all.json')
        .map(s => ({ name: formatSubject(s.replace('.json','')), file: s, cls: classifyAcc(getSubjectStats(s).accuracy), accuracy: getSubjectStats(s).accuracy }))
        .sort((a,b) => (a.accuracy??-1) - (b.accuracy??-1));
    el.innerHTML = subjects.map(s => `
        <div class="sp-bar-row" data-file="${s.file}">
            <span class="sp-bar-label" title="${s.name}">${s.name}</span>
            <div class="sp-bar-track">
                <div class="sp-bar-fill ${s.cls}" style="width:${s.accuracy??0}%"></div>
            </div>
            <span class="sp-bar-pct">${s.accuracy!==null?s.accuracy+'%':'New'}</span>
        </div>`).join('');
    // Tap to practice
    el.querySelectorAll('.sp-bar-row').forEach(row => {
        row.addEventListener('click', () => {
            const file = row.dataset.file;
            if (!file) return;
            dataUrl = 'data/' + file;
            currentSubject = file.replace('.json','');
            quizMode = 'weak';
            localStorage.setItem('qm-mode', 'weak');
            const sel = document.getElementById('subject-select');
            if (sel) sel.value = file;
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('mode-weak')?.classList.add('active');
            updateModeDesc();
            loadQuestions();
            switchTab('quiz');
        });
    });
}

function renderFlagged() {
    const el    = document.getElementById('sp-flagged-list');
    const cpBtn = document.getElementById('sp-copy-flagged');
    if (!el) return;
    const entries = Object.entries(flaggedQ);
    if (!entries.length) {
        el.innerHTML = '<p class="sp-empty">No flagged questions. Use the ⚠ button on any question to flag it.</p>';
        if (cpBtn) cpBtn.style.display = 'none';
        return;
    }
    if (cpBtn) cpBtn.style.display = 'flex';
    el.innerHTML = entries.map(([qid, f]) => {
        // Look up question text from loaded questions array
        const q = questions.find(q => q.qid === qid);
        const qText = q ? q.question : qid;
        const subjectName = formatSubject(f.s || '');
        const dateStr = f.t ? new Date(f.t * 1000).toLocaleDateString() : '';
        return `<div class="sp-flagged-item">
            <div>
                <p class="sp-flagged-q">${qText}</p>
                <span class="sp-flagged-meta">${qid} · ${subjectName} · ${dateStr}</span>
            </div>
            <button class="unflag-btn" data-qid="${qid}">Unflag</button>
        </div>`;
    }).join('');
    el.querySelectorAll('.unflag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            delete flaggedQ[btn.dataset.qid];
            saveFlagged();
            renderFlagged();
            // Update flag icon on card if visible
            updateFlagOnCard(btn.dataset.qid);
        });
    });
}

function renderQIDHealth() {
    const el = document.getElementById('sp-qid-health');
    if (!el) return;
    const allQIDs = questions.map(q => q.qid).filter(Boolean);
    if (!allQIDs.length) {
        el.innerHTML = '<p class="sp-empty">Run generateQsJSON.py convert to assign QIDs.</p>'; return;
    }
    const nums   = allQIDs.map(q => parseInt(q.slice(1))).filter(n => !isNaN(n));
    const maxNum = Math.max(...nums);
    const active = nums.length;
    const full   = new Set(Array.from({length:maxNum}, (_,i) => i+1));
    const gaps   = [...full].filter(n => !nums.includes(n));
    const pct    = Math.round((active / maxNum) * 100);
    el.innerHTML = `
        <div class="qid-health-bar">
            <span>Q00001</span>
            <div class="qid-bar-track"><div class="qid-bar-fill" style="width:${pct}%"></div></div>
            <span>Q${String(maxNum).padStart(5,'0')}</span>
        </div>
        <div class="qid-stats-row">
            <div class="qid-stat"><strong>Q${String(maxNum).padStart(5,'0')}</strong>Max QID</div>
            <div class="qid-stat"><strong>${active}</strong>Active</div>
            <div class="qid-stat"><strong>${gaps.length}</strong>Gaps</div>
        </div>
        ${gaps.length
            ? `<p class="qid-gaps-label">Gap QIDs:</p>
               <div class="qid-gaps-wrap">${gaps.slice(0,20).map(n=>`<span class="qid-gap-pill">Q${String(n).padStart(5,'0')}</span>`).join('')}${gaps.length>20?`<span class="qid-gap-pill">+${gaps.length-20} more</span>`:''}</div>`
            : '<p class="sp-empty" style="margin:0">No gaps — all QIDs active ✓</p>'}`;
}

// ═══════════════════════════════════════════════════════════════
//  INFO TAB RENDERER
// ═══════════════════════════════════════════════════════════════

function renderInfoTab() {
    const el = document.getElementById('info-content');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = 'true';

    const sections = [
        { id:'how-to',   icon:'fa-circle-question', title:'How to Answer' },
        { id:'modes',    icon:'fa-layer-group',      title:'Quiz Modes' },
        { id:'stats',    icon:'fa-chart-bar',        title:'Your Stats' },
        { id:'sync',     icon:'fa-brands fa-github', title:'Sync & Backup' },
        { id:'version',  icon:'fa-circle-info',      title:'Version' },
    ];

    const toc = `<div class="info-toc">
        ${sections.map(s => `<button class="info-toc-btn" data-target="${s.id}">${s.title}</button>`).join('')}
    </div>`;

    el.innerHTML = toc + `
    <div class="info-hero">
        <span class="version-badge">QuizMe v5.1</span>
        <h1>Welcome to QuizMe</h1>
        <p>A personal MCQ revision tool built for BPSC exam preparation. Track accuracy, identify weak areas, build real mastery — question by question.</p>
    </div>

    <div class="info-section" id="how-to">
        <h2><i class="fa-solid fa-circle-question"></i> How to Answer Questions</h2>
        <p>Tap any option to answer. After a wrong answer you'll see an explanation (if available) and a link to ask Perplexity for more context. Correct answers auto-advance after 2.2 seconds (1.5s in Revision mode).</p>
        <h3>Keyboard Shortcuts</h3>
        <table class="kb-table">
            <tr><th>Key</th><th>Action</th></tr>
            <tr><td><span class="kb-key">A</span></td><td>Select option A</td></tr>
            <tr><td><span class="kb-key">B</span></td><td>Select option B</td></tr>
            <tr><td><span class="kb-key">C</span></td><td>Select option C</td></tr>
            <tr><td><span class="kb-key">D</span></td><td>Select option D</td></tr>
            <tr><td><span class="kb-key">R</span></td><td>Start new session</td></tr>
        </table>
        <h3>Flagging Questions</h3>
        <p>Tap the ⚠ icon on any question to flag it for review. Manage flagged questions in the Stats tab.</p>
    </div>

    <div class="info-section" id="modes">
        <h2><i class="fa-solid fa-layer-group"></i> Quiz Modes</h2>
        <h3>Normal</h3>
        <p>Weighted random — weak questions appear more often than strong ones. Best for daily practice.</p>
        <h3>Weak Mode</h3>
        <p>Only questions with accuracy below 60%, or never attempted. Target your problem areas.</p>
        <h3>Unseen Mode</h3>
        <p>Only questions you've never answered. Good for first-pass coverage of a new subject.</p>
        <h3>Revision Mode</h3>
        <p>Only mastered questions (4+ consecutive correct). Rapid 1.5s auto-advance. Stats not recorded — pure revision.</p>
        <p>Switch modes via <strong>⚙ Settings</strong>.</p>
    </div>

    <div class="info-section" id="stats">
        <h2><i class="fa-solid fa-chart-bar"></i> Understanding Your Stats</h2>
        <h3>Mastery Levels</h3>
        <ul>
            <li><strong>Mastered</strong> — 4+ consecutive correct</li>
            <li><strong>Familiar</strong> — 2–3 consecutive correct</li>
            <li><strong>Learning</strong> — attempted, not on a streak</li>
            <li><strong>Not seen</strong> — never attempted</li>
        </ul>
        <h3>Accuracy Badge on Card</h3>
        <ul>
            <li><strong>New</strong> (teal) — never attempted</li>
            <li><strong>%</strong> (green) — strong ≥75%</li>
            <li><strong>%</strong> (amber) — average 50–74%</li>
            <li><strong>%</strong> (red) — weak &lt;50%</li>
            <li><strong>⏰</strong> — mastered but not seen in 30+ days</li>
        </ul>
        <h3>Subject Heatmap</h3>
        <p>Tap any heatmap tile or subject bar to instantly practice that subject in Weak mode.</p>
        <h3>Stats not recorded when…</h3>
        <ul>
            <li>You are in <strong>All Subjects</strong> mode — switch to a specific subject for tracked stats</li>
            <li>You are in <strong>Revision mode</strong> — revision is stats-free by design</li>
        </ul>
        <h3>Exam Readiness Score</h3>
        <p>A combined 0–100% score based on accuracy across subjects and mastery level distribution. Target 75% before the exam.</p>
    </div>

    <div class="info-section" id="sync">
        <h2><i class="fa-brands fa-github"></i> Sync & Backup</h2>
        <p>Stats are saved locally on this device. Connect a free GitHub Gist to back them up and sync across devices. Each user uses their own Gist — your data stays private.</p>
        <div class="info-step">
            <div class="info-step-num">Step 1 — Create a GitHub token</div>
            <p>Go to <code>github.com/settings/tokens</code> → Generate new token (classic) → select only the <code>gist</code> scope → copy the token.</p>
        </div>
        <div class="info-step">
            <div class="info-step-num">Step 2 — Connect in QuizMe</div>
            <p>Open <strong>⚙ Settings</strong> → paste your token → leave Gist ID blank → click <strong>Connect</strong>. A private Gist is auto-created.</p>
        </div>
        <div class="info-step">
            <div class="info-step-num">Step 3 — Second device</div>
            <p>On the new device, paste the same token + the Gist ID (from the Gist URL) → Connect. Stats sync automatically. Syncs are batched every 30 seconds to save bandwidth.</p>
        </div>
    </div>

    <div class="info-section" id="version">
        <h2><i class="fa-solid fa-circle-info"></i> Version & Credits</h2>
        <span class="version-badge">QuizMe v5.1</span>
        <p style="margin-top:12px">Built by <strong>Aman Bhaskar</strong> for BPSC exam preparation.</p>
        <p>
            <a href="https://github.com/amanbh2" target="_blank"><i class="fa-brands fa-github"></i> github.com/amanbh2</a>
            &nbsp;·&nbsp;
            <a href="https://www.linkedin.com/in/amanbh2/" target="_blank"><i class="fa-brands fa-linkedin"></i> LinkedIn</a>
        </p>
    </div>`;

    // TOC scroll
    el.querySelectorAll('.info-toc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// ═══════════════════════════════════════════════════════════════
//  DOM READY
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // ── Theme ─────────────────────────────────────────────────
    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('quizme-theme', t);
        const isDark = t === 'dark';
        const iconCls = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        ['theme-icon','theme-icon-mobile'].forEach(id => {
            const e = document.getElementById(id); if (e) e.className = iconCls;
        });
        const tl = document.getElementById('theme-label'); if (tl) tl.textContent = isDark ? 'Dark' : 'Light';
    }
    applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
    document.getElementById('theme-toggle')?.addEventListener('click', () =>
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    document.getElementById('theme-toggle-mobile')?.addEventListener('click', () =>
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

    // ── Navigation ────────────────────────────────────────────
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(btn =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    switchTab(activeTab);

    // ── Settings panel ────────────────────────────────────────
    function openSettings() {
        document.getElementById('settings-panel').classList.add('show');
        document.getElementById('overlay').classList.add('show');
        // Populate fields
        const ti = document.getElementById('gist-token');
        const gi = document.getElementById('gist-id-input');
        if (ti) ti.value = gistConfig.token  || '';
        if (gi) gi.value = gistConfig.gistId || '';
        const ni = document.getElementById('exam-name-input');
        const di = document.getElementById('exam-date-input');
        if (ni) ni.value = examConfig.name || '';
        if (di) di.value = examConfig.date || '';
        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('mode-' + quizMode)?.classList.add('active');
        updateModeDesc();
        // Toggles
        const nm = document.getElementById('neg-marking-toggle'); if (nm) nm.checked = negMarking;
        const st = document.getElementById('sound-toggle');       if (st) st.checked = soundEnabled;
        setSyncUI(gistConfig.token && gistConfig.gistId ? 'ok' : 'idle');
    }
    function closeSettings() {
        document.getElementById('settings-panel').classList.remove('show');
        document.getElementById('overlay').classList.remove('show');
    }
    document.getElementById('settings-btn')?.addEventListener('click', openSettings);
    document.getElementById('settings-btn-mobile')?.addEventListener('click', openSettings);
    document.getElementById('close-settings')?.addEventListener('click', closeSettings);
    document.getElementById('overlay')?.addEventListener('click', closeSettings);

    // ── Mode buttons ──────────────────────────────────────────
    const modeDescs = {
        normal:   'Weighted random — weak questions appear more often',
        weak:     'Only questions below 60% accuracy or never attempted',
        unseen:   'Only questions you have never attempted before',
        revision: 'Mastered questions only — stats not recorded'
    };
    function updateModeDesc() {
        const el = document.getElementById('mode-desc');
        if (el) el.textContent = modeDescs[quizMode] || '';
    }
    ['normal','weak','unseen','revision'].forEach(mode => {
        document.getElementById('mode-' + mode)?.addEventListener('click', () => {
            quizMode = mode;
            localStorage.setItem('qm-mode', mode);
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('mode-' + mode)?.classList.add('active');
            updateModeDesc();
            closeSettings();
            loadQuestions();
        });
    });

    // ── Toggles ───────────────────────────────────────────────
    document.getElementById('neg-marking-toggle')?.addEventListener('change', e => {
        negMarking = e.target.checked;
        localStorage.setItem('qm-neg-marking', negMarking);
    });
    document.getElementById('sound-toggle')?.addEventListener('change', e => {
        soundEnabled = e.target.checked;
        localStorage.setItem('qm-sound', soundEnabled);
        if (soundEnabled) { unlockAudio(); playSound('flag'); }
    });

    // ── Exam date ─────────────────────────────────────────────
    document.getElementById('exam-date-save')?.addEventListener('click', () => {
        examConfig.name = document.getElementById('exam-name-input')?.value.trim() || '';
        examConfig.date = document.getElementById('exam-date-input')?.value || '';
        localStorage.setItem('qm-exam', JSON.stringify(examConfig));
        // Show saved confirmation
        const confirm = document.getElementById('exam-save-confirm');
        if (confirm) {
            confirm.textContent = 'Saved ✓';
            confirm.classList.add('show');
            setTimeout(() => confirm.classList.remove('show'), 2000);
        }
        if (activeTab === 'stats') renderExamCountdown();
    });

    // ── Gist connect ──────────────────────────────────────────
    document.getElementById('gist-connect-btn')?.addEventListener('click', async () => {
        const token  = document.getElementById('gist-token')?.value.trim();
        const gistId = document.getElementById('gist-id-input')?.value.trim();
        const btn    = document.getElementById('gist-connect-btn');
        if (!token) { alert('Please enter a GitHub Personal Access Token.'); return; }
        btn.textContent = 'Connecting…'; btn.disabled = true;
        try {
            const finalId = gistId || await createGist(token);
            if (!gistId) { const el = document.getElementById('gist-id-input'); if (el) el.value = finalId; }
            gistConfig = { token, gistId: finalId };
            saveConfig();
            setSyncUI('ok');
            btn.textContent = 'Connected ✓';
        } catch(e) {
            alert('Connection failed: ' + e.message);
            setSyncUI('err');
            btn.textContent = 'Connect'; btn.disabled = false;
        }
    });
    document.getElementById('gist-disconnect-btn')?.addEventListener('click', () => {
        if (!confirm('Disconnect sync? Local stats are kept.')) return;
        gistConfig = { token:'', gistId:'' };
        localStorage.removeItem('qm-gist-config');
        ['gist-token','gist-id-input'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
        setSyncUI('idle');
        const cb = document.getElementById('gist-connect-btn');
        if (cb) { cb.textContent = 'Connect'; cb.disabled = false; }
    });

    // ── Go to sync in Info ────────────────────────────────────
    document.getElementById('go-to-info-sync')?.addEventListener('click', () => {
        closeSettings(); switchTab('info');
        setTimeout(() => document.getElementById('sync')?.scrollIntoView({ behavior:'smooth' }), 150);
    });

    // ── Stats reset ───────────────────────────────────────────
    document.getElementById('sp-reset-btn')?.addEventListener('click', doReset);

    // ── Copy flagged ──────────────────────────────────────────
    document.getElementById('sp-copy-flagged')?.addEventListener('click', () => {
        const entries = Object.entries(flaggedQ);
        const lines   = entries.map(([qid, f]) => {
            const q = questions.find(q => q.qid === qid);
            return `${qid} — ${formatSubject(f.s||'')} — ${q ? q.question : qid}`;
        });
        navigator.clipboard.writeText(lines.join('\n'))
            .then(()  => alert('Copied to clipboard!'))
            .catch(()  => alert('Copy failed — try manually.'));
    });

    // ── Go to quiz from stats empty state ─────────────────────
    document.getElementById('go-quiz-btn')?.addEventListener('click', () => switchTab('quiz'));

    // ── Load manifest ─────────────────────────────────────────
    fetch('control/manifest.json')
        .then(r => r.json())
        .then(data => {
            availableSheets = data.files;
            createSubjectDropdown();
            loadQuestions();
        })
        .catch(e => console.error('Manifest load failed:', e));

    // ── Online: flush queue ───────────────────────────────────
    window.addEventListener('online', flushSync);
    if (gistConfig.token && gistConfig.gistId && syncQueue.length) flushSync();
});

// ═══════════════════════════════════════════════════════════════
//  QUIZ LOGIC
// ═══════════════════════════════════════════════════════════════

function createSubjectDropdown() {
    const el = document.getElementById('subject');
    if (!el) return;
    el.innerHTML = '';
    const select = document.createElement('select');
    select.id = 'subject-select';
    availableSheets.forEach(sheet => {
        const opt = document.createElement('option');
        opt.value       = sheet;
        opt.textContent = formatSubject(sheet.replace('.json','')).toUpperCase();
        select.appendChild(opt);
    });
    select.value    = dataUrl.split('/').pop();
    select.onchange = () => {
        dataUrl        = 'data/' + select.value;
        currentSubject = select.value.replace('.json','');
        loadQuestions();
    };
    el.appendChild(select);
}

function loadQuestions() {
    fetch(dataUrl)
        .then(r => r.json())
        .then(data => {
            questions      = data;
            currentSubject = dataUrl.split('/').pop().replace('.json','');
            startQuiz();
        })
        .catch(e => console.error('Error loading JSON:', e));
}

function startQuiz() {
    usedIndexes.clear();
    document.onkeydown = null;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    sessionAnswered = 0; sessionCorrect = 0;
    sessionBestStreak = 0; sessionCurrentStreak = 0;
    sessionNewMastered = 0; simScore = 0;
    buildFiltered();
    updateModeLabel();
    showQuestion();
    healthCheckDone = false;
    runHealthCheck();
}

function updateModeLabel() {
    const el = document.getElementById('mode-label');
    if (!el) return;
    const n = filteredIndexes.length;
    const labels = {
        weak:     `● Weak Mode · ${n} questions`,
        unseen:   `● Unseen Mode · ${n} questions`,
        revision: `● Revision Mode · ${n} questions`
    };
    el.textContent = labels[quizMode] || '';
    el.className   = `mode-label${quizMode !== 'normal' ? ' mode-' + quizMode : ''}`;
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length-1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function updateProgressBar() {
    const bar    = document.getElementById('progress-bar');
    const label  = document.getElementById('progress-label');
    const streak = document.getElementById('streak');
    if (!bar) return;
    const total = filteredIndexes.length || 1;
    const done  = usedIndexes.size;
    bar.style.width = Math.round((done / total) * 100) + '%';
    if (label)  label.textContent  = done + '/' + total;
    if (streak) streak.innerHTML   = `<i class="fa-solid fa-fire"></i> ${sessionCurrentStreak}`;
}

function renderTagsHTML(tags) {
    if (!tags) return '';
    const list = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (!list.length) return '';
    const visible = list.slice(0, 2);
    const extra   = list.length - 2;
    const pills   = visible.map(t => `<span class="q-tag">#${t}</span>`).join('');
    const more    = extra > 0 ? `<span class="q-tag-more">+${extra}</span>` : '';
    return `<div class="q-tags">${pills}${more}</div>`;
}

function showQuestion() {
    const qc = document.getElementById('quiz-container');
    if (!qc) return;
    qc.innerHTML = '';
    updateProgressBar();

    currentQuestionIndex = getNextIndex();
    if (currentQuestionIndex === -1) { showSessionComplete(); return; }

    const q      = questions[currentQuestionIndex];
    const qid    = q.qid || '';
    const acc    = getAccuracy(qid);
    const stale  = isStale(qid);

    // Accuracy badge
    let badgeCls = 'badge-new', badgeTxt = 'New';
    if (qid && questionStats[qid]) {
        if      (stale)   { badgeCls = 'badge-stale';  badgeTxt = `⏰ ${acc}%`; }
        else if (acc>=75) { badgeCls = 'badge-strong'; badgeTxt = acc+'%'; }
        else if (acc>=50) { badgeCls = 'badge-avg';    badgeTxt = acc+'%'; }
        else              { badgeCls = 'badge-weak';   badgeTxt = acc+'%'; }
    }

    const isFlagged = !!flaggedQ[qid];
    const div       = document.createElement('div');

    div.innerHTML = `
        <div class="question-header">
            ${renderTagsHTML(q.tags)}
            <span class="q-acc-badge ${badgeCls}">${badgeTxt}</span>
            <button class="flag-btn${isFlagged?' flagged':''}" id="flag-btn-card" data-qid="${qid}"
                title="${isFlagged?'Unflag':'Flag for review'}">
                <i class="fa-${isFlagged?'solid':'regular'} fa-triangle-exclamation"></i>
            </button>
        </div>
        <p class="question"></p>
        <div class="choices"></div>`;

    div.querySelector('.question').textContent = q.question;

    // Flag handler
    div.querySelector('.flag-btn')?.addEventListener('click', function() {
        unlockAudio(); playSound('flag');
        const qidBtn = this.dataset.qid;
        if (!qidBtn) return;
        if (flaggedQ[qidBtn]) {
            delete flaggedQ[qidBtn];
            this.classList.remove('flagged');
            this.querySelector('i').className = 'fa-regular fa-triangle-exclamation';
            this.title = 'Flag for review';
        } else {
            flaggedQ[qidBtn] = { s: currentSubject, t: Math.floor(Date.now()/1000) };
            this.classList.add('flagged');
            this.querySelector('i').className = 'fa-solid fa-triangle-exclamation';
            this.title = 'Unflag';
        }
        saveFlagged();
    });

    // Choices
    const choices   = shuffleArray(q.choices);
    const keyLabels = ['A','B','C','D'];
    const choicesDiv = div.querySelector('.choices');
    choices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        btn.textContent = choice.toString();
        btn.setAttribute('data-key', keyLabels[idx] || String(idx+1));
        btn.addEventListener('click', () => {
            unlockAudio();
            checkAnswer(btn, choice.toString(), q.answer.toString(), q);
        });
        choicesDiv.appendChild(btn);
    });

    qc.appendChild(div);

    // Keyboard
    document.onkeydown = e => {
        const km = { a:0, b:1, c:2, d:3 };
        const k  = e.key.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(km, k)) {
            const btns = document.querySelectorAll('.choices button');
            if (btns[km[k]] && !btns[km[k]].disabled) btns[km[k]].click();
        }
        if (k === 'r') startQuiz();
    };
}

function updateFlagOnCard(qid) {
    const btn = document.getElementById('flag-btn-card');
    if (!btn || btn.dataset.qid !== qid) return;
    const isFlagged = !!flaggedQ[qid];
    btn.classList.toggle('flagged', isFlagged);
    btn.querySelector('i').className = isFlagged
        ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-triangle-exclamation';
}

function checkAnswer(button, selected, correct, qData) {
    const isCorrect = selected === correct;
    const qid       = qData.qid || '';
    const buttons   = document.querySelectorAll('.choices button');

    // Record (guarded inside recordAnswer for all/revision)
    const prevMastery = qid ? getMastery(qid) : null;
    recordAnswer(currentSubject, qid, isCorrect);

    // Session tracking
    sessionAnswered++;
    if (isCorrect) {
        sessionCorrect++;
        sessionCurrentStreak++;
        if (sessionCurrentStreak > sessionBestStreak) sessionBestStreak = sessionCurrentStreak;
        if (qid && getMastery(qid) === 'mastered' && prevMastery !== 'mastered') sessionNewMastered++;
        if (negMarking) simScore += 1;
        playSound('correct');
    } else {
        sessionCurrentStreak = 0;
        if (negMarking) simScore -= 1/3;
        playSound('wrong');
    }
    updateProgressBar();

    // Highlight choices
    buttons.forEach(btn => {
        if (btn.innerText === correct)               btn.classList.add('correct');
        if (btn.innerText === selected && !isCorrect) btn.classList.add('wrong');
        btn.disabled = true;
    });

    if (!isCorrect) {
        // Show information
        const infoEl = document.createElement('p');
        infoEl.className = 'information';
        if (qData.information && qData.information.toString().trim()) {
            infoEl.textContent  = qData.information;
            infoEl.style.display = 'block';
        }
        const container = document.querySelector('.container');
        if (container) container.appendChild(infoEl);

        // Negative marking indicator
        if (negMarking) {
            const neg = document.createElement('p');
            neg.className   = 'neg-mark-indicator';
            neg.textContent = `−⅓ mark · Running score: ${simScore.toFixed(2)}`;
            if (container) container.appendChild(neg);
        }

        // Ask Perplexity
        showAskAI(qData.question, correct);
    } else {
        // Auto-advance countdown bar
        const delay = quizMode === 'revision' ? 1500 : 2200;
        const container = document.querySelector('.container');
        if (container) {
            const barWrap = document.createElement('div');
            barWrap.className = 'advance-bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'advance-bar';
            barWrap.appendChild(bar);
            container.appendChild(barWrap);
            // Trigger drain animation
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    bar.style.transition = `width ${delay}ms linear`;
                    bar.classList.add('draining');
                });
            });
        }
        advanceTimer = setTimeout(() => {
            playSound('flip');
            showQuestion();
        }, delay);
    }
}

function showAskAI(question, answer) {
    const wrap = document.createElement('div');
    wrap.className = 'ask-ai-wrap';
    const btn = document.createElement('button');
    btn.className = 'ask-ai-btn';
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Ask Perplexity';
    btn.addEventListener('click', () =>
        window.open(`https://www.perplexity.ai/search?q=${encodeURIComponent('Explain MCQ: ' + question + ' Correct answer: ' + answer)}`, '_blank'));
    wrap.appendChild(btn);
    document.querySelector('.container')?.appendChild(wrap);
}

function showSessionComplete() {
    const qc = document.getElementById('quiz-container');
    if (!qc) return;
    const accuracy = sessionAnswered ? Math.round((sessionCorrect / sessionAnswered) * 100) : 0;
    const focus    = getFocusToday();

    qc.innerHTML = `
        <div class="session-complete">
            <h2>Session Complete 🎯</h2>
            <div class="session-stats-row">
                <div class="session-stat"><strong>${sessionAnswered}</strong>Answered</div>
                <div class="session-stat"><strong style="color:var(--correct)">${sessionCorrect}</strong>Correct</div>
                <div class="session-stat"><strong style="color:var(--accent)">${accuracy}%</strong>Accuracy</div>
                <div class="session-stat"><strong>${sessionBestStreak}</strong>Best Streak</div>
                ${sessionNewMastered ? `<div class="session-stat"><strong style="color:var(--correct)">${sessionNewMastered}</strong>Newly Mastered</div>` : ''}
                ${negMarking ? `<div class="session-stat"><strong style="color:var(--text-muted)">${simScore.toFixed(2)}</strong>Sim. Score</div>` : ''}
            </div>
            ${focus.length ? `
            <div class="focus-section-inline">
                <div class="focus-title"><i class="fa-solid fa-map-pin"></i> Focus Next</div>
                ${focus.map(f => `
                <div class="focus-item">
                    <span class="focus-item-name">${f.name}</span>
                    <span class="focus-item-pct ${classifyAcc(f.accuracy)}">${f.accuracy!==null?f.accuracy+'%':'New'}</span>
                    <span class="focus-item-reason">${f.reason}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>`;

    // Mark stats dirty so next Stats tab open re-renders
    statsDirty = true;
}

document.getElementById('restart-btn')?.addEventListener('click', startQuiz);