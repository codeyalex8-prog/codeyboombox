
const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActivityType
} = require('discord.js');

const util = require('node:util');

const { DisTube } = require('distube');
const { SoundCloudPlugin } = require('@distube/soundcloud');

const ffmpegPath = require('ffmpeg-static');
const { buildPanel } = require('./panel');

const TOKEN = process.env.DISCORD_TOKEN;

// CHECK CONFIGURATION

if (!TOKEN) {
  throw new Error('DISCORD_TOKEN is missing from Railway Variables.');
}

if (!ffmpegPath) {
  throw new Error(
    'FFmpeg binary could not be found. Check ffmpeg-static installation.'
  );
}

console.log('FFmpeg executable:', ffmpegPath);

// DISCORD CLIENT

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// DISTUBE CONFIGURATION

const distube = new DisTube(client, {
  emitNewSongOnly: true,

  ffmpeg: {
    path: ffmpegPath
  },

  plugins: [
    new SoundCloudPlugin()
  ]
});

// SLASH COMMANDS

const commands = [
  {
    name: 'play',
    description: 'Play a song from SoundCloud',
    options: [{
      name: 'song',
      description: 'SoundCloud song name or URL',
      type: 3,
      required: true
    }]
  },
  { name: 'pause', description: 'Pause playback' },
  { name: 'resume', description: 'Resume playback' },
  { name: 'skip', description: 'Skip the current song' },
  { name: 'stop', description: 'Stop playback' },
  {
    name: 'volume',
    description: 'Change volume',
    options: [{
      name: 'amount',
      description: 'Volume from 0 to 200',
      type: 4,
      required: true
    }]
  },
  { name: 'queue', description: 'Show the queue' },
  { name: 'panel', description: 'Show the music player' }
];

// STARTUP

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await client.application.commands.set(commands);
    console.log('Registered 8 commands');
  } catch (error) {
    console.error('[COMMAND REGISTRATION ERROR]', error);
  }

  client.user.setActivity('music', {
    type: ActivityType.Listening
  });

  console.log('Music bot online');
});

// MUSIC EVENTS

distube.on('addSong', (queue, song) => {
  console.log('[MUSIC] ADDED:', song.name);
});

distube.on('playSong', (queue, song) => {
  console.log('[MUSIC] PLAYING:', song.name);
  console.log('[MUSIC] URL:', song.url);
});

distube.on('finishSong', (queue, song) => {
  console.log('[MUSIC] SONG FINISHED:', song.name);
});

distube.on('finish', queue => {
  console.log('[MUSIC] QUEUE FINISHED:', queue.id);
});

distube.on('deleteQueue', queue => {
  console.log('[MUSIC] QUEUE DELETED:', queue.id);
});

distube.on('disconnect', queue => {
  console.log('[VOICE] DISCONNECTED:', queue.id);
});

// ERROR HANDLING

distube.on('error', (error, queue, song) => {
  console.error('\n========== DISTUBE ERROR ==========');
  console.error('Message:', error?.message);
  console.error('Song:', song?.name);
  console.error('Guild:', queue?.id);

  console.error(
    'Cause:',
    util.inspect(error?.cause, {
      depth: 4,
      colors: false
    })
  );

  console.error('Stack:', error?.stack);
  console.error('===================================\n');
});

distube.on('debug', debug => {
  console.log('[DISTUBE DEBUG]', debug);
});

// INTERACTIONS

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.commandName;

      // PLAY

      if (command === 'play') {
        const query = interaction.options.getString('song');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
          return interaction.reply({
            content: 'Join a voice channel first.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });

        try {
          console.log('\n========== PLAY REQUEST ==========');
          console.log('Query:', query);
          console.log('Guild:', interaction.guildId);
          console.log('Voice channel:', voiceChannel.name);
          console.log('FFmpeg:', ffmpegPath);

          await distube.play(voiceChannel, query, {
            member: interaction.member,
            textChannel: interaction.channel
          });

          await interaction.editReply(
            'SoundCloud request received. Checking the track...'
          );

        } catch (error) {
          console.error('[PLAY COMMAND ERROR]', error);

          await interaction.editReply(
            `Playback request failed: ${error.message || 'Unknown error'}`
          ).catch(() => {});
        }

        return;
      }

      const queue = distube.getQueue(interaction.guildId);

      if (command !== 'panel' && !queue) {
        return interaction.reply({
          content: 'Nothing is currently playing.',
          flags: MessageFlags.Ephemeral
        });
      }

      // PAUSE

      if (command === 'pause') {
        queue.pause();
        return interaction.reply('Playback paused.');
      }

      // RESUME

      if (command === 'resume') {
        queue.resume();
        return interaction.reply('Playback resumed.');
      }

      // SKIP

      if (command === 'skip') {
        await queue.skip();
        return interaction.reply('Skipped.');
      }

      // STOP

      if (command === 'stop') {
        queue.stop();
        return interaction.reply('Playback stopped.');
      }

      // VOLUME

      if (command === 'volume') {
        const amount = interaction.options.getInteger('amount');

        if (amount < 0 || amount > 200) {
          return interaction.reply({
            content: 'Volume must be between 0 and 200.',
            flags: MessageFlags.Ephemeral
          });
        }

        queue.setVolume(amount);
        return interaction.reply(`Volume set to ${amount}%.`);
      }

      // QUEUE

      if (command === 'queue') {
        const songs = queue.songs
          .map((song, index) => `${index + 1}. ${song.name}`)
          .join('\n');

        return interaction.reply({
          content: songs.slice(0, 1900) || 'Queue is empty.',
          flags: MessageFlags.Ephemeral
        });
      }

      // PLAYER PANEL

      if (command === 'panel') {
        const currentQueue = distube.getQueue(interaction.guildId);

        if (!currentQueue) {
          return interaction.reply({
            content: 'Play a song first to open the player.',
            flags: MessageFlags.Ephemeral
          });
        }

        return interaction.reply({
          components: [buildPanel(currentQueue)],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }

    // PLAYER BUTTONS

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('mp:')
    ) {
      const queue = distube.getQueue(interaction.guildId);

      if (!queue) {
        return interaction.reply({
          content: 'Nothing is currently playing.',
          flags: MessageFlags.Ephemeral
        });
      }

      switch (interaction.customId) {
        case 'mp:pause':
          if (queue.paused) {
            queue.resume();
          } else {
            queue.pause();
          }
          break;

        case 'mp:skip':
          await queue.skip();
          break;

        case 'mp:stop':
          await interaction.deferUpdate();
          queue.stop();
          return;

        case 'mp:loop':
          queue.setRepeatMode((queue.repeatMode + 1) % 3);
          break;

        case 'mp:voldown':
          queue.setVolume(Math.max(0, queue.volume - 10));
          break;

        case 'mp:volup':
          queue.setVolume(Math.min(200, queue.volume + 10));
          break;

        case 'mp:shuffle':
          queue.shuffle();
          break;

        case 'mp:queue': {
          const songs = queue.songs
            .map((song, index) => `${index + 1}. ${song.name}`)
            .join('\n');

          return interaction.reply({
            content: songs.slice(0, 1900) || 'Queue is empty.',
            flags: MessageFlags.Ephemeral
          });
        }

        default:
          return;
      }

      await interaction.deferUpdate();

      const updatedQueue = distube.getQueue(interaction.guildId);

      if (updatedQueue) {
        await interaction.message.edit({
          components: [buildPanel(updatedQueue)]
        }).catch(error => {
          console.error('[PANEL REFRESH ERROR]', error.message);
        });
      }
    }

  } catch (error) {
    console.error('[INTERACTION ERROR]', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

// GLOBAL ERRORS

process.on('unhandledRejection', error => {
  console.error('[UNHANDLED REJECTION]', error);
});

process.on('uncaughtException', error => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

// LOGIN

client.login(TOKEN);
