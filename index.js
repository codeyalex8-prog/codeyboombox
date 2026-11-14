
const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActivityType
} = require('discord.js');

const util = require('node:util');

const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const ffmpegPath = require('ffmpeg-static');
const { buildPanel } = require('./panel');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  throw new Error('DISCORD_TOKEN is missing from Railway Variables.');
}

if (!ffmpegPath) {
  throw new Error('FFmpeg binary was not found.');
}

console.log('FFmpeg path:', ffmpegPath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

const distube = new DisTube(client, {
  ffmpeg: {
    path: ffmpegPath
  },
  plugins: [
    new YouTubePlugin(),
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new YtDlpPlugin({ update: true })
  ]
});

// SLASH COMMANDS

const commands = [
  {
    name: 'play',
    description: 'Play a song',
    options: [{
      name: 'song',
      description: 'Song name or URL',
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
    console.error('COMMAND REGISTRATION ERROR:', error);
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

// ACTUAL DISTUBE ERROR

distube.on('error', (error, queue, song) => {
  console.error('\n========== DISTUBE ERROR ==========');
  console.error('Message:', error?.message);
  console.error('Code:', error?.errorCode || error?.code);
  console.error('Source:', error?.source);
  console.error('Song:', song?.name);
  console.error('Guild:', queue?.id);

  console.error(
    'Cause:',
    util.inspect(error?.cause, {
      depth: 5,
      colors: false
    })
  );

  console.error(
    'Stack:',
    error?.stack
  );

  console.error('===================================\n');
});

// FFMPEG OUTPUT

distube.on('ffmpegDebug', debug => {
  console.log('[FFMPEG]', debug);
});

// DISTUBE DEBUG

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

        console.log('\n========== PLAY REQUEST ==========');
        console.log('Query:', query);
        console.log('Guild:', interaction.guildId);

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
          console.log('Joining voice channel:', voiceChannel.name);

          await distube.play(voiceChannel, query, {
            member: interaction.member,
            textChannel: interaction.channel
          });

          console.log('PLAY REQUEST ACCEPTED');

          await interaction.editReply(
            'Song added to the queue. Starting playback...'
          );

        } catch (error) {
          console.error('PLAY COMMAND FAILED:', error);

          await interaction.editReply(
            `Playback request failed: ${error.message || 'Unknown error'}`
          ).catch(() => {});
        }

        console.log('==================================\n');
        return;
      }

      // OTHER COMMANDS

      const queue = distube.getQueue(interaction.guildId);

      if (command !== 'panel' && !queue) {
        return interaction.reply({
          content: 'Nothing is currently playing.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (command === 'pause') {
        queue.pause();
        return interaction.reply('Playback paused.');
      }

      if (command === 'resume') {
        queue.resume();
        return interaction.reply('Playback resumed.');
      }

      if (command === 'skip') {
        await queue.skip();
        return interaction.reply('Skipped.');
      }

      if (command === 'stop') {
        queue.stop();
        return interaction.reply('Playback stopped.');
      }

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

      if (command === 'queue') {
        const songs = queue.songs
          .map((song, index) => `${index + 1}. ${song.name}`)
          .join('\n');

        return interaction.reply({
          content: songs.slice(0, 1900) || 'Queue is empty.',
          flags: MessageFlags.Ephemeral
        });
      }

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

    if (interaction.isButton()) {
      const queue = distube.getQueue(interaction.guildId);

      if (!queue) {
        return interaction.reply({
          content: 'Nothing is currently playing.',
          flags: MessageFlags.Ephemeral
        });
      }

      switch (interaction.customId) {
        case 'music_pause':
          queue.pause();
          break;

        case 'music_resume':
          queue.resume();
          break;

        case 'music_skip':
          await queue.skip();
          break;

        case 'music_stop':
          queue.stop();
          break;

        case 'music_shuffle':
          queue.shuffle();
          break;

        case 'music_loop':
          queue.setRepeatMode(
            queue.repeatMode === 0 ? 1 : 0
          );
          break;

        default:
          return;
      }

      await interaction.deferUpdate();
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
