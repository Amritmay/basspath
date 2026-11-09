/* BassPath — a gamified companion for the StudyBass.com curriculum. All progress is stored on-device. */
(() => {
'use strict';

/* ═════════════ Helpers ═════════════ */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = '') => `<span class="ms ${cls}">${name}</span>`;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dkey();
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return dkey(x); };
const daysBetween = (a, b) => { const p = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };
const fmtDate = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const PICK_SVG = `<svg class="pickicon" viewBox="0 0 20 22"><path d="M10 21c-1.6 0-8.6-9.6-8.6-14.2C1.4 2.6 5.8 1 10 1s8.6 1.6 8.6 5.8C18.6 11.4 11.6 21 10 21z" fill="var(--gold)" stroke="var(--gold-deep)" stroke-width="1.6"/><path d="M6 6.2c1-1.6 3-2.2 5-2" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;

/* ═════════════ Curriculum ═════════════ */
const COURSES = window.COURSES, QB = window.QUESTIONS;
const LESSONS = [], UNITS = [];
COURSES.forEach(c => c.units.forEach((u, ui) => {
  u.course = c; u.n = ui + 1; UNITS.push(u);
  u.lessons.forEach(l => { l.unit = u; l.course = c; l.idx = LESSONS.length; LESSONS.push(l); });
}));
const LBY = Object.fromEntries(LESSONS.map(l => [l.id, l]));
const UBY = Object.fromEntries(UNITS.map(u => [u.id, u]));
const PART = {
  read:      { label: 'Read the lesson',        icon: 'menu_book',   min: 10, xp: 5 },
  exercises: { label: 'Play the exercises',     icon: 'music_note',  min: 25, xp: 10 },
  songs:     { label: 'Study the song examples', icon: 'queue_music', min: 15, xp: 5 },
  quiz:      { label: 'Take the StudyBass quiz', icon: 'quiz',        min: 5,  xp: 5 },
};
const partsOf = l => ['read', ...l.p];
const partUrl = (l, p) => `https://www.studybass.com/lessons/${l.id}/${p === 'read' ? '' : p + '/'}`;
const estMin = l => partsOf(l).reduce((s, p) => s + PART[p].min, 0);
const lessonXP = l => 10 + partsOf(l).reduce((s, p) => s + PART[p].xp, 0);
const lessonIcon = l => l.p.includes('exercises') ? 'music_note' : l.p.includes('songs') ? 'queue_music' : l.p.includes('quiz') ? 'quiz' : 'menu_book';

/* ═════════════ State ═════════════ */
const KEY = 'basspath.v1';
const fresh = () => ({
  v: 1, onboarded: false, name: '', goal: 15, created: today(), course: 'f1',
  done: {}, parts: {}, units: {}, xp: 0, picks: 25, freezes: 0,
  streak: { n: 0, best: 0, last: null }, days: {}, frozen: {},
  quests: { day: null, ids: [], claimed: [], chest: false }, ach: {},
  stats: { fret: 0, ear: 0, perfect: 0, quizzes: 0, drill: 0, staff: 0 },
  settings: { sound: true, theme: 'auto', accent: 'indigo', remind: '19:00' }, owned: ['indigo'],
  away: null, practice: null, dismissed: {}, lastLevel: 1,
});
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = fresh(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const day = (k = today()) => (S.days[k] ||= { sec: 0, xp: 0, lessons: 0, drill: 0, practice: 0, perfect: 0, ear: 0, hit: false });
const minsToday = () => Math.floor(day().sec / 60);

const isDone = l => !!S.done[l.id];
const isUnlocked = l => isDone(l) || l.idx === 0 || isDone(LESSONS[l.idx - 1]);
const nextLesson = () => LESSONS.find(l => !isDone(l));
const unitDone = u => u.lessons.every(isDone);
const courseDone = c => c.units.every(unitDone);
const realLessons = () => Object.values(S.done).filter(v => v !== 'skip').length;

/* ═════════════ Levels / ETA ═════════════ */
function levelInfo(xp) { let L = 1, base = 0, need = 60; while (xp >= base + need) { base += need; L++; need = 60 + 20 * (L - 1); } return { L, into: xp - base, need }; }
const RANKS = [[1, 'Open String'], [3, 'Root Note Rookie'], [5, 'Groove Starter'], [8, 'Pocket Player'], [12, 'Walking Bassist'], [16, 'Low-End Hero'], [20, 'Groove Master'], [25, 'Bass Legend']];
const rankOf = L => RANKS.filter(r => L >= r[0]).pop()[1];

function remainingMin(list = LESSONS) {
  return list.reduce((s, l) => isDone(l) ? s : s + partsOf(l).reduce((a, p) => a + ((S.parts[l.id] || {})[p] ? 0 : PART[p].min), 0), 0);
}
const totalMin = LESSONS.reduce((s, l) => s + estMin(l), 0);
function etaFor(goal, rem = remainingMin()) {
  const days = Math.ceil(rem / Math.max(goal, 1));
  const d = new Date(); d.setDate(d.getDate() + days);
  return { days, date: d };
}
function humanSpan(days) {
  if (days <= 0) return 'done!';
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.round(days / 7), 'week');
  if (days < 548) return plural(Math.round(days / 30.4), 'month');
  return `${(days / 365).toFixed(1)} years`;
}
function actualPace() {
  const age = daysBetween(S.created, today()) + 1;
  if (age < 3) return null;
  const n = Math.min(14, age); let sec = 0;
  for (let i = 0; i < n; i++) sec += (S.days[addDays(today(), -i)] || {}).sec || 0;
  return sec / 60 / n;
}

/* ═════════════ Audio ═════════════ */
let AC;
const ac = () => { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; };
function tone(f, dur = .15, type = 'sine', vol = .2, when = 0) {
  if (!S.settings.sound) return;
  try {
    const c = ac(), t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .05);
  } catch (e) {}
}
const sfx = {
  ok() { tone(660, .12, 'triangle', .22); tone(990, .22, 'triangle', .22, .09); buzz(15); },
  bad() { tone(180, .28, 'sawtooth', .07); tone(150, .3, 'sawtooth', .07, .08); buzz([30, 40, 30]); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, 'triangle', .18, i * .11)); buzz([20, 50, 20]); },
  coin() { tone(988, .08, 'square', .06); tone(1319, .25, 'square', .06, .07); },
  tap() { tone(700, .04, 'triangle', .06); },
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
function pluck(freq, dur = 1.8) { // bass-like plucked string
  try {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq; o2.type = 'triangle'; o2.frequency.value = freq * 2;
    f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(380, t + .5); f.Q.value = 2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.45, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = .35;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(c.destination);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  } catch (e) {}
}
const OPEN = { E: 41.2, A: 55, D: 73.42, G: 98 };

/* ═════════════ Toasts / confetti / modals ═════════════ */
function toast(html, icon = 'bolt', ms = 2600) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = (icon ? ic(icon) : '') + `<span>${html}</span>`;
  $('#toasts').appendChild(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
function confetti() {
  const cv = $('#confetti'), cx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ['--accent', '--gold', '--ok', '--fire', '--ice'].map(v => cs.getPropertyValue(v).trim());
  const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: pick(cols) }));
  let t0 = performance.now();
  (function f(t) {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach(p => { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); });
    if (t - t0 < 2600) requestAnimationFrame(f); else cx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}
const modalQueue = [];
function modal(html, opts = {}) {
  modalQueue.push({ html, opts });
  if (modalQueue.length === 1) showModal();
}
function showModal() {
  const m = modalQueue[0]; if (!m) return;
  const host = document.createElement('div'); host.className = 'backdrop center'; host.id = 'modal';
  host.innerHTML = `<div class="modal">${m.html}</div>`;
  document.body.appendChild(host);
  if (m.opts.confetti) confetti();
  if (m.opts.sound) sfx[m.opts.sound]();
  host.addEventListener('click', e => { if (e.target === host && !m.opts.sticky) closeModal(); });
}
function closeModal() { const h = $('#modal'); h && h.remove(); const m = modalQueue.shift(); m && m.opts.onClose && m.opts.onClose(); showModal(); }

/* ═════════════ Progress / rewards ═════════════ */
function addXP(n) {
  if (!n) return;
  S.xp += n; day().xp += n;
  const L = levelInfo(S.xp).L;
  if (L > S.lastLevel) {
    S.lastLevel = L; S.picks += 10;
    modal(`${ic('workspace_premium', 'big-ico')}<h2>Level ${L}!</h2><p>You're now a <b>${rankOf(L)}</b>. Here are 10 picks to celebrate.</p><button class="btn primary block" data-a="modal-close">Keep grooving</button>`, { confetti: true, sound: 'win' });
  }
}
function addTime(sec) {
  if (sec <= 0) return;
  const before = minsToday(); day().sec += sec; const after = minsToday();
  if (after > before) addXP(after - before);
  checkGoal(); save();
}
function normalizeStreak() {
  const t = today(), y = addDays(t, -1), st = S.streak;
  if (!st.last || st.last >= y) return;
  const missed = daysBetween(st.last, t) - 1;
  if (st.n > 0 && S.freezes >= missed) {
    S.freezes -= missed;
    for (let i = 1; i <= missed; i++) S.frozen[addDays(st.last, i)] = true;
    st.last = y; toast(`${plural(missed, 'streak freeze')} used — your streak is safe!`, 'ac_unit', 4000);
  } else if (st.n > 0) {
    st.n = 0;
  }
  save();
}
function checkGoal() {
  const d = day();
  if (d.hit || minsToday() < S.goal) return;
  d.hit = true; normalizeStreak();
  const st = S.streak;
  if (st.last !== today()) { st.n += 1; st.last = today(); st.best = Math.max(st.best, st.n); }
  S.picks += 10;
  const milestone = [3, 7, 14, 30, 50, 100, 200, 365].includes(st.n);
  modal(`<span class="ms f big-ico" style="color:var(--fire)">local_fire_department</span><h2>${st.n}-day streak!</h2>
    <p>You hit today's ${S.goal}-minute goal. ${milestone ? '<b>Milestone reached!</b> ' : ''}+10 picks.</p>
    <p style="font-size:14px">${tomorrowNudge()}</p><button class="btn gold block" data-a="modal-close">Awesome</button>`, { confetti: true, sound: 'win' });
  checkAch(); save(); render();
}
function tomorrowNudge() {
  const n = nextLesson();
  return n ? `Up next: <b>${esc(n.t)}</b>. See you tomorrow!` : 'You finished the whole path — legendary.';
}

/* ═════════════ Quests ═════════════ */
const QUESTS = {
  goal:       { t: () => `Hit your ${S.goal}-minute goal`, target: () => S.goal, val: d => Math.floor(d.sec / 60), r: 10, icon: 'timer' },
  lesson1:    { t: () => 'Complete a lesson', target: () => 1, val: d => d.lessons, r: 10, icon: 'menu_book' },
  lesson2:    { t: () => 'Complete 2 lessons', target: () => 2, val: d => d.lessons, r: 15, icon: 'auto_stories' },
  xp40:       { t: () => 'Earn 40 XP', target: () => 40, val: d => d.xp, r: 10, icon: 'bolt' },
  drill15:    { t: () => 'Get 15 drill answers right', target: () => 15, val: d => d.drill, r: 10, icon: 'grid_on' },
  practice10: { t: () => 'Practice 10 min with the timer', target: () => 10, val: d => Math.floor(d.practice / 60), r: 10, icon: 'speed' },
  perfect:    { t: () => 'Finish a quiz with no mistakes', target: () => 1, val: d => d.perfect, r: 15, icon: 'star' },
  ear8:       { t: () => 'Name 8 strings by ear', target: () => 8, val: d => d.ear, r: 10, icon: 'headphones' },
};
function ensureQuests() {
  if (S.quests.day === today()) return;
  let h = 0; for (const ch of today()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = Object.keys(QUESTS).filter(k => k !== 'goal'), ids = ['goal'];
  while (ids.length < 3) { h = (h * 1103515245 + 12345) >>> 0; const k = pool[h % pool.length]; if (!ids.includes(k) && !(k === 'lesson2' && ids.includes('lesson1')) && !(k === 'lesson1' && ids.includes('lesson2'))) ids.push(k); }
  S.quests = { day: today(), ids, claimed: [], chest: false }; save();
}
const questReady = () => S.quests.ids.filter(id => !S.quests.claimed.includes(id) && QUESTS[id].val(day()) >= QUESTS[id].target()).length;

/* ═════════════ Achievements ═════════════ */
const ACH = [
  { id: 'first',   icon: 'music_note',            t: 'First Note',       d: 'Complete your first lesson', ok: () => realLessons() >= 1 },
  { id: 'ten',     icon: 'auto_stories',          t: 'Bookworm',         d: 'Complete 10 lessons', ok: () => realLessons() >= 10 },
  { id: 'unit',    icon: 'flag',                  t: 'Unit Cleared',     d: 'Finish a whole unit', ok: () => UNITS.some(u => unitDone(u) && u.lessons.some(l => S.done[l.id] !== 'skip')) },
  { id: 'trophy',  icon: 'emoji_events',          t: 'Checkpoint Champ', d: 'Pass a unit checkpoint', ok: () => Object.keys(S.units).length >= 1 },
  { id: 'f1',      icon: 'military_tech',         t: 'Fundamentals I',   d: 'Finish Fundamentals One', ok: () => courseDone(COURSES[0]) },
  { id: 'f2',      icon: 'military_tech',         t: 'Fundamentals II',  d: 'Finish Fundamentals Two', ok: () => courseDone(COURSES[1]) },
  { id: 'f3',      icon: 'workspace_premium',     t: 'Fundamentals III', d: 'Finish Fundamentals Three', ok: () => courseDone(COURSES[2]) },
  { id: 's3',      icon: 'local_fire_department', t: 'Warming Up',       d: '3-day streak', ok: () => S.streak.best >= 3 },
  { id: 's7',      icon: 'local_fire_department', t: 'Week of Groove',   d: '7-day streak', ok: () => S.streak.best >= 7 },
  { id: 's30',     icon: 'local_fire_department', t: 'Monthly Pocket',   d: '30-day streak', ok: () => S.streak.best >= 30 },
  { id: 's100',    icon: 'local_fire_department', t: 'Unstoppable',      d: '100-day streak', ok: () => S.streak.best >= 100 },
  { id: 'xp1k',    icon: 'bolt',                  t: 'Groove Machine',   d: 'Earn 1,000 XP', ok: () => S.xp >= 1000 },
  { id: 'fret',    icon: 'grid_on',               t: 'Neck Navigator',   d: '50 fretboard notes right', ok: () => S.stats.fret >= 50 },
  { id: 'ear',     icon: 'headphones',            t: 'Golden Ears',      d: '30 strings named by ear', ok: () => S.stats.ear >= 30 },
  { id: 'perfect', icon: 'star',                  t: 'Flawless',         d: '5 perfect quizzes', ok: () => S.stats.perfect >= 5 },
  { id: 'hours',   icon: 'schedule',              t: '10-Hour Club',     d: 'Study for 10 hours total', ok: () => Object.values(S.days).reduce((s, d) => s + d.sec, 0) >= 36000 },
  { id: 'early',   icon: 'light_mode',            t: 'Early Bird',       d: 'Study before 8 am', ok: () => new Date().getHours() < 8 && day().sec > 0 },
  { id: 'night',   icon: 'dark_mode',             t: 'Night Owl',        d: 'Study after 10 pm', ok: () => new Date().getHours() >= 22 && day().sec > 0 },
];
function checkAch() {
  ACH.forEach(a => {
    if (!S.ach[a.id] && a.ok()) {
      S.ach[a.id] = today(); S.picks += 5;
      setTimeout(() => { toast(`Badge unlocked: <b>${a.t}</b> · +5 picks`, 'military_tech', 3500); sfx.coin(); }, 400);
    }
  });
  save();
}

/* ═════════════ Rendering: shell ═════════════ */
let tab = 'learn', obStep = 0, installEvt = null;
const app = $('#app'), overlay = $('#overlay');

function applyTheme() {
  const r = document.documentElement;
  S.settings.theme === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', S.settings.theme);
  S.settings.accent === 'indigo' ? r.removeAttribute('data-accent') : r.setAttribute('data-accent', S.settings.accent);
}

function goalRing(size = 34, stroke = 4) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = clamp(minsToday() / S.goal, 0, 1);
  const col = p >= 1 ? 'var(--gold)' : 'var(--accent)';
  return `<div class="ring" style="width:${size}px;height:${size}px" title="${minsToday()} of ${S.goal} min today"><svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>
    <span class="ms" style="font-size:${Math.round(size * .46)}px;width:${Math.round(size * .46)}px;height:${Math.round(size * .46)}px">${p >= 1 ? 'check' : 'timer'}</span></div>`;
}
function topbar() {
  const lit = S.streak.last === today();
  return `<header class="topbar"><div class="wrap">
    <div class="brand"><img src="icons/icon.svg" alt="">BassPath</div>
    <button class="chip fire ${lit ? '' : 'off'}" data-a="tab" data-arg="profile" aria-label="Streak">${ic('local_fire_department', 'f')}${S.streak.n}</button>
    <button class="chip pick" data-a="tab" data-arg="quests" aria-label="Picks">${PICK_SVG}${S.picks}</button>
    <button data-a="tab" data-arg="practice" aria-label="Daily goal">${goalRing()}</button>
  </div></header>`;
}
function tabbar() {
  const t = [['learn', 'school', 'Learn'], ['practice', 'graphic_eq', 'Practice'], ['quests', 'emoji_events', 'Quests'], ['profile', 'person', 'Profile']];
  const dot = questReady() ? `<i class="dot"></i>` : '';
  return `<nav class="tabbar"><div class="wrap">${t.map(([k, i, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab" data-arg="${k}">${ic(i)}${l}${k === 'quests' ? dot : ''}</button>`).join('')}</div></nav>`;
}
function render() {
  applyTheme();
  if (!S.onboarded) { app.innerHTML = renderOnboarding(); return; }
  ensureQuests();
  app.innerHTML = topbar() + `<main><div class="wrap">${VIEWS[tab]()}</div></main>` + tabbar();
  afterRender[tab] && afterRender[tab]();
}

/* ═════════════ Onboarding ═════════════ */
const GOALS = [[5, 'Casual'], [10, 'Easygoing'], [15, 'Regular'], [20, 'Serious'], [30, 'Intense'], [45, 'Dedicated'], [60, 'All in']];
function renderOnboarding() {
  const steps = 4, prog = `<div class="top">${obStep ? `<button class="iconbtn" data-a="ob-back">${ic('arrow_back')}</button>` : ''}<div class="bar"><i style="width:${(obStep / steps) * 100}%"></i></div></div>`;
  if (obStep === 0) return `<div class="ob"><div class="content">
    <img class="logo" src="icons/icon.svg" alt="">
    <h1>Learn bass a little every day.</h1>
    <p class="lead">BassPath turns the free StudyBass curriculum into a daily habit, with a clear path, streaks, quizzes and drills.</p>
    <div class="feat">
      <div>${ic('route')}<span>166 lessons across 3 courses, one step at a time</span></div>
      <div>${ic('local_fire_department')}<span>Daily goals, streaks and quests that keep you coming back</span></div>
      <div>${ic('event_available')}<span>See exactly when you'll finish at your pace</span></div>
    </div></div>
    <button class="btn primary block" data-a="ob-next">Get started</button></div>`;
  if (obStep === 1) return `<div class="ob">${prog}<div class="content">
    <h1>What should we call you?</h1><p class="lead">Just a first name or nickname. It stays on this device.</p>
    <input type="text" id="ob-name" maxlength="24" placeholder="Your name" value="${esc(S.name)}" autocomplete="given-name" enterkeyhint="next">
    </div><button class="btn primary block" data-a="ob-next">Continue</button></div>`;
  if (obStep === 2) {
    const e = etaFor(S.goal, totalMin);
    return `<div class="ob">${prog}<div class="content">
    <h1>Pick a daily goal</h1><p class="lead">Minutes per day: reading lessons, playing exercises and practicing. You can change it any time.</p>
    <div class="goals">${GOALS.map(([m, l]) => `<button class="${S.goal === m ? 'on' : ''}" data-a="ob-goal" data-arg="${m}">${l}<span>${m} min / day</span></button>`).join('')}</div>
    <div class="eta-live">${ic('event_available')}<span>At <b>${S.goal} min/day</b> you'd finish all 3 StudyBass Fundamentals courses by <b>${fmtDate(e.date)}</b>, about ${humanSpan(e.days)} from now.</span></div>
    </div><button class="btn primary block" data-a="ob-next">Continue</button></div>`;
  }
  const lv = [['f1', 'Brand new to bass', 'Start at the very beginning: Fundamentals One'], ['f2', 'I know the basics', 'Technique, tab and simple patterns are fine. Start at Fundamentals Two'], ['f3', "I'm an intermediate player", 'Scales, keys and blues are familiar. Start at Fundamentals Three']];
  return `<div class="ob">${prog}<div class="content">
    <h1>Where are you starting?</h1><p class="lead">Earlier lessons will be marked as done. You can still revisit them any time.</p>
    <div class="goals levels">${lv.map(([k, t, d]) => `<button class="${S.course === k ? 'on' : ''}" data-a="ob-level" data-arg="${k}">${t}<span>${d}</span></button>`).join('')}</div>
    </div><button class="btn primary block" data-a="ob-finish">Start learning</button></div>`;
}

/* ═════════════ Learn ═════════════ */
function viewLearn() {
  const c = COURSES.find(x => x.id === S.course) || COURSES[0];
  const cl = c.units.flatMap(u => u.lessons), done = cl.filter(isDone).length, pct = Math.round(done / cl.length * 100);
  const nx = nextLesson(), nxIn = nx && nx.course === c;
  const left = Math.max(0, S.goal - minsToday());
  const hr = new Date().getHours(), hello = hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.name ? `, ${esc(S.name)}` : '';
  let html = `<div class="card greet">${goalRing(52, 6)}<div><div class="big">${hello}${name}!</div><div class="sub">${left ? `${left} min to go for today's goal` : `Daily goal complete. Nice work!`}</div></div></div>`;
  if (!day().hit && S.streak.n > 0 && hr >= 18) html += `<div class="banner warn">${ic('local_fire_department', 'f')}<span>Your ${S.streak.n}-day streak is at risk. ${left} minutes saves it!</span></div>`;
  html += installBanner();
  html += `<div class="seg">${COURSES.map(x => `<button class="${x.id === c.id ? 'on' : ''}" data-a="course" data-arg="${x.id}">${x.title.replace('Fundamentals ', 'Fund. ')}</button>`).join('')}</div>`;
  const e = etaFor(S.goal, remainingMin(cl));
  html += `<div class="card hero">${ic('graphic_eq', 'deco')}<h2>${c.title}</h2><p>${c.desc}</p>
    <div class="bar"><i style="width:${pct}%"></i></div><div class="meta"><span>${done} / ${cl.length} lessons</span><span>${pct === 100 ? 'Complete!' : `Done by ~${e.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</span></div>
    ${nx ? `<button class="btn block" data-a="${nxIn ? 'lesson' : 'goto-next'}" data-arg="${nx.id}">${ic('play_arrow', 'f')}${nxIn ? `Continue: ${esc(nx.t)}` : `Continue in ${nx.course.title}`}</button>` : ''}</div>`;
  const offs = [0, 52, 78, 52, 0, -52, -78, -52];
  c.units.forEach(u => {
    const ud = u.lessons.filter(isDone).length, all = ud === u.lessons.length, won = S.units[u.id];
    const started = u.lessons.some(isUnlocked);
    html += `<section class="unit" id="${u.id}"><div class="unit-head"><div><div class="num">Unit ${u.n}</div><h3>${esc(u.title)}</h3><div class="prog">${ud}/${u.lessons.length} lessons${won ? ` · checkpoint ${won}%` : ''}</div></div>
      ${all ? `<span class="ms f trophy ${won ? 'won' : ''}">emoji_events</span>` : `<button class="btn soft skip" data-a="testout" data-arg="${u.id}" title="Already know this? Take a test to skip it">${ic('skip_next')}Test out</button>`}</div><div class="path">`;
    u.lessons.forEach((l, i) => {
      const d = isDone(l), un = isUnlocked(l), cur = nx === l;
      const cls = d ? 'done' : un ? '' : 'locked';
      html += `<div class="node-wrap ${cur ? 'cur' : ''}" style="transform:translateX(${offs[i % offs.length]}px)" ${cur ? 'id="current"' : ''}>
        ${cur ? `<div class="bubble">START</div>` : ''}
        <button class="node ${cls} ${cur ? 'cur' : ''}" data-a="${un ? 'lesson' : 'locked'}" data-arg="${l.id}" aria-label="${esc(l.t)}">${ic(d ? 'check' : un ? lessonIcon(l) : 'lock')}</button>
        <div class="node-label">${esc(l.t)}</div></div>`;
    });
    const off = offs[u.lessons.length % offs.length];
    html += `<div class="node-wrap" style="transform:translateX(${off}px)"><button class="node check ${all ? (won ? 'won' : '') : 'locked'}" data-a="${all ? 'checkpoint' : 'locked-cp'}" data-arg="${u.id}" aria-label="Unit checkpoint">${ic(all ? 'emoji_events' : 'lock')}</button><div class="node-label">Checkpoint</div></div></div></section>`;
    void started;
  });
  const ci = COURSES.indexOf(c);
  html += `<div class="course-end">${ci < 2 ? `Next up: <a href="#" data-a="course" data-arg="${COURSES[ci + 1].id}">${COURSES[ci + 1].title} →</a>` : 'That\'s the whole StudyBass Fundamentals path. 🎸'}</div>`;
  return html;
}
let scrollToCurrent = true;
const afterRender = {
  learn() { if (scrollToCurrent) { scrollToCurrent = false; const el = $('#current'); el && setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); } },
  practice() { updatePracticeClock(); },
};

function installBanner() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || S.dismissed.install) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (installEvt) return `<div class="banner">${ic('install_mobile')}<span>Install BassPath for one-tap daily practice.</span><button class="btn soft" data-a="install" style="margin-left:auto">Install</button></div>`;
  if (ios) return `<div class="banner">${ic('install_mobile')}<span>Install: tap <b>Share</b> then <b>Add to Home Screen</b>.</span><button class="x" data-a="dismiss" data-arg="install">${ic('close')}</button></div>`;
  return '';
}

/* ═════════════ Lesson sheet ═════════════ */
let sheetLesson = null;
function openLesson(id) {
  const l = LBY[id]; sheetLesson = l;
  const d = isDone(l), pp = S.parts[l.id] || {}, parts = partsOf(l);
  const qs = QB[l.unit.id] || [];
  overlay.innerHTML = `<div class="backdrop" data-a="sheet-bg"><div class="sheet" role="dialog" aria-label="${esc(l.t)}"><div class="grab"></div>
    <div class="sheet-head"><div><div class="kicker">${l.course.short} · Unit ${l.unit.n} · ${esc(l.unit.title)}</div><h2>${esc(l.t)}</h2></div>
    <button class="iconbtn" data-a="sheet-close" aria-label="Close">${ic('close')}</button></div>
    <div class="pills"><span class="pill">${ic('schedule')}~${estMin(l)} min</span><span class="pill xp">${ic('bolt', 'f')}+${lessonXP(l)} XP</span>${d ? `<span class="pill" style="color:var(--ok)">${ic('check_circle', 'f')}${S.done[l.id] === 'skip' ? 'Tested out' : 'Completed'}</span>` : ''}</div>
    <div class="steps">${parts.map(p => `<div class="step ${pp[p] || d ? 'on' : ''}">
      <button class="tick" data-a="part-toggle" data-arg="${p}" aria-label="Mark ${PART[p].label} done">${ic('check')}</button>
      <div class="lbl"><b>${PART[p].label}</b><span>~${PART[p].min} min on StudyBass</span></div>
      <a class="open" href="${partUrl(l, p)}" target="_blank" rel="noopener" data-a="part-open" data-arg="${p}">Open${ic('open_in_new')}</a></div>`).join('')}</div>
    ${qs.length ? `<div class="qc">${ic('quiz')}<div><b>Quick check</b><span>3 questions · +5 XP bonus</span></div><button class="btn primary small" data-a="quickcheck">Start</button></div>` : ''}
    <div style="margin-top:16px">${d ? `<button class="btn ghost block" data-a="sheet-close">Close</button>` : `<button class="btn ok block" data-a="complete" ${pp.read ? '' : 'disabled'}>${ic('check_circle', 'f')}Complete lesson</button>`}</div>
    <p class="note">${ic('info')}<span>Lessons open on StudyBass.com, where all the lesson material lives. Tick off each step, then come back here to complete the lesson and keep your streak alive. ${l.p.length ? 'Some exercises and songs may need a StudyBass membership.' : ''}</span></p>
  </div></div>`;
}
function closeSheet() { overlay.innerHTML = ''; sheetLesson = null; }

function completeFlow() {
  const l = sheetLesson; if (!l) return;
  let sug = Math.min(estMin(l), 30);
  if (S.away && S.away.lid === l.id) { const m = Math.round((Date.now() - S.away.t) / 60000); if (m >= 1 && m <= 120) sug = m; }
  const opts = [...new Set([5, 10, 15, 20, 30, 45, 60, sug])].sort((a, b) => a - b);
  modal(`${ic('schedule', 'big-ico')}<h2 style="font-size:21px">How long did you spend?</h2><p>Time on this lesson counts toward your daily goal and streak.</p>
    <div class="chips" style="justify-content:center;margin-top:16px" id="timechips">${opts.map(m => `<button class="${m === sug ? 'on' : ''}" data-a="timechip" data-arg="${m}">${m}m</button>`).join('')}</div>
    <button class="btn ok block" data-a="finish-lesson" data-arg="${sug}" id="finishbtn">${ic('bolt', 'f')}Claim +${lessonXP(l)} XP</button>`, { sticky: true });
}
function finishLesson(min) {
  const l = sheetLesson; if (!l) return;
  closeModal();
  const parts = partsOf(l); S.parts[l.id] = Object.fromEntries(parts.map(p => [p, 1]));
  S.done[l.id] = Date.now(); S.away = null; day().lessons++;
  closeSheet(); scrollToCurrent = true;
  const unitNow = unitDone(l.unit);
  modal(`${ic(unitNow ? 'flag' : 'celebration', 'big-ico')}<h2>${unitNow ? 'Unit complete!' : 'Lesson complete!'}</h2>
    <p>+${lessonXP(l)} XP · ${min} min logged${unitNow ? `<br>Take the <b>${esc(l.unit.title)}</b> checkpoint for a trophy and bonus picks.` : ''}</p>
    ${unitNow ? `<button class="btn gold block" data-a="checkpoint" data-arg="${l.unit.id}">${ic('emoji_events', 'f')}Take checkpoint</button><button class="btn ghost block" data-a="modal-close">Later</button>`
      : `<button class="btn primary block" data-a="modal-close">Continue</button>`}`, { confetti: true, sound: 'win', onClose: () => { checkAch(); render(); } });
  addXP(lessonXP(l)); addTime(min * 60); // may queue level-up / streak celebrations after this one
  render(); save();
}

/* ═════════════ Quiz engine ═════════════ */
let QZ = null;
function startQuiz(cfg) {
  // cfg: {title, kind, qs:[{q,o,c,why,visual,audio,grid}], onDone(res), stat}
  QZ = { ...cfg, queue: cfg.qs.map((q, i) => ({ ...q, i })), total: cfg.qs.length, firstTry: new Set(), missed: new Set(), pos: 0, sel: null, state: 'ask', combo: 0, t0: Date.now(), xpPer: cfg.xpPer ?? 2 };
  renderQ();
}
function renderQ() {
  const q = QZ.queue[QZ.pos], prog = (QZ.firstTry.size + QZ.missed.size === 0 ? 0 : (QZ.pos) / QZ.queue.length) * 100;
  const doneCount = QZ.queue.slice(0, QZ.pos).length;
  const p = Math.min(100, doneCount / QZ.queue.length * 100);
  void prog;
  overlay.innerHTML = `<div class="quiz"><header><button class="iconbtn" data-a="quiz-quit" aria-label="Quit">${ic('close')}</button>
    <div class="bar"><i style="width:${p}%"></i></div><div class="combo">${QZ.combo >= 2 ? ic('local_fire_department', 'f') + QZ.combo : ''}</div></header>
    <div class="qbody"><div class="qkind">${esc(QZ.title)}${q.retry ? ' · Try again' : ''}</div><div class="qtext">${q.q}</div>
    ${q.visual ? `<div class="visual">${q.visual}</div>` : ''}
    ${q.audio ? `<div class="visual" style="flex-direction:column;align-items:center"><button class="audiobtn" data-a="q-audio" aria-label="Play sound">${ic('volume_up')}</button>${q.ref ? `<div class="refrow">Reference: ${['E', 'A', 'D', 'G'].map(s => `<button data-a="tone" data-arg="${s}">${s}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="opts ${q.grid ? 'grid2' : ''}">${q.o.map((o, i) => `<button class="opt" data-a="q-sel" data-arg="${i}"><kbd>${i + 1}</kbd><span>${o}</span></button>`).join('')}</div></div>
    <footer class="qfoot" id="qfoot"><div class="in"><div class="fb" id="fb"></div><button class="btn primary block" id="qbtn" data-a="q-check" disabled>Check</button></div></footer></div>`;
  if (q.audio) setTimeout(() => q.audio(), 250);
}
function qSelect(i) {
  if (QZ.state !== 'ask') return;
  QZ.sel = +i; sfx.tap();
  overlay.querySelectorAll('.opt').forEach((b, j) => b.classList.toggle('sel', j === QZ.sel));
  $('#qbtn').disabled = false;
}
function qCheck() {
  const q = QZ.queue[QZ.pos], foot = $('#qfoot'), fb = $('#fb'), btn = $('#qbtn');
  if (QZ.state === 'ask') {
    if (QZ.sel == null) return;
    const ok = QZ.sel === q.c, opts = overlay.querySelectorAll('.opt');
    opts.forEach((b, j) => { b.classList.remove('sel'); if (j === q.c) b.classList.add('right'); else if (j === QZ.sel) b.classList.add('wrong'); b.disabled = true; });
    if (ok) {
      if (!q.retry && !QZ.missed.has(q.i)) QZ.firstTry.add(q.i);
      QZ.combo++; sfx.ok();
      const cheers = ['Nice!', 'Great job!', 'Locked in!', 'In the pocket!', 'Correct!', 'You got it!'];
      fb.innerHTML = `<h3>${ic('check_circle', 'f')}${QZ.combo >= 3 ? `${QZ.combo} in a row!` : pick(cheers)}</h3>${q.why ? `<p>${q.why}</p>` : ''}`;
      foot.className = 'qfoot ok'; btn.className = 'btn ok block';
      QZ.onRight && QZ.onRight(q);
    } else {
      QZ.missed.add(q.i); QZ.combo = 0; sfx.bad();
      fb.innerHTML = `<h3>${ic('cancel', 'f')}Correct answer: ${q.o[q.c]}</h3>${q.why ? `<p>${q.why}</p>` : ''}`;
      foot.className = 'qfoot bad'; btn.className = 'btn bad block';
      if (!q.retry && QZ.retry !== false) QZ.queue.push({ ...q, retry: true, o: q.o, c: q.c });
    }
    btn.textContent = 'Continue'; btn.disabled = false; QZ.state = 'fb';
  } else {
    QZ.pos++; QZ.sel = null; QZ.state = 'ask';
    if (QZ.pos >= QZ.queue.length) finishQuiz(); else renderQ();
  }
}
function finishQuiz() {
  const sec = Math.min(Math.round((Date.now() - QZ.t0) / 1000), 1200);
  const right = QZ.firstTry.size, total = QZ.total, acc = Math.round(right / total * 100), perfect = right === total;
  const xp = right * QZ.xpPer + (perfect ? 5 : 0);
  S.stats.quizzes++; if (perfect) { S.stats.perfect++; day().perfect++; }
  addXP(xp); addTime(sec);
  const res = { right, total, acc, perfect, xp, sec };
  const extra = QZ.onDone ? QZ.onDone(res) || {} : {};
  const title = extra.title || (perfect ? 'Flawless!' : acc >= 80 ? 'Great work!' : acc >= 50 ? 'Nice effort!' : 'Keep practicing!');
  overlay.innerHTML = `<div class="quiz"><div class="result">${ic(extra.icon || (perfect ? 'stars' : acc >= 50 ? 'emoji_events' : 'fitness_center'), 'big-ico')}
    <h2>${title}</h2><p>${extra.msg || esc(QZ.title)}</p>
    <div class="tiles"><div class="tile a"><div class="k">Total XP</div><div class="v">${ic('bolt', 'f')}${xp + (extra.xp || 0)}</div></div>
    <div class="tile b"><div class="k">Accuracy</div><div class="v">${ic('track_changes')}${acc}%</div></div>
    <div class="tile c"><div class="k">Time</div><div class="v">${ic('timer')}${Math.floor(sec / 60)}:${pad(sec % 60)}</div></div></div>
    </div><footer class="qfoot"><div class="in"><button class="btn primary block" data-a="quiz-done">Continue</button></div></footer></div>`;
  if (acc >= 50) { confetti(); sfx.win(); }
  checkAch(); save();
}
function quitQuiz() {
  const sec = Math.min(Math.round((Date.now() - QZ.t0) / 1000), 1200);
  addTime(sec); QZ = null; overlay.innerHTML = ''; render();
}

/* ─── Quizzes from the bank ─── */
const bankQ = ([q, o, c, why]) => { const idx = shuffle(o.map((_, i) => i)); return { q: esc(q), o: idx.map(i => esc(o[i])), c: idx.indexOf(c), why: esc(why) }; };
function quickCheck() {
  const l = sheetLesson, qs = shuffle(QB[l.unit.id]).slice(0, 3).map(bankQ);
  startQuiz({ title: 'Quick check', qs, xpPer: 1, onDone: r => { if (r.right) addXP(5); return { xp: r.right ? 5 : 0 }; }, back: () => openLesson(l.id) });
}
function unitQuiz(uid, testOut) {
  const u = UBY[uid], qs = shuffle(QB[uid] || []).slice(0, 8).map(bankQ);
  if (!qs.length) return toast('No checkpoint for this unit yet', 'info');
  startQuiz({
    title: testOut ? `Test out · ${u.title}` : `Checkpoint · ${u.title}`, qs, xpPer: 3,
    onDone: r => {
      const pass = r.acc >= 80;
      if (pass) {
        S.units[uid] = Math.max(S.units[uid] || 0, r.acc);
        if (testOut) u.lessons.forEach(l => { if (!S.done[l.id]) S.done[l.id] = 'skip'; });
        S.picks += 15; scrollToCurrent = true;
        return { title: testOut ? 'Unit unlocked!' : 'Trophy earned!', icon: 'emoji_events', msg: testOut ? `You tested out of ${esc(u.title)}. +15 picks` : `+15 picks · checkpoint score ${r.acc}%` };
      }
      return { title: 'Almost there', icon: 'fitness_center', msg: testOut ? 'You need 80% to test out. Work through the lessons and try again!' : 'Score 80% or more to earn the trophy. Try again any time.' };
    },
  });
}

/* ═════════════ Drills (generated) ═════════════ */
const NOTES = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
const STR = [['G', 7], ['D', 2], ['A', 9], ['E', 4]]; // top→bottom as on a diagram
function fretSVG(si, fret) {
  const W = 340, H = 118, x0 = 30, fw = (W - x0 - 8) / 12, y0 = 18, sg = 22;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Fretboard">`;
  s += `<rect x="${x0}" y="${y0 - 8}" width="${W - x0 - 8}" height="${sg * 3 + 16}" rx="6" fill="var(--surface-2)"/>`;
  [3, 5, 7, 9].forEach(f => s += `<circle cx="${x0 + (f - .5) * fw}" cy="${y0 + sg * 1.5}" r="4.5" fill="var(--line)"/>`);
  s += `<circle cx="${x0 + 11.5 * fw}" cy="${y0 + sg * .5}" r="4.5" fill="var(--line)"/><circle cx="${x0 + 11.5 * fw}" cy="${y0 + sg * 2.5}" r="4.5" fill="var(--line)"/>`;
  for (let f = 0; f <= 12; f++) s += `<line x1="${x0 + f * fw}" y1="${y0 - 8}" x2="${x0 + f * fw}" y2="${y0 + sg * 3 + 8}" stroke="var(--muted)" stroke-opacity="${f ? .45 : 1}" stroke-width="${f ? 2 : 5}"/>`;
  STR.forEach(([n], i) => { s += `<line x1="${x0 - 6}" y1="${y0 + i * sg}" x2="${W - 8}" y2="${y0 + i * sg}" stroke="var(--ink)" stroke-opacity=".55" stroke-width="${1.4 + i * .6}"/><text x="10" y="${y0 + i * sg + 5}" font-size="13" font-weight="800" fill="var(--muted)" font-family="Nunito, sans-serif">${n}</text>`; });
  [3, 5, 7, 9, 12].forEach(f => s += `<text x="${x0 + (f - .5) * fw}" y="${H - 4}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--muted)" font-family="Nunito, sans-serif">${f}</text>`);
  if (si != null) { const cx = fret === 0 ? x0 - 14 : x0 + (fret - .5) * fw, cy = y0 + si * sg; s += `<circle cx="${cx}" cy="${cy}" r="10" fill="var(--accent)" stroke="var(--surface)" stroke-width="3"/>`; }
  return s + '</svg>';
}
function optsFrom(correct, pool, n = 4) { const o = [correct]; for (const x of shuffle(pool)) { if (o.length >= n) break; if (!o.includes(x)) o.push(x); } const s = shuffle(o); return { o: s, c: s.indexOf(correct) }; }
const GEN = {
  fret() {
    const si = rnd(4), [sn, open] = STR[si], fret = rnd(13), note = (open + fret) % 12;
    if (Math.random() < .7) { const { o, c } = optsFrom(NOTES[note], NOTES); return { q: 'Which note is this?', visual: fretSVG(si, fret), o, c, grid: true, why: `${sn} string, fret ${fret} = ${NOTES[note]}`, kind: 'fret' }; }
    const target = rnd(12), f = ((target - open) % 12 + 12) % 12;
    const { o, c } = optsFrom(`Fret ${f}`, Array.from({ length: 12 }, (_, i) => `Fret ${i}`));
    return { q: `Where is <b>${NOTES[target]}</b> on the <b>${sn}</b> string (frets 0–11)?`, visual: fretSVG(null), o, c, grid: true, why: `${sn} + ${f} half steps = ${NOTES[target]}`, kind: 'fret' };
  },
  interval() {
    const IV = [['minor 2nd', 1], ['major 2nd', 2], ['minor 3rd', 3], ['major 3rd', 4], ['perfect 4th', 5], ['tritone', 6], ['perfect 5th', 7], ['minor 6th', 8], ['major 6th', 9], ['minor 7th', 10], ['major 7th', 11], ['octave', 12]];
    const [nm, st] = pick(IV), t = rnd(3);
    if (t === 0) { const { o, c } = optsFrom(`${st} frets`, IV.map(x => `${x[1]} frets`)); return { q: `On one string, a <b>${nm}</b> spans how many frets?`, o, c, grid: true, why: `A ${nm} = ${st} half steps = ${st} frets.` }; }
    const r = rnd(12), n = (r + st) % 12;
    if (t === 1) { const { o, c } = optsFrom(NOTES[n], NOTES); return { q: `What note is a <b>${nm}</b> above <b>${NOTES[r]}</b>?`, o, c, grid: true, why: `${NOTES[r]} + ${st} half steps = ${NOTES[n]}.` }; }
    const { o, c } = optsFrom(nm, IV.map(x => x[0])); return { q: `From <b>${NOTES[r]}</b> up to <b>${NOTES[n]}</b> (${st} frets) is a…`, o, c, why: `${st} half steps = ${nm}.` };
  },
  keys() {
    const K = [['C', 0, 'A'], ['G', 1, 'E'], ['D', 2, 'B'], ['A', 3, 'F♯'], ['E', 4, 'C♯'], ['B', 5, 'G♯'], ['F', -1, 'D'], ['B♭', -2, 'G'], ['E♭', -3, 'C'], ['A♭', -4, 'F'], ['D♭', -5, 'B♭']];
    const lab = n => n === 0 ? 'No sharps or flats' : n > 0 ? plural(n, 'sharp') : plural(-n, 'flat');
    const [k, n, rel] = pick(K), t = rnd(3);
    if (t === 0) { const { o, c } = optsFrom(lab(n), K.map(x => lab(x[1]))); return { q: `How many sharps or flats are in <b>${k} major</b>?`, o, c, why: `${k} major: ${lab(n).toLowerCase()}.` }; }
    if (t === 1) { const { o, c } = optsFrom(`${k} major`, K.map(x => `${x[0]} major`)); return { q: `Which major key has <b>${lab(n).toLowerCase()}</b>?`, o, c, grid: true, why: `${k} major has ${lab(n).toLowerCase()}.` }; }
    const { o, c } = optsFrom(`${rel} minor`, K.map(x => `${x[2]} minor`)); return { q: `What is the relative minor of <b>${k} major</b>?`, o, c, grid: true, why: `Count down 3 half steps (a minor 3rd) from ${k}: ${rel} minor.` };
  },
  ear() {
    const s = pick(['E', 'A', 'D', 'G']), o = ['E', 'A', 'D', 'G'];
    return { q: 'Which open string is this?', audio: () => pluck(OPEN[s]), ref: true, o, c: o.indexOf(s), grid: true, why: `That was the open ${s} string.`, kind: 'ear' };
  },
  staff() { // bass clef reading: step 0 = G2 (bottom line)
    const L = ['G', 'A', 'B', 'C', 'D', 'E', 'F'], step = rnd(13) - 2, letter = L[((step % 7) + 7) % 7];
    const W = 260, H = 150, gap = 16, by = 104, x = 160, y = by - step * gap / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Bass clef staff">`;
    for (let i = 0; i < 5; i++) s += `<line x1="10" x2="${W - 10}" y1="${by - i * gap}" y2="${by - i * gap}" stroke="var(--ink)" stroke-opacity=".6" stroke-width="1.6"/>`;
    s += `<path d="M30 ${by - 3 * gap + 6} c0 -14 26 -16 28 2 c2 18 -14 34 -30 44" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="${by - 3 * gap + 4}" r="5" fill="var(--ink)"/>
      <circle cx="68" cy="${by - 3.5 * gap}" r="3" fill="var(--ink)"/><circle cx="68" cy="${by - 2.5 * gap}" r="3" fill="var(--ink)"/>`;
    for (let k = -2; k >= step; k -= 2) s += `<line x1="${x - 18}" x2="${x + 18}" y1="${by - k * gap / 2}" y2="${by - k * gap / 2}" stroke="var(--ink)" stroke-opacity=".6" stroke-width="1.6"/>`;
    for (let k = 10; k <= step; k += 2) s += `<line x1="${x - 18}" x2="${x + 18}" y1="${by - k * gap / 2}" y2="${by - k * gap / 2}" stroke="var(--ink)" stroke-opacity=".6" stroke-width="1.6"/>`;
    s += `<ellipse cx="${x}" cy="${y}" rx="10" ry="7.5" transform="rotate(-20 ${x} ${y})" fill="var(--accent)"/>`;
    s += `<line x1="${step >= 4 ? x - 9.5 : x + 9.5}" x2="${step >= 4 ? x - 9.5 : x + 9.5}" y1="${y}" y2="${step >= 4 ? y + 46 : y - 46}" stroke="var(--accent)" stroke-width="2.4"/></svg>`;
    const { o, c } = optsFrom(letter, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    return { q: 'Name this bass clef note', visual: s, o, c, grid: true, why: `${step % 2 === 0 ? 'Line' : 'Space'} note: ${letter}. Lines G-B-D-F-A, spaces A-C-E-G.`, kind: 'staff' };
  },
};
const DRILLS = [
  ['fret', 'Fretboard Notes', 'Find any note on the neck', 'grid_on', '#5B4BDB'],
  ['staff', 'Bass Clef Reading', 'Name notes on the staff', 'library_music', '#D9446F'],
  ['interval', 'Intervals', 'Half steps, 3rds, 5ths…', 'swap_vert', '#0E9C9C'],
  ['keys', 'Keys & Circle of 5ths', 'Sharps, flats, relatives', 'tune', '#E46A2E'],
  ['ear', 'Ear: Open Strings', 'Name E, A, D or G by sound', 'headphones', '#2F6FE0'],
];
function startDrill(kind) {
  const d = DRILLS.find(x => x[0] === kind);
  const qs = Array.from({ length: 10 }, () => GEN[kind]());
  startQuiz({
    title: d[1], qs, xpPer: 1, retry: false,
    onRight: q => { day().drill++; S.stats.drill++; if (kind === 'fret') S.stats.fret++; if (kind === 'ear') { S.stats.ear++; day().ear++; } if (kind === 'staff') S.stats.staff++; },
  });
}

/* ═════════════ Practice ═════════════ */
const metro = { on: false, bpm: 80, beat: 0, next: 0, timer: null, beats: 4 };
function metroToggle() {
  metro.on = !metro.on;
  if (metro.on) {
    const c = ac(); metro.beat = 0; metro.next = c.currentTime + .08;
    metro.timer = setInterval(() => {
      while (metro.next < c.currentTime + .12) {
        const b = metro.beat, t = metro.next, acc = b === 0;
        try { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = acc ? 1600 : 1000; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(acc ? .5 : .3, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .05); o.connect(g).connect(c.destination); o.start(t); o.stop(t + .06); } catch (e) {}
        setTimeout(() => { overlay.ownerDocument.querySelectorAll('.beats i').forEach((el, i) => el.classList.toggle('on', i === b)); }, Math.max(0, (t - c.currentTime) * 1000));
        metro.next += 60 / metro.bpm; metro.beat = (b + 1) % metro.beats;
      }
    }, 25);
  } else { clearInterval(metro.timer); document.querySelectorAll('.beats i').forEach(el => el.classList.remove('on')); }
  const btn = $('#metrobtn'); if (btn) btn.innerHTML = metro.on ? `${ic('pause', 'f')}Stop` : `${ic('play_arrow', 'f')}Start`;
}
let taps = [];
function tapTempo() { const n = performance.now(); taps = taps.filter(t => n - t < 2500); taps.push(n); if (taps.length >= 2) { const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); setBpm(Math.round(60000 / iv)); } sfx.tap(); }
function setBpm(v) { metro.bpm = clamp(v, 30, 240); const el = $('#bpm'); if (el) el.firstChild.textContent = metro.bpm; const r = $('#bpmr'); if (r) r.value = metro.bpm; }

const practiceSec = () => S.practice ? S.practice.acc + (S.practice.run ? (Date.now() - S.practice.run) / 1000 : 0) : 0;
function practiceToggle() {
  if (!S.practice) S.practice = { acc: 0, run: null };
  if (S.practice.run) { S.practice.acc += (Date.now() - S.practice.run) / 1000; S.practice.run = null; }
  else S.practice.run = Date.now();
  save(); render();
}
function practiceFinish() {
  const sec = Math.round(practiceSec()); S.practice = null;
  if (sec < 5) { save(); return render(); }
  day().practice += sec; addTime(sec);
  toast(`${Math.max(1, Math.round(sec / 60))} min of practice logged`, 'timer'); checkAch(); render();
}
let clockTimer = null;
function updatePracticeClock() {
  clearInterval(clockTimer);
  const tick = () => { const el = $('#clock'); if (!el) return clearInterval(clockTimer); const s = Math.floor(practiceSec()); el.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
  tick(); if (S.practice && S.practice.run) clockTimer = setInterval(tick, 500);
}
function viewPractice() {
  const running = S.practice && S.practice.run, has = S.practice && practiceSec() > 0;
  return `<div class="section-title">Practice session</div>
  <div class="card timer">${goalRing(64, 7)}<div class="clock" id="clock">00:00</div><div class="muted" style="font-weight:700;font-size:14px">${minsToday()} of ${S.goal} min today · grab your bass and play!</div>
    <div class="row"><button class="btn ${running ? 'ghost' : 'primary'}" data-a="practice-toggle">${ic(running ? 'pause' : 'play_arrow', 'f')}${running ? 'Pause' : has ? 'Resume' : 'Start timer'}</button>${has ? `<button class="btn ok" data-a="practice-finish">${ic('check', 'f')}Log it</button>` : ''}</div>
    <div style="margin-top:14px;font-size:13px;font-weight:700" class="muted">Practiced away from the app? Log it:</div>
    <div class="chips" style="justify-content:center;margin-top:8px">${[5, 10, 15, 30].map(m => `<button data-a="log" data-arg="${m}">+${m}m</button>`).join('')}</div></div>
  <div class="section-title">Metronome</div>
  <div class="card metro"><div class="bpm" id="bpm">${metro.bpm}<small>BPM</small></div>
    <div class="beats">${Array.from({ length: metro.beats }, () => '<i></i>').join('')}</div>
    <input type="range" id="bpmr" min="30" max="240" value="${metro.bpm}" aria-label="Tempo">
    <div class="stepper"><button data-a="bpm" data-arg="-5">−5</button><button data-a="bpm" data-arg="-1">−1</button><button data-a="tap">Tap</button><button data-a="bpm" data-arg="1">+1</button><button data-a="bpm" data-arg="5">+5</button></div>
    <button class="btn primary block" id="metrobtn" data-a="metro" style="margin-top:14px">${metro.on ? `${ic('pause', 'f')}Stop` : `${ic('play_arrow', 'f')}Start`}</button></div>
  <div class="section-title">Tuning reference</div>
  <div class="card"><div class="muted" style="font-size:14px;font-weight:700">Tap a string to hear its pitch, then match it on your bass. Headphones help with the low notes.</div>
    <div class="strings">${['E', 'A', 'D', 'G'].map(s => `<button data-a="tone" data-arg="${s}">${s}<small>${{ E: 'E1', A: 'A1', D: 'D2', G: 'G2' }[s]}</small></button>`).join('')}</div>
    <a class="btn soft block" style="margin-top:12px" href="https://www.studybass.com/tools/tuner/" target="_blank" rel="noopener">${ic('open_in_new')}Open StudyBass tuner</a></div>
  <div class="section-title">Drills · +1 XP per correct answer</div>
  <div class="drills">${DRILLS.map(([k, t, d, i, col]) => `<button class="drill" data-a="drill" data-arg="${k}"><div class="ico" style="background:${col}">${ic(i)}</div><b>${t}</b><span>${d}</span></button>`).join('')}</div>`;
}

/* ═════════════ Quests view ═════════════ */
function viewQuests() {
  ensureQuests();
  const d = day(), now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const hrs = Math.floor((mid - now) / 36e5), mins = Math.floor((mid - now) / 6e4) % 60;
  const allClaimed = S.quests.ids.every(id => S.quests.claimed.includes(id));
  let html = `<div class="section-title" style="display:flex;justify-content:space-between"><span>Daily quests</span><span>${ic('schedule')} ${hrs}h ${mins}m left</span></div><div class="card" style="padding:4px 16px">`;
  S.quests.ids.forEach(id => {
    const Qd = QUESTS[id], v = Math.min(Qd.val(d), Qd.target()), tg = Qd.target(), cl = S.quests.claimed.includes(id), ready = v >= tg && !cl;
    html += `<div class="quest"><div class="qi">${ic(Qd.icon)}</div><div class="body"><b>${Qd.t()}</b><div class="bar gold"><i style="width:${v / tg * 100}%"></i><em>${v} / ${tg}</em></div></div>
      ${cl ? `<span class="claimed">${ic('check_circle', 'f')}Done</span>` : ready ? `<button class="btn gold small" data-a="claim" data-arg="${id}">+${Qd.r}</button>` : `<span class="chip pick" style="font-size:13px">${PICK_SVG}${Qd.r}</span>`}</div>`;
  });
  html += `</div>`;
  html += `<div class="card" style="margin-top:12px;display:flex;align-items:center;gap:14px"><span class="ms f" style="font-size:44px;width:44px;color:${allClaimed ? 'var(--gold)' : 'var(--line)'}">redeem</span>
    <div style="flex:1"><b style="font-weight:900">Daily chest</b><div class="muted" style="font-size:13px;font-weight:700">${S.quests.chest ? 'Opened. Come back tomorrow for a new one!' : 'Finish all 3 quests to open: +20 picks'}</div></div>
    ${allClaimed && !S.quests.chest ? `<button class="btn gold small" data-a="chest">Open</button>` : ''}</div>`;
  const got = ACH.filter(a => S.ach[a.id]).length;
  html += `<div class="section-title">Badges · ${got}/${ACH.length}</div><div class="badges">${ACH.map(a => `<div class="badge ${S.ach[a.id] ? '' : 'locked'}"><div class="bi">${ic(a.icon)}</div><b>${a.t}</b><span>${a.d}</span></div>`).join('')}</div>`;
  return html;
}

/* ═════════════ Profile view ═════════════ */
const ACCENTS = [['indigo', 'Indigo', '#5B4BDB', 0], ['teal', 'Teal', '#0E9C9C', 60], ['rose', 'Rose', '#D9446F', 60], ['forest', 'Forest', '#2E9A57', 80], ['sunset', 'Sunset', '#E46A2E', 80], ['ocean', 'Ocean', '#2F6FE0', 100]];
function viewProfile() {
  const lv = levelInfo(S.xp), tot = Object.values(S.days).reduce((s, d) => s + d.sec, 0);
  const rem = remainingMin(), e = etaFor(S.goal, rem), pace = actualPace();
  const doneN = LESSONS.filter(isDone).length;
  let html = `<div class="profile-top"><div class="avatar">${esc((S.name || 'B')[0].toUpperCase())}</div><div style="flex:1;min-width:0">
    <h2>${esc(S.name || 'Bassist')}</h2><div class="rank">Level ${lv.L} · ${rankOf(lv.L)}</div><div class="bar gold"><i style="width:${lv.into / lv.need * 100}%"></i></div><div class="lv">${lv.into} / ${lv.need} XP to level ${lv.L + 1}</div></div></div>`;
  html += `<div class="section-title">Stats</div><div class="stats">
    <div class="stat"><span class="ms" style="color:var(--fire)">local_fire_department</span><div><b>${S.streak.n}</b><span>Day streak · best ${S.streak.best}</span></div></div>
    <div class="stat"><span class="ms" style="color:var(--gold)">bolt</span><div><b>${S.xp.toLocaleString()}</b><span>Total XP</span></div></div>
    <div class="stat"><span class="ms" style="color:var(--accent)">school</span><div><b>${doneN}/${LESSONS.length}</b><span>Lessons done</span></div></div>
    <div class="stat"><span class="ms" style="color:var(--ok)">schedule</span><div><b>${tot >= 3600 ? (tot / 3600).toFixed(1) + 'h' : Math.floor(tot / 60) + 'm'}</b><span>Time studied</span></div></div></div>`;
  html += `<div class="section-title">Your finish line</div><div class="card eta">
    <div class="muted" style="font-weight:800;font-size:14px">${rem ? 'At this pace you\'ll finish all of StudyBass Fundamentals by' : 'You finished everything!'}</div>
    <div class="when" id="eta-when">${rem ? fmtDate(e.date) : '🎉'}</div><div class="sub" id="eta-sub">${rem ? `${humanSpan(e.days)} · ${Math.round(rem / 60)} hours of material left` : ''}</div>
    <div class="breakdown" id="eta-br">${COURSES.map(c => { const r = remainingMin(c.units.flatMap(u => u.lessons)); return `<div><b>${r ? humanSpan(Math.ceil(r / S.goal)) : 'Done'}</b><span>${c.short}</span></div>`; }).join('')}</div>
    <div class="goalv"><span>Daily goal</span><b id="goal-v">${S.goal} min</b></div>
    <input type="range" id="goal-r" min="5" max="120" step="5" value="${S.goal}" aria-label="Daily goal in minutes">
    ${pace != null ? `<div class="pace">${ic('trending_up')} Your real pace over the last ${Math.min(14, daysBetween(S.created, today()) + 1)} days: <b>${pace.toFixed(1)} min/day</b>${pace > 0 && rem ? `, which gets you there by <b>${fmtDate(etaFor(pace, rem).date)}</b>.` : '. Start a streak to see your projection!'}</div>` : ''}
    <div class="muted" style="font-size:12px;font-weight:600;margin-top:10px">Estimates assume ~10 min per lesson read, ~25 min to practice its exercises, ~15 min for song examples and ~5 min per quiz.</div></div>`;
  // week chart
  const days7 = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6)), mx = Math.max(S.goal * 1.4, ...days7.map(k => ((S.days[k] || {}).sec || 0) / 60));
  html += `<div class="section-title">This week</div><div class="card"><div class="week">${days7.map(k => { const m = ((S.days[k] || {}).sec || 0) / 60, h = (S.days[k] || {}).hit; const [y, mo, dd] = k.split('-').map(Number); return `<div class="col"><div class="b ${m ? (h ? 'hit' : '') : 'zero'}" style="height:${Math.max(4, m / mx * 100)}px" title="${Math.round(m)} min"></div><div class="d ${k === today() ? 'today' : ''}">${new Date(y, mo - 1, dd).toLocaleDateString(undefined, { weekday: 'narrow' })}</div></div>`; }).join('')}
    <div class="goal-line" style="bottom:${S.goal / mx * 100 + 22}px"></div></div></div>`;
  // calendar (last 5 weeks)
  const start = addDays(today(), -34);
  html += `<div class="section-title">Streak calendar</div><div class="card"><div class="cal">${Array.from({ length: 35 }, (_, i) => { const k = addDays(start, i), d = S.days[k]; const cls = d && d.hit ? 'h' : S.frozen[k] ? 'fz' : d && d.sec ? 'p' : ''; return `<i class="${cls} ${k === today() ? 't' : ''}">${+k.slice(8)}</i>`; }).join('')}</div>
    <div class="muted" style="font-size:12px;font-weight:700;margin-top:10px;display:flex;gap:14px;flex-wrap:wrap"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--gold)"></i> Goal hit</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:color-mix(in srgb,var(--accent) 35%,var(--surface))"></i> Studied</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:color-mix(in srgb,var(--ice) 40%,var(--surface))"></i> Freeze used</span></div></div>`;
  // shop
  html += `<div class="section-title" style="display:flex;justify-content:space-between"><span>Shop</span><span class="chip pick" style="padding:0">${PICK_SVG}${S.picks}</span></div><div class="shop">
    <button data-a="buy-freeze"><span class="ms f" style="color:var(--ice);font-size:30px;width:30px">ac_unit</span><b>Streak freeze</b><span>${PICK_SVG}50 · own ${S.freezes}/2</span></button>
    ${ACCENTS.map(([k, n, col, price]) => `<button class="${S.settings.accent === k ? 'on' : ''}" data-a="accent" data-arg="${k}"><div class="sw" style="background:${col}"></div><b>${n} theme</b>${S.owned.includes(k) ? `<span class="own">${S.settings.accent === k ? 'In use' : 'Owned'}</span>` : `<span>${PICK_SVG}${price}</span>`}</button>`).join('')}</div>`;
  // settings
  const th = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  html += `<div class="section-title">Settings</div><div class="list">
    <button class="li" data-a="sound">${ic(S.settings.sound ? 'volume_up' : 'volume_off')}Sound effects<span class="r"><span class="toggle ${S.settings.sound ? 'on' : ''}"></span></span></button>
    <button class="li" data-a="theme">${ic('contrast')}Appearance<span class="r">${th[S.settings.theme]}${ic('chevron_right')}</span></button>
    <div class="li">${ic('calendar_month')}Daily reminder<span class="r"><input type="time" class="timein" id="remind" value="${S.settings.remind}"><button class="btn soft" data-a="ics">Add</button></span></div>
    ${installEvt ? `<button class="li" data-a="install">${ic('install_mobile')}Install app<span class="r">${ic('chevron_right')}</span></button>` : ''}
    <button class="li" data-a="edit-name">${ic('person')}Change name<span class="r">${ic('chevron_right')}</span></button>
    <button class="li" data-a="export">${ic('download')}Back up progress<span class="r">${ic('chevron_right')}</span></button>
    <button class="li" data-a="import">${ic('upload')}Restore from backup<span class="r">${ic('chevron_right')}</span></button>
    <button class="li" data-a="reset" style="color:var(--bad)">${ic('restart_alt')}Reset all progress</button></div>
  <p class="foot">BassPath is an unofficial, fan-made study companion. All lessons, exercises and songs live on <a href="https://www.studybass.com/" target="_blank" rel="noopener">StudyBass.com</a> © Leading Tone Media, LLC. Not affiliated with or endorsed by StudyBass. If the lessons help you, consider <a href="https://www.studybass.com/support/" target="_blank" rel="noopener">supporting StudyBass</a>.<br><br>Your progress is stored only on this device.</p>`;
  return html;
}
afterRender.profile = () => {
  const r = $('#goal-r'); if (!r) return;
  r.addEventListener('input', () => {
    const g = +r.value, rem = remainingMin(), e = etaFor(g, rem);
    $('#goal-v').textContent = `${g} min`;
    if (rem) { $('#eta-when').textContent = fmtDate(e.date); $('#eta-sub').textContent = `${humanSpan(e.days)} · ${Math.round(rem / 60)} hours of material left`; }
    $('#eta-br').innerHTML = COURSES.map(c => { const rr = remainingMin(c.units.flatMap(u => u.lessons)); return `<div><b>${rr ? humanSpan(Math.ceil(rr / g)) : 'Done'}</b><span>${c.short}</span></div>`; }).join('');
  });
  r.addEventListener('change', () => { S.goal = +r.value; save(); toast(`Daily goal set to ${S.goal} min`, 'timer'); checkGoal(); render(); });
  const t = $('#remind'); t && t.addEventListener('change', () => { S.settings.remind = t.value; save(); });
};
afterRender.practice = () => {
  updatePracticeClock();
  const r = $('#bpmr'); r && r.addEventListener('input', () => setBpm(+r.value));
};

const VIEWS = { learn: viewLearn, practice: viewPractice, quests: viewQuests, profile: viewProfile };

/* ═════════════ Misc actions ═════════════ */
function downloadICS() {
  const [h, m] = (S.settings.remind || '19:00').split(':'), d = new Date(); d.setDate(d.getDate() + 1);
  const ds = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${h}${m}00`;
  const url = location.href.split('#')[0];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BassPath//EN', 'BEGIN:VEVENT', `UID:basspath-daily-${Date.now()}@basspath`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${ds}`, `DURATION:PT${S.goal}M`, 'RRULE:FREQ=DAILY', `SUMMARY:🎸 Bass practice (${S.goal} min)`, `DESCRIPTION:Keep your BassPath streak alive! ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Time for bass practice', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'basspath-daily-reminder.ics'; a.click();
  toast('Open the file to add a daily reminder to your calendar', 'calendar_month', 3500);
}
function exportData() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
  a.download = `basspath-backup-${today()}.json`; a.click(); toast('Backup downloaded', 'download');
}
function importData() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); if (!d || d.v !== 1) throw 0; S = Object.assign(fresh(), d); save(); render(); toast('Progress restored', 'check_circle'); } catch (e) { toast('That file is not a BassPath backup', 'error'); } }); };
  inp.click();
}

/* ═════════════ Event wiring ═════════════ */
const A = {
  tab: a => { tab = a; if (a === 'learn') scrollToCurrent = true; render(); scrollTo(0, 0); },
  course: a => { S.course = a; scrollToCurrent = true; save(); render(); scrollTo(0, 0); },
  'goto-next': a => { const l = LBY[a]; S.course = l.course.id; scrollToCurrent = true; save(); render(); },
  lesson: a => openLesson(a),
  locked: () => { toast('Finish the earlier lessons first, or use "Test out" to skip a unit', 'lock', 3200); buzz(30); },
  'locked-cp': () => toast('Complete every lesson in this unit to unlock its checkpoint', 'lock', 3000),
  'sheet-bg': (a, el, e) => { if (e.target === el) closeSheet(); },
  'sheet-close': () => closeSheet(),
  'part-open': (p) => { const l = sheetLesson; if (!l) return; if (!S.away || S.away.lid !== l.id) S.away = { lid: l.id, t: Date.now() }; (S.parts[l.id] ||= {})[p] = 1; save(); setTimeout(() => sheetLesson && openLesson(l.id), 300); return true; },
  'part-toggle': p => { const l = sheetLesson; if (!l || isDone(l)) return; const pp = (S.parts[l.id] ||= {}); pp[p] = pp[p] ? 0 : 1; sfx.tap(); save(); openLesson(l.id); },
  quickcheck: () => quickCheck(),
  complete: () => completeFlow(),
  timechip: (m, el) => { document.querySelectorAll('#timechips button').forEach(b => b.classList.toggle('on', b === el)); $('#finishbtn').dataset.arg = m; },
  'finish-lesson': m => finishLesson(+m),
  checkpoint: u => { closeSheet(); if ($('#modal')) closeModal(); unitQuiz(u, false); },
  testout: u => modal(`${ic('skip_next', 'big-ico')}<h2>Test out of this unit?</h2><p>Score 80% or more on the <b>${esc(UBY[u].title)}</b> quiz to mark all its lessons as done.</p><button class="btn primary block" data-a="testout-go" data-arg="${u}">Start test</button><button class="btn ghost block" data-a="modal-close">Cancel</button>`),
  'testout-go': u => { closeModal(); unitQuiz(u, true); },
  'modal-close': () => closeModal(),
  'q-sel': i => qSelect(i),
  'q-check': () => qCheck(),
  'q-audio': () => { const q = QZ && QZ.queue[QZ.pos]; q && q.audio && q.audio(); },
  'quiz-quit': () => modal(`${ic('sentiment_dissatisfied', 'big-ico')}<h2>Leave now?</h2><p>You'll lose this quiz's progress (study time still counts).</p><button class="btn primary block" data-a="modal-close">Keep going</button><button class="btn ghost block" data-a="quiz-quit-yes" style="color:var(--bad)">Quit</button>`),
  'quiz-quit-yes': () => { closeModal(); const back = QZ && QZ.back; quitQuiz(); back && back(); },
  'quiz-done': () => { const back = QZ.back; QZ = null; overlay.innerHTML = ''; render(); back && back(); },
  drill: k => startDrill(k),
  tone: s => pluck(OPEN[s]),
  metro: () => metroToggle(),
  bpm: d => setBpm(metro.bpm + +d),
  tap: () => tapTempo(),
  'practice-toggle': () => practiceToggle(),
  'practice-finish': () => practiceFinish(),
  log: m => { day().practice += m * 60; addTime(m * 60); toast(`+${m} min logged`, 'timer'); checkAch(); render(); },
  claim: id => { const Qd = QUESTS[id]; if (S.quests.claimed.includes(id) || Qd.val(day()) < Qd.target()) return; S.quests.claimed.push(id); S.picks += Qd.r; sfx.coin(); toast(`+${Qd.r} picks`, 'redeem'); save(); render(); },
  chest: () => { if (S.quests.chest) return; S.quests.chest = true; S.picks += 20; save(); modal(`${ic('redeem', 'big-ico')}<h2>Chest opened!</h2><p>+20 picks. New quests arrive at midnight.</p><button class="btn gold block" data-a="modal-close">Sweet</button>`, { confetti: true, sound: 'win', onClose: render }); },
  'buy-freeze': () => { if (S.freezes >= 2) return toast('You can hold 2 streak freezes at a time', 'ac_unit'); if (S.picks < 50) return toast('Not enough picks yet. Complete quests to earn more!', 'redeem'); S.picks -= 50; S.freezes++; sfx.coin(); toast('Streak freeze equipped. It protects one missed day', 'ac_unit', 3200); save(); render(); },
  accent: k => { const it = ACCENTS.find(x => x[0] === k); if (!S.owned.includes(k)) { if (S.picks < it[3]) return toast(`Need ${it[3]} picks to unlock ${it[1]}`, 'redeem'); S.picks -= it[3]; S.owned.push(k); sfx.coin(); toast(`${it[1]} theme unlocked!`, 'palette'); } S.settings.accent = k; save(); render(); },
  sound: () => { S.settings.sound = !S.settings.sound; save(); render(); },
  theme: () => { const o = ['auto', 'light', 'dark']; S.settings.theme = o[(o.indexOf(S.settings.theme) + 1) % 3]; save(); render(); },
  ics: () => downloadICS(),
  export: () => exportData(),
  import: () => importData(),
  reset: () => modal(`${ic('restart_alt', 'big-ico')}<h2>Reset everything?</h2><p>This permanently erases your streak, XP and lesson progress on this device.</p><button class="btn bad block" data-a="reset-yes">Reset progress</button><button class="btn ghost block" data-a="modal-close">Cancel</button>`),
  'reset-yes': () => { localStorage.removeItem(KEY); S = fresh(); obStep = 0; closeModal(); render(); },
  'edit-name': () => { const n = prompt('Your name', S.name); if (n != null) { S.name = n.trim().slice(0, 24); save(); render(); } },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); },
  dismiss: k => { S.dismissed[k] = 1; save(); render(); },
  // onboarding
  'ob-next': () => { if (obStep === 1) S.name = ($('#ob-name').value || '').trim().slice(0, 24); obStep++; save(); render(); },
  'ob-back': () => { obStep = Math.max(0, obStep - 1); render(); },
  'ob-goal': m => { S.goal = +m; sfx.tap(); render(); },
  'ob-level': k => { S.course = k; sfx.tap(); render(); },
  'ob-finish': () => {
    const skipTo = COURSES.findIndex(c => c.id === S.course);
    COURSES.slice(0, skipTo).forEach(c => c.units.forEach(u => u.lessons.forEach(l => S.done[l.id] = 'skip')));
    S.onboarded = true; S.created = today(); S.lastLevel = 1; save(); scrollToCurrent = true; render();
    modal(`${ic('music_note', 'big-ico')}<h2>You're all set${S.name ? ', ' + esc(S.name) : ''}!</h2><p>Tap the glowing lesson to begin. Open it on StudyBass, tick off the steps, then come back to complete it and earn XP.</p><button class="btn primary block" data-a="modal-close">Let's go</button>`, { confetti: true, sound: 'win' });
  },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  const keepDefault = el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href') !== '#';
  if (!keepDefault) e.preventDefault();
  if (AC && AC.state === 'suspended') AC.resume();
  fn(el.dataset.arg, el, e);
});
document.addEventListener('keydown', e => {
  if (QZ && overlay.querySelector('.quiz')) {
    if (/^[1-9]$/.test(e.key)) { const b = overlay.querySelectorAll('.opt')[+e.key - 1]; b && qSelect(+e.key - 1); }
    if (e.key === 'Enter') { const b = $('#qbtn'); b && !b.disabled && qCheck(); }
  } else if (e.key === 'Enter' && !S.onboarded && obStep === 1) A['ob-next']();
  if (e.key === 'Escape') { if ($('#modal')) closeModal(); else if (sheetLesson) closeSheet(); }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (S.onboarded && !QZ) render(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.onboarded) return;
  normalizeStreak(); ensureQuests();
  if (!QZ && !sheetLesson && !$('#modal')) render();
  else if (sheetLesson && !QZ) openLesson(sheetLesson.id);
});

/* ═════════════ Boot ═════════════ */
if (S.onboarded) { normalizeStreak(); S.lastLevel = Math.max(S.lastLevel, levelInfo(S.xp).L); }
render();
window.BassPath = { state: () => S };
})();
