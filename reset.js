const fs = require('fs');

// 🕒 calcule prochain vendredi
function getNextFridayMidnight() {
  const now = new Date();
  const next = new Date();

  const day = now.getDay();
  const diff = (5 - day + 7) % 7;

  next.setDate(now.getDate() + diff);
  next.setHours(0, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 7);
  }

  return next;
}

// 🔥 variable partagée (IMPORTANT)
let nextReset = getNextFridayMidnight();

// 🔄 reset data
function resetWeek() {
  fs.writeFileSync('./songs.json', JSON.stringify([], null, 2));
  fs.writeFileSync('./participants.json', JSON.stringify([], null, 2));
  console.log("🔄 Reset effectué");
}

// ⏰ scheduler
function scheduleReset() {
  const ms = nextReset - Date.now();

  setTimeout(() => {
    resetWeek();
    nextReset = getNextFridayMidnight(); // recalcul nouvelle semaine
    scheduleReset(); // boucle
  }, ms);
}

// 📡 pour synchroniser le timer dans index.js
function getNextReset() {
  return nextReset;
}

module.exports = {
  scheduleReset,
  getNextReset
};