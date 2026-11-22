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