/* ================================================================
   CONSTANTS
   ================================================================ */
const START_MIN = 330;            // 5:30
const END_MIN   = 24 * 60;        // 24:00
const TOTAL_MIN = END_MIN - START_MIN;

/* ================================================================
   DATE / WEEK HELPERS
   ================================================================ */
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }
function shiftWeek(weekId, deltaWeeks) {
  const d = new Date(weekId + 'T00:00:00');
  d.setDate(d.getDate() + deltaWeeks * 7);
  return isoDate(d);
}
function formatWeekLabel(weekId) {
  const monday = new Date(weekId + 'T00:00:00');
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
  const opts = { month: 'short', day: 'numeric' };
  const year = friday.getFullYear();
  return `Week of ${monday.toLocaleDateString('en-US', opts)} – ${friday.toLocaleDateString('en-US', opts)}, ${year}`;
}

let currentWeekId = isoDate(mondayOf(new Date()));

// Read pixel-per-hour from CSS so we have ONE source of truth
function pxPerMin(){
  const cs = getComputedStyle(document.documentElement);
  const hourPx = parseFloat(cs.getPropertyValue('--hour-px')) || 62;
  return hourPx / 60;
}

function tm(s){const[h,m]=s.split(':').map(Number);return h*60+m}
function fd(d){const h=Math.floor(d/60),m=d%60;return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`}
function fe(t,d){const e=tm(t)+d,h=Math.floor(e/60),m=e%60;return`${h}:${String(m).padStart(2,'0')}`}

/* ================================================================
   COLOR PALETTE
   ================================================================ */
const TY = {
  deep:    {bg:'#e8f0fe', bd:'#1a73e8', tx:'#174ea6', lb:'Deep focus'},
  tools:   {bg:'#fef7e0', bd:'#f9ab00', tx:'#5f4100', lb:'Tool research'},
  lang:    {bg:'#e6f4ea', bd:'#188038', tx:'#0d652d', lb:'Language / learning'},
  admin:   {bg:'#f1f3f4', bd:'#5f6368', tx:'#3c4043', lb:'Admin / flex'},
  body:    {bg:'#fce8e6', bd:'#d93025', tx:'#a50e0e', lb:'Body / exercise'},
  recovery:{bg:'#f8f9fa', bd:'#9aa0a6', tx:'#5f6368', lb:'Recovery / life'},
  relation:{bg:'#fce8f1', bd:'#d01884', tx:'#8e0e5c', lb:'Relationship'},
  fixed:   {bg:'#fff4c2', bd:'#f9ab00', tx:'#5f4100', lb:'Fixed meeting'},
  mind:    {bg:'#e8f5e9', bd:'#34a853', tx:'#0d652d', lb:'Meditation'},
  read:    {bg:'#fde7d3', bd:'#e8710a', tx:'#8a4200', lb:'Reading'},
  commute: {bg:'#f1f3f4', bd:'#9aa0a6', tx:'#5f6368', lb:'Commute / prep'},
};

/* ================================================================
   SCHEDULE DATA
   ================================================================ */
const MORNING = [
  {t:'6:00', l:'Wake — news / music / phone + prep breakfast', y:'recovery', d:60},
  {t:'7:00', l:'Get ready + commute to pool', y:'commute', d:30},
  {t:'7:30', l:'Swim', y:'body', d:60},
  {t:'8:30', l:'Shower + commute back', y:'commute', d:30},
  {t:'9:00', l:'Eat breakfast', y:'recovery', d:30},
  {t:'9:30', l:'Get ready / settle in', y:'commute', d:30},
];
const NIGHT = (s) => {
  const t1 = fe(s, 110), t2 = fe(t1, 30);
  return [
    {t:s,  l:'Night exercise + shower', y:'body',  d:110},
    {t:t1, l:'Reading',                  y:'read',  d:30},
    {t:t2, l:'Meditation',               y:'mind',  d:15},
  ];
};

/* Shared days that don't change across variants */
const MONDAY_BASE = [...MORNING,
  {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
  {t:'11:30', l:'Break / walk', y:'recovery', d:20},
  {t:'11:50', l:'Personal biz — research', y:'deep', d:90, cat:'biz_research'},
  {t:'13:20', l:'Break / walk', y:'recovery', d:20},
  {t:'13:40', l:'Personal biz — action', y:'deep', d:80, cat:'biz_action'},
  {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
  {t:'16:00', l:'Language class (FR/DE/KR)', y:'lang', d:90, cat:'lang_class'},
  {t:'17:30', l:'Prep Spanish class', y:'lang', d:30, cat:'spanish_prep'},
  {t:'18:00', l:'Admin / flex', y:'admin', d:30, cat:'admin'},
  {t:'18:30', l:'Dinner', y:'recovery', d:30},
  {t:'19:00', l:'Spanish date w/ girlfriend', y:'relation', d:60},
  ...NIGHT('20:00')];

const FRIDAY_BASE = [...MORNING,
  {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
  {t:'11:30', l:'Break / walk', y:'recovery', d:20},
  {t:'11:50', l:'Econ markets — research', y:'deep', d:90, cat:'markets_research'},
  {t:'13:20', l:'Break / walk', y:'recovery', d:20},
  {t:'13:40', l:'Econ markets — action', y:'deep', d:80, cat:'markets_action'},
  {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
  {t:'16:00', l:'Language class (FR/DE/KR)', y:'lang', d:90, cat:'lang_class'},
  {t:'17:30', l:'Admin / wrap week', y:'admin', d:45, cat:'admin'},
  {t:'18:15', l:'Free buffer', y:'recovery', d:15},
  {t:'18:30', l:'Dinner', y:'recovery', d:30},
  {t:'19:00', l:'GF / date night', y:'relation', d:60},
  ...NIGHT('20:00')];

/* ============================================================
   THREE SCHEDULE VARIANTS
   ============================================================ */
const SCHEDULE_VERSIONS = {
  v7: {
    name: 'Balanced (v7)',
    tagline: 'Tool research on Thursday afternoon',
    desc: 'Standard week. Thursday devotes 2h to work tool research; evenings stay open for GF time and recovery.',
    highlights: ['Thu 4pm – Tool research (2h)', 'Tue afternoon – Budgeting + Admin', 'Wed afternoon – House + Grocery'],
    week: [
      MONDAY_BASE,
      // Tuesday — DD + Budgeting + Admin
      [...MORNING,
        {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Due diligence — research', y:'deep', d:10, cat:'dd_research'},
        {t:'12:00', l:'Investment meeting (fixed)', y:'fixed', d:60},
        {t:'13:00', l:'Due diligence — action', y:'deep', d:90, cat:'dd_action'},
        {t:'14:30', l:'Break / walk', y:'recovery', d:30},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Budgeting', y:'admin', d:60, cat:'budget'},
        {t:'17:00', l:'Admin / flex', y:'admin', d:60, cat:'admin'},
        {t:'18:00', l:'Free buffer', y:'recovery', d:30},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Time with girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      // Wednesday — Personal biz + house + grocery
      [...MORNING,
        {t:'10:00', l:'Personal biz — action', y:'deep', d:90, cat:'biz_action'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Personal biz — research', y:'deep', d:90, cat:'biz_research'},
        {t:'13:20', l:'Break / walk', y:'recovery', d:20},
        {t:'13:40', l:'Clean house / laundry', y:'admin', d:20, cat:'house'},
        {t:'14:00', l:'Grocery shopping', y:'admin', d:60, cat:'grocery'},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Language class (FR/DE/KR)', y:'lang', d:90, cat:'lang_class'},
        {t:'17:30', l:'Clean house / laundry', y:'admin', d:60, cat:'house'},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Spanish date w/ girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      // Thursday — Tool research + recovery evening
      [...MORNING,
        {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Personal finances — research', y:'deep', d:90, cat:'fin_research'},
        {t:'13:20', l:'Break / walk', y:'recovery', d:20},
        {t:'13:40', l:'Personal finances — action', y:'deep', d:80, cat:'fin_action'},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Tool research (work)', y:'tools', d:90, cat:'tools'},
        {t:'17:30', l:'Tool research (work) — wrap', y:'tools', d:30, cat:'tools'},
        {t:'18:00', l:'Free buffer', y:'recovery', d:30},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Time with girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      FRIDAY_BASE,
    ]
  },

  v7b: {
    name: 'Push Thursday (v7b)',
    tagline: 'Bonus deep work in the evening',
    desc: 'Same as v7, but Thursday evening adds 2h of personal-biz deep work. Sacrifices GF time and night exercise that day.',
    highlights: ['Thu evening – +2h personal biz deep', 'No night exercise on Thursday', 'No GF time on Thursday'],
    week: [
      MONDAY_BASE,
      // Tuesday — same as v7
      [...MORNING,
        {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Due diligence — research', y:'deep', d:10, cat:'dd_research'},
        {t:'12:00', l:'Investment meeting (fixed)', y:'fixed', d:60},
        {t:'13:00', l:'Due diligence — action', y:'deep', d:90, cat:'dd_action'},
        {t:'14:30', l:'Break / walk', y:'recovery', d:30},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Budgeting', y:'admin', d:60, cat:'budget'},
        {t:'17:00', l:'Admin / flex', y:'admin', d:60, cat:'admin'},
        {t:'18:00', l:'Free buffer', y:'recovery', d:30},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Time with girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      // Wednesday — same as v7
      [...MORNING,
        {t:'10:00', l:'Personal biz — action', y:'deep', d:90, cat:'biz_action'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Personal biz — research', y:'deep', d:90, cat:'biz_research'},
        {t:'13:20', l:'Break / walk', y:'recovery', d:20},
        {t:'13:40', l:'Clean house / laundry', y:'admin', d:20, cat:'house'},
        {t:'14:00', l:'Grocery shopping', y:'admin', d:60, cat:'grocery'},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Language class (FR/DE/KR)', y:'lang', d:90, cat:'lang_class'},
        {t:'17:30', l:'Clean house / laundry', y:'admin', d:60, cat:'house'},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Spanish date w/ girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      // Thursday — bonus deep work in evening
      [...MORNING,
        {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Personal finances — research', y:'deep', d:90, cat:'fin_research'},
        {t:'13:20', l:'Break / walk', y:'recovery', d:20},
        {t:'13:40', l:'Personal finances — action', y:'deep', d:80, cat:'fin_action'},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Tool research (work)', y:'tools', d:90, cat:'tools'},
        {t:'17:30', l:'Tool research (work) — wrap', y:'tools', d:30, cat:'tools'},
        {t:'18:00', l:'Free buffer', y:'recovery', d:30},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Personal biz — deep (bonus)', y:'deep', d:90, cat:'biz_action'},
        {t:'20:30', l:'Break / walk', y:'recovery', d:20},
        {t:'20:50', l:'Personal biz — deep (bonus)', y:'deep', d:30, cat:'biz_action'},
        {t:'21:20', l:'Wind-down buffer', y:'recovery', d:30},
        {t:'21:50', l:'Reading', y:'read', d:30},
        {t:'22:20', l:'Meditation', y:'mind', d:15}],
      FRIDAY_BASE,
    ]
  },

  v8: {
    name: 'Errands Tuesday (v8)',
    tagline: 'Tue/Wed errand swap',
    desc: 'Tuesday afternoon becomes the errand block (grocery + house). Wednesday becomes a cleaner deep-work day with budgeting absorbed in.',
    highlights: ['Tue 4pm – Grocery + house cleaning', 'Wed afternoon – Budgeting + admin', 'Wed evening freed up'],
    week: [
      MONDAY_BASE,
      // Tuesday — errands replace budgeting
      [...MORNING,
        {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Due diligence — research', y:'deep', d:10, cat:'dd_research'},
        {t:'12:00', l:'Investment meeting (fixed)', y:'fixed', d:60},
        {t:'13:00', l:'Due diligence — action', y:'deep', d:90, cat:'dd_action'},
        {t:'14:30', l:'Break / walk', y:'recovery', d:30},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Grocery shopping', y:'admin', d:60, cat:'grocery'},
        {t:'17:00', l:'Clean house / laundry', y:'admin', d:90, cat:'house'},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Time with girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      // Wednesday — clean deep work + budgeting
      [...MORNING,
        {t:'10:00', l:'Personal biz — action', y:'deep', d:90, cat:'biz_action'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Personal biz — research', y:'deep', d:90, cat:'biz_research'},
        {t:'13:20', l:'Break / walk', y:'recovery', d:20},
        {t:'13:40', l:'Budgeting', y:'admin', d:60, cat:'budget'},
        {t:'14:40', l:'Admin / flex', y:'admin', d:20, cat:'admin'},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Language class (FR/DE/KR)', y:'lang', d:90, cat:'lang_class'},
        {t:'17:30', l:'Admin / flex', y:'admin', d:60, cat:'admin'},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Spanish date w/ girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      // Thursday — same as v7
      [...MORNING,
        {t:'10:00', l:'Job applications', y:'deep', d:90, cat:'job'},
        {t:'11:30', l:'Break / walk', y:'recovery', d:20},
        {t:'11:50', l:'Personal finances — research', y:'deep', d:90, cat:'fin_research'},
        {t:'13:20', l:'Break / walk', y:'recovery', d:20},
        {t:'13:40', l:'Personal finances — action', y:'deep', d:80, cat:'fin_action'},
        {t:'15:00', l:'Cook + eat lunch', y:'recovery', d:60},
        {t:'16:00', l:'Tool research (work)', y:'tools', d:90, cat:'tools'},
        {t:'17:30', l:'Tool research (work) — wrap', y:'tools', d:30, cat:'tools'},
        {t:'18:00', l:'Free buffer', y:'recovery', d:30},
        {t:'18:30', l:'Dinner', y:'recovery', d:30},
        {t:'19:00', l:'Time with girlfriend', y:'relation', d:60},
        ...NIGHT('20:00')],
      FRIDAY_BASE,
    ]
  }
};

/* The currently-active variant key. WEEK is a getter that always returns the active week. */
let activeVersion = 'v7';
let WEEK = SCHEDULE_VERSIONS[activeVersion].week;

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri'];
let DAY_DATES = ['13','14','15','16','17'];
let TODAY_INDEX = -1;

function recomputeWeekDerived(){
  const monday = new Date(currentWeekId + 'T00:00:00');
  DAY_DATES = [0,1,2,3,4].map(i => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return String(d.getDate());
  });
  const todayWeekId = isoDate(mondayOf(new Date()));
  if (currentWeekId === todayWeekId){
    const dow = new Date().getDay(); // 0 Sun..6 Sat
    TODAY_INDEX = (dow >= 1 && dow <= 5) ? (dow - 1) : -1;
  } else {
    TODAY_INDEX = -1;
  }
  const lbl = document.querySelector('.week-label');
  if (lbl) lbl.textContent = formatWeekLabel(currentWeekId);
}
recomputeWeekDerived();

/* ================================================================
   RENDER CALENDAR
   ================================================================ */
const cal = document.getElementById('cal');

function renderCalendar(){
  cal.innerHTML = '';
  const PPM = pxPerMin();

  // ROW 1: header — corner + 5 day cells
  const corner = document.createElement('div');
  corner.className = 'cal-head-corner';
  cal.appendChild(corner);

  DAY_NAMES.forEach((name, i) => {
    const dh = document.createElement('div');
    dh.className = 'cal-head-day' + (i === TODAY_INDEX ? ' today' : '');
    dh.innerHTML = `
      <div class="cal-head-name">${name}</div>
      <div class="cal-head-num">${DAY_DATES[i]}</div>
    `;
    cal.appendChild(dh);
  });

  // ROW 2: body — gutter + 5 day cells
  const gutter = document.createElement('div');
  gutter.className = 'cal-body-cell cal-gutter';
  // Time ticks at every full hour
  for (let h = 6; h <= 24; h++){
    const y = (h*60 - START_MIN) * PPM;
    const tick = document.createElement('div');
    tick.className = 'gutter-tick';
    tick.style.top = y + 'px';
    tick.textContent = (h === 24 ? 0 : h) + ':00';
    gutter.appendChild(tick);
  }
  cal.appendChild(gutter);

  // 5 day body cells
  WEEK.forEach((day, di) => {
    const cell = document.createElement('div');
    cell.className = 'cal-body-cell';
    cell.dataset.dayIndex = di;

    // Hour grid lines (drawn inside the cell, so they're guaranteed to align)
    for (let h = 6; h <= 24; h++){
      const y = (h*60 - START_MIN) * PPM;
      const line = document.createElement('div');
      line.className = 'hour-line';
      line.style.top = y + 'px';
      cell.appendChild(line);
      if (h < 24){
        const half = document.createElement('div');
        half.className = 'hour-line half';
        half.style.top = (y + 30 * PPM) + 'px';
        cell.appendChild(half);
      }
    }

    // Blocks
    day.forEach(b => {
      if (!b.d) return;
      const info = TY[b.y];
      const top = (tm(b.t) - START_MIN) * PPM;
      const height = b.d * PPM;

      const el = document.createElement('div');
      el.className = 'block';
      el.dataset.cat = b.cat || '';
      el.style.top = top + 'px';
      el.style.height = height + 'px';
      el.style.background = info.bg;
      el.style.borderLeftColor = info.bd;
      el.style.color = info.tx;
      el.style.setProperty('--block-bg', info.bg);
      el.style.setProperty('--block-bd', info.bd);

      el.innerHTML = `
        <div class="block-name">${b.l}</div>
        ${height > 50 ? `<div class="block-time">${b.t} · ${fd(b.d)}</div>` : ''}
        <div class="block-extra">
          <div class="block-extra-row"><span class="block-extra-label">Time</span><span>${b.t} – ${fe(b.t, b.d)}</span></div>
          <div class="block-extra-row"><span class="block-extra-label">Duration</span><span>${fd(b.d)}</span></div>
          <div class="block-extra-row"><span class="block-extra-label">Type</span><span style="font-weight:500">${info.lb}</span></div>
        </div>
      `;
      el.addEventListener('click', () => toggleExpand(el));
      cell.appendChild(el);
    });

    cal.appendChild(cell);
  });
}

function toggleExpand(el){
  const wasExpanded = el.classList.contains('expanded');
  document.querySelectorAll('.block.expanded').forEach(b => {
    b.classList.remove('expanded');
    if (b.dataset.origHeight) b.style.height = b.dataset.origHeight;
  });
  if (wasExpanded){
    cal.classList.remove('has-expanded');
    return;
  }
  el.dataset.origHeight = el.style.height;
  const origH = parseFloat(el.style.height);
  const newH = Math.max(180, origH * 1.5);
  el.style.height = newH + 'px';
  el.classList.add('expanded');
  cal.classList.add('has-expanded');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.block')){
    document.querySelectorAll('.block.expanded').forEach(b => {
      b.classList.remove('expanded');
      if (b.dataset.origHeight) b.style.height = b.dataset.origHeight;
    });
    cal.classList.remove('has-expanded');
  }
});

/* ================================================================
   STATS
   ================================================================ */
const statsRow = document.getElementById('statsRow');
function renderStats(){
  statsRow.innerHTML = '';
  WEEK.forEach((day, i) => {
    const total = day.filter(b => b.y === 'deep').reduce((s,b) => s+b.d, 0);
    const h = Math.floor(total/60), m = total%60;
    const el = document.createElement('div');
    el.className = 'stat';
    el.innerHTML = `
      <div class="stat-label">${DAY_NAMES[i]}</div>
      <div class="stat-value">${h}h${m ? ' '+m+'m' : ''}</div>
      <div class="stat-sub">deep work</div>
    `;
    statsRow.appendChild(el);
  });
}
renderStats();

/* ================================================================
   LEGEND
   ================================================================ */
const legend = document.getElementById('legend');
Object.values(TY).forEach(info => {
  const el = document.createElement('div');
  el.className = 'leg';
  el.innerHTML = `<div class="leg-sq" style="background:${info.bg};border:1px solid ${info.bd};--leg-bg:${info.bd}"></div><span>${info.lb}</span>`;
  legend.appendChild(el);
});

/* ================================================================
   NOTES PANEL
   ================================================================ */
const panel = document.getElementById('panel');
const scrim = document.getElementById('scrim');
const panelBody = document.getElementById('panelBody');
const saveIndicator = document.getElementById('saveIndicator');

let notesData = [];

function flashSaved(){
  saveIndicator.classList.add('show');
  setTimeout(() => saveIndicator.classList.remove('show'), 900);
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatNoteDate(ts){
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()){
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  return d.toLocaleDateString([], {month:'short', day:'numeric'});
}
function renderNotes(){
  panelBody.innerHTML = '';
  const composer = document.createElement('div');
  composer.className = 'note-composer';
  composer.innerHTML = `
    <textarea id="noteInput" placeholder="Jot down a reminder…" rows="2"></textarea>
    <button id="noteAddBtn">Add note</button>
  `;
  panelBody.appendChild(composer);

  const sorted = [...notesData].sort((a, b) => {
    if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return (b.created_at || 0) - (a.created_at || 0);
  });

  if (sorted.length === 0){
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div class="notes-empty-title">No notes yet</div>
      <div class="notes-empty-sub">Add a reminder above — it'll save automatically.</div>
    `;
    panelBody.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'notes-list';
    sorted.forEach(n => {
      const item = document.createElement('div');
      item.className = 'note' + (n.pinned ? ' pinned' : '');
      item.innerHTML = `
        <div class="note-body">
          <div class="note-text">${escapeHtml(n.text).replace(/\n/g, '<br>')}</div>
          <div class="note-meta">
            <span class="note-date">${formatNoteDate(n.created_at)}</span>
            ${n.pinned ? '<span class="note-pinned-label">Pinned</span>' : ''}
          </div>
        </div>
        <div class="note-actions">
          <button class="note-btn note-pin" data-id="${n.id}" aria-label="${n.pinned ? 'Unpin' : 'Pin'}" title="${n.pinned ? 'Unpin' : 'Pin'}">
            <svg viewBox="0 0 24 24" fill="${n.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4.76a2 2 0 0 0 1.11 1.79l1.78.95A2 2 0 0 1 19 15.28V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-.72a2 2 0 0 1 1.11-1.78l1.78-.95A2 2 0 0 0 9 10.76Z"/></svg>
          </button>
          <button class="note-btn note-delete" data-id="${n.id}" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      `;
      list.appendChild(item);
    });
    panelBody.appendChild(list);
  }

  const input = document.getElementById('noteInput');
  const addBtn = document.getElementById('noteAddBtn');
  const submit = async () => {
    const v = input.value.trim();
    if (!v) return;
    addBtn.disabled = true;
    try {
      const created = await window.api.addNote(currentWeekId, v);
      notesData.push(created);
      input.value = '';
      renderNotes();
      flashSaved();
      setTimeout(() => { const ni = document.getElementById('noteInput'); if (ni) ni.focus(); }, 0);
    } catch(e){
      console.error('addNote failed', e);
      addBtn.disabled = false;
    }
  };
  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); submit(); }
  });
}
async function openNotes(){
  renderNotes();
  panel.classList.add('open');
  scrim.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  setTimeout(() => { const ni = document.getElementById('noteInput'); if (ni) ni.focus(); }, 200);
}
function closeNotes(){
  panel.classList.remove('open');
  scrim.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}
document.getElementById('openNotes').addEventListener('click', openNotes);
document.getElementById('closePanel').addEventListener('click', closeNotes);
scrim.addEventListener('click', closeNotes);
panelBody.addEventListener('click', async (e) => {
  const pin = e.target.closest('.note-pin');
  if (pin){
    const n = notesData.find(x => x.id === pin.dataset.id);
    if (!n) return;
    const next = !n.pinned;
    try {
      await window.api.updateNote(n.id, { pinned: next });
      n.pinned = next;
      renderNotes();
      flashSaved();
    } catch(err){ console.error('updateNote failed', err); }
    return;
  }
  const del = e.target.closest('.note-delete');
  if (del){
    const id = del.dataset.id;
    try {
      await window.api.deleteNote(id);
      notesData = notesData.filter(x => x.id !== id);
      renderNotes();
      flashSaved();
    } catch(err){ console.error('deleteNote failed', err); }
  }
});

/* ================================================================
   TOPICS
   ================================================================ */
const TOPIC_GROUPS = [
  {label:'Career', full:true, items:[{key:'job', name:'Job Applications', color:TY.deep.bd}]},
  {label:'Personal Business', items:[
    {key:'biz_research', name:'Personal Biz — Research', color:TY.deep.bd},
    {key:'biz_action',   name:'Personal Biz — Action',   color:TY.deep.bd},
  ]},
  {label:'Due Diligence', items:[
    {key:'dd_research', name:'Due Diligence — Research', color:TY.deep.bd},
    {key:'dd_action',   name:'Due Diligence — Action',   color:TY.deep.bd},
  ]},
  {label:'Personal Finances', items:[
    {key:'fin_research', name:'Finances — Research', color:TY.deep.bd},
    {key:'fin_action',   name:'Finances — Action',   color:TY.deep.bd},
  ]},
  {label:'Econ Markets', items:[
    {key:'markets_research', name:'Markets — Research', color:TY.deep.bd},
    {key:'markets_action',   name:'Markets — Action',   color:TY.deep.bd},
  ]},
  {label:'Languages', items:[
    {key:'lang_class',   name:'Language Class', color:TY.lang.bd},
    {key:'spanish_prep', name:'Prep Spanish',   color:TY.lang.bd},
  ]},
  {label:'Household', items:[
    {key:'house',   name:'House / Laundry',   color:TY.admin.bd},
    {key:'grocery', name:'Grocery Shopping', color:TY.admin.bd},
  ]},
  {label:'Work Tools', full:true, items:[{key:'tools', name:'Tool Research', color:TY.tools.bd}]},
  {label:'Money',      full:true, items:[{key:'budget', name:'Budgeting', color:TY.admin.bd}]},
  {label:'Free Time',  full:true, items:[{key:'admin', name:'Admin / Flex', color:TY.admin.bd}]},
];
const TOPIC_CATEGORIES = TOPIC_GROUPS.flatMap(g => g.items);

const topicsModal = document.getElementById('topicsModal');
const topicsScrim = document.getElementById('topicsScrim');
const topicGroupsEl = document.getElementById('topicGroups');
const topicDetailModal = document.getElementById('topicDetailModal');
const topicDetailScrim = document.getElementById('topicDetailScrim');
const topicDetailDot = document.getElementById('topicDetailDot');
const topicDetailName = document.getElementById('topicDetailName');
const topicListEl = document.getElementById('topicList');
const topicInput = document.getElementById('topicInput');
const topicAddBtn = document.getElementById('topicAddBtn');

let topicsData = {};
let activeTopicCat = null;

async function loadTopics(){
  try {
    topicsData = await window.api.getTopics();
  } catch(e){ console.warn('topics load failed', e); topicsData = {}; }
  TOPIC_CATEGORIES.forEach(c => { if (!topicsData[c.key]) topicsData[c.key] = []; });
}
function renderTopicGroups(){
  topicGroupsEl.innerHTML = '';
  TOPIC_GROUPS.forEach(group => {
    const ge = document.createElement('div');
    ge.className = 'topic-group';
    const lbl = document.createElement('div');
    lbl.className = 'topic-group-label';
    lbl.textContent = group.label;
    ge.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'topic-group-row' + (group.full ? ' topic-group-row-full' : '');
    group.items.forEach(cat => {
      const items = topicsData[cat.key] || [];
      const btn = document.createElement('button');
      btn.className = 'topic-cat-btn';
      btn.style.borderLeftColor = cat.color;
      btn.dataset.key = cat.key;
      btn.innerHTML = `
        <div class="topic-cat-name">${cat.name}</div>
        <div class="topic-cat-count">${items.length} topic${items.length === 1 ? '' : 's'}</div>
      `;
      btn.addEventListener('click', () => openTopicDetail(cat.key));
      row.appendChild(btn);
    });
    ge.appendChild(row);
    topicGroupsEl.appendChild(ge);
  });
}
function renderTopicList(){
  if (!activeTopicCat) return;
  const items = topicsData[activeTopicCat] || [];
  topicListEl.innerHTML = '';
  if (items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'topic-empty';
    empty.textContent = 'No topics yet. Add one below.';
    topicListEl.appendChild(empty);
  } else {
    items.forEach(t => {
      const item = document.createElement('div');
      item.className = 'topic-item';
      item.innerHTML = `
        <div class="topic-item-text">${escapeHtml(t.text)}</div>
        <button class="topic-item-delete" data-id="${t.id}" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      `;
      topicListEl.appendChild(item);
    });
  }
}
function openTopicDetail(catKey){
  const cat = TOPIC_CATEGORIES.find(c => c.key === catKey);
  if (!cat) return;
  activeTopicCat = catKey;
  topicDetailDot.style.background = cat.color;
  topicDetailName.textContent = cat.name;
  renderTopicList();
  topicDetailModal.classList.add('open');
  topicDetailScrim.classList.add('open');
  topicDetailModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => topicInput.focus(), 100);
}
function closeTopicDetail(){
  topicDetailModal.classList.remove('open');
  topicDetailScrim.classList.remove('open');
  topicDetailModal.setAttribute('aria-hidden', 'true');
  renderTopicGroups();
  activeTopicCat = null;
}
function openTopicsModal(){
  renderTopicGroups();
  topicsModal.classList.add('open');
  topicsScrim.classList.add('open');
  topicsModal.setAttribute('aria-hidden', 'false');
}
function closeTopicsModal(){
  if (topicDetailModal.classList.contains('open')) closeTopicDetail();
  topicsModal.classList.remove('open');
  topicsScrim.classList.remove('open');
  topicsModal.setAttribute('aria-hidden', 'true');
}
document.getElementById('openTopics').addEventListener('click', openTopicsModal);
document.getElementById('closeTopics').addEventListener('click', closeTopicsModal);
document.getElementById('closeTopicDetail').addEventListener('click', closeTopicDetail);
topicsScrim.addEventListener('click', closeTopicsModal);
topicDetailScrim.addEventListener('click', closeTopicDetail);

async function addTopic(){
  if (!activeTopicCat) return;
  const v = topicInput.value.trim();
  if (!v) return;
  topicAddBtn.disabled = true;
  try {
    const created = await window.api.addTopic(activeTopicCat, v);
    if (!topicsData[activeTopicCat]) topicsData[activeTopicCat] = [];
    topicsData[activeTopicCat].push(created);
    topicInput.value = '';
    renderTopicList();
    flashSaved();
    topicInput.focus();
  } catch(e){ console.error('addTopic failed', e); }
  finally { topicAddBtn.disabled = false; }
}
topicAddBtn.addEventListener('click', addTopic);
topicInput.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); addTopic(); }
});
topicListEl.addEventListener('click', async (e) => {
  const del = e.target.closest('.topic-item-delete');
  if (!del || !activeTopicCat) return;
  const id = del.dataset.id;
  try {
    await window.api.deleteTopic(id);
    topicsData[activeTopicCat] = topicsData[activeTopicCat].filter(t => t.id !== id);
    renderTopicList();
    flashSaved();
  } catch(err){ console.error('deleteTopic failed', err); }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (topicDetailModal.classList.contains('open')) closeTopicDetail();
  else if (topicsModal.classList.contains('open')) closeTopicsModal();
});

/* ================================================================
   VERSIONS MODAL
   ================================================================ */
const versionsModal = document.getElementById('versionsModal');
const versionsScrim = document.getElementById('versionsScrim');
const versionListEl = document.getElementById('versionList');

async function setActiveVersion(key){
  if (!SCHEDULE_VERSIONS[key]) return;
  activeVersion = key;
  WEEK = SCHEDULE_VERSIONS[activeVersion].week;
  renderCalendar();
  renderStats();
  try { await window.api.setVersion(currentWeekId, key); flashSaved(); } catch(e){ console.error('setVersion failed', e); }
  renderVersionList();
}

function renderVersionList(){
  versionListEl.innerHTML = '';
  Object.entries(SCHEDULE_VERSIONS).forEach(([key, v]) => {
    const card = document.createElement('button');
    card.className = 'version-card' + (key === activeVersion ? ' active' : '');
    card.dataset.key = key;
    card.innerHTML = `
      <div class="version-card-head">
        <div class="version-card-title">${v.name}</div>
        <span class="version-card-badge">Active</span>
      </div>
      <div class="version-card-tagline">${v.tagline}</div>
      <div class="version-card-desc">${v.desc}</div>
      <div class="version-card-highlights">
        ${v.highlights.map(h => `<div class="version-card-highlight">${h}</div>`).join('')}
      </div>
    `;
    card.addEventListener('click', () => {
      setActiveVersion(key);
      setTimeout(closeVersionsModal, 200);
    });
    versionListEl.appendChild(card);
  });
}

function openVersionsModal(){
  renderVersionList();
  versionsModal.classList.add('open');
  versionsScrim.classList.add('open');
  versionsModal.setAttribute('aria-hidden', 'false');
}
function closeVersionsModal(){
  versionsModal.classList.remove('open');
  versionsScrim.classList.remove('open');
  versionsModal.setAttribute('aria-hidden', 'true');
}
document.getElementById('openVersions').addEventListener('click', openVersionsModal);
document.getElementById('closeVersions').addEventListener('click', closeVersionsModal);
versionsScrim.addEventListener('click', closeVersionsModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && versionsModal.classList.contains('open')) closeVersionsModal();
});

/* ================================================================
   THEME
   ================================================================ */
const themeBtn = document.getElementById('toggleTheme');
const iconMoon = document.getElementById('iconMoon');
const iconSun = document.getElementById('iconSun');
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  iconMoon.style.display = (t === 'dark') ? 'none' : 'block';
  iconSun.style.display  = (t === 'dark') ? 'block' : 'none';
}
function loadTheme(){
  const t = localStorage.getItem('schedule:theme');
  if (t){ applyTheme(t); return; }
  applyTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('schedule:theme', next);
});

/* ================================================================
   WEEK NAVIGATION
   ================================================================ */
async function loadWeekAndRender(){
  recomputeWeekDerived();
  renderCalendar();
  renderStats();
  try {
    const week = await window.api.getWeek(currentWeekId);
    const v = week.activeVersion;
    activeVersion = (v && SCHEDULE_VERSIONS[v]) ? v : 'v7';
    WEEK = SCHEDULE_VERSIONS[activeVersion].week;
    notesData = week.notes || [];
    renderCalendar();
    renderStats();
    if (panel.classList.contains('open')) renderNotes();
  } catch(e){ console.warn('week load failed', e); }
}

document.getElementById('weekPrev').addEventListener('click', async () => {
  currentWeekId = shiftWeek(currentWeekId, -1);
  await loadWeekAndRender();
});
document.getElementById('weekToday').addEventListener('click', async () => {
  currentWeekId = isoDate(mondayOf(new Date()));
  await loadWeekAndRender();
});
document.getElementById('weekNext').addEventListener('click', async () => {
  currentWeekId = shiftWeek(currentWeekId, +1);
  await loadWeekAndRender();
});

/* ================================================================
   INIT
   ================================================================ */
// Render calendar IMMEDIATELY (synchronously) so it appears even
// if the API is slow or fails.
loadTheme();
renderCalendar();

// Re-render on resize so any responsive change to --hour-px is honored
let rzTimer;
window.addEventListener('resize', () => {
  clearTimeout(rzTimer);
  rzTimer = setTimeout(renderCalendar, 150);
});

(async () => {
  await loadWeekAndRender();
  try { await loadTopics(); } catch(e){ console.warn('topics load failed', e); }
})();
