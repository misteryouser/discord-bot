const fs = require('fs');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const SONG_VOTES_FILE = './songVotes.json';

function ensureSongVotesFile() {
  if (!fs.existsSync(SONG_VOTES_FILE)) {
    fs.writeFileSync(SONG_VOTES_FILE, JSON.stringify({}, null, 2));
  }
}

function loadSongVotes() {
  ensureSongVotesFile();
  return JSON.parse(fs.readFileSync(SONG_VOTES_FILE, 'utf8'));
}

function saveSongVotes(votes) {
  fs.writeFileSync(SONG_VOTES_FILE, JSON.stringify(votes, null, 2));
}

function createVoteButtons(songs) {
  const row = new ActionRowBuilder();

  songs.slice(0, 5).forEach((song, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_${index}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  return songs.length > 0 ? row : null;
}

async function handleSongVote(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('vote_')) return false;

  const voterId = interaction.user.id;
  const index = parseInt(interaction.customId.split('_')[1], 10);

  const songs = fs.existsSync('./songs.json')
    ? JSON.parse(fs.readFileSync('./songs.json', 'utf8'))
    : [];

  const selectedSong = songs[index];

  if (!selectedSong) {
    await interaction.reply({
      content: "❌ Son introuvable.",
      ephemeral: true
    });
    return true;
  }

  const votes = loadSongVotes();

  if (votes[voterId] !== undefined) {
    await interaction.reply({
      content: "❌ Tu as déjà voté pour un son cette semaine.",
      ephemeral: true
    });
    return true;
  }

  votes[voterId] = index;
  saveSongVotes(votes);

  await interaction.reply({
    content: `✅ Tu as voté pour <@${selectedSong.userId}>`,
    ephemeral: true
  });

  return true;
}async function updateRecap(client, themeSemaine) {
  const recapChannel =
    client.channels.cache.get('1505144899824259092');

  if (!recapChannel) {
    console.log("❌ Salon recap introuvable");
    return;
  }

  let songs = [];

  if (fs.existsSync('./songs.json')) {
    songs = JSON.parse(fs.readFileSync('./songs.json', 'utf8'));
  }

  const votes = loadSongVotes() || {};

  const voteCounts = {};

  Object.values(votes).forEach(index => {
    voteCounts[index] = (voteCounts[index] || 0) + 1;
  });

  const songsText =
    songs.length > 0
      ? songs
          .map((s, i) => {
            const userId = s.userId || "0";
            const url = s.url || "https://discord.com";
            const count = voteCounts[i] || 0;

            return `**${i + 1}.** <@${userId}>\n🎵 [écouter](${url})\n🗳️ ${count} vote(s)`;
          })
          .join('\n\n')
          .slice(0, 1024)
      : "Aucun son pour le moment.";

  const statsText =
    `🎵 ${songs.length || 0} son(s) • 🗳️ ${Object.keys(votes).length || 0} vote(s)`;

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle(`🎧 Défi de la semaine — ${themeSemaine || "Aucun thème"}`)
    .setDescription(
      "🎶 Découvre les sons de la semaine et vote pour ton préféré !"
    )
    .addFields(
      {
        name: "‼️🎵 Les sons de la semaine 🎵",
        value: songsText || "Aucun son pour le moment."
      },
      {
        name: "📊 Stats",
        value: statsText || "Aucune stat pour le moment."
      }
    )
    .setFooter({
      text: "Discord Music Challenge • Recap automatique"
    })
    .setTimestamp();

  const row = createVoteButtons(songs);

  let state = {};

  if (fs.existsSync('./recapState.json')) {
    state = JSON.parse(fs.readFileSync('./recapState.json', 'utf8'));
  }

  let recapMessage = null;

  if (state.recapMessageId) {
    try {
      recapMessage = await recapChannel.messages.fetch(
        state.recapMessageId
      );
    } catch (error) {
      console.log("⚠️ Ancien recap introuvable");
      recapMessage = null;
    }
  }

  const payload = {
    embeds: [embed],
    components: row ? [row] : []
  };

  if (recapMessage) {
    await recapMessage.edit(payload);
    console.log("♻️ Recap mis à jour");
  } else {
    const newMessage = await recapChannel.send(payload);

    state.recapMessageId = newMessage.id;

    fs.writeFileSync(
      './recapState.json',
      JSON.stringify(state, null, 2)
    );

    console.log("✅ Nouveau recap créé");
  }
}


async function updateRecap(client, themeSemaine) {
  const recapChannel =
    client.channels.cache.get('1505144899824259092');

  if (!recapChannel) {
    console.log("❌ Salon recap introuvable");
    return;
  }

  let songs = [];

  if (fs.existsSync('./songs.json')) {
    songs = JSON.parse(fs.readFileSync('./songs.json', 'utf8'));
  }

  const votes = loadSongVotes();

  const voteCounts = {};

  Object.values(votes).forEach(index => {
    voteCounts[index] = (voteCounts[index] || 0) + 1;
  });

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle(`🎧 Défi de la semaine — ${themeSemaine}`)
    .setDescription(
      "🎶 Découvre les sons de la semaine et vote pour ton préféré !"
    )
    .addFields(
      {
        name: "‼️🎵 Les sons de la semaine 🎵",
        value:
          songs.length > 0
            ? songs
                .map(
                  (s, i) =>
                    `**${i + 1}.** <@${s.userId}>\n🎵 [écouter](${s.url})\n🗳️ ${voteCounts[i] || 0} vote(s)`
                )
                .join('\n\n')
                .slice(0, 1024)
            : "Aucun son pour le moment"
      },
      {
        name: "📊 Stats",
        value: `🎵 ${songs.length} son(s) • 🗳️ ${Object.keys(votes).length} vote(s)`
      }
    )
    .setFooter({
      text: "Discord Music Challenge • Recap automatique"
    })
    .setTimestamp();

  const row = createVoteButtons(songs);

  let state = {};

  if (fs.existsSync('./recapState.json')) {
    state = JSON.parse(fs.readFileSync('./recapState.json', 'utf8'));
  }

  let recapMessage = null;

  if (state.recapMessageId) {
    try {
      recapMessage = await recapChannel.messages.fetch(
        state.recapMessageId
      );
    } catch (error) {
      console.log("⚠️ Ancien recap introuvable");
    }
  }

  const payload = {
    embeds: [embed],
    components: row ? [row] : []
  };

  if (recapMessage) {
    await recapMessage.edit(payload);
    console.log("♻️ Recap mis à jour");
  } else {
    const newMessage = await recapChannel.send(payload);

    state.recapMessageId = newMessage.id;

    fs.writeFileSync(
      './recapState.json',
      JSON.stringify(state, null, 2)
    );

    console.log("✅ Nouveau recap créé");
  }
}


module.exports = {
  updateRecap,
  handleSongVote
};