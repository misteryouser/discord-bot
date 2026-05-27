require('dotenv').config();

const fs = require('fs');
const cron = require('node-cron');






const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  updateRecap,
  handleSongVote
} = require('./recap');

const {
  updateThemeRecap,
  handleThemeMessage,
  handleThemeVote,
  getWinningTheme,
  resetThemeVotes
} = require('./themes');

// salons
const DEFI_CHANNEL_ID = '1504807341395021864';
const DROP_CHANNEL_ID = '1504807631053918289';
const ARCHIVE_CHANNEL_ID = '1504807528142344202';

// fichiers
const PARTICIPANTS_FILE = './participants.json';
const SONGS_FILE = './songs.json';
const BOT_STATE_FILE = './botState.json';
const THEME_ARCHIVE_FILE = './themeArchive.json';

// thème par défaut
const DEFAULT_THEME = 'Libre!';

function ensureFile(path, defaultValue) {
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, JSON.stringify(defaultValue, null, 2));
  }
}

function loadJSON(path, defaultValue) {
  ensureFile(path, defaultValue);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

let participants = loadJSON(PARTICIPANTS_FILE, []);
let botState = loadJSON(BOT_STATE_FILE, {
  currentTheme: DEFAULT_THEME,
  challengeMessageId: null,
  nextResetAt: null
});

function saveParticipants() {
  saveJSON(PARTICIPANTS_FILE, participants);
}

function saveBotState() {
  saveJSON(BOT_STATE_FILE, botState);
}

function getNextMondayMidnight() {
  const now = new Date();

  const next = new Date(now);
  next.setHours(0, 0, 0, 0);

  const day = next.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;

  next.setDate(next.getDate() + daysUntilMonday);

  return next.getTime();
}

function getTimeLeft() {
  if (!botState.nextResetAt) {
    botState.nextResetAt = getNextMondayMidnight();
    saveBotState();
  }

  const diff = Math.max(0, botState.nextResetAt - Date.now());

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);

  return `${days}j ${hours}h ${minutes}m`;
}

function formatParticipants() {
  return participants.length > 0
    ? participants.map(id => `<@${id}>`).join('\n')
    : 'Aucun participant';
}

function createParticipateButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('participer')
      .setLabel('🎵 Participer')
      .setStyle(ButtonStyle.Primary)
  );
}

function getChallengeContent() {
  return ` Nouveau thème : **${botState.currentTheme}**

Faire un son à partir du thème de la semaine 🎶

⏳ Temps restant : **${getTimeLeft()}**

👥 Participants :
${formatParticipants()}`;
}

async function updateChallengeMessage(client) {
  const channel = client.channels.cache.get(DEFI_CHANNEL_ID);

  if (!channel) {
    console.log('❌ Salon défi introuvable');
    return;
  }

  const row = createParticipateButton();

  let message = null;

  if (botState.challengeMessageId) {
    try {
      message = await channel.messages.fetch(botState.challengeMessageId);
    } catch (err) {
      message = null;
    }
  }

  if (message) {
    await message.edit({
      content: getChallengeContent(),
      components: [row]
    });
  } else {
    const newMessage = await channel.send({
      content: getChallengeContent(),
      components: [row]
    });

    botState.challengeMessageId = newMessage.id;
    saveBotState();
  }
}

function archiveWinningTheme(winner) {
  const archive = loadJSON(THEME_ARCHIVE_FILE, []);

  archive.push({
    theme: winner ? winner.theme : DEFAULT_THEME,
    userId: winner ? winner.userId : null,
    votes: winner ? winner.votes || 0 : 0,
    date: new Date().toISOString()
  });

  saveJSON(THEME_ARCHIVE_FILE, archive);
}

async function rotateWeek(client) {
  const winner = getWinningTheme();

  if (winner && winner.theme) {
    botState.currentTheme = winner.theme;
    archiveWinningTheme(winner);
  } else {
    archiveWinningTheme(null);
  }

  botState.nextResetAt = getNextMondayMidnight();
  saveBotState();

  participants = [];
  saveJSON(PARTICIPANTS_FILE, []);

  saveJSON(SONGS_FILE, []);

  resetThemeVotes();

  await updateChallengeMessage(client);
  await updateRecap(client, botState.currentTheme);
  await updateThemeRecap(client);

  console.log(`🔄 Nouvelle semaine lancée avec le thème : ${botState.currentTheme}`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  if (!botState.nextResetAt) {
    botState.nextResetAt = getNextMondayMidnight();
    saveBotState();
  }

  await updateChallengeMessage(client);
  await updateRecap(client, botState.currentTheme);
  await updateThemeRecap(client);

  setInterval(async () => {
    await updateChallengeMessage(client);
  }, 60000);

  cron.schedule(
    '0 0 * * 1',
    async () => {
      await rotateWeek(client);
    },
    {
      timezone: 'Europe/Paris'
    }
  );
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('themevote_')) {
    await handleThemeVote(interaction, client);
    return;
  }

  if (interaction.customId.startsWith('vote_')) {
    const handled = await handleSongVote(interaction);

    if (handled) {
      await updateRecap(client, botState.currentTheme);
    }

    return;
  }

  if (interaction.customId === 'participer') {
    const userId = interaction.user.id;

    if (!participants.includes(userId)) {
      participants.push(userId);
      saveParticipants();
    }

    await interaction.reply({
      content: "✅ Tu es inscrit au défi !\n\n🎧 On attend ton banger dans #drop-my-song !",
      ephemeral: true
    });

    await updateChallengeMessage(client);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  await handleThemeMessage(message, client);

  if (message.channel.id !== DROP_CHANNEL_ID) return;
  if (message.attachments.size === 0) return;

  const file = message.attachments.first();
  const fileName = file.name.toLowerCase();

  if (
    !fileName.endsWith('.mp3') &&
    !fileName.endsWith('.wav')
  ) return;

  const song = {
    userId: message.author.id,
    url: file.url,
    week: botState.currentTheme
  };

  const songs = loadJSON(SONGS_FILE, []);
  songs.push(song);
  saveJSON(SONGS_FILE, songs);

  await updateRecap(client, botState.currentTheme);

  const archiveChannel = client.channels.cache.get(ARCHIVE_CHANNEL_ID);

  if (archiveChannel) {
    archiveChannel.send({
      content: `🎶 <@${message.author.id}> nous a encore pondu un classique !`,
      files: [file.url]
    });
  }
});

client.login(process.env.TOKEN);




