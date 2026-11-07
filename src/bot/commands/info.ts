import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import pg from 'pg';
import { AppConfig } from '../../config/index.js';

export const infoCommand = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View detailed information about a shared file')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('public_id')
        .setDescription('The unique file download ID (e.g. xY7kP2)')
        .setRequired(true)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    services: { pool: pg.Pool; config: AppConfig }
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const publicId = interaction.options.getString('public_id', true).trim();
      const res = await services.pool.query('SELECT * FROM files WHERE public_id = $1', [publicId]);

      if (res.rows.length === 0) {
        return await interaction.editReply({ content: '❌ File not found.' });
      }

      const file = res.rows[0];
      const isOwner = file.owner_discord_id === interaction.user.id;
      const isAdmin = services.config.ADMIN_DISCORD_USER_IDS.includes(interaction.user.id);

      if (!isOwner && !isAdmin) {
        return await interaction.editReply({
          content: '❌ You do not have permission to view metadata for this file.',
        });
      }

      const sizeMb = (parseInt(file.size_bytes, 10) / (1024 * 1024)).toFixed(2);
      const downloadUrl = `${services.config.BASE_URL}/d/${file.public_id}`;

      const embed = new EmbedBuilder()
        .setTitle(`📄 File Details: ${file.original_filename}`)
        .setColor(0x3b82f6)
        .addFields(
          { name: 'Public ID', value: `\`${file.public_id}\``, inline: true },
          { name: 'Size', value: `${sizeMb} MB`, inline: true },
          { name: 'Status', value: `\`${file.status}\``, inline: true },
          { name: 'Downloads', value: `${file.download_count} / ${file.max_downloads}`, inline: true },
          { name: 'Expires At', value: new Date(file.expires_at).toLocaleString(), inline: true },
          { name: 'Download Link', value: downloadUrl }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ Error: ${err.message}` });
    }
  },
};
