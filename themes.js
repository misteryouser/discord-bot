const fs = require('fs');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const THEME_CHANNEL_ID = '1505934152455950487';
const THEMES_FILE = './themes.json';
const THEME_STATE_FILE = './themeState.json';

function ensureThemeFiles() {
  if (!fs.existsSync(THEMES_FILE)) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(THEME_STATE_FILE)) {
    fs.writeFileSync(THEME_STATE_FILE, JSON.stringify({}, null, 2));
  }
}

function loadThemes() {
  ensureThemeFiles();
  return JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
}

function saveThemes(themes) {
  fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));
}

function loadThemeState() {
  ensureThemeFiles();
  return JSON.parse(fs.readFileSync(THEME_STATE_FILE, 'utf8'));
}

function saveThemeState(state) {
  fs.writeFileSync(THEME_STATE_FILE, JSON.stringify(state, null, 2));
}

function createThemeVoteButtons(themes) {
  if (themes.length === 0) return null;

  const row = new ActionRowBuilder();

  themes.slice(0, 5).forEach((theme, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`themevote_${index}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Success)
    );
  });

  return row;
}

async function updateThemeRecap(client) {
  const channel = client.channels.cache.get(THEME_CHANNEL_ID);

  if (!channel) {
    console.log("❌ Salon thème introuvable");
    return;
  }

  const themes = loadThemes();
  const state = loadThemeState();

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle("🎨 Thème de la prochaine semaine")
    .setDescription(
      "Une envie de thème en particulier ? Écris-le dans ce salon.\n\n" +
      "Tu ne peux proposer qu’un seul thème. Si tu en renvoies un, ton ancien thème sera remplacé.\n\n" +
      "🗳️ Vote pour ta proposition préférée !"
    )
    .addFields({
      name: "💡 Thèmes proposés",
      value:
        themes.length > 0
          ? themes
              .map(
                (t, i) =>
                  `**${i + 1}.** ${t.theme}\nProposé par <@${t.userId}> • 🗳️ ${t.votes || 0} vote(s)`
              )
              .join('\n\n')
          : "Aucun thème proposé pour le moment."
    })
    .setFooter({
      text: "Discord Music Challenge • Vote thème automatique"
    })
    .setTimestamp();

  const row = createThemeVoteButtons(themes);

  let recapMessage = null;

  if (state.themeRecapMessageId) {
    try {
      recapMessage = await channel.messages.fetch(state.themeRecapMessageId);
    } catch (err) {
      recapMessage = null;
    }
  }

  const payload = {
    embeds: [embed],
    components: row ? [row] : []
  };

  if (recapMessage) {
    await recapMessage.edit(payload);
  } else {
    const newMessage = await channel.send(payload);
    state.themeRecapMessageId = newMessage.id;
    saveThemeState(state);
  }
}

async function handleThemeMessage(message, client) {
  if (message.author.bot) return;
  if (message.channel.id !== THEME_CHANNEL_ID) return;

  const proposal = message.content.trim();
  if (!proposal) return;

  const themes = loadThemes();

  const existingIndex = themes.findIndex(
    theme => theme.userId === message.author.id
  );

  if (existingIndex !== -1) {
    themes[existingIndex] = {
      userId: message.author.id,
      theme: proposal,
      votes: 0,
      voters: []
    };
  } else {
    themes.push({
      userId: message.author.id,
      theme: proposal,
      votes: 0,
      voters: []
    });
  }

  saveThemes(themes);

  try {
    await message.delete();
  } catch (err) {
    console.log("⚠️ Impossible de supprimer le message thème. Vérifie la permission Manage Messages.");
  }

  await updateThemeRecap(client);
}

async function handleThemeVote(interaction, client) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('themevote_')) return;

  const index = parseInt(interaction.customId.split('_')[1], 10);
  const themes = loadThemes();

  const selectedTheme = themes[index];

  if (!selectedTheme) {
    return interaction.reply({
      content: "❌ Ce thème n’existe plus.",
      flags: 64
    });
  }

  const voterId = interaction.user.id;

  const alreadyVotedIndex = themes.findIndex(
    theme => Array.isArray(theme.voters) && theme.voters.includes(voterId)
  );

  if (alreadyVotedIndex !== -1) {
    return interaction.reply({
      content: "❌ Tu as déjà voté pour un thème cette semaine.",
      flags: 64
    });
  }

  if (!Array.isArray(selectedTheme.voters)) {
    selectedTheme.voters = [];
  }

  selectedTheme.voters.push(voterId);
  selectedTheme.votes = (selectedTheme.votes || 0) + 1;

  saveThemes(themes);

  await interaction.reply({
    content: `✅ Tu as voté pour : **${selectedTheme.theme}**`,
    flags: 64
  });

  await updateThemeRecap(client);
}

function getWinningTheme() {
  const themes = loadThemes();

  if (themes.length === 0) return null;

  const sorted = [...themes].sort((a, b) => {
    return (b.votes || 0) - (a.votes || 0);
  });

  return sorted[0];
}

function resetThemeVotes() {
  saveThemes([]);
}

module.exports = {
  updateThemeRecap,
  handleThemeMessage,
  handleThemeVote,
  getWinningTheme,
  resetThemeVotes
};