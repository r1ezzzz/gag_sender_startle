const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// ─── Configuration ───────────────────────────────────────────────
const BOT_TOKEN = '8432606941:AAGQFEVm-zHLnuTL2E1ftfbUEIrXY77UnYY';
const GROUP_ID = '-1003912990983';
const STOCK_API = 'https://growagardenstock.com/api/stock';

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

// ─── Discord emoji code → Unicode ────────────────────────────────
const DISCORD_EMOJI_MAP = {
  ':GaG_Corn:': '🌽', ':GaG_BlueBerry:': '🫐', ':GaG_Carrot:': '🥕',
  ':GaG_Bamboo:': '🎋', ':Strawberry:': '🍓', ':Tomato:': '🍅',
  ':Trowel:': '🔧', ':HarvestTool:': '🔨', ':trading_ticket:': '🎫',
  ':RecallWrench:': '🔩', ':FavoriteTool:': '⭐', ':WateringCan:': '🚿',
  ':CommonEgg:': '🥚', ':RareEgg:': '🥚', ':LegendaryEgg:': '🥚',
  ':MythicalEgg:': '🥚',
};

// ─── Item name → emoji (fallback for items without discord codes) ─
const ITEM_EMOJI = {
  // Seeds - Common
  'corn': '🌽',
  'carrot': '🥕',
  'strawberry': '🍓',
  'tomato': '🍅',
  'blueberry': '🫐',
  'bamboo': '🎋',
  'broccoli': '🥦',
  'buttercup': '🌼',
  'cocomango': '🥭',
  'watermelon': '🍉',
  'pumpkin': '🎃',
  'apple': '🍎',
  'orange': '🍊',
  'grape': '🍇',
  'lemon': '🍋',
  'pineapple': '🍍',
  'cherry': '🍒',
  'peach': '🍑',
  'mushroom': '🍄',
  'potato': '🥔',
  'onion': '🧅',
  'garlic': '🧄',
  'lettuce': '🥬',
  'cucumber': '🥒',
  'avocado': '🥑',
  'coconut': '🥥',
  'mango': '🥭',
  'banana': '🍌',
  'melon': '🍈',
  'pear': '🍐',
  'kiwi': '🥝',

  // Seeds - Rare
  'beanstalk': '🌿',
  'sunflower': '🌻',
  'giant pinecone': '🌲',
  'burning bud': '🔥',
  'sugar apple': '🍏',
  'ember lily': '🌺',
  'elder strawberry': '🍓',
  'eggsnapper': '🐊',
  'octobloom': '🐙',
  'alien apple': '👽',
  'zebrazinkle': '🦓',
  'pepper': '🌶️',

  // Gear
  'trowel': '🔧',
  'harvest tool': '🔨',
  'trading ticket': '🎫',
  'recall wrench': '🔩',
  'favorite tool': '⭐',
  'watering can': '🚿',
  'pet lead': '🐾',
  'pet name reroller': '🎲',
  'godly sprinkler': '💎',
  'advanced sprinkler': '🔷',
  'grandmaster sprinkler': '👑',
  'master sprinkler': '🏆',
  'sprinkler': '💧',
  'lightning rod': '⚡',
  'speed boots': '👟',

  // Eggs
  'common egg': '🥚',
  'uncommon egg': '🥚',
  'rare egg': '🥚',
  'legendary egg': '🥚',
  'mythical egg': '🥚',
  'jungle egg': '🌴',
  'ocean egg': '🌊',
  'desert egg': '🏜️',
  'arctic egg': '❄️',
  'volcanic egg': '🌋',
  'crystal egg': '💎',
  'golden egg': '✨',
  'shadow egg': '🌑',
  'celestial egg': '🌟',
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

// ─── Helpers ─────────────────────────────────────────────────────

function replaceDiscordEmojis(text) {
  let result = text;
  for (const [code, emoji] of Object.entries(DISCORD_EMOJI_MAP)) {
    result = result.split(code).join(emoji);
  }
  // Remove any remaining unrecognized :emoji: codes
  result = result.replace(/:[A-Za-z0-9_]+:/g, '');
  return result.trim();
}

function getItemEmoji(name, category) {
  const lower = name.toLowerCase().trim();

  // Check exact match first
  if (ITEM_EMOJI[lower]) return ITEM_EMOJI[lower];

  // Check partial match
  for (const [key, emoji] of Object.entries(ITEM_EMOJI)) {
    if (lower.includes(key) || key.includes(lower)) return emoji;
  }

  // Fallback by category
  const fallbacks = {
    seeds: '🌱',
    gear: '🔧',
    egg: '🥚',
    event: '🎉',
  };
  return fallbacks[category] || '📦';
}

function parseItem(raw, category) {
  // Check if the raw string had a discord emoji code
  const hadDiscordEmoji = /:[A-Za-z0-9_]+:/.test(raw);

  const cleaned = replaceDiscordEmojis(raw);
  const match = cleaned.match(/\*\*x(\d+)\*\*/);
  const qty = match ? parseInt(match[1], 10) : 0;

  // Remove qty
  let name = cleaned.replace(/\*\*x\d+\*\*/, '').trim();

  // Check if name already starts with an emoji (from discord code replacement)
  const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/u;
  const alreadyHasEmoji = emojiRegex.test(name);

  let emoji = '';
  if (alreadyHasEmoji) {
    // Extract the existing emoji and clean name
    const parts = name.match(/^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]+)\s*(.*)/u);
    if (parts) {
      emoji = parts[1];
      name = parts[2].trim();
    }
  } else {
    // No emoji from API, assign one based on name
    emoji = getItemEmoji(name, category);
  }

  return { name, qty, emoji };
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

// ─── Build the main message ──────────────────────────────────────

function buildMainMessage(data) {
  const now = getCurrentTime();
  const timeStr = formatTime(now);
  const dateStr = formatDate(now);

  const seedItems = (data.seeds || []).map(r => parseItem(r, 'seeds')).filter(i => i.qty > 0);
  const rareSeeds = seedItems.filter(i => isRareItem(i.name, RARE_SEEDS));
  const gearItems = (data.gear || []).map(r => parseItem(r, 'gear')).filter(i => i.qty > 0);
  const rareGear = gearItems.filter(i => isRareItem(i.name, RARE_GEAR));
  const eggItems = (data.egg || []).map(r => parseItem(r, 'egg')).filter(i => i.qty > 0);
  const eventItems = (data.event || []).map(r => parseItem(r, 'event')).filter(i => i.qty > 0);

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

// ─── Category detail for callbacks ───────────────────────────────

function buildCategoryPopup(categoryKey, data) {
  const config = CATEGORIES[categoryKey];
  if (!config) return null;

  const items = (data[categoryKey] || [])
    .map(r => parseItem(r, categoryKey))
    .filter(i => i.qty > 0)
    .sort((a, b) => b.qty - a.qty);

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

// Track previously seen rare items to avoid spamming pings
let lastRareItems = new Set();

async function fetchAndSendStock() {
  try {
    console.log(`[${new Date().toISOString()}] Fetching stock...`);

    const res = await fetch(STOCK_API);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
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
          const pingResult = await bot.sendMessage(GROUP_ID, pingMsg, {
            parse_mode: 'HTML',
          });
          console.log(`[${new Date().toISOString()}] 🚨 Pinged for rare items: ${newRares.join(', ')}`);
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

      // Always fetch fresh data for popups
      const res = await fetch(STOCK_API);
      const data = await res.json();
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
console.log('🌿 Grow A Garden Stock Bot');
console.log(`   Group: ${GROUP_ID}`);
fetchAndSendStock();
scheduleAligned();
console.log('✅ Running!');
