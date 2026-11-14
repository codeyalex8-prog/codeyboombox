
const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActivityType,
} = require('discord.js');

const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const ffmpegPath = require('ffmpeg-static');
const { buildPanel, MAX_VOLUME } = require('./panel');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in Railway Variables.');
  process.exit(1);
}

if (!ffmpegPath) {
  console.error('❌ FFmpeg binary was not found.');
  process.exit(1);
}

console.log('FFmpeg:', ffmpegPath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const distube = new DisTube(client, {
  ffmpeg: {
    path: ffmpegPath,
  },
  plugins: [
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new YtDlpPlugin({ update: true }),
  ],
});

const commands = [
  {
    name: 'play',
    description: 'Play a song',
    options: [{
      type: 3,
      name: 'song',
      description: 'Song name or URL',
      required: true,
    }],
  },
  { name: 'pause', description: 'Pause music' },
  { name: 'resume', description: 'Resume music' },
  { name: 'skip', description: 'Skip the current song' },
  { name: 'stop', description: 'Stop music' },
  {
    name: 'volume',
    description: 'Change volume',
    options: [{
      type: 4,
      name: 'percent',
      description: 'Volume percentage',
      required: true,
      min_value: 1,
      max_value: MAX_VOLUME,
    }],
  },
  { name: 'queue', description: 'View the queue' },
  { name: 'panel', description: 'Send the music player panel' },
];

const panels = new Map();

function ephemeral(content) {
  return {
    content,
    flags: MessageFlags.Ephemeral,
  };
}

async function sendPanel(queue) {
  const old = panels.get(queue.id);

  if (old) old.delete().catch(() => {});
  panels.delete(queue.id);

  if (!queue.textChannel || !queue.songs[0]) return;

  try {
    const message = await queue.textChannel.send({
      components: [buildPanel(queue)],
      flags: MessageFlags.IsComponentsV2,
    });

    panels.set(queue.id, message);
  } catch (error) {
    console.error('Panel error:', error);
  }
}

async function refreshPanel(queue) {
  const message = panels.get(queue.id);

  if (!message || !queue.songs[0]) return;

  try {
    await message.edit({
      components: [buildPanel(queue)],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch {
    panels.delete(queue.id);
  }
}

function clearPanel(guildId) {
  const message = panels.get(guildId);

  if (message) message.delete().catch(() => {});
  panels.delete(guildId);
}

distube
  .on('playSong', queue => sendPanel(queue))
  .on('addSong', (queue, song) => {
    queue.textChannel?.send({
      content: `➕ Added **${song.name}** to the queue.`,
    }).catch(() => {});
  })
  .on('addList', (queue, playlist) => {
    queue.textChannel?.send({
      content: `➕ Added playlist **${playlist.name}**.`,
    }).catch(() => {});
  })
  .on('finish', queue => {
    queue.textChannel?.send('✅ Queue finished.').catch(() => {});
  })
  .on('deleteQueue', queue => clearPanel(queue.id))
  .on('disconnect', queue => clearPanel(queue.id))
  .on('error', (error, queue) => {
    console.error('DisTube error:', error);

    queue?.textChannel?.send(
      `❌ Music error: ${String(error.message || error).slice(0, 180)}`
    ).catch(() => {});
  });

async function getQueue(interaction) {
  const queue = distube.getQueue(interaction.guildId);

  if (!queue) {
    await interaction.reply(ephemeral('❌ Nothing is playing.'));
    return null;
  }

  const userVoice = interaction.member.voice?.channel;
  const botVoice = interaction.guild.members.me?.voice?.channel;

  if (!userVoice || !botVoice || userVoice.id !== botVoice.id) {
    await interaction.reply(ephemeral('❌ Join my voice channel first.'));
    return null;
  }

  return queue;
}

function queueText(queue) {
  if (!queue.songs.length) return 'The queue is empty.';

  return '📜 **Music Queue**\n' +
    queue.songs.slice(0, 10).map((song, index) =>
      `${index === 0 ? '▶️' : `**${index}.**`} ${song.name} \`${song.formattedDuration}\``
    ).join('\n') +
    (queue.songs.length > 10
      ? `\n…and ${queue.songs.length - 10} more songs.`
      : '');
}

client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.inGuild()) return;

    if (interaction.isChatInputCommand()) {
      const command = interaction.commandName;

      if (command === 'play') {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const query = interaction.options.getString('song', true);
        const voice = interaction.member.voice?.channel;

        if (!voice) {
          return interaction.editReply('❌ Join a voice channel first.');
        }

        const botVoice = interaction.guild.members.me?.voice?.channel;

        if (botVoice && botVoice.id !== voice.id) {
          return interaction.editReply(
            '❌ I am already playing in another voice channel.'
          );
        }

        const permissions = voice.permissionsFor(
          interaction.guild.members.me
        );

        if (!permissions?.has(['ViewChannel', 'Connect', 'Speak'])) {
          return interaction.editReply(
            '❌ I need View Channel, Connect and Speak permissions.'
          );
        }

        try {
          await distube.play(voice, query, {
            member: interaction.member,
            textChannel: interaction.channel,
          });

          await interaction.editReply('✅ Your request has been added.');
        } catch (error) {
          console.error('Play error:', error);

          await interaction.editReply(
            `❌ Couldn't play that song: ${String(error.message || error).slice(0, 180)}`
          );
        }

        return;
      }

      if (command === 'panel') {
        const queue = await getQueue(interaction);
        if (!queue) return;

        queue.textChannel = interaction.channel;

        await interaction.reply(ephemeral('✅ Player panel sent.'));
        return sendPanel(queue);
      }

      const queue = await getQueue(interaction);
      if (!queue) return;

      switch (command) {
        case 'pause':
          queue.pause();
          await interaction.reply(ephemeral('⏸️ Paused.'));
          return refreshPanel(queue);

        case 'resume':
          queue.resume();
          await interaction.reply(ephemeral('▶️ Resumed.'));
          return refreshPanel(queue);

        case 'skip':
          await interaction.reply(ephemeral('⏭️ Skipping.'));
          return queue.songs.length > 1
            ? queue.skip()
            : queue.stop();

        case 'stop':
          await interaction.reply(ephemeral('⏹️ Stopping.'));
          return queue.stop();

        case 'volume': {
          const volume = interaction.options.getInteger('percent', true);
          queue.setVolume(volume);

          await interaction.reply(
            ephemeral(`🔊 Volume set to ${volume}%.`)
          );

          return refreshPanel(queue);
        }

        case 'queue':
          return interaction.reply(ephemeral(queueText(queue)));
      }
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('mp:')
    ) {
      const queue = await getQueue(interaction);
      if (!queue) return;

      const action = interaction.customId.slice(3);

      switch (action) {
        case 'pause':
          queue.paused ? queue.resume() : queue.pause();
          break;

        case 'skip':
          await interaction.deferUpdate();
          return queue.songs.length > 1
            ? queue.skip()
            : queue.stop();

        case 'stop':
          await interaction.deferUpdate();
          return queue.stop();

        case 'loop':
          queue.setRepeatMode((queue.repeatMode + 1) % 3);
          break;

        case 'voldown':
          queue.setVolume(Math.max(10, queue.volume - 10));
          break;

        case 'volup':
          queue.setVolume(Math.min(MAX_VOLUME, queue.volume + 10));
          break;

        case 'shuffle':
          await queue.shuffle();
          break;

        case 'queue':
          return interaction.reply(ephemeral(queueText(queue)));

        default:
          return interaction.reply(ephemeral('Unknown control.'));
      }

      return interaction.update({
        components: [buildPanel(queue)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch (error) {
    console.error('Interaction error:', error);

    const response = ephemeral('❌ Something went wrong.');

    if (interaction.deferred || interaction.replied) {
      interaction.followUp(response).catch(() => {});
    } else if (interaction.isRepliable()) {
      interaction.reply(response).catch(() => {});
    }
  }
});

client.once('clientReady', async () => {
  try {
    await client.application.commands.set(commands);

    client.user.setActivity('/play • music', {
      type: ActivityType.Listening,
    });

    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`✅ Registered ${commands.length} commands`);
    console.log('🟢 Music bot is online');
  } catch (error) {
    console.error('Startup error:', error);
  }
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

client.login(TOKEN);
