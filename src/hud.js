const hud = document.createElement("div");
hud.id = "hud";
const distanceEl = document.createElement("div");
const killsEl = document.createElement("div");
distanceEl.className = "stat";
killsEl.className = "stat";
hud.append(distanceEl, killsEl);
document.body.appendChild(hud);

let lastDistance = -1;
let lastKills = -1;

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
