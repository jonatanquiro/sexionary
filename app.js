'use strict';

const CATEGORY_META = {
  rojo:    { label: 'Rojo',    color: '#e63946' },
  verde:   { label: 'Verde',   color: '#2a9d8f' },
  celeste: { label: 'Celeste', color: '#4cc9f0' },
  naranja: { label: 'Naranja', color: '#f77f00' }
};
const REAL_CATEGORIES = ['rojo', 'verde', 'celeste', 'naranja'];
const CHANGE_ALLOWED_CATEGORIES = ['rojo'];

const STORAGE_KEY = 'sexionary_state_v1';

let WORDS = null;

let state = {
  time: null,
  teamCount: null,
  teamNames: [],
  scores: [],
  currentTeamIndex: 0,
  usedWords: { rojo: [], verde: [], celeste: [], naranja: [] },
  pendingSetup: { time: null, teamCount: null }
};

let timerInterval = null;
let currentDraw = null; // { category, word }

// ---------- Utility ----------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function showScreen(id) {
  $all('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadWords() {
  const res = await fetch('words.json');
  WORDS = await res.json();
}

// ---------- Persistence ----------
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.teamNames || !parsed.teamNames.length) return false;
    state = parsed;
    return true;
  } catch (e) { return false; }
}
function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------- Setup screen ----------
function initSetupScreen() {
  $all('#time-options .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $all('#time-options .chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      state.pendingSetup.time = parseInt(chip.dataset.time, 10);
      validateSetup();
    });
  });

  $all('#team-count-options .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $all('#team-count-options .chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      state.pendingSetup.teamCount = parseInt(chip.dataset.teams, 10);
      renderTeamNameInputs(state.pendingSetup.teamCount);
      validateSetup();
    });
  });

  $('#btn-back-home').addEventListener('click', () => showScreen('screen-home'));
  $('#btn-start-game').addEventListener('click', startGame);
}

const TEAM_COLORS = ['#e63946', '#2a9d8f', '#4cc9f0', '#f77f00'];

function renderTeamNameInputs(count) {
  const container = $('#team-names-list');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'team-name-input';
    wrap.innerHTML = `
      <span class="dot" style="background:${TEAM_COLORS[i % TEAM_COLORS.length]}"></span>
      <input type="text" maxlength="20" placeholder="Equipo ${i + 1}" data-team-idx="${i}" value="Equipo ${i + 1}">
    `;
    container.appendChild(wrap);
  }
  validateSetup();
}

function validateSetup() {
  const ok = state.pendingSetup.time && state.pendingSetup.teamCount;
  $('#btn-start-game').disabled = !ok;
}

function startGame() {
  const time = state.pendingSetup.time;
  const teamCount = state.pendingSetup.teamCount;
  const inputs = $all('#team-names-list input');
  const names = inputs.map((inp, i) => (inp.value.trim() || `Equipo ${i + 1}`));

  state.time = time;
  state.teamCount = teamCount;
  state.teamNames = names;
  state.scores = names.map(() => 0);
  state.currentTeamIndex = 0;
  state.usedWords = { rojo: [], verde: [], celeste: [], naranja: [] };

  saveState();
  goToBoard();
}

// ---------- Board screen ----------
function goToBoard() {
  renderScoreboard();
  renderTurnIndicator();
  renderCategoryAvailability();
  showScreen('screen-board');
}

function renderScoreboard() {
  const el = $('#scoreboard');
  el.innerHTML = '';
  state.teamNames.forEach((name, i) => {
    const div = document.createElement('div');
    div.className = 'score-item' + (i === state.currentTeamIndex ? ' active-turn' : '');
    div.innerHTML = `<span class="name">${escapeHtml(name)}</span><span class="points">${state.scores[i]}</span>`;
    el.appendChild(div);
  });
}

function renderTurnIndicator() {
  $('#current-team-name').textContent = state.teamNames[state.currentTeamIndex];
}

function renderCategoryAvailability() {
  REAL_CATEGORIES.forEach(cat => {
    const total = (WORDS[cat] || []).length;
    const used = state.usedWords[cat].length;
    const btn = document.querySelector(`.cat-card[data-cat="${cat}"]`);
    btn.disabled = used >= total;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initBoardScreen() {
  $all('.cat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      drawCard(btn.dataset.cat);
    });
  });

  $('#btn-finish-game').addEventListener('click', () => {
    if (confirm('¿Seguro que querés finalizar el juego?')) {
      goToEnd();
    }
  });
}

// ---------- Card screen ----------
function drawCard(category) {
  const pool = WORDS[category] || [];
  const used = state.usedWords[category];
  const availableIdx = [];
  for (let i = 0; i < pool.length; i++) {
    if (!used.includes(i)) availableIdx.push(i);
  }
  if (availableIdx.length === 0) {
    alert('No quedan más palabras en esta categoría.');
    return;
  }
  const idx = availableIdx[Math.floor(Math.random() * availableIdx.length)];
  currentDraw = { category, word: pool[idx], idx, changed: false };

  const meta = CATEGORY_META[category];
  const label = $('#card-cat-label');
  label.textContent = meta.label;
  label.style.background = meta.color;
  label.style.color = (category === 'celeste') ? '#06283a' : '#fff';

  $('#card-team-label').textContent = state.teamNames[state.currentTeamIndex];

  $('#word-display').innerHTML = '<span class="word-hint">Preparate...</span>';
  $('#btn-reveal').classList.remove('hidden');
  $('#btn-reveal').disabled = false;
  $('#pre-timer-actions').classList.add('hidden');
  $('#result-actions').classList.add('hidden');

  const changeBtn = $('#btn-change-word');
  if (CHANGE_ALLOWED_CATEGORIES.includes(category)) {
    changeBtn.classList.remove('hidden');
  } else {
    changeBtn.classList.add('hidden');
  }

  const timerVal = $('#timer-value');
  const circle = $('#timer-circle');
  circle.classList.remove('warning', 'danger');
  timerVal.textContent = state.time;

  showScreen('screen-card');
}

function showCurrentWord() {
  $('#word-display').innerHTML = `<span class="word-text">${escapeHtml(currentDraw.word)}</span>`;
}

function initCardScreen() {
  $('#btn-reveal').addEventListener('click', () => {
    showCurrentWord();
    $('#btn-reveal').classList.add('hidden');
    $('#pre-timer-actions').classList.remove('hidden');
  });

  $('#btn-change-word').addEventListener('click', () => {
    if (currentDraw.changed) return;
    const category = currentDraw.category;
    const pool = WORDS[category] || [];
    const used = state.usedWords[category];

    // consume the discarded word so it never comes back
    if (!used.includes(currentDraw.idx)) used.push(currentDraw.idx);

    const availableIdx = [];
    for (let i = 0; i < pool.length; i++) {
      if (!used.includes(i)) availableIdx.push(i);
    }
    if (availableIdx.length === 0) {
      $('#btn-change-word').classList.add('hidden');
      return;
    }
    const idx = availableIdx[Math.floor(Math.random() * availableIdx.length)];
    currentDraw = { category, word: pool[idx], idx, changed: true };
    showCurrentWord();
    $('#btn-change-word').classList.add('hidden');
  });

  $('#btn-start-timer').addEventListener('click', () => {
    $('#pre-timer-actions').classList.add('hidden');
    $('#result-actions').classList.remove('hidden');
    startTimer();
  });

  $('#btn-correct').addEventListener('click', () => resolveCard('correct'));
  $('#btn-fail').addEventListener('click', () => resolveCard('fail'));
  $('#btn-pass').addEventListener('click', () => resolveCard('pass'));
}

function startTimer() {
  let remaining = state.time;
  const timerVal = $('#timer-value');
  const circle = $('#timer-circle');
  timerVal.textContent = remaining;
  clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    remaining--;
    timerVal.textContent = Math.max(remaining, 0);
    if (remaining <= state.time * 0.3) circle.classList.add('warning');
    if (remaining <= state.time * 0.15) circle.classList.add('danger');
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timeUp();
    }
  }, 1000);
}

function timeUp() {
  // time's up: word stays hidden result buttons still usable, but mark as failed automatically if no action
  $('#word-display').innerHTML = `<span class="word-text">${escapeHtml(currentDraw.word)}</span><br><span class="word-hint">¡Tiempo!</span>`;
}

function resolveCard(result) {
  clearInterval(timerInterval);

  const { category, idx } = currentDraw;
  if (!state.usedWords[category].includes(idx)) {
    state.usedWords[category].push(idx);
  }

  if (result === 'correct') {
    state.scores[state.currentTeamIndex]++;
  }
  // fail and pass: no point change, but card is consumed (não repeat)

  // advance turn (skip on pass too, still next team's turn)
  state.currentTeamIndex = (state.currentTeamIndex + 1) % state.teamNames.length;

  saveState();
  goToBoard();
}

// ---------- End screen ----------
function goToEnd() {
  clearInterval(timerInterval);
  const ranking = state.teamNames
    .map((name, i) => ({ name, points: state.scores[i] }))
    .sort((a, b) => b.points - a.points);

  const podium = $('#podium');
  podium.innerHTML = '';
  ranking.forEach((team, i) => {
    const div = document.createElement('div');
    div.className = 'podium-item' + (i === 0 ? ' first' : '');
    div.innerHTML = `<span><span class="rank">#${i + 1}</span>${escapeHtml(team.name)}</span><span class="pts">${team.points} pts</span>`;
    podium.appendChild(div);
  });

  clearState();
  showScreen('screen-end');
}

function initEndScreen() {
  $('#btn-play-again').addEventListener('click', () => {
    resetSetupForm();
    showScreen('screen-setup');
  });
}

// ---------- Home screen ----------
function initHomeScreen() {
  $('#btn-new-game').addEventListener('click', () => {
    resetSetupForm();
    showScreen('screen-setup');
  });
  $('#btn-continue-game').addEventListener('click', () => {
    goToBoard();
  });

  if (loadState()) {
    $('#btn-continue-game').classList.remove('hidden');
  }
}

function resetSetupForm() {
  state = {
    time: null,
    teamCount: null,
    teamNames: [],
    scores: [],
    currentTeamIndex: 0,
    usedWords: { rojo: [], verde: [], celeste: [], naranja: [] },
    pendingSetup: { time: null, teamCount: null }
  };
  $all('#time-options .chip').forEach(c => c.classList.remove('selected'));
  $all('#team-count-options .chip').forEach(c => c.classList.remove('selected'));
  $('#team-names-list').innerHTML = '';
  $('#btn-start-game').disabled = true;
}

// ---------- Init ----------
async function init() {
  await loadWords();
  initHomeScreen();
  initSetupScreen();
  initBoardScreen();
  initCardScreen();
  initEndScreen();

  if (state.teamNames && state.teamNames.length) {
    // there is saved state; home screen already shows "continue" button
  }
}

document.addEventListener('DOMContentLoaded', init);

// PWA service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
