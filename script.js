// ═══════════════════════════════════════════════════════════════
//  QuizMe  script.js  v6.0
//  Stats engine · Mastery · Bookmarks · Audio
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
function saveStats()   { localStorage.setItem('qm-stats-v2',  JSON.stringify(questionStats)); }
function saveFlagged() { localStorage.setItem('qm-flagged', JSON.stringify(flaggedQ)); }

/* ── Persistent state ────────────────────────────────────────── */
let questionStats = safeParseJSON('qm-stats-v2',   {});
let flaggedQ      = safeParseJSON('qm-flagged',     {});
let srsReviews    = safeParseJSON('qm-srs',         {});
let examConfig    = safeParseJSON('qm-exam',        { name:'', date:'' });
let negMarking    = localStorage.getItem('qm-neg-marking') === 'true';
let soundEnabled  = localStorage.getItem('qm-sound') !== 'false'; // default on
let excludeFlagged = localStorage.getItem('qm-exclude-flagged') !== 'false'; // default on

/* ── Runtime state ───────────────────────────────────────────── */
let questions            = [];
let allQuestions         = [];
let subjectQuestionCounts = {};
let subjectQuestions     = {};
let usedIndexes          = new Set();
let currentQuestionIndex = 0;
let dataUrl              = 'data/all.json';
let currentSubject       = 'all';
let availableSheets      = [];
let quizMode             = localStorage.getItem('qm-mode') || 'normal';
let activeTab            = localStorage.getItem('qm-tab')  || 'prep';
let filteredIndexes      = [];
let sessionAnswered      = 0;
let sessionCorrect       = 0;
let sessionBestStreak    = 0;
let sessionCurrentStreak = 0;
let sessionNewMastered   = 0;
let simScore             = 0;  // for negative marking display
let healthCheckDone      = false;
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

    // --- SRS Spaced Repetition Logic ---
    const now = Math.floor(Date.now() / 1000);
    if (!isCorrect) {
        srsReviews[qid] = {
            box: 1,
            nextReview: now + 86400
        };
    } else {
        if (srsReviews[qid]) {
            const currentBox = srsReviews[qid].box || 1;
            const nextBox = Math.min(currentBox + 1, 5);
            srsReviews[qid] = {
                box: nextBox,
                nextReview: now + SRS_INTERVALS[nextBox - 1]
            };
        }
    }
    localStorage.setItem('qm-srs', JSON.stringify(srsReviews));
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
                    saveStats(); hideHealthAlert(); renderPrepTab();
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
    ['prep-nav-badge','prep-bottom-badge'].forEach(id => {
        const e = document.getElementById(id); if (e) e.style.display = 'inline-block';
    });
}
function doReset() {
    if (!confirm('Reset ALL statistics? This cannot be undone.')) return;
    questionStats = {};
    saveStats();
    hideHealthAlert();
    ['prep-nav-badge','prep-bottom-badge'].forEach(id => {
        const e = document.getElementById(id); if (e) e.style.display = 'none';
    });
    renderPrepTab();
}



// ═══════════════════════════════════════════════════════════════
//  QUIZ MODES
// ═══════════════════════════════════════════════════════════════

function buildFiltered() {
    filteredIndexes = [];
    const now = Math.floor(Date.now() / 1000);
    const subSelect = document.getElementById('subtopic-select');
    const selectedSubtopic = (subSelect && subSelect.value) ? subSelect.value : 'all';

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qid = q.qid;

        // Exclude Flagged Filter
        if (excludeFlagged && flaggedQ[qid]) {
            continue;
        }

        // Sub-topic Filter
        if (selectedSubtopic !== 'all') {
            const qtags = q.tags ? q.tags.split(',').map(t => t.trim()) : [];
            if (!qtags.includes(selectedSubtopic)) {
                continue;
            }
        }

        const acc = getAccuracy(qid);
        const m   = getMastery(qid);
        if (quizMode === 'weak') {
            if (acc === null || acc < 60) filteredIndexes.push(i);
        } else if (quizMode === 'unseen') {
            if (getAttempts(qid) === 0) filteredIndexes.push(i);
        } else if (quizMode === 'revision') {
            if (m === 'mastered') filteredIndexes.push(i);
        } else if (quizMode === 'srs') {
            if (srsReviews[qid] && srsReviews[qid].nextReview <= now) {
                filteredIndexes.push(i);
            }
        } else {
            filteredIndexes.push(i);
        }
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
        const isActive = b.dataset.tab === tab;
        b.classList.toggle('active', isActive);
        if (isActive && b.classList.contains('bottom-nav-item') && !b.classList.contains('bottom-nav-fixed')) {
            b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    });
    if (tab === 'info')  renderInfoTab();
    if (tab === 'prep')  renderPrepTab();
    if (tab === 'settings') renderSettingsFlaggedList();
    if (tab === 'timeline') {
        if (!timelineData) initTimeline();
        else renderTimeline();
    }
    
    // Auto-start quiz if navigating to the tab and no questions are loaded yet
    if (tab === 'quiz' && questions.length === 0 && Object.keys(subjectQuestions).length > 0) {
        questions = subjectQuestions[currentSubject] || subjectQuestions['all'] || [];
        startQuiz();
    }
}

/* ── BPSC Prelims Upgrade: SRS, Sub-topics & Dashboard Helpers ── */

const TAG_LABELS = {
    // Polity
    polityBackground: "Polity: Historical Background",
    polityMaking: "Polity: Making of the Constitution",
    polityPreamble: "Polity: Preamble",
    polityFR: "Polity: Fundamental Rights",
    polityDPSP: "Polity: DPSP",
    polityDuties: "Polity: Fundamental Duties",
    polityUnionExec: "Polity: Union Executive",
    polityParliament: "Polity: Parliament",
    polityJudiciary: "Polity: Judiciary",
    polityStateGov: "Polity: State Government",
    polityRelations: "Polity: Centre-State Relations",
    polityEmergency: "Polity: Emergency Provisions",
    polityBodies: "Polity: Constitutional/Non-Constitutional Bodies",
    polityLocalGov: "Polity: Local Government",
    polityAmendments: "Polity: Amendments",
    polityJudgements: "Polity: Landmark Judgements",

    // Ancient History
    ancientIVC: "Ancient: IVC & Prehistory",
    ancientVedic: "Ancient: Vedic Age",
    ancientMahajanapadas: "Ancient: Mahajanapadas",
    ancientMauryan: "Ancient: Mauryan Empire",
    ancientPostMauryan: "Ancient: Post-Mauryan Period",
    ancientGupta: "Ancient: Gupta Empire",
    ancientPostGupta: "Ancient: Post-Gupta Period",
    ancientSangam: "Ancient: Sangam Age",
    ancientBuddhismJainism: "Ancient: Buddhism & Jainism",
    ancientSouthIndia: "Ancient: Early South India",

    // Medieval History
    medievalRajputsCholas: "Medieval: Rajputs & Cholas",
    medievalInvasions: "Medieval: Early Invasions",
    medievalSultanate: "Medieval: Delhi Sultanate",
    medievalDeccan: "Medieval: Vijayanagar & Bahmani",
    medievalMughal: "Medieval: Mughal Empire & Sher Shah",
    medievalBhaktiSufi: "Medieval: Bhakti & Sufi Movements",

    // Modern History
    modernEuropeans: "Modern: Advent of Europeans",
    modernConsolidation1857: "Modern: British Consolidation & 1857",
    modernNationalism: "Modern: Rise of Nationalism (1858-1905)",
    modernSwadeshiSurat: "Modern: Swadeshi & Extremism (1905-1918)",
    modernMassMovements: "Modern: Gandhian Era & Mass Movements",
    modernIndependence: "Modern: Towards Independence (1940-1947)",

    // Geography
    geoPhysical: "Geography: Physical",
    geoIndiaPhysiography: "Geography: Indian Physiography",
    geoIndiaEconomic: "Geography: Indian Economic Geography",
    geoBihar: "Geography: Bihar Geography",
    geoWorld: "Geography: World Geography",
    geoEnvironment: "Geography: Environment & Ecology",

    // Economy
    econCore: "Economy: Core Concepts",
    econBihar: "Economy: Bihar Economy",
    census2011: "Census: 2011 Data",
    budgetSurvey: "Budget & Surveys"
};

const SRS_INTERVALS = [
    86400,          // Box 1: 1 day
    3 * 86400,      // Box 2: 3 days
    7 * 86400,      // Box 3: 7 days
    14 * 86400,     // Box 4: 14 days
    30 * 86400      // Box 5: 30 days
];

function getSRSDueCount() {
    const now = Math.floor(Date.now() / 1000);
    let count = 0;
    const validQids = new Set(allQuestions.map(q => q.qid));
    for (const qid in srsReviews) {
        if (validQids.has(qid) && srsReviews[qid] && srsReviews[qid].nextReview <= now) {
            count++;
        }
    }
    return count;
}

function getMasteryPercent(sheet) {
    const subject = sheet.replace('.json', '');
    const qs = subjectQuestions[subject] || [];
    if (!qs.length) return 0;
    
    let mastered = 0, familiar = 0, learning = 0;
    qs.forEach(q => {
        const qid = q.qid;
        if (qid && questionStats[qid]) {
            const m = getMastery(qid);
            if (m === 'mastered') mastered++;
            else if (m === 'familiar') familiar++;
            else if (m === 'learning') learning++;
        }
    });
    
    return Math.round((mastered * 100 + familiar * 60 + learning * 30) / qs.length);
}

async function loadAllSubjectData() {
    try {
        const subjectsToLoad = availableSheets.filter(s => s !== 'all.json');
        
        const promises = subjectsToLoad.map(sheet => 
            fetch('data/' + sheet)
                .then(r => r.json())
                .then(qs => {
                    const subName = sheet.replace('.json', '');
                    qs.forEach(q => { q.subject = subName; });
                    subjectQuestions[subName] = qs;
                    subjectQuestionCounts[subName] = qs.length;
                    return qs;
                })
        );
        
        const results = await Promise.all(promises);
        allQuestions = results.flat();
        subjectQuestions['all'] = allQuestions;
        subjectQuestionCounts['all'] = allQuestions.length;

        // Render Prep Hub dashboard
        renderPrepTab();
        
        // Initialise subtopic dropdown for the current subject
        updateSubtopicDropdown();

        // If the user's active tab is quiz, load and start the quiz
        if (activeTab === 'quiz') {
            questions = subjectQuestions[currentSubject] || allQuestions;
            startQuiz();
        }
    } catch (e) {
        console.error('Error loading subject data:', e);
    }
}



function startSubjectQuiz(sheet) {
    dataUrl = 'data/' + sheet;
    currentSubject = sheet.replace('.json', '');
    const select = document.getElementById('subject-select');
    if (select) select.value = sheet;
    
    // Update subtopic dropdown for this subject
    updateSubtopicDropdown();
    
    // Load and start
    questions = subjectQuestions[currentSubject] || [];
    switchTab('quiz');
    startQuiz();
}

function updateSubtopicDropdown() {
    const wrap = document.getElementById('subtopic-wrap');
    const select = document.getElementById('subtopic-select');
    if (!wrap || !select) return;
    
    select.innerHTML = '';
    
    if (currentSubject === 'all') {
        wrap.style.display = 'none';
        return;
    }
    
    const qs = subjectQuestions[currentSubject] || [];
    const uniqueTags = new Set();
    qs.forEach(q => {
        if (q.tags) {
            q.tags.split(',').forEach(t => {
                const cleanTag = t.trim();
                if (cleanTag && TAG_LABELS[cleanTag]) {
                    uniqueTags.add(cleanTag);
                }
            });
        }
    });
    
    if (uniqueTags.size === 0) {
        wrap.style.display = 'none';
        return;
    }
    
    wrap.style.display = 'block';
    
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'ALL SUB-TOPICS';
    select.appendChild(optAll);
    
    Array.from(uniqueTags).sort().forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = TAG_LABELS[tag].toUpperCase();
        select.appendChild(opt);
    });
    
    select.value = 'all';
}

// ═══════════════════════════════════════════════════════════════
//  INFO TAB RENDERER
// ═══════════════════════════════════════════════════════════════

function parseMarkdown(md) {
    if (!md) return '';
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    let html = [];
    let inList = false;
    let inBlockquote = false;
    let inParagraph = false;

    // Helper to close paragraphs
    function closeParagraph() {
        if (inParagraph) {
            html.push('</p>');
            inParagraph = false;
        }
    }

    // Helper to close list
    function closeList() {
        if (inList) {
            html.push('</ul>');
            inList = false;
        }
    }

    // Helper to close blockquote
    function closeBlockquote() {
        if (inBlockquote) {
            html.push('</blockquote>');
            inBlockquote = false;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // Check if raw HTML block (like table, span, etc.)
        if (/^<\/?(table|thead|tbody|tr|td|th|span|div|i|footer|pre)/i.test(line)) {
            closeParagraph();
            closeList();
            closeBlockquote();
            html.push(line);
            continue;
        }

        // Empty line
        if (!line) {
            closeParagraph();
            closeList();
            closeBlockquote();
            continue;
        }

        // Horizontal Rule
        if (line === '---') {
            closeParagraph();
            closeList();
            closeBlockquote();
            html.push('<hr>');
            continue;
        }

        // Headings
        if (line.startsWith('# ')) {
            closeParagraph();
            closeList();
            closeBlockquote();
            html.push(`<h1>${line.slice(2)}</h1>`);
            continue;
        }
        if (line.startsWith('## ')) {
            closeParagraph();
            closeList();
            closeBlockquote();
            html.push(`<h2>${line.slice(3)}</h2>`);
            continue;
        }
        if (line.startsWith('### ')) {
            closeParagraph();
            closeList();
            closeBlockquote();
            html.push(`<h3>${line.slice(4)}</h3>`);
            continue;
        }

        // Blockquotes
        if (line.startsWith('> ')) {
            closeParagraph();
            closeList();
            if (!inBlockquote) {
                html.push('<blockquote>');
                inBlockquote = true;
            }
            let content = line.slice(2);
            content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
            content = content.replace(/`(.*?)`/g, '<code>$1</code>');
            content = content.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            html.push(`<p>${content}</p>`);
            continue;
        }

        // List items
        if (line.startsWith('- ')) {
            closeParagraph();
            closeBlockquote();
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            let content = line.slice(2);
            content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
            content = content.replace(/`(.*?)`/g, '<code>$1</code>');
            content = content.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            html.push(`<li>${content}</li>`);
            continue;
        }

        // Standard text line
        closeList();
        closeBlockquote();
        
        line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');
        line = line.replace(/`(.*?)`/g, '<code>$1</code>');
        line = line.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

        if (!inParagraph) {
            html.push('<p>');
            inParagraph = true;
            html.push(line);
        } else {
            html.push('<br>' + line);
        }
    }

    closeParagraph();
    closeList();
    closeBlockquote();

    return html.join('\n');
}

function renderInfoTab() {
    const el = document.getElementById('info-content');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = 'true';

    // Show loading indicator
    el.innerHTML = '<p class="sp-empty" style="text-align:center;padding:40px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Loading user guide...</p>';

    fetch('README.md')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load README.md');
            return res.text();
        })
        .then(text => {
            const htmlContent = parseMarkdown(text);
            el.innerHTML = htmlContent;

            // Build dynamic Table of Contents from h2 elements
            const headings = el.querySelectorAll('h2');
            if (headings.length > 0) {
                const toc = document.createElement('div');
                toc.className = 'info-toc';

                headings.forEach(heading => {
                    if (!heading.id) {
                        heading.id = heading.textContent
                            .toLowerCase()
                            .replace(/[^\w\s-]/g, '')
                            .trim()
                            .replace(/\s+/g, '-');
                    }

                    const btn = document.createElement('button');
                    btn.className = 'info-toc-btn';
                    // Strip emojis or non-word chars from the start for button label
                    btn.textContent = heading.textContent.replace(/^[^\w\s]+/g, '').trim();
                    btn.addEventListener('click', () => {
                        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                    toc.appendChild(btn);
                });

                el.insertBefore(toc, el.firstChild);
            }
        })
        .catch(err => {
            console.error(err);
            el.dataset.rendered = ''; // Allow retry
            el.innerHTML = `
                <div class="stats-empty-wrap" style="padding: 40px 0; text-align: center;">
                    <i class="fa-solid fa-circle-exclamation stats-empty-icon" style="color: var(--wrong); font-size: 32px; margin-bottom: 12px;"></i>
                    <h3>Failed to load Info Guide</h3>
                    <p style="color: var(--text-muted); margin-bottom: 16px;">Make sure README.md exists and is readable.</p>
                    <button class="go-quiz-btn" onclick="renderInfoTab()" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-rotate-right"></i> Retry
                    </button>
                </div>`;
        });
}

// ═══════════════════════════════════════════════════════════════
//  TIMELINE ENGINE
// ═══════════════════════════════════════════════════════════════

let timelineData     = null;   // { bce: [], ce: [] }
let tlCurrentEra     = 'bce';  // 'bce' | 'ce'
let tlLoadedCount    = 0;      // how many events rendered so far
const TL_CHUNK_SIZE  = 100;    // events per "Load More"
let tlObserver       = null;   // IntersectionObserver for scroll-reveal

const BCE_JUMPS = [
    { label: 'Prehistory', year: -115000 },
    { label: 'Indus Valley', year: -3000 },
    { label: 'Vedic Era', year: -1500 },
    { label: 'Mahajanapadas', year: -600 },
    { label: 'Mauryan', year: -322 },
    { label: 'Post-Mauryan', year: -185 }
];

const CE_JUMPS = [
    { label: 'Ancient (0–600)', year: 0 },
    { label: 'Early Med (600–1200)', year: 600 },
    { label: 'Sultanate (1200–1526)', year: 1200 },
    { label: 'Mughals (1526–1707)', year: 1526 },
    { label: 'Modern (1707–1947)', year: 1707 },
    { label: 'Independent (1947+)', year: 1947 }
];

function jumpToTimelineYear(targetYear) {
    if (!timelineData) return;
    const events = timelineData[tlCurrentEra] || [];
    let targetIdx = events.findIndex(e => e.year >= targetYear);
    if (targetIdx === -1) {
        targetIdx = events.length - 1;
    }
    if (targetIdx === -1) return;

    if (targetIdx >= tlLoadedCount) {
        const container = document.getElementById('timeline-container');
        if (container) {
            const targetLoadLimit = Math.min(targetIdx + 20, events.length);
            renderTimelineChunk(events, tlLoadedCount, targetLoadLimit - tlLoadedCount, container);
            updateLoadMoreButton(events);
            updateEventCount(events);
        }
    }

    const targetEvent = events[targetIdx];
    if (!targetEvent) return;

    const element = document.querySelector(`.tl-item[data-id="${targetEvent.id}"]`);
    if (element) {
        const card = element.querySelector('.tl-card');
        if (card) {
            card.classList.add('tl-card-highlight');
            setTimeout(() => card.classList.remove('tl-card-highlight'), 2000);
        }
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function renderJumpBar() {
    const bar = document.getElementById('timeline-jump-bar');
    if (!bar) return;
    bar.innerHTML = '';
    const jumps = tlCurrentEra === 'bce' ? BCE_JUMPS : CE_JUMPS;
    jumps.forEach(j => {
        const btn = document.createElement('button');
        btn.className = 'tl-jump-btn';
        btn.textContent = j.label;
        btn.addEventListener('click', () => jumpToTimelineYear(j.year));
        bar.appendChild(btn);
    });
}

function formatYearLabel(event) {
    const y = event.year;
    if (y < 0) {
        const absY = Math.abs(y);
        // Format large numbers with commas
        const yearStr = absY >= 1000 ? absY.toLocaleString() : absY;
        if (event.yearEnd != null && event.yearEnd !== y) {
            const absEnd = Math.abs(event.yearEnd);
            const endStr = absEnd >= 1000 ? absEnd.toLocaleString() : absEnd;
            return `${endStr} – ${yearStr} BCE`;
        }
        return `${yearStr} BCE`;
    }
    return `${y} CE`;
}

function formatDateSub(event) {
    const parts = [];
    if (event.day) parts.push(event.day);
    if (event.month) parts.push(event.month);
    if (parts.length === 0) return '';
    return parts.join(' ');
}

function computeYearsAgo(event) {
    const now = new Date().getFullYear();
    const y = event.year;
    if (y < 0) {
        return `~${(now + Math.abs(y)).toLocaleString()} years ago`;
    }
    const diff = now - y;
    if (diff <= 0) return 'This year';
    return `${diff} year${diff > 1 ? 's' : ''} ago`;
}

function getEraForYear(year) {
    if (year < 0) return 'prehistoric';
    if (year < 600) return 'ancient';
    if (year < 1526) return 'medieval';
    if (year <= 1947) return 'modern';
    return 'postIndependence';
}

const ERA_LABELS = {
    prehistoric: 'Pre-Historic & Ancient',
    ancient: 'Ancient India (0–600 CE)',
    medieval: 'Medieval India (600–1526)',
    modern: 'Modern India (1526–1947)',
    postIndependence: 'Post Independence (1947+)'
};

function createTimelineItem(event, index) {
    const side = index % 2 === 0 ? 'tl-left' : 'tl-right';
    const div = document.createElement('div');
    div.className = `tl-item ${side}`;
    div.dataset.id = event.id;

    const yearLabel = formatYearLabel(event);
    const dateSub = formatDateSub(event);
    const ago = computeYearsAgo(event);

    div.innerHTML = `
        <div class="tl-card">
            <div class="tl-year">${yearLabel}</div>
            ${dateSub ? `<div class="tl-date-sub">${dateSub}</div>` : ''}
            <p class="tl-event">${event.event}</p>
            <button class="tl-expand-btn">Show more</button>
            <span class="tl-ago">${ago}</span>
        </div>
    `;

    return div;
}

function setupExpandButtons(container) {
    // After DOM paint, check which events overflow and show expand buttons
    requestAnimationFrame(() => {
        container.querySelectorAll('.tl-item:not([data-expand-checked])').forEach(item => {
            item.dataset.expandChecked = '1';
            const eventEl = item.querySelector('.tl-event');
            const btn = item.querySelector('.tl-expand-btn');
            if (!eventEl || !btn) return;

            // Check if text is truncated
            if (eventEl.scrollHeight > eventEl.clientHeight + 2) {
                btn.style.display = 'inline-block';
                btn.addEventListener('click', () => {
                    const expanded = eventEl.classList.toggle('tl-expanded');
                    btn.textContent = expanded ? 'Show less' : 'Show more';
                });
            }
        });
    });
}

function renderTimelineChunk(events, startIdx, count, container) {
    const end = Math.min(startIdx + count, events.length);
    let lastEra = null;
    let itemIndex = startIdx;

    // Determine the last era of already-rendered items
    if (startIdx > 0 && startIdx < events.length) {
        lastEra = getEraForYear(events[startIdx - 1].year);
    }

    for (let i = startIdx; i < end; i++) {
        const event = events[i];
        const era = getEraForYear(event.year);

        // Insert era divider if era changed (only for CE)
        if (tlCurrentEra === 'ce' && era !== lastEra && lastEra !== null) {
            const divider = document.createElement('div');
            divider.className = 'tl-era-divider';
            divider.innerHTML = `<span>${ERA_LABELS[era] || era}</span>`;
            container.appendChild(divider);
        }
        lastEra = era;

        const item = createTimelineItem(event, itemIndex);
        container.appendChild(item);

        // Observe for scroll-reveal
        if (tlObserver) tlObserver.observe(item);
        itemIndex++;
    }

    tlLoadedCount = end;
    setupExpandButtons(container);
}

function updateLoadMoreButton(events) {
    const wrap = document.getElementById('tl-load-more-wrap');
    if (!wrap) return;
    if (tlLoadedCount < events.length) {
        wrap.style.display = 'block';
        const remaining = events.length - tlLoadedCount;
        const btn = document.getElementById('tl-load-more-btn');
        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> Load More (${remaining} remaining)`;
        }
    } else {
        wrap.style.display = 'none';
    }
}

function updateEventCount(events) {
    const el = document.getElementById('tl-event-count');
    if (!el) return;
    const showing = Math.min(tlLoadedCount, events.length);
    el.textContent = showing < events.length
        ? `${showing} of ${events.length} events`
        : `${events.length} events`;
}

function setSpineColors(era) {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    if (era === 'bce') {
        container.style.setProperty('--tl-spine-start', '#c2956b');
        container.style.setProperty('--tl-spine-mid', '#b8860b');
        container.style.setProperty('--tl-spine-end', '#8b6c42');
    } else {
        container.style.setProperty('--tl-spine-start', '#b8860b');
        container.style.setProperty('--tl-spine-mid', '#c0392b');
        container.style.setProperty('--tl-spine-end', '#2a7c6f');
    }
}

function renderTimeline(era) {
    if (!timelineData) return;

    tlCurrentEra = era || tlCurrentEra;
    tlLoadedCount = 0;

    const container = document.getElementById('timeline-container');
    if (!container) return;
    container.innerHTML = '';

    // Update toggle buttons
    document.querySelectorAll('.tl-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.era === tlCurrentEra);
    });

    const toggleContainer = document.querySelector('.timeline-toggle');
    if (toggleContainer) {
        toggleContainer.setAttribute('data-active-era', tlCurrentEra);
    }

    setSpineColors(tlCurrentEra);
    renderJumpBar();

    const events = timelineData[tlCurrentEra] || [];
    if (!events.length) {
        container.innerHTML = '<div class="tl-loading">No events found for this era.</div>';
        updateLoadMoreButton(events);
        updateEventCount(events);
        return;
    }

    // For BCE (small dataset), load all. For CE, load in chunks.
    const initialLoad = tlCurrentEra === 'bce' ? events.length : TL_CHUNK_SIZE;
    renderTimelineChunk(events, 0, initialLoad, container);
    updateLoadMoreButton(events);
    updateEventCount(events);
}

function loadMoreTimeline() {
    if (!timelineData) return;
    const events = timelineData[tlCurrentEra] || [];
    const container = document.getElementById('timeline-container');
    if (!container || tlLoadedCount >= events.length) return;

    renderTimelineChunk(events, tlLoadedCount, TL_CHUNK_SIZE, container);
    updateLoadMoreButton(events);
    updateEventCount(events);
}

async function initTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    // Show loading
    container.innerHTML = '<div class="tl-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading timeline data...</div>';

    // Setup IntersectionObserver for scroll-reveal
    if ('IntersectionObserver' in window) {
        tlObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('tl-visible');
                    tlObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    }

    try {
        const res = await fetch('data/timeline/timeline.json');
        if (!res.ok) throw new Error('Failed to fetch timeline.json');
        timelineData = await res.json();
        renderTimeline(tlCurrentEra);
    } catch (err) {
        console.error('Timeline load error:', err);
        container.innerHTML = `
            <div class="tl-loading">
                <i class="fa-solid fa-circle-exclamation" style="color: var(--wrong)"></i>
                Failed to load timeline data.
                <br><button class="go-quiz-btn" onclick="initTimeline()" style="margin-top: 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-rotate-right"></i> Retry
                </button>
            </div>`;
    }
}

// ═══════════════════════════════════════════════════════════════
//  DOM READY
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // ── Theme Engine ──────────────────────────────────────────
    const presetColors = {
        light: {
            indigo: { accent: '#5d5fef', bg: '#f4f6f9', text: '#111827' },
            scholar: { accent: '#2a7c6f', bg: '#f5f2eb', text: '#1a1f2e' },
            pink: { accent: '#db2777', bg: '#fdf2f8', text: '#4c1d95' },
            amber: { accent: '#d97706', bg: '#fffbeb', text: '#451a03' }
        },
        dark: {
            indigo: { accent: '#818cf8', bg: '#0f111a', text: '#f3f4f6' },
            scholar: { accent: '#3db89e', bg: '#141820', text: '#e8e4da' },
            pink: { accent: '#f472b6', bg: '#1c0f18', text: '#fce7f3' },
            amber: { accent: '#fbbf24', bg: '#1c1917', text: '#fef3c7' }
        }
    };

    function applyThemeMode(isDark) {
        const t = isDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('quizme-theme-mode', t);
        const iconCls = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        ['theme-icon', 'theme-icon-mobile'].forEach(id => {
            const e = document.getElementById(id); if (e) e.className = iconCls;
        });
        const tl = document.getElementById('theme-label'); if (tl) tl.textContent = isDark ? 'Dark' : 'Light';
        
        const dmToggle = document.getElementById('settings-dark-mode-toggle');
        if (dmToggle) dmToggle.checked = isDark;

        const activePreset = localStorage.getItem('quizme-color-theme') || 'scholar';
        if (activePreset !== 'custom') {
            const colors = presetColors[t][activePreset] || presetColors[t]['scholar'];
            const ca = document.getElementById('custom-color-accent'); if (ca) ca.value = colors.accent;
            const cb = document.getElementById('custom-color-bg'); if (cb) cb.value = colors.bg;
            const ct = document.getElementById('custom-color-text'); if (ct) ct.value = colors.text;
        }
    }
    
    function applyColorTheme(preset, customColors = null) {
        if (preset === 'custom' && customColors) {
            document.documentElement.removeAttribute('data-color-theme');
            document.documentElement.style.setProperty('--accent', customColors.accent);
            document.documentElement.style.setProperty('--bg', customColors.bg);
            document.documentElement.style.setProperty('--text', customColors.text);
            localStorage.setItem('quizme-color-theme', 'custom');
            localStorage.setItem('quizme-custom-colors', JSON.stringify(customColors));
        } else {
            document.documentElement.style.removeProperty('--accent');
            document.documentElement.style.removeProperty('--bg');
            document.documentElement.style.removeProperty('--text');
            document.documentElement.setAttribute('data-color-theme', preset);
            localStorage.setItem('quizme-color-theme', preset);
            
            // Update preset active state
            document.querySelectorAll('.theme-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === preset);
            });
            
            // Sync custom pickers to reflect this preset
            const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const colors = presetColors[mode][preset] || presetColors[mode]['scholar'];
            const ca = document.getElementById('custom-color-accent'); if (ca) ca.value = colors.accent;
            const cb = document.getElementById('custom-color-bg'); if (cb) cb.value = colors.bg;
            const ct = document.getElementById('custom-color-text'); if (ct) ct.value = colors.text;
        }
    }

    // Initialize themes
    const savedMode = localStorage.getItem('quizme-theme-mode') || 'light';
    applyThemeMode(savedMode === 'dark');
    
    const savedColorTheme = localStorage.getItem('quizme-color-theme') || 'scholar';
    if (savedColorTheme === 'custom') {
        const custom = safeParseJSON('quizme-custom-colors', {accent: '#2a7c6f', bg: '#f5f2eb', text: '#1a1f2e'});
        applyColorTheme('custom', custom);
        const ca = document.getElementById('custom-color-accent'); if (ca) ca.value = custom.accent;
        const cb = document.getElementById('custom-color-bg'); if (cb) cb.value = custom.bg;
        const ct = document.getElementById('custom-color-text'); if (ct) ct.value = custom.text;
    } else {
        applyColorTheme(savedColorTheme);
    }

    // Theme Event Listeners
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        applyThemeMode(document.documentElement.getAttribute('data-theme') !== 'dark');
    });
    document.getElementById('theme-toggle-mobile')?.addEventListener('click', () => {
        applyThemeMode(document.documentElement.getAttribute('data-theme') !== 'dark');
    });
    document.getElementById('settings-dark-mode-toggle')?.addEventListener('change', (e) => {
        applyThemeMode(e.target.checked);
    });

    document.querySelectorAll('.theme-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyColorTheme(btn.dataset.preset);
        });
    });

    document.getElementById('apply-custom-theme-btn')?.addEventListener('click', () => {
        const accent = document.getElementById('custom-color-accent').value;
        const bg = document.getElementById('custom-color-bg').value;
        const text = document.getElementById('custom-color-text').value;
        applyColorTheme('custom', { accent, bg, text });
        document.querySelectorAll('.theme-preset-btn').forEach(btn => btn.classList.remove('active'));
        
        const b = document.getElementById('apply-custom-theme-btn');
        b.textContent = 'Applied ✓';
        setTimeout(() => b.textContent = 'Apply Custom Theme', 2000);
    });

    // ── Navigation & Sidebar ───────────────────────────────────
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(btn =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    if (activeTab === 'dashboard' || activeTab === 'stats') activeTab = 'prep';
    switchTab(activeTab);

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    
    if (localStorage.getItem('quizme-sidebar-collapsed') === 'true') {
        sidebar?.classList.add('collapsed');
        mainContent?.classList.add('collapsed');
    }
    
    collapseBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
        mainContent?.classList.toggle('collapsed');
        localStorage.setItem('quizme-sidebar-collapsed', sidebar?.classList.contains('collapsed'));
    });

    // ── Settings Initialization ───────────────────────────────
    // Populate fields
    const ni = document.getElementById('exam-name-input');
    const di = document.getElementById('exam-date-input');
    if (ni) ni.value = examConfig.name || '';
    if (di) di.value = examConfig.date || '';
    
    // Mode buttons
    const modeDescs = {
        normal:   'Weighted random — weak questions appear more often',
        weak:     'Only questions below 60% accuracy or never attempted',
        unseen:   'Only questions you have never attempted before',
        srs:      'Spaced Repetition System — only review questions due now',
        revision: 'Mastered questions only — stats not recorded'
    };
    function updateModeDesc() {
        const el = document.getElementById('mode-desc');
        if (el) el.textContent = modeDescs[quizMode] || '';
    }

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mode-' + quizMode)?.classList.add('active');
    updateModeDesc();
    
    // Toggles
    const nm = document.getElementById('neg-marking-toggle'); if (nm) nm.checked = negMarking;
    const st = document.getElementById('sound-toggle');       if (st) st.checked = soundEnabled;
    const ef = document.getElementById('exclude-flagged-toggle'); if (ef) ef.checked = excludeFlagged;


    // ── Mode buttons ──────────────────────────────────────────
    ['normal','weak','unseen','srs','revision'].forEach(mode => {
        document.getElementById('mode-' + mode)?.addEventListener('click', () => {
            quizMode = mode;
            localStorage.setItem('qm-mode', mode);
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('mode-' + mode)?.classList.add('active');
            updateModeDesc();
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
    document.getElementById('exclude-flagged-toggle')?.addEventListener('change', e => {
        excludeFlagged = e.target.checked;
        localStorage.setItem('qm-exclude-flagged', excludeFlagged);
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
    });



    // ── Stats reset ───────────────────────────────────────────
    document.getElementById('sp-reset-btn')?.addEventListener('click', doReset);

    // ── Wipe App & Clear Cache ────────────────────────────────
    document.getElementById('settings-wipe-btn')?.addEventListener('click', async () => {
        if (!confirm('Are you absolutely sure you want to WIPE the application?\n\nThis will delete all study statistics, syllabus checklists progress, custom theme preferences, and offline cached data. This cannot be undone!')) return;
        if (!confirm('Double check: Wiping will clear everything and force-download from the server. Proceed?')) return;
        
        try {
            // 1. Clear LocalStorage
            localStorage.clear();
            
            // 2. Unregister Service Workers
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let r of regs) {
                    await r.unregister();
                }
            }
            
            // 3. Delete Caches
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let k of keys) {
                    await caches.delete(k);
                }
            }
            
            // 4. Force Reload
            window.location.reload();
        } catch (e) {
            console.error('App wipe failed:', e);
            alert('Wipe completed with some cache errors. Reloading...');
            window.location.reload();
        }
    });

    // ── Timeline toggle & Load More ──────────────────────────
    document.querySelectorAll('.tl-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.era === tlCurrentEra) return;
            renderTimeline(btn.dataset.era);
            // Scroll to top of timeline
            document.getElementById('tab-timeline')?.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
    document.getElementById('tl-load-more-btn')?.addEventListener('click', loadMoreTimeline);

    // ── Copy flagged ──────────────────────────────────────────
    document.getElementById('sp-copy-flagged')?.addEventListener('click', () => {
        const entries = Object.entries(flaggedQ);
        const lines   = entries.map(([qid, f]) => {
            const q = allQuestions.find(q => q.qid === qid);
            return `${qid} — ${formatSubject(f.s||'')} — ${q ? q.question : qid}`;
        });
        navigator.clipboard.writeText(lines.join('\n'))
            .then(()  => alert('Copied all flagged details to clipboard!'))
            .catch(()  => alert('Copy failed — try manually.'));
    });


    // ── Sub-topic selector & Dashboard click handlers ──────────
    document.getElementById('subtopic-select')?.addEventListener('change', () => {
        startQuiz();
    });
    document.getElementById('db-btn-start')?.addEventListener('click', () => {
        quizMode = 'normal';
        localStorage.setItem('qm-mode', 'normal');
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === 'mode-normal');
        });
        startSubjectQuiz('all.json');
    });
    document.getElementById('db-btn-srs')?.addEventListener('click', () => {
        quizMode = 'srs';
        localStorage.setItem('qm-mode', 'srs');
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === 'mode-srs');
        });
        startSubjectQuiz('all.json');
    });

    // ── Load manifest ─────────────────────────────────────────
    fetch('control/manifest.json')
        .then(r => r.json())
        .then(data => {
            availableSheets = data.files;
            createSubjectDropdown();
            loadAllSubjectData();
        })
        .catch(e => console.error('Manifest load failed:', e));

    // Initialize Prep Hub event listeners
    initPrepListeners();

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
        updateSubtopicDropdown();
        loadQuestions();
    };
    el.appendChild(select);
}

function loadQuestions() {
    if (subjectQuestions[currentSubject]) {
        questions = subjectQuestions[currentSubject];
        startQuiz();
    } else {
        fetch(dataUrl)
            .then(r => r.json())
            .then(data => {
                questions      = data;
                currentSubject = dataUrl.split('/').pop().replace('.json','');
                startQuiz();
            })
            .catch(e => console.error('Error loading JSON:', e));
    }
}

function startQuiz() {
    usedIndexes.clear();
    document.onkeydown = null;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    sessionAnswered = 0; sessionCorrect = 0;
    sessionBestStreak = 0; sessionCurrentStreak = 0;
    sessionNewMastered = 0; simScore = 0;

    // ✅ FIX 2: Clear elements appended directly to .container on wrong answers
    document.querySelectorAll('.information, .neg-mark-indicator, .ask-ai-wrap, .advance-bar-wrap')
        .forEach(el => el.remove());

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

    // ✅ FIX 1: Remove any leftover advance bar from previous question
    document.querySelectorAll('.advance-bar-wrap').forEach(el => el.remove());

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
            <button class="copy-btn-card" id="copy-btn-card" data-qid="${qid}" title="Copy question text to clipboard">
                <i class="fa-regular fa-copy"></i>
            </button>
            <button class="flag-btn${isFlagged?' flagged':''}" id="flag-btn-card" data-qid="${qid}"
                title="${isFlagged?'Remove bookmark':'Bookmark for review'}">
                <i class="${isFlagged?'fa-solid':'fa-regular'} fa-bookmark" ${!isFlagged?'style="opacity: 0.6"':''}></i>
            </button>
        </div>
        <p class="question"></p>
        <div class="choices"></div>`;

    div.querySelector('.question').textContent = q.question;

    // Copy handler
    div.querySelector('#copy-btn-card')?.addEventListener('click', function() {
        navigator.clipboard.writeText(q.question)
            .then(() => {
                const icon = this.querySelector('i');
                icon.className = 'fa-solid fa-check';
                setTimeout(() => icon.className = 'fa-regular fa-copy', 1500);
            })
            .catch(e => console.error('Copy failed:', e));
    });

    // Flag handler
    div.querySelector('.flag-btn')?.addEventListener('click', function() {
        unlockAudio(); playSound('flag');
        const qidBtn = this.dataset.qid;
        if (!qidBtn) return;
        if (flaggedQ[qidBtn]) {
            delete flaggedQ[qidBtn];
            this.classList.remove('flagged');
            this.querySelector('i').className = 'fa-regular fa-bookmark';
            this.querySelector('i').style.opacity = '0.6';
            this.title = 'Bookmark for review';
        } else {
            flaggedQ[qidBtn] = { s: currentSubject, t: Math.floor(Date.now()/1000) };
            this.classList.add('flagged');
            this.querySelector('i').className = 'fa-solid fa-bookmark';
            this.querySelector('i').style.opacity = '1';
            this.title = 'Remove bookmark';
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
    const icon = btn.querySelector('i');
    icon.className = isFlagged ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    icon.style.opacity = isFlagged ? '1' : '0.6';
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
    
    if (quizMode === 'srs' && sessionAnswered === 0) {
        qc.innerHTML = `
            <div class="session-complete">
                <h2>All Reviewed! 🎉</h2>
                <p>No questions are currently due for spaced repetition review.</p>
                <div style="margin-top:20px;">
                    <button class="btn" onclick="switchTab('dashboard')" style="padding:10px 20px; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer; font-family:'DM Sans',sans-serif;">
                        Go to Dashboard
                    </button>
                </div>
            </div>`;
        return;
    }
    
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

}

document.getElementById('restart-btn')?.addEventListener('click', startQuiz);

// ═══════════════════════════════════════════════════════════════
//  INSTALL PROMPT  (PWA)
// ═══════════════════════════════════════════════════════════════

let deferredInstallPrompt = null;
const INSTALL_DISMISSED_KEY = 'qm-install-dismissed';

// Capture the browser's install prompt
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;

    // Don't show if user dismissed within the last 7 days
    const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
    if (dismissed && (Date.now() - parseInt(dismissed)) < 7 * 86400000) return;

    // Don't show if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    showInstallBanner();
});

function showInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'block';
}
function hideInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
}

document.getElementById('install-btn')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    hideInstallBanner();
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    // If dismissed from native dialog, remember for 7 days
    if (outcome === 'dismissed') {
        localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
    }
});

document.getElementById('install-dismiss')?.addEventListener('click', () => {
    hideInstallBanner();
    localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
});

// Hide banner if installed after the fact
window.addEventListener('appinstalled', hideInstallBanner);

// ═══════════════════════════════════════════════════════════════
//  OFFLINE INDICATOR
// ═══════════════════════════════════════════════════════════════

function updateOfflinePill() {
    const pill = document.getElementById('offline-pill');
    if (!pill) return;
    pill.style.display = navigator.onLine ? 'none' : 'block';
}

window.addEventListener('online',  updateOfflinePill);
window.addEventListener('offline', updateOfflinePill);
updateOfflinePill(); // check on load

// ═══════════════════════════════════════════════════════════════
//  SW UPDATE NOTIFICATION  (optional quality-of-life)
// ═══════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
        reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            newSW?.addEventListener('statechange', () => {
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                    // New version available — show a subtle toast
                    const toast = document.createElement('div');
                    toast.style.cssText = `
                        position:fixed; bottom:calc(var(--bottom-nav-h, 60px) + 70px);
                        left:50%; transform:translateX(-50%);
                        background:var(--card); border:1px solid var(--accent);
                        color:var(--text); font-family:'DM Mono',monospace;
                        font-size:12px; padding:10px 18px; border-radius:10px;
                        box-shadow:var(--shadow); z-index:500; white-space:nowrap;
                        display:flex; gap:12px; align-items:center;
                        animation: fadeUp 0.3s ease;
                    `;
                    toast.innerHTML = `
                        <span>🆕 New version available</span>
                        <button onclick="newSW.postMessage('SKIP_WAITING'); location.reload();"
                            style="background:var(--accent);color:#fff;border:none;
                                   padding:4px 12px;border-radius:6px;cursor:pointer;
                                   font-family:'DM Mono',monospace;font-size:11px;">
                            Update
                        </button>
                        <button onclick="this.parentElement.remove()"
                            style="background:none;border:none;color:var(--text-muted);
                                   cursor:pointer;font-size:14px;">✕</button>
                    `;
                    document.body.appendChild(toast);
                    setTimeout(() => toast.remove(), 12000);
                }
            });
        });
    });
}

// ═══════════════════════════════════════════════════════════════
//  STUDY & PREP HUB LOGIC
// ═══════════════════════════════════════════════════════════════

const PREP_SUBJECTS = [
    { id: 'history-ancient', title: 'Ancient History', icon: '🏺', path: 'knowledge-base/history/ancient-history/topics.md', sheet: 'HistoryAncient.json' },
    { id: 'history-medieval', title: 'Medieval History', icon: '🏰', path: 'knowledge-base/history/medieval-history/topics.md', sheet: 'HistoryMedieval.json' },
    { id: 'history-modern', title: 'Modern History', icon: '📜', path: 'knowledge-base/history/modern-history/topics.md', sheet: 'HistoryModern.json' },
    { id: 'polity', title: 'Indian Polity', icon: '⚖️', path: 'knowledge-base/polity/topics.md', sheet: 'Polity.json' },
    { id: 'geography', title: 'Geography', icon: '🗺️', path: 'knowledge-base/geography/topics.md', sheet: 'Geography.json' },
    { id: 'reports-census', title: 'Census & Reports', icon: '📊', path: 'knowledge-base/reports-surveys/census/topics.md', sheet: 'Census.json' },
    { id: 'bihar-specific', title: 'Bihar Specific', icon: '🦁', path: '', sheet: 'BiharSpecific.json' },
    { id: 'bihar-economy', title: 'Bihar Economy', icon: '🌾', path: '', sheet: 'BiharEconomy.json' },
    { id: 'union-economy', title: 'Union Economy', icon: '📈', path: '', sheet: 'UnionEconomy.json' },
    { id: 'general-knowledge', title: 'General Knowledge', icon: '🧠', path: '', sheet: 'GeneralKnowledge.json' },
    { id: 'bihar-geography', title: 'Bihar Geography', icon: '🏞️', path: '', sheet: 'BiharGeography.json' },
    { id: 'bihar-polity', title: 'Bihar Polity', icon: '🏛️', path: '', sheet: 'BiharPolity.json' }
];

let prepData = {}; // subjectId -> parsed topics data
let activePrepSubject = null;
let activePrepSection = 'all'; // active section filter (e.g., 'all' or section ID)
let prepProgress = {}; // topicId -> boolean (checked/unchecked)

function loadPrepProgress() {
    try {
        const raw = localStorage.getItem('qm-prep-progress');
        prepProgress = raw ? JSON.parse(raw) : {};
    } catch (e) {
        prepProgress = {};
    }
}

function savePrepProgress() {
    localStorage.setItem('qm-prep-progress', JSON.stringify(prepProgress));
}

async function loadPrepSubject(subjectId) {
    const subject = PREP_SUBJECTS.find(s => s.id === subjectId);
    if (!subject) return null;
    if (prepData[subjectId]) return prepData[subjectId];
    
    try {
        const res = await fetch(subject.path);
        if (!res.ok) throw new Error('Failed to load topic checklist');
        const text = await res.text();
        const parsed = parseMarkdownChecklist(text);
        prepData[subjectId] = parsed;
        return parsed;
    } catch (e) {
        console.error('Error fetching/parsing prep subject:', e);
        return null;
    }
}

function parseMarkdownChecklist(text) {
    const lines = text.split(/\r?\n/);
    const sections = [];
    let currentSection = null;
    let inTable = false;
    let tableHeaders = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Detect section header: **SECTION X — Title** or Here is **Era X: Title**
        const sectionMatch = line.match(/^(?:\*\*SECTION\s+([A-Z0-9]+)\s*—\s*(.*?)\*\*|Here is \*\*Era\s+([A-Z0-9]+)\s*:\s*(.*?)\*\*)/i);
        if (sectionMatch) {
            currentSection = {
                id: sectionMatch[1] || sectionMatch[3],
                title: (sectionMatch[2] || sectionMatch[4] || '').trim(),
                rawLine: line,
                topics: []
            };
            sections.push(currentSection);
            inTable = false;
            continue;
        }
        
        // Detect table rows: starts and ends with |
        if (line.startsWith('|')) {
            if (line.match(/^\|(?:\s*[:-]+\s*\|)+$/)) {
                if (currentSection) {
                    currentSection.separatorLine = line;
                }
                continue;
            }
            const cells = line.split('|').map(c => c.trim()).slice(1, -1);
            if (!inTable) {
                tableHeaders = cells.map(c => c.toLowerCase());
                if (currentSection) {
                    currentSection.headerLine = line;
                }
                inTable = true;
            } else {
                if (currentSection && cells.length >= 3) {
                    let statusIdx = tableHeaders.findIndex(h => h.includes('status'));
                    let idIdx = tableHeaders.findIndex(h => h.includes('#'));
                    let topicIdx = tableHeaders.findIndex(h => h.includes('topic') || h.includes('source') || h.includes('event'));
                    let refIdx = tableHeaders.findIndex(h => h.includes('reference') || h.includes('ref'));
                    let impIdx = tableHeaders.findIndex(h => h.includes('importance'));
                    let yearIdx = tableHeaders.findIndex(h => h.includes('year'));
                    
                    if (statusIdx === -1) statusIdx = 0;
                    if (idIdx === -1) idIdx = 1;
                    if (topicIdx === -1) topicIdx = 2;
                    if (refIdx === -1) {
                        refIdx = cells.findIndex(c => c.match(/(RS Sharma|Laxmikanth|NCERT|FPG|IPE|Spectrum|Satish Chandra)/i));
                    }
                    if (impIdx === -1) {
                        impIdx = cells.length - 1; // default to last column
                    }
                    
                    const rawTopic = cells[topicIdx] || '';
                    let topicTitle = rawTopic.replace(/\*\*/g, '').trim();
                    let topicDesc = '';
                    
                    const sepIndex = topicTitle.search(/\s*(?:—|–|-)\s+/);
                    if (sepIndex !== -1) {
                        topicDesc = topicTitle.slice(sepIndex).replace(/^\s*(?:—|–|-)\s+/, '').trim();
                        topicTitle = topicTitle.slice(0, sepIndex).trim();
                    }
                    
                    if (!topicDesc) {
                        const detailIdx = tableHeaders.findIndex(h => h.includes('tells') || h.includes('detail') || h.includes('figure') || h.includes('fact') || h.includes('ranking') || h.includes('context'));
                        if (detailIdx !== -1 && detailIdx !== topicIdx) {
                            topicDesc = cells[detailIdx] || '';
                        }
                    }
                    
                    let yearVal = yearIdx !== -1 && yearIdx < cells.length ? cells[yearIdx].trim() : '';
                    if (yearVal) {
                        if (topicDesc) {
                            topicDesc = `Year: ${yearVal} · ${topicDesc}`;
                        } else {
                            topicDesc = `Year: ${yearVal}`;
                        }
                    }
                    
                    let notePath = '';
                    let noteLabel = '';
                    for (let c = 0; c < cells.length; c++) {
                        const linkMatch = cells[c].match(/\[([^\]]+)\]\(([^)]*notes\/[^)]+)\)/i);
                        if (linkMatch) {
                            noteLabel = linkMatch[1];
                            notePath = linkMatch[2];
                            break;
                        }
                    }
                    
                    const statusCell = cells[statusIdx] || '';
                    const isChecked = statusCell.includes('x') || statusCell.includes('X');
                    const code = (cells[idIdx] || '').trim();
                    const bookRef = refIdx !== -1 && refIdx < cells.length ? cells[refIdx] : '';
                    const importance = impIdx !== -1 && impIdx < cells.length ? cells[impIdx] : 'Medium';
                    
                    currentSection.topics.push({
                        code: code,
                        title: topicTitle,
                        description: topicDesc.replace(/\*\*/g, '').trim(),
                        bookRef: bookRef.replace(/\*\*/g, '').trim(),
                        importance: importance.replace(/\*\*/g, '').trim(),
                        defaultChecked: isChecked,
                        notePath: notePath,
                        noteLabel: noteLabel,
                        rawCells: cells
                    });
                }
            }
        } else {
            inTable = false;
        }
    }
    
    return sections;
}

async function renderPrepTab() {
    loadPrepProgress();
    const dashboardView = document.getElementById('prep-dashboard-view');
    const checklistView = document.getElementById('prep-checklist-view');
    if (!dashboardView || !checklistView) return;
    
    if (activePrepSubject) {
        dashboardView.style.display = 'none';
        checklistView.style.display = 'block';
        await renderSubjectChecklist(activePrepSubject);
    } else {
        dashboardView.style.display = 'block';
        checklistView.style.display = 'none';
        await renderPrepDashboard();
    }
}

async function renderPrepDashboard() {
    const grid = document.getElementById('prep-subject-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="tl-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading Prep Hub...</div>';
    
    // Update global MCQ stats (from old dashboard overview)
    const totalQ = allQuestions.length;
    const overallAcc = getOverall().accuracy;
    const srsDue = getSRSDueCount();
    
    const totalQEl = document.getElementById('db-total-questions');
    const accEl = document.getElementById('db-total-accuracy');
    const srsEl = document.getElementById('db-srs-count');
    
    if (totalQEl) totalQEl.textContent = totalQ.toLocaleString();
    if (accEl) accEl.textContent = overallAcc + '%';
    if (srsEl) srsEl.textContent = srsDue;

    const promises = PREP_SUBJECTS.map(async (subj) => {
        let data = null;
        if (subj.path) {
            data = await loadPrepSubject(subj.id);
        }
        return { subject: subj, data: data };
    });
    
    const results = await Promise.all(promises);
    grid.innerHTML = '';
    
    let totalTopics = 0;
    let completedTopics = 0;
    
    results.forEach(({ subject, data }) => {
        // 1. Calculate Checklist Progress
        const hasChecklist = !!subject.path;
        let subjTotal = 0;
        let subjCompleted = 0;
        let checklistPercent = 0;

        if (hasChecklist && data) {
            data.forEach(sec => {
                sec.topics.forEach(t => {
                    subjTotal++;
                    const key = `${subject.id}-${t.code}`;
                    const isChecked = prepProgress[key] !== undefined ? prepProgress[key] : t.defaultChecked;
                    if (isChecked) subjCompleted++;
                });
            });
            totalTopics += subjTotal;
            completedTopics += subjCompleted;
            checklistPercent = subjTotal > 0 ? Math.round((subjCompleted / subjTotal) * 100) : 0;
        }

        // 2. Fetch MCQ Stats
        const sheet = subject.sheet;
        const hasMCQ = !!sheet;
        let qCount = 0;
        let mcqAccuracy = 'New';
        let mcqMastery = 0;
        let accClass = 'untouched';

        if (hasMCQ) {
            const subName = sheet.replace('.json', '');
            qCount = subjectQuestionCounts[subName] || 0;
            const stats = getSubjectStats(sheet);
            mcqAccuracy = stats.accuracy !== null ? stats.accuracy + '%' : 'New';
            mcqMastery = getMasteryPercent(sheet);
            accClass = classifyAcc(stats.accuracy);
        }

        // 3. Render Card HTML
        const card = document.createElement('div');
        card.className = 'prep-card';
        if (!hasChecklist) card.classList.add('no-checklist');
        
        let checklistHTML = '';
        if (hasChecklist) {
            checklistHTML = `
                <div class="prep-card-checklist-section" title="Click to view checklist details">
                    <div class="prep-card-section-label">
                        <span>Checklist Progress</span>
                        <span class="prep-card-percent">${checklistPercent}%</span>
                    </div>
                    <div class="prep-card-progress-track">
                        <div class="prep-card-progress-fill" style="width: ${checklistPercent}%"></div>
                    </div>
                    <div class="prep-card-stats">
                        <span>${subjCompleted} / ${subjTotal} completed</span>
                        <span>${subjTotal - subjCompleted} remaining</span>
                    </div>
                </div>
            `;
        } else {
            checklistHTML = `
                <div class="prep-card-checklist-section empty-checklist">
                    <span class="checklist-placeholder-text">Syllabus checklist not linked</span>
                </div>
            `;
        }

        let mcqHTML = '';
        if (hasMCQ) {
            mcqHTML = `
                <div class="prep-card-mcq-section" title="Click to practice these MCQs">
                    <div class="prep-card-section-label">
                        <span>MCQ Practice</span>
                        <span class="prep-card-mastery">${mcqMastery}% Mastery</span>
                    </div>
                    <div class="prep-card-progress-track mastery-track">
                        <div class="prep-card-progress-fill mastery-fill" style="width: ${mcqMastery}%"></div>
                    </div>
                    <div class="prep-card-stats">
                        <span>${qCount} Questions</span>
                        <span class="cov-badge ${accClass}">${mcqAccuracy} Accuracy</span>
                    </div>
                </div>
            `;
        } else {
            mcqHTML = `
                <div class="prep-card-mcq-section empty-mcq">
                    <span class="checklist-placeholder-text">MCQ database not linked</span>
                </div>
            `;
        }

        let actionsHTML = `
            <div class="prep-card-actions">
                ${hasChecklist ? `
                    <button class="prep-card-btn checklist-btn" data-action="checklist">
                        <i class="fa-solid fa-list-check"></i> Checklist
                    </button>
                ` : `
                    <button class="prep-card-btn checklist-btn disabled" disabled>
                        <i class="fa-solid fa-list-check"></i> Checklist
                    </button>
                `}
                ${hasMCQ ? `
                    <button class="prep-card-btn practice-btn" data-action="practice">
                        <i class="fa-solid fa-crosshairs"></i> Practice MCQs
                    </button>
                ` : ''}
            </div>
        `;

        card.innerHTML = `
            <div class="prep-card-header">
                <div class="prep-card-title-wrap">
                    <span class="prep-card-icon">${subject.icon}</span>
                    <h3 class="prep-card-title">${subject.title}</h3>
                </div>
            </div>
            <div class="prep-card-body">
                ${checklistHTML}
                ${mcqHTML}
            </div>
            ${actionsHTML}
        `;

        // Event bindings
        if (hasChecklist) {
            const chkBtn = card.querySelector('[data-action="checklist"]');
            if (chkBtn) {
                chkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openChecklist(subject.id);
                });
            }
            const chkSec = card.querySelector('.prep-card-checklist-section');
            if (chkSec) {
                chkSec.addEventListener('click', () => {
                    openChecklist(subject.id);
                });
            }
        }
        
        if (hasMCQ) {
            const pracBtn = card.querySelector('[data-action="practice"]');
            if (pracBtn) {
                pracBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    startSubjectQuiz(sheet);
                });
            }
            const mcqSec = card.querySelector('.prep-card-mcq-section');
            if (mcqSec) {
                mcqSec.addEventListener('click', () => {
                    startSubjectQuiz(sheet);
                });
            }
        }

        grid.appendChild(card);
    });
    
    const masterPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
    const ring = document.getElementById('prep-master-ring');
    const percentSpan = document.getElementById('prep-master-percent');
    const metaP = document.getElementById('prep-master-meta');
    
    if (ring) {
        ring.style.background = `conic-gradient(var(--accent) ${masterPercent}%, var(--border-soft) ${masterPercent}%)`;
    }
    if (percentSpan) percentSpan.textContent = masterPercent + '%';
    if (metaP) metaP.textContent = `${completedTopics} of ${totalTopics} topics completed`;
}

function openChecklist(subjectId) {
    activePrepSubject = subjectId;
    activePrepSection = 'all';
    const dashboardView = document.getElementById('prep-dashboard-view');
    const checklistView = document.getElementById('prep-checklist-view');
    if (dashboardView && checklistView) {
        dashboardView.style.display = 'none';
        checklistView.style.display = 'block';
        renderSubjectChecklist(subjectId);
    }
}

function updateMasterProgressCard() {
    let totalTopics = 0;
    let completedTopics = 0;
    
    PREP_SUBJECTS.forEach(subject => {
        if (!subject.path) return;
        const data = prepData[subject.id];
        if (!data) return;
        data.forEach(sec => {
            sec.topics.forEach(t => {
                totalTopics++;
                const key = `${subject.id}-${t.code}`;
                const isChecked = prepProgress[key] !== undefined ? prepProgress[key] : t.defaultChecked;
                if (isChecked) completedTopics++;
            });
        });
    });
    
    const masterPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
    const ring = document.getElementById('prep-master-ring');
    const percentSpan = document.getElementById('prep-master-percent');
    const metaP = document.getElementById('prep-master-meta');
    
    if (ring) {
        ring.style.background = `conic-gradient(var(--accent) ${masterPercent}%, var(--border-soft) ${masterPercent}%)`;
    }
    if (percentSpan) percentSpan.textContent = masterPercent + '%';
    if (metaP) metaP.textContent = `${completedTopics} of ${totalTopics} topics completed`;
}

async function renderSubjectChecklist(subjectId) {
    const subject = PREP_SUBJECTS.find(s => s.id === subjectId);
    if (!subject) return;
    
    const iconEl = document.getElementById('prep-subject-icon');
    const titleEl = document.getElementById('prep-subject-title');
    if (iconEl) iconEl.textContent = subject.icon;
    if (titleEl) titleEl.textContent = subject.title;
    
    const container = document.getElementById('prep-topics-container');
    if (!container) return;
    container.innerHTML = '<div class="tl-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading checklist...</div>';
    
    const sections = await loadPrepSubject(subjectId);
    if (!sections) {
        container.innerHTML = '<p class="sp-empty">Failed to load checklist details.</p>';
        return;
    }
    
    // Safety check: if activePrepSection doesn't exist in this subject's sections, reset to 'all'
    if (activePrepSection !== 'all' && !sections.some(s => s.id === activePrepSection)) {
        activePrepSection = 'all';
    }
    
    const jumpBar = document.getElementById('prep-jump-bar');
    if (jumpBar) {
        jumpBar.innerHTML = '';
        const btnAll = document.createElement('button');
        btnAll.className = `checklist-jump-btn${activePrepSection === 'all' ? ' active' : ''}`;
        btnAll.textContent = 'ALL SECTIONS';
        btnAll.addEventListener('click', () => {
            activePrepSection = 'all';
            jumpBar.querySelectorAll('.checklist-jump-btn').forEach(b => b.classList.remove('active'));
            btnAll.classList.add('active');
            renderFilteredChecklist(sections, subjectId);
        });
        jumpBar.appendChild(btnAll);
        
        sections.forEach(sec => {
            const btn = document.createElement('button');
            btn.className = `checklist-jump-btn${activePrepSection === sec.id ? ' active' : ''}`;
            btn.textContent = `SEC ${sec.id}`;
            btn.title = sec.title;
            btn.addEventListener('click', () => {
                activePrepSection = sec.id;
                jumpBar.querySelectorAll('.checklist-jump-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderFilteredChecklist(sections, subjectId);
            });
            jumpBar.appendChild(btn);
        });
    }
    
    renderFilteredChecklist(sections, subjectId);
}

function renderFilteredChecklist(sections, subjectId) {
    const container = document.getElementById('prep-topics-container');
    if (!container) return;
    
    const searchVal = (document.getElementById('prep-search-input')?.value || '').toLowerCase().trim();
    const statusVal = document.getElementById('prep-filter-status')?.value || 'all';
    const importanceVal = document.getElementById('prep-filter-importance')?.value || 'all';
    
    container.innerHTML = '';
    let renderedAny = false;
    
    sections.forEach(sec => {
        if (activePrepSection !== 'all' && sec.id !== activePrepSection) return;
        const filteredTopics = sec.topics.filter(t => {
            const matchesSearch = !searchVal || 
                t.code.toLowerCase().includes(searchVal) || 
                t.title.toLowerCase().includes(searchVal) || 
                t.description.toLowerCase().includes(searchVal) || 
                t.bookRef.toLowerCase().includes(searchVal);
            if (!matchesSearch) return false;
            
            const key = `${subjectId}-${t.code}`;
            const isChecked = prepProgress[key] !== undefined ? prepProgress[key] : t.defaultChecked;
            const matchesStatus = statusVal === 'all' || 
                (statusVal === 'checked' && isChecked) || 
                (statusVal === 'unchecked' && !isChecked);
            if (!matchesStatus) return false;
            
            const cleanImp = t.importance.toLowerCase().replace(/\s+/g, '');
            const matchesImportance = importanceVal === 'all' || cleanImp === importanceVal;
            return matchesImportance;
        });
        
        if (filteredTopics.length === 0) return;
        renderedAny = true;
        
        const secGroup = document.createElement('div');
        secGroup.className = 'prep-section-group';
        secGroup.id = `prep-sec-${sec.id}`;
        secGroup.innerHTML = `
            <div class="prep-section-header">
                <span>SECTION ${sec.id} — ${sec.title}</span>
                <span class="prep-section-badge">${filteredTopics.length} topics</span>
            </div>
            <div class="prep-section-table" id="prep-sec-table-${sec.id}"></div>
        `;
        
        const tableBody = secGroup.querySelector(`#prep-sec-table-${sec.id}`);
        
        filteredTopics.forEach(t => {
            const key = `${subjectId}-${t.code}`;
            const isChecked = prepProgress[key] !== undefined ? prepProgress[key] : t.defaultChecked;
            
            const row = document.createElement('div');
            row.className = 'prep-topic-row';
            
            const impClass = t.importance.toLowerCase() === 'very high' ? 'imp-very-high' 
                           : t.importance.toLowerCase() === 'high' ? 'imp-high' 
                           : 'imp-medium';
                           
            const bookBadge = t.bookRef ? `<span class="prep-pill book">${t.bookRef}</span>` : '';
            
            let noteBtn = '';
            if (t.notePath) {
                noteBtn = `<button class="prep-note-link" data-path="${t.notePath}"><i class="fa-solid fa-file-lines"></i> Notes</button>`;
            } else {
                if (subjectId === 'reports-census') {
                    if (t.code.startsWith('2.')) {
                        noteBtn = `<button class="prep-note-link" data-path="notes/india-census-2011.md"><i class="fa-solid fa-file-lines"></i> Notes</button>`;
                    } else if (t.code.startsWith('3.')) {
                        noteBtn = `<button class="prep-note-link" data-path="notes/bihar-census-2011.md"><i class="fa-solid fa-file-lines"></i> Notes</button>`;
                    }
                }
            }
            
            row.innerHTML = `
                <div class="prep-topic-chk-wrap">
                    <input type="checkbox" id="chk-${key}" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="prep-topic-id">${t.code}</div>
                <div class="prep-topic-body">
                    <strong>${t.title}</strong>
                    ${t.description ? `<br><span style="color:var(--text-muted);font-size:12px">${t.description}</span>` : ''}
                    <div class="prep-topic-meta-row">
                        <span class="prep-pill ${impClass}">${t.importance}</span>
                        ${bookBadge}
                        ${noteBtn}
                    </div>
                </div>
                <button class="prep-topic-practice-btn" title="Practice MCQs for this topic" data-title="${t.title}" data-code="${t.code}">
                    <i class="fa-solid fa-crosshairs"></i> Practice
                </button>
            `;
            
            const chk = row.querySelector('input[type="checkbox"]');
            chk.addEventListener('change', (e) => {
                prepProgress[key] = e.target.checked;
                savePrepProgress();
                updateMasterProgressCard();
            });
            
            const noteEl = row.querySelector('.prep-note-link');
            if (noteEl) {
                noteEl.addEventListener('click', () => {
                    const relativePath = noteEl.dataset.path;
                    const subject = PREP_SUBJECTS.find(s => s.id === subjectId);
                    const folderPath = subject.path.substring(0, subject.path.lastIndexOf('/'));
                    const fullNotePath = `${folderPath}/${relativePath}`;
                    openPrepNoteDrawer(t.title, fullNotePath);
                });
            }
            
            const practiceBtn = row.querySelector('.prep-topic-practice-btn');
            practiceBtn.addEventListener('click', () => {
                launchTopicPractice(subjectId, t.code, t.title);
            });
            
            tableBody.appendChild(row);
        });
        container.appendChild(secGroup);
    });
    
    if (!renderedAny) {
        container.innerHTML = '<p class="sp-empty">No topics match the active filters.</p>';
    }
}


async function openPrepNoteDrawer(title, notePath) {
    const drawer = document.getElementById('prep-notes-drawer');
    const drawerTitle = document.getElementById('prep-drawer-title');
    const drawerBody = document.getElementById('prep-drawer-body');
    if (!drawer || !drawerTitle || !drawerBody) return;
    
    drawerTitle.textContent = title;
    drawerBody.innerHTML = '<div class="tl-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading note content...</div>';
    drawer.classList.add('open');
    
    try {
        const res = await fetch(notePath);
        if (!res.ok) throw new Error('Note file not found');
        const markdown = await res.text();
        drawerBody.innerHTML = renderMarkdownToHTML(markdown);
    } catch (e) {
        console.error('Error loading study notes:', e);
        drawerBody.innerHTML = `
            <div style="text-align:center;padding:40px 20px;color:var(--wrong);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:24px;margin-bottom:12px;"></i>
                <p>Failed to load study notes file.</p>
                <code style="font-size:11px;color:var(--text-muted)">${notePath}</code>
            </div>
        `;
    }
}

function renderMarkdownToHTML(markdown) {
    let html = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
    const lines = html.split(/\r?\n/);
    let inList = false;
    let inTable = false;
    let tableRows = [];
    let processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();
        
        const bqMatch = line.match(/^(&gt;)\s*(.*)/);
        if (bqMatch) {
            let content = bqMatch[2].trim();
            const alertMatch = content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
            if (alertMatch) {
                const type = alertMatch[1].toUpperCase();
                content = content.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '').trim();
                processedLines.push(`<blockquote class="alert-block alert-${type.toLowerCase()}"><strong>${type}</strong><p>`);
            } else {
                processedLines.push(`<blockquote><p>`);
            }
            processedLines.push(parseMarkdownInline(content) + `</p></blockquote>`);
            continue;
        }
        
        const hMatch = line.match(/^(#{1,6})\s+(.*)/);
        if (hMatch) {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            if (inTable) { processedLines.push(renderHTMLTable(tableRows)); inTable = false; tableRows = []; }
            const level = hMatch[1].length;
            processedLines.push(`<h${level}>${parseMarkdownInline(hMatch[2])}</h${level}>`);
            continue;
        }
        
        if (trimmed === '---') {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            if (inTable) { processedLines.push(renderHTMLTable(tableRows)); inTable = false; tableRows = []; }
            processedLines.push('<hr>');
            continue;
        }
        
        const listMatch = line.match(/^([-*])\s+(.*)/);
        if (listMatch) {
            if (inTable) { processedLines.push(renderHTMLTable(tableRows)); inTable = false; tableRows = []; }
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            processedLines.push(`<li>${parseMarkdownInline(listMatch[2])}</li>`);
            continue;
        }
        
        if (trimmed.startsWith('|')) {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            inTable = true;
            tableRows.push(trimmed);
            continue;
        } else {
            if (inTable) {
                processedLines.push(renderHTMLTable(tableRows));
                inTable = false;
                tableRows = [];
            }
        }
        
        if (trimmed === '') {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            processedLines.push('<br>');
        } else {
            if (inList) { processedLines.push('</ul>'); inList = false; }
            processedLines.push(`<p>${parseMarkdownInline(line)}</p>`);
        }
    }
    
    if (inList) processedLines.push('</ul>');
    if (inTable) processedLines.push(renderHTMLTable(tableRows));
    
    return processedLines.join('\n');
}

function parseMarkdownInline(text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

function renderHTMLTable(rows) {
    if (rows.length === 0) return '';
    let html = '<table>';
    
    const headerCells = rows[0].split('|').map(c => c.trim()).slice(1, -1);
    html += '<thead><tr>';
    headerCells.forEach(cell => {
        html += `<th>${parseMarkdownInline(cell)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.match(/^\|(?:\s*[:-]+\s*\|)+$/)) continue;
        const cells = row.split('|').map(c => c.trim()).slice(1, -1);
        html += '<tr>';
        cells.forEach(cell => {
            html += `<td>${parseMarkdownInline(cell)}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function launchTopicPractice(subjectId, topicCode, topicTitle) {
    const sheetMap = {
        'history-ancient': 'HistoryAncient.json',
        'history-medieval': 'HistoryMedieval.json',
        'history-modern': 'HistoryModern.json',
        'polity': 'Polity.json',
        'geography': 'Geography.json',
        'reports-census': 'Census.json'
    };
    
    const sheetName = sheetMap[subjectId];
    if (!sheetName) return;
    
    const subjectKey = sheetName.replace('.json', '');
    let dbQuestions = subjectQuestions[subjectKey];
    if (!dbQuestions || !dbQuestions.length) {
        alert('Please load the quiz questions first by starting a session.');
        return;
    }
    
    const cleanTitle = topicTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const keywords = cleanTitle.split(/\s+/).filter(w => w.length > 3);
    
    let sectionTag = '';
    const secChar = topicCode.charAt(0);
    
    if (subjectId === 'polity') {
        const tagMap = {
            'A': 'polityBackground', 'B': 'polityMaking', 'C': 'polityPreamble',
            'D': 'polityFR', 'E': 'polityDPSP', 'F': 'polityUnionExec',
            'G': 'polityParliament', 'H': 'polityJudiciary', 'I': 'polityStateGov',
            'J': 'polityRelations', 'K': 'polityEmergency', 'L': 'polityBodies',
            'M': 'polityLocalGov', 'N': 'polityAmendments', 'O': 'polityJudgements'
        };
        sectionTag = tagMap[secChar] || '';
    } else if (subjectId === 'history-ancient') {
        const tagMap = {
            '0': 'ancientIVC', '1': 'ancientIVC', '2': 'ancientIVC',
            '3': 'ancientVedic', '4': 'ancientMahajanapadas', '5': 'ancientMauryan',
            '6': 'ancientPostMauryan', '7': 'ancientGupta', '8': 'ancientPostGupta',
            '9': 'ancientSangam', '10': 'ancientBuddhismJainism'
        };
        sectionTag = tagMap[secChar] || '';
    } else if (subjectId === 'geography') {
        const tagMap = {
            'A': 'geoPhysical', 'B': 'geoPhysical', 'C': 'geoPhysical', 'D': 'geoPhysical',
            'E': 'geoIndiaPhysiography', 'F': 'geoIndiaPhysiography', 'G': 'geoIndiaPhysiography',
            'H': 'geoIndiaPhysiography', 'I': 'geoIndiaEconomic', 'J': 'geoIndiaEconomic',
            'K': 'geoIndiaEconomic', 'L': 'geoBihar', 'M': 'geoWorld', 'N': 'geoEnvironment'
        };
        sectionTag = tagMap[secChar] || '';
    } else if (subjectId === 'reports-census') {
        sectionTag = 'census2011';
    }
    
    let matchedQs = dbQuestions.filter(q => {
        const qtext = (q.q || '').toLowerCase();
        const qtags = q.tags ? q.tags.split(',').map(t => t.trim().toLowerCase()) : [];
        
        if (sectionTag && qtags.includes(sectionTag.toLowerCase())) {
            if (keywords.length > 0) {
                const hasKeyword = keywords.some(w => qtext.includes(w));
                if (hasKeyword) return true;
            } else {
                return true;
            }
        }
        if (keywords.length > 0) {
            const matchCount = keywords.filter(w => qtext.includes(w)).length;
            if (matchCount >= Math.min(2, keywords.length)) return true;
        }
        return false;
    });
    
    if (matchedQs.length === 0 && sectionTag) {
        matchedQs = dbQuestions.filter(q => {
            const qtags = q.tags ? q.tags.split(',').map(t => t.trim().toLowerCase()) : [];
            return qtags.includes(sectionTag.toLowerCase());
        });
    }
    
    if (matchedQs.length === 0) {
        alert(`No specific practice questions found for topic: ${topicTitle}. Practicing all questions for this subject instead.`);
        matchedQs = dbQuestions;
    }
    
    currentSubject = subjectKey;
    const select = document.getElementById('subject-select');
    if (select) select.value = sheetName;
    
    questions = matchedQs;
    switchTab('quiz');
    
    const modeLabel = document.getElementById('mode-label');
    if (modeLabel) {
        modeLabel.textContent = `PRACTICE: ${topicTitle} (${matchedQs.length} Qs)`.toUpperCase();
        modeLabel.style.display = 'block';
    }
    startQuiz();
}

function generateUpdatedMarkdown() {
    if (!activePrepSubject) {
        alert('Please open a subject checklist first.');
        return;
    }
    
    const subject = PREP_SUBJECTS.find(s => s.id === activePrepSubject);
    const sections = prepData[activePrepSubject];
    if (!sections) return;
    
    let output = [];
    output.push(`# 📚 ${subject.title} - Master Progress & Topics Checklist\n`);
    
    sections.forEach(sec => {
        output.push(sec.rawLine || `**SECTION ${sec.id} — ${sec.title}**\n`);
        
        if (sec.headerLine) output.push(sec.headerLine);
        if (sec.separatorLine) output.push(sec.separatorLine);
        
        // If headerLine wasn't stored, use fallback
        if (!sec.headerLine) {
            let headerLine = '';
            let separatorLine = '';
            if (activePrepSubject === 'history-ancient') {
                headerLine = '| Status | # | Source | Type | Created By / Period | What It Tells Us | Book Reference | Importance |';
                separatorLine = '| :---: | :---: | --- | --- | --- | --- | --- | --- |';
            } else if (activePrepSubject === 'geography') {
                headerLine = '| Status | # | Topic | Region/Context | NCERT Reference | Category | Importance |';
                separatorLine = '| :---: | --- | --- | --- | --- | --- | --- |';
            } else if (activePrepSubject === 'polity') {
                headerLine = '| Status | # | Topic | Article/Amendment/Case | Section | Book Reference | Category | Importance |';
                separatorLine = '| :---: | :---: | --- | --- | :---: | --- | --- | --- |';
            } else {
                headerLine = '| Status | # | Topic | Key Details | Importance |';
                separatorLine = '| :---: | --- | --- | --- | --- |';
            }
            output.push(headerLine);
            output.push(separatorLine);
        }
        
        sec.topics.forEach(t => {
            const key = `${activePrepSubject}-${t.code}`;
            const isChecked = prepProgress[key] !== undefined ? prepProgress[key] : t.defaultChecked;
            const chkStr = isChecked ? '[x]' : '[ ]';
            
            if (t.rawCells && t.rawCells.length > 0) {
                const cellsCopy = [...t.rawCells];
                cellsCopy[0] = chkStr;
                output.push(`| ${cellsCopy.join(' | ')} |`);
            } else {
                let rowCells = [];
                rowCells.push(` ${chkStr} `);
                rowCells.push(` ${t.code} `);
                
                let topicCell = t.title;
                if (t.description) {
                    topicCell = ` **${t.title}** — ${t.description} `;
                }
                
                if (activePrepSubject === 'history-ancient') {
                    rowCells.push(` ${t.title} `);
                    rowCells.push(' ');
                    rowCells.push(' ');
                    rowCells.push(` ${t.description} `);
                    rowCells.push(` ${t.bookRef} `);
                    rowCells.push(` ${t.importance} `);
                } else if (activePrepSubject === 'geography') {
                    rowCells.push(` ${topicCell} `);
                    rowCells.push(' ');
                    rowCells.push(` ${t.bookRef} `);
                    rowCells.push(' ');
                    rowCells.push(` ${t.importance} `);
                } else if (activePrepSubject === 'polity') {
                    rowCells.push(` ${topicCell} `);
                    rowCells.push(' ');
                    rowCells.push(' ');
                    rowCells.push(` ${t.bookRef} `);
                    rowCells.push(' ');
                    rowCells.push(` ${t.importance} `);
                } else {
                    rowCells.push(` ${t.title} `);
                    rowCells.push(` ${t.description} `);
                    rowCells.push(` ${t.importance} `);
                }
                output.push(`|${rowCells.join('|')}|`);
            }
        });
        output.push('');
    });
    
    const mdText = output.join('\n');
    navigator.clipboard.writeText(mdText).then(() => {
        alert('Updated markdown checklist tables copied to clipboard! You can paste this directly to overwrite your topics.md file.');
    }).catch(e => {
        console.error('Failed to copy markdown:', e);
        alert('Failed to copy to clipboard. Showing content in notes reader instead.');
        openPrepNoteDrawer('Sync Markdown Content', '');
        const db = document.getElementById('prep-drawer-body');
        if (db) {
            db.innerHTML = `
                <p>Copy the text below to update your checklist file:</p>
                <textarea style="width:100%;height:300px;font-family:monospace;font-size:11px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;" readonly>${mdText}</textarea>
            `;
        }
    });
}

function initPrepListeners() {
    document.getElementById('prep-back-btn')?.addEventListener('click', () => {
        activePrepSubject = null;
        const dashboardView = document.getElementById('prep-dashboard-view');
        const checklistView = document.getElementById('prep-checklist-view');
        if (dashboardView && checklistView) {
            dashboardView.style.display = 'block';
            checklistView.style.display = 'none';
        }
        renderPrepDashboard();
    });
    
    document.getElementById('prep-search-input')?.addEventListener('input', () => {
        if (activePrepSubject && prepData[activePrepSubject]) {
            renderFilteredChecklist(prepData[activePrepSubject], activePrepSubject);
        }
    });
    
    document.getElementById('prep-filter-status')?.addEventListener('change', () => {
        if (activePrepSubject && prepData[activePrepSubject]) {
            renderFilteredChecklist(prepData[activePrepSubject], activePrepSubject);
        }
    });
    
    document.getElementById('prep-filter-importance')?.addEventListener('change', () => {
        if (activePrepSubject && prepData[activePrepSubject]) {
            renderFilteredChecklist(prepData[activePrepSubject], activePrepSubject);
        }
    });
    
    const drawer = document.getElementById('prep-notes-drawer');
    const closeBtn = document.getElementById('prep-drawer-close');
    const backdrop = document.getElementById('prep-drawer-backdrop');
    if (drawer && closeBtn && backdrop) {
        const closeDrawer = () => drawer.classList.remove('open');
        closeBtn.addEventListener('click', closeDrawer);
        backdrop.addEventListener('click', closeDrawer);
    }
    
    document.getElementById('prep-export-btn')?.addEventListener('click', () => {
        generateUpdatedMarkdown();
    });
    
    document.getElementById('prep-clear-btn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all syllabus topic progress? This will uncheck all completed topics across all subjects.')) {
            prepProgress = {};
            savePrepProgress();
            renderPrepTab();
            alert('Syllabus progress reset successfully!');
        }
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderSettingsFlaggedList() {
    const container = document.getElementById('settings-flagged-list');
    if (!container) return;
    
    const entries = Object.entries(flaggedQ);
    if (!entries.length) {
        container.innerHTML = '<div class="sp-empty">No flagged questions.</div>';
        return;
    }
    
    entries.sort((a,b) => (b[1].t || 0) - (a[1].t || 0));
    
    let html = '';
    entries.forEach(([qid, meta]) => {
        const q = allQuestions.find(x => x.qid === qid);
        const qText = q ? q.question : `[QID: ${qid}]`;
        const subjName = formatSubject(meta.s || q?.subject || '');
        
        html += `
            <div class="flagged-list-item" data-qid="${qid}">
                <div class="flagged-item-body">
                    <span class="flagged-item-meta">${subjName} (${qid})</span>
                    <p class="flagged-item-question">${escapeHTML(qText)}</p>
                </div>
                <div class="flagged-item-actions">
                    <button class="flagged-action-btn copy-q-btn" data-qtext="${escapeHTML(qText)}" title="Copy question text only">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                    <button class="flagged-action-btn unflag-q-btn" data-qid="${qid}" title="Unflag question">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Bind copy buttons
    container.querySelectorAll('.copy-q-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const qtext = btn.dataset.qtext;
            navigator.clipboard.writeText(qtext)
                .then(() => {
                    const icon = btn.querySelector('i');
                    icon.className = 'fa-solid fa-check';
                    setTimeout(() => icon.className = 'fa-solid fa-copy', 1500);
                })
                .catch(e => console.error('Copy failed:', e));
        });
    });
    
    // Bind unflag buttons
    container.querySelectorAll('.unflag-q-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const qid = btn.dataset.qid;
            delete flaggedQ[qid];
            saveFlagged();
            renderSettingsFlaggedList();
            
            // Also update the active quiz card flag state
            updateFlagOnCard(qid);
        });
    });
}