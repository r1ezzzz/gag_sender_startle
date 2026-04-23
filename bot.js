const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────
const BOT_TOKEN = '8432606941:AAGQFEVm-zHLnuTL2E1ftfbUEIrXY77UnYY';
const GROUP_ID = '-1003912990983';
const STOCK_API = 'https://www.gamersberg.com/api/v1/grow-a-garden/stock';
const FALLBACK_API = 'https://growagardenstock.com/api/stock';
const COOKIE_FILE = path.join(__dirname, 'cf_cookie.txt');

// Load or set default cf_clearance
let cfClearance = 'RqbfyFXOLiWh9EhSisftuTSRSjRbwRrwE3Bgj.6lDP8-1776957063-1.2.1.1-RNKUR0YPLCWJPfcfN2063huD6KZTzRAwVgkW.nV.3aw61_.U4augy3gSPajAXvAjPoefc6_xvcNMqcKVIhGLKc7D2u1PZSFFyRDWbhZYfMOsDJr1DTrazHrIdgViKezBxoK11xdeSscsiojUlLHMsSqgdruQzGjUv1tYF5YbM7tA8Qj1lvkM8uTIMQQqnvr8wAjiULkykP3CNdNDg8uSfGP5ydOHeM5iOLf7719CYfGCGrH84zA.iuol.RK1dsULh5axgeDSgcRquzau33ElZosIS5OwaT0qZcVG1cDGM8zpmriM_EaxgSlqhWkwgHkktBRdzPL56jFZtF4bncoGmw';

// Try to load saved cookie
try {
  if (fs.existsSync(COOKIE_FILE)) {
    cfClearance = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
    console.log('📂 Loaded cf_clearance from file');
  }
} catch (e) {}

function getApiHeaders() {
  return {
    'accept': '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'cookie': `cf_clearance=${cfClearance}`,
    'referer': 'https://www.gamersberg.com/grow-a-garden/stock',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="142", "Google Chrome";v="142"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  };
}

let usingFallback = false;

// ─── Rare items to track ────────────────────────────────────────
const RARE_SEEDS = [
  'Beanstalk', 'Sunflower', 'Giant Pinecone', 'Burning Bud',
  'Sugar Apple', 'Ember Lily', 'Elder Strawberry', 'Eggsnapper',
  'Octobloom', 'Alien Apple', 'Zebrazinkle', 'Pepper'
];

const RARE_GEAR = [
  'Godly Sprinkler', 'Advanced Sprinkler',
  'Grandmaster Sprinkler', 'Master Sprinkler'
];

// ─── Item name → emoji ──────────────────────────────────────────
const ITEM_EMOJI = {
  // Seeds
  'corn': '🌽', 'carrot': '🥕', 'strawberry': '🍓', 'tomato': '🍅',
  'blueberry': '🫐', 'bamboo': '🎋', 'broccoli': '🥦', 'buttercup': '🌼',
  'cocomango': '🥭', 'watermelon': '🍉', 'pumpkin': '🎃', 'apple': '🍎',
  'grape': '🍇', 'mushroom': '🍄', 'coconut': '🥥', 'mango': '🥭',
  'daffodil': '🌻', 'cacao': '🍫', 'romanesco': '🥦', 'cactus': '🌵',
  'dragon fruit': '🐉', 'crimson thorn': '🌹',
  // Rare seeds
  'beanstalk': '🌿', 'sunflower': '🌻', 'giant pinecone': '🌲',
  'burning bud': '🔥', 'sugar apple': '🍏', 'ember lily': '🌺',
  'elder strawberry': '🍓', 'eggsnapper': '🐊', 'octobloom': '🐙',
  'alien apple': '👽', 'zebrazinkle': '🦓', 'pepper': '🌶️',
  // Gear
  'trowel': '🔧', 'harvest tool': '🔨', 'trading ticket': '🎫',
  'recall wrench': '🔩', 'favorite tool': '⭐', 'watering can': '🚿',
  'pet lead': '🐾', 'pet name reroller': '🎲', 'friendship pot': '🫂',
  'cleaning spray': '🧹', 'magnifying glass': '🔍', 'medium treat': '🍖',
  'basic sprinkler': '💧', 'medium toy': '🧸', 'levelup lollipop': '🍭',
  'cleansing pet shard': '💎',
  'godly sprinkler': '💎', 'advanced sprinkler': '🔷',
  'grandmaster sprinkler': '👑', 'master sprinkler': '🏆',
  // Eggs
  'common egg': '🥚', 'uncommon egg': '🥚', 'rare egg': '🥚',
  'legendary egg': '🥚', 'mythical egg': '🥚', 'jungle egg': '🌴',
  'bug egg': '🐛', 'ocean egg': '🌊',
};

const CATEGORIES = {
  seeds: { title: 'Seeds', emoji: '🌱' },
  gear:  { title: 'Gear',  emoji: '⚙️' },
  event: { title: 'Event', emoji: '🎉' },
  egg:   { title: 'Egg',   emoji: '🥚' },
};

// ─── Bot init ────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let lastMessageId = null;
let cachedStockData = null;
let lastRareItems = new Set();

// ─── Helpers ─────────────────────────────────────────────────────

function getItemEmoji(name, category) {
  const lower = name.toLowerCase().trim();
  if (ITEM_EMOJI[lower]) return ITEM_EMOJI[lower];
  for (const [key, emoji] of Object.entries(ITEM_EMOJI)) {
    if (lower.includes(key) || key.includes(lower)) return emoji;
  }
  const fallbacks = { seeds: '🌱', gear: '🔧', egg: '🥚', event: '🎉' };
  return fallbacks[category] || '📦';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isRareItem(name, rareList) {
  const lower = name.toLowerCase();
  return rareList.some(rare => lower.includes(rare.toLowerCase()));
}

function getCurrentTime() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs - 8 * 3600000);
}

function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// ─── Fetch stock from Gamersberg API ─────────────────────────────

async function fetchStockData() {
  // Try Gamersberg API first (accurate real-time data)
  try {
    const res = await fetch(STOCK_API, { headers: getApiHeaders() });
    if (!res.ok) throw new Error(`Gamersberg API ${res.status}`);
    const json = await res.json();
    if (json.message === 'Unauthorized') throw new Error('cf_clearance expired');
    if (!json.success || !json.data || !json.data[0]) throw new Error('Invalid response');
    if (usingFallback) {
      console.log(`[${new Date().toISOString()}] ✅ Gamersberg API restored!`);
      usingFallback = false;
    }
    return json.data[0];
  } catch (primaryErr) {
    console.error(`[${new Date().toISOString()}] ⚠️ Gamersberg failed: ${primaryErr.message}`);
    if (!usingFallback) {
      usingFallback = true;
      console.log(`[${new Date().toISOString()}] 🔄 Switching to fallback API`);
      // Notify in group that cookie needs updating
      try {
        await bot.sendMessage(GROUP_ID,
          `⚠️ <b>CF Clearance expired!</b>\n\nUsing fallback API (may be less accurate).\n\nTo fix: Send /setcookie YOUR_NEW_COOKIE to the bot in DM.`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
    }

    // Fallback to growagardenstock.com API
    const res = await fetch(FALLBACK_API);
    if (!res.ok) throw new Error(`Fallback API ${res.status}`);
    const data = await res.json();

    // Convert old format to new format
    return convertOldFormat(data);
  }
}

/**
 * Convert the old growagardenstock.com format to the Gamersberg format
 */
function convertOldFormat(data) {
  const result = { seeds: {}, gear: {}, eggs: [], event: {} };

  // Parse seeds array: [":GaG_Corn: Corn **x4**", ...]
  if (data.seeds) {
    for (const raw of data.seeds) {
      let cleaned = raw.replace(/:[A-Za-z0-9_]+:/g, '').trim();
      const match = cleaned.match(/(.+?)\s*\*\*x(\d+)\*\*/);
      if (match) {
        result.seeds[match[1].trim()] = match[2];
      }
    }
  }

  // Parse gear array
  if (data.gear) {
    for (const raw of data.gear) {
      let cleaned = raw.replace(/:[A-Za-z0-9_]+:/g, '').trim();
      const match = cleaned.match(/(.+?)\s*\*\*x(\d+)\*\*/);
      if (match) {
        result.gear[match[1].trim()] = match[2];
      }
    }
  }

  // Parse egg array
  if (data.egg) {
    for (const raw of data.egg) {
      let cleaned = raw.replace(/:[A-Za-z0-9_]+:/g, '').trim();
      const match = cleaned.match(/(.+?)\s*\*\*x(\d+)\*\*/);
      if (match) {
        result.eggs.push({ name: match[1].trim(), quantity: parseInt(match[2], 10) });
      }
    }
  }

  return result;
}

/**
 * Parse object-style stock data { "Carrot": "14", "Corn": "0" }
 * Returns array of { name, qty, emoji } with qty > 0
 */
function parseObjectStock(obj, category) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .map(([name, qtyStr]) => ({
      name,
      qty: parseInt(qtyStr, 10) || 0,
      emoji: getItemEmoji(name, category),
    }))
    .filter(i => i.qty > 0)
    .sort((a, b) => b.qty - a.qty);
}

/**
 * Parse array-style egg data [{ name: "Common Egg", quantity: 2 }]
 * Returns array of { name, qty, emoji } with qty > 0
 */
function parseEggStock(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(e => ({
      name: e.name,
      qty: e.quantity || 0,
      emoji: getItemEmoji(e.name, 'egg'),
    }))
    .filter(i => i.qty > 0)
    .sort((a, b) => b.qty - a.qty);
}

// ─── Build the main message ──────────────────────────────────────

function buildMainMessage(data) {
  const now = getCurrentTime();
  const timeStr = formatTime(now);
  const dateStr = formatDate(now);

  const seedItems = parseObjectStock(data.seeds, 'seeds');
  const rareSeeds = seedItems.filter(i => isRareItem(i.name, RARE_SEEDS));
  const gearItems = parseObjectStock(data.gear, 'gear');
  const rareGear = gearItems.filter(i => isRareItem(i.name, RARE_GEAR));
  const eggItems = parseEggStock(data.eggs);
  const eventItems = parseObjectStock(data.event, 'event');

  let msg = '';

  // ── Header ──
  msg += `🏡🌿 <b>GROW A GARDEN</b> 🌿🏡\n`;
  msg += `         <b>STOCK MONITOR</b>\n\n`;
  msg += `⏰ ${timeStr}  ┃  📅 ${dateStr}\n`;
  msg += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;

  // ── Rare Seeds ──
  const seedStatus = rareSeeds.length > 0 ? '🟢' : '🔴';
  msg += `🌱 <b>RARE SEEDS</b>  ${seedStatus}\n`;
  if (rareSeeds.length > 0) {
    for (let i = 0; i < rareSeeds.length; i++) {
      const item = rareSeeds[i];
      const connector = i === rareSeeds.length - 1 ? '└' : '├';
      msg += `   ${connector} ${item.emoji} ${escapeHtml(item.name)} ── <b>x${item.qty}</b>\n`;
    }
  } else {
    msg += `   └ <i>None in stock</i>\n`;
  }
  msg += `\n`;

  // ── Rare Gear ──
  const gearStatus = rareGear.length > 0 ? '🟢' : '🔴';
  msg += `⚙️ <b>RARE GEAR</b>  ${gearStatus}\n`;
  if (rareGear.length > 0) {
    for (let i = 0; i < rareGear.length; i++) {
      const item = rareGear[i];
      const connector = i === rareGear.length - 1 ? '└' : '├';
      msg += `   ${connector} ${item.emoji} ${escapeHtml(item.name)} ── <b>x${item.qty}</b>\n`;
    }
  } else {
    msg += `   └ <i>None in stock</i>\n`;
  }
  msg += `\n`;

  // ── Eggs ──
  const eggStatus = eggItems.length > 0 ? '🟢' : '🔴';
  msg += `🥚 <b>EGGS</b>  ${eggStatus}\n`;
  if (eggItems.length > 0) {
    for (let i = 0; i < eggItems.length; i++) {
      const item = eggItems[i];
      const connector = i === eggItems.length - 1 ? '└' : '├';
      msg += `   ${connector} ${item.emoji} ${escapeHtml(item.name)} ── <b>x${item.qty}</b>\n`;
    }
  } else {
    msg += `   └ <i>None in stock</i>\n`;
  }
  msg += `\n`;

  // ── Events ──
  if (eventItems.length > 0) {
    msg += `🎉 <b>EVENT</b>  🟢\n`;
    for (let i = 0; i < eventItems.length; i++) {
      const item = eventItems[i];
      const connector = i === eventItems.length - 1 ? '└' : '├';
      msg += `   ${connector} ${item.emoji} ${escapeHtml(item.name)} ── <b>x${item.qty}</b>\n`;
    }
    msg += `\n`;
  }

  // ── Weather ──
  if (data.weather && data.weather.type) {
    const weatherEmojis = {
      'Thunderstorm': '⛈️', 'Rain': '🌧️', 'Sunny': '☀️',
      'Cloudy': '☁️', 'Windy': '💨', 'Snow': '❄️',
      'Heatwave': '🔥', 'Rainbow': '🌈',
    };
    const wEmoji = weatherEmojis[data.weather.type] || '🌤️';
    msg += `${wEmoji} <b>Weather:</b> ${escapeHtml(data.weather.type)}`;
    if (data.weather.duration) {
      msg += ` (${Math.floor(data.weather.duration / 60)}m)`;
    }
    msg += `\n\n`;
  }

  // ── Footer ──
  msg += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n`;
  msg += `🔄 <i>Auto-updates every 5 min</i>\n\n`;
  msg += `👇 <b>View full stock by category:</b>`;

  // ── Keyboard ──
  const keyboard = { inline_keyboard: [
    [
      { text: `🌱 Seeds (${seedItems.length})`, callback_data: 'cat_seeds' },
      { text: `⚙️ Gear (${gearItems.length})`, callback_data: 'cat_gear' },
    ],
    [
      { text: `🎉 Event (${eventItems.length})`, callback_data: 'cat_event' },
      { text: `🥚 Egg (${eggItems.length})`, callback_data: 'cat_egg' },
    ],
    [
      { text: '🔄 Refresh', callback_data: 'refresh' },
    ],
  ]};

  const hasRares = rareSeeds.length > 0 || rareGear.length > 0;
  const rareNames = [...rareSeeds, ...rareGear].map(i => `${i.emoji} ${i.name}`);
  return { message: msg, keyboard, hasRares, rareNames };
}

// ─── Category popup for callbacks ────────────────────────────────

function buildCategoryPopup(categoryKey, data) {
  const config = CATEGORIES[categoryKey];
  if (!config) return null;

  let items;
  if (categoryKey === 'egg') {
    items = parseEggStock(data.eggs);
  } else if (categoryKey === 'event') {
    items = parseObjectStock(data.event, 'event');
  } else {
    items = parseObjectStock(data[categoryKey], categoryKey);
  }

  if (items.length === 0) {
    return `${config.emoji} ${config.title.toUpperCase()}\n━━━━━━━━━━━━━━\n❌ No items in stock`;
  }

  let text = `${config.emoji} ${config.title.toUpperCase()} (${items.length})\n`;
  text += `━━━━━━━━━━━━━━\n`;

  for (const item of items) {
    const line = `${item.emoji} ${item.name} ×${item.qty}\n`;
    if (text.length + line.length > 195) {
      text += `...`;
      break;
    }
    text += line;
  }

  return text;
}

// ─── Main fetch & send ───────────────────────────────────────────

async function fetchAndSendStock() {
  try {
    console.log(`[${new Date().toISOString()}] Fetching stock...`);

    const data = await fetchStockData();
    cachedStockData = data;

    const { message, keyboard, hasRares, rareNames } = buildMainMessage(data);

    let sent = false;
    if (lastMessageId) {
      try {
        await bot.editMessageText(message, {
          chat_id: GROUP_ID,
          message_id: lastMessageId,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        console.log(`[${new Date().toISOString()}] ✅ Edited #${lastMessageId}`);
        sent = true;
      } catch (e) {
        console.log(`[${new Date().toISOString()}] ⚠️ Edit failed: ${e.message}`);
      }
    }

    if (!sent) {
      try {
        const result = await bot.sendMessage(GROUP_ID, message, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        lastMessageId = result.message_id;
        console.log(`[${new Date().toISOString()}] ✅ Sent #${lastMessageId}`);
      } catch (e) {
        console.error(`[${new Date().toISOString()}] ❌ Send failed: ${e.message}`);
      }
    }

    // Ping everyone if NEW rare items appeared
    if (hasRares) {
      const currentRares = new Set(rareNames);
      const newRares = rareNames.filter(r => !lastRareItems.has(r));

      if (newRares.length > 0) {
        const pingMsg =
          `🚨🚨🚨 <b>RARE ITEM ALERT!</b> 🚨🚨🚨\n\n` +
          newRares.map(r => `⭐ ${r}`).join('\n') +
          `\n\n@everyone`;

        try {
          await bot.sendMessage(GROUP_ID, pingMsg, { parse_mode: 'HTML' });
          console.log(`[${new Date().toISOString()}] 🚨 Pinged for: ${newRares.join(', ')}`);
        } catch (e) {
          console.error(`[${new Date().toISOString()}] ❌ Ping failed: ${e.message}`);
        }
      }

      lastRareItems = currentRares;
    } else {
      lastRareItems = new Set();
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ ${err.message}`);
  }
}

// ─── Callback handler ────────────────────────────────────────────

bot.on('callback_query', async (query) => {
  try {
    const action = query.data;

    if (action === 'refresh') {
      await bot.answerCallbackQuery(query.id, { text: '🔄 Refreshing...' });
      await fetchAndSendStock();
      return;
    }

    if (action.startsWith('cat_')) {
      const key = action.replace('cat_', '');

      // Always fetch fresh data
      const data = await fetchStockData();
      cachedStockData = data;

      const detail = buildCategoryPopup(key, data);
      if (!detail) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Unknown' });
        return;
      }

      await bot.answerCallbackQuery(query.id, {
        text: detail,
        show_alert: true,
      });
      return;
    }

    await bot.answerCallbackQuery(query.id, { text: '❓ Unknown' });
  } catch (err) {
    console.error('Callback error:', err.message);
    try { await bot.answerCallbackQuery(query.id, { text: '❌ Error' }); } catch (e) {}
  }
});

// ─── /setcookie command to update cf_clearance ───────────────────

bot.onText(/\/setcookie (.+)/, async (msg, match) => {
  const newCookie = match[1].trim();
  cfClearance = newCookie;

  // Save to file for persistence
  try {
    fs.writeFileSync(COOKIE_FILE, newCookie);
  } catch (e) {}

  usingFallback = false;
  console.log(`[${new Date().toISOString()}] 🍪 Cookie updated by user ${msg.from.id}`);

  await bot.sendMessage(msg.chat.id, '✅ CF Clearance cookie updated! Fetching fresh data...');
  await fetchAndSendStock();
});

bot.on('polling_error', (err) => {
  if (!err.message.includes('409')) console.error(`Polling: ${err.message}`);
});

// ─── Schedule aligned to 5-min marks ─────────────────────────────

function scheduleAligned() {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const next = Math.ceil(now / fiveMin) * fiveMin;
  const delay = next - now;
  console.log(`⏰ Next update in ${Math.round(delay / 1000)}s`);
  setTimeout(() => {
    fetchAndSendStock();
    setInterval(fetchAndSendStock, fiveMin);
  }, delay);
}

// ─── Start ───────────────────────────────────────────────────────
console.log('🌿 Grow A Garden Stock Bot (Gamersberg API)');
console.log(`   Group: ${GROUP_ID}`);
fetchAndSendStock();
scheduleAligned();
console.log('✅ Running!');
