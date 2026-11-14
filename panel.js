const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const MAX_VOLUME = 200;

function volumeBar(volume) {
  const filled = Math.round((Math.min(volume, MAX_VOLUME) / MAX_VOLUME) * 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

function clip(text, max) {
  text = String(text || 'Unknown');
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function buildPanel(queue) {
  const song = queue.songs[0];
  const paused = queue.paused;
  const loopLabels = ['Off', 'Song', 'Queue'];

  const container = new ContainerBuilder().setAccentColor(paused ? 0xfaa61a : 0x5865f2);

  const header = new TextDisplayBuilder().setContent(
    `### ${paused ? '⏸️ Paused' : '🎶 Now Playing'}\n` +
      `**[${clip(song.name, 90)}](${song.url})**\n` +
      `${clip(song.uploader?.name, 60)} • \`${song.formattedDuration}\``
  );

  if (song.thumbnail) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail))
    );
  } else {
    container.addTextDisplayComponents(header);
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `🔊 **${queue.volume}%** ${volumeBar(queue.volume)}\n` +
        `🔁 Loop: **${loopLabels[queue.repeatMode] || 'Off'}** • 📜 Up next: **${Math.max(queue.songs.length - 1, 0)}**` +
        (song.user ? `\n👤 Requested by <@${song.user.id}>` : '')
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mp:pause')
        .setLabel(paused ? 'Resume' : 'Pause')
        .setEmoji(paused ? '▶️' : '⏸️')
        .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mp:skip').setLabel('Skip').setEmoji('⏭️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mp:stop').setLabel('Stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mp:loop').setLabel('Loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mp:voldown')
        .setLabel('-10')
        .setEmoji('🔉')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(queue.volume <= 10),
      new ButtonBuilder()
        .setCustomId('mp:volup')
        .setLabel('+10')
        .setEmoji('🔊')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(queue.volume >= MAX_VOLUME),
      new ButtonBuilder().setCustomId('mp:shuffle').setLabel('Shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp:queue').setLabel('Queue').setEmoji('📜').setStyle(ButtonStyle.Secondary)
    )
  );

  return container;
}

module.exports = { buildPanel, MAX_VOLUME };
