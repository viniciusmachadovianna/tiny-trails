const hud = document.createElement("div");
hud.id = "hud";

const distanceEl = document.createElement("div");
const killsEl = document.createElement("div");
distanceEl.className = "stat stat-distance";
killsEl.className = "stat stat-kills";

const messageEl = document.createElement("div");
messageEl.id = "message";

hud.append(distanceEl, killsEl, messageEl);
document.body.appendChild(hud);

let lastDistance = -1;
let lastKills = -1;
let bestDistance = 0;
let bestKills = 0;
let startBestDistance = 0; // recordes no começo da partida atual (para saber se bateu algum)
let startBestKills = 0;
let messageTimer = null;
let bumpTimer = null;

export function showMessage(text, seconds = 2) {
  messageEl.textContent = text;
  messageEl.classList.toggle("horde-warning", /horda/i.test(text));
  messageEl.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    messageEl.classList.remove("visible", "horde-warning");
  }, seconds * 1000);
}

export function updateHud(distance, kills) {
  if (distance !== lastDistance) {
    lastDistance = distance;
    bestDistance = Math.max(bestDistance, distance);
    distanceEl.innerHTML = `
      <span class="stat-label">📏 Distância</span>
      <span class="stat-value">${distance} m</span>
      <span class="stat-best">Rec: ${bestDistance} m</span>
    `;
  }

  if (kills !== lastKills) {
    const gainedKill = kills > lastKills && lastKills >= 0;
    lastKills = kills;
    bestKills = Math.max(bestKills, kills);
    killsEl.innerHTML = `
      <span class="stat-label">🧟 Zumbis mortos</span>
      <span class="stat-value">${kills}</span>
      <span class="stat-best">Rec: ${bestKills}</span>
    `;

    if (gainedKill) {
      killsEl.classList.remove("bump");
      void killsEl.offsetWidth;
      killsEl.classList.add("bump");
      clearTimeout(bumpTimer);
      bumpTimer = setTimeout(() => killsEl.classList.remove("bump"), 180);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Botão de pausa + tela de pausa / fim de jogo ("Renascer").
// Tudo é criado por código (como o HUD acima), então não precisa mexer no HTML.
// ---------------------------------------------------------------------------------------------

const actions = { togglePause() {}, respawn() {} };

// O main.js registra aqui o que cada botão faz.
export function bindHudActions(next) {
  Object.assign(actions, next);
}

const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
const ICON_PLAY =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>';

const pauseBtn = document.createElement("button");
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";

function setPauseButton(paused) {
  pauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
  const label = paused ? "Continuar (P)" : "Pausar (P)";
  pauseBtn.title = label;
  pauseBtn.setAttribute("aria-label", label);
}
setPauseButton(false);

// blur(): sem isso o botão fica com foco e a barra de espaço (tiro) acionaria o botão.
pauseBtn.addEventListener("click", () => {
  pauseBtn.blur();
  actions.togglePause();
});

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.hidden = true;

const panel = document.createElement("div");
panel.className = "panel";
panel.setAttribute("role", "dialog");
panel.setAttribute("aria-modal", "true");
panel.setAttribute("aria-labelledby", "overlay-title");

const titleEl = document.createElement("h2");
titleEl.id = "overlay-title";
const subEl = document.createElement("p");
subEl.className = "overlay-sub";
const statsEl = document.createElement("div");
statsEl.className = "overlay-stats";
const badgeEl = document.createElement("div");
badgeEl.className = "overlay-badge";
const actionBtn = document.createElement("button");
actionBtn.type = "button";
actionBtn.className = "overlay-btn";
const hintEl = document.createElement("p");
hintEl.className = "overlay-hint";

panel.append(titleEl, subEl, statsEl, badgeEl, actionBtn, hintEl);
overlay.appendChild(panel);
document.body.append(pauseBtn, overlay);

let mode = null;
let unlockTimer = null;

actionBtn.addEventListener("click", () => {
  actionBtn.blur();
  if (mode === "dead") actions.respawn();
  else actions.togglePause();
});

// Chamado ao começar uma partida nova (depois de renascer).
export function beginRun() {
  startBestDistance = bestDistance;
  startBestKills = bestKills;
}

// kind: "pause" ou "dead". Para "dead", data = { distance, kills, text, lockMs }.
// Devolve true se a partida que acabou bateu algum recorde.
export function showOverlay(kind, data = {}) {
  mode = kind;
  clearTimeout(unlockTimer);
  overlay.hidden = false;
  overlay.dataset.mode = kind;
  let record = false;

  if (kind === "dead") {
    const { distance = 0, kills = 0, text = "", lockMs = 0 } = data;
    // Só comemora recorde se já existia um recorde anterior para bater.
    const newDistance = startBestDistance > 0 && distance > startBestDistance;
    const newKills = startBestKills > 0 && kills > startBestKills;
    record = newDistance || newKills;
    bestDistance = Math.max(bestDistance, distance);
    bestKills = Math.max(bestKills, kills);

    titleEl.textContent = "Você morreu";
    subEl.textContent = text;
    statsEl.innerHTML = `
      <span class="os-label">📏 Distância</span><strong>${distance} m</strong><em>Rec: ${bestDistance} m</em>
      <span class="os-label">🧟 Zumbis mortos</span><strong>${kills}</strong><em>Rec: ${bestKills}</em>
    `;
    statsEl.hidden = false;
    badgeEl.textContent = !record
      ? ""
      : newDistance && newKills
        ? "🏆 Novos recordes!"
        : newDistance
          ? "🏆 Novo recorde de distância!"
          : "🏆 Novo recorde de zumbis!";
    badgeEl.hidden = !record;
    actionBtn.textContent = "↻ Renascer";
    hintEl.textContent = "ou aperte Enter / R";
    // Trava o botão por um instante: quem estava atirando/andando na hora da morte não renasce sem querer.
    actionBtn.disabled = lockMs > 0;
    if (lockMs > 0) {
      unlockTimer = setTimeout(() => {
        actionBtn.disabled = false;
      }, lockMs);
    }
    pauseBtn.hidden = true;
  } else {
    titleEl.textContent = "Pausado";
    subEl.textContent = "O jogo está parado.";
    statsEl.hidden = true;
    badgeEl.hidden = true;
    actionBtn.textContent = "▶ Continuar";
    hintEl.textContent = "P, Esc ou Enter para continuar · M liga/desliga o som";
    actionBtn.disabled = false;
    pauseBtn.hidden = false;
    setPauseButton(true);
  }
  return record;
}

export function hideOverlay() {
  mode = null;
  clearTimeout(unlockTimer);
  overlay.hidden = true;
  pauseBtn.hidden = false;
  setPauseButton(false);
}
