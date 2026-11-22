const hud = document.createElement("div");
hud.id = "hud";
const distanceEl = document.createElement("div");
const killsEl = document.createElement("div");
distanceEl.className = "stat";
killsEl.className = "stat";
const messageEl = document.createElement("div");
messageEl.id = "message";
hud.append(distanceEl, killsEl, messageEl);
document.body.appendChild(hud);

let lastDistance = -1;
let lastKills = -1;
let messageTimer = null;

export function showMessage(text, seconds = 2) {
  messageEl.textContent = text;
  messageEl.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => messageEl.classList.remove("visible"), seconds * 1000);
}

export function updateHud(distance, kills) {
  if (distance !== lastDistance) {
    distanceEl.textContent = `Distância: ${distance} m`;
    lastDistance = distance;
  }
  if (kills !== lastKills) {
    killsEl.textContent = `Zumbis mortos: ${kills}`;
    lastKills = kills;
  }
}
