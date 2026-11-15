// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money,
// killfeed, buy menu, banners and the overlays. It never touches the
// simulation; the sim pushes numbers in and reads callbacks out. Every setter
// caches its last value so the DOM is only touched when something changed.
import { WEAPON_DEFS, GRENADE_DEFS, BUY_ORDER } from './weapons.js';

const COPY = {
  start: {
    title: 'DUSKLINE',
    copy: 'Foundry Yard at dusk. Ember attacks, Frost defends. Plant the spike at Furnace (A) or Silo (B) — or eliminate the other team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSKLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Watching your team. The round plays on.',
    action: 'Keep watching',
  },
};

export function createHud(onBuy) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeLine = $('grenade-line');
  const timerEl = $('timer');
  const scoreEl = $('score');
  const moneyEl = $('money');
  const aliveEl = $('alive');
  const killfeed = $('killfeed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const damage = $('damage');
  const flashEl = $('flash');
  const channel = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const spikeEl = $('spike');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Build the buy menu once from the weapon definitions.
  const buyRows = {};
  for (const id of BUY_ORDER) {
    const def = WEAPON_DEFS[id] ?? GRENADE_DEFS[id];
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.dataset.item = id;
    const key = BUY_ORDER.indexOf(id) + 1;
    row.innerHTML = `<span class="buy-key">${key}</span><span class="buy-name">${def.name}</span><span class="buy-desc">${def.kind ?? def.blurb}</span><span class="buy-price">$${def.price}</span>`;
    row.addEventListener('click', () => onBuy(id));
    buyList.appendChild(row);
    buyRows[id] = row;
  }

  return {
    setHealth(hp) {
      if (last.hp === hp) return;
      last.hp = hp;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(frag, flash, sel) {
      setText(grenadeLine, 'nades', `Frag ${frag} · Flash ${flash} — [G] ${sel === 'frag' ? 'Frag' : 'Flash'} · [Q] swap`);
    },
    setTimer(seconds, planted, spikeT) {
      const t = planted ? spikeT : seconds;
      const s = Math.max(0, Math.ceil(t));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('planted', planted);
    },
    setScore(ember, frost, round) {
      setText(scoreEl, 'score', `EMBER ${ember} — ${frost} FROST · ROUND ${round}`);
    },
    setMoney(m) {
      setText(moneyEl, 'money', `$${m}`);
    },
    setAlive(ember, frost) {
      setText(aliveEl, 'alive', `Ember ${ember} alive · Frost ${frost} alive`);
    },
    setSpike(text) {
      setText(spikeEl, 'spike', text);
    },
    setCrosshair(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 120) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 180);
    },
    flashBlind(opacity) {
      flashEl.style.opacity = String(opacity);
    },
    channel(frac, label) {
      if (frac == null) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelFill.style.width = `${Math.round(frac * 100)}%`;
      channelLabel.textContent = label;
    },
    banner(titleText, sub, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub ?? '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    killfeed(kills) {
      killfeed.innerHTML = kills.map((k) => {
        const head = k.headshot ? ' <span class="hs">HEADSHOT</span>' : '';
        return `<div>${k.killer} ▸ ${k.victim}${head}</div>`;
      }).join('');
    },
    showBuy(money, owned) {
      buyMenu.hidden = false;
      for (const id of BUY_ORDER) {
        const row = buyRows[id];
        const def = WEAPON_DEFS[id] ?? GRENADE_DEFS[id];
        const isOwned = owned.includes(id);
        row.classList.toggle('owned', isOwned);
        row.classList.toggle('poor', !isOwned && money < def.price);
      }
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = extra ?? text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showMatchEnd(winner, ember, frost) {
      title.textContent = winner === 'ember' ? 'EMBER TAKES THE YARD' : 'FROST HOLDS THE YARD';
      copy.textContent = `Final score Ember ${ember} — ${frost} Frost.`;
      play.textContent = 'Play again';
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
