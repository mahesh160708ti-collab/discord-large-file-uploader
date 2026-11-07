import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import pg from 'pg';
import { UserService } from '../../services/userService.js';

export const filesCommand = {
  data: new SlashCommandBuilder()
    .setName('files')
    .setDescription('View your active uploaded files, download counts, and remaining quota')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),

  async execute(
    interaction: ChatInputCommandInteraction,
    services: { pool: pg.Pool; userService: UserService }
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const storageInfo = await services.userService.getUserStorage(interaction.user.id);
      const res = await services.pool.query(
        `
        SELECT public_id, original_filename, size_bytes, expires_at, download_count, max_downloads
        FROM files
        WHERE owner_discord_id = $1
          AND status = 'completed'
          AND expires_at > NOW()
          AND download_count < max_downloads
        ORDER BY created_at DESC
        LIMIT 15;
        `,
        [interaction.user.id]
      );

      const usedMb = (storageInfo.usedBytes / (1024 * 1024)).toFixed(1);
      const totalMb = (storageInfo.quotaBytes / (1024 * 1024)).toFixed(1);

      const embed = new EmbedBuilder()
        .setTitle('📁 Your Active Uploads')
        .setColor(0x3b82f6)
        .setDescription(`**Storage Used:** ${usedMb} MB / ${totalMb} MB`)
        .setTimestamp();

      if (res.rows.length === 0) {
        embed.addFields({ name: 'No Active Files', value: 'Use `/upload` to share a file.' });
      } else {
        res.rows.forEach((row) => {
          const sizeMb = (parseInt(row.size_bytes, 10) / (1024 * 1024)).toFixed(1);
          const expiresDate = new Date(row.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          embed.addFields({
            name: `${row.original_filename} (${sizeMb} MB)`,
            value: `ID: \`${row.public_id}\` • Downloads: ${row.download_count}/${row.max_downloads} • Expires: ${expiresDate}`,
          });
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ Error fetching your files: ${err.message}` });
    }
  },
};
