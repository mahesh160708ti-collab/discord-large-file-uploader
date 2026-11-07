import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import pg from 'pg';
import { UserService } from '../../services/userService.js';

export const extendCommand = {
  data: new SlashCommandBuilder()
    .setName('extend')
    .setDescription('Extend the expiration time of an active upload')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('public_id')
        .setDescription('The file ID you want to extend')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('expires')
        .setDescription('Additional time to extend')
        .setRequired(true)
        .addChoices(
          { name: '24 hours', value: '86400' },
          { name: '3 days', value: '259200' },
          { name: '7 days', value: '604800' },
          { name: '30 days', value: '2592000' }
        )
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    services: { pool: pg.Pool; userService: UserService }
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const publicId = interaction.options.getString('public_id', true).trim();
      const addSeconds = parseInt(interaction.options.getString('expires', true), 10);

      const res = await services.pool.query('SELECT * FROM files WHERE public_id = $1', [publicId]);
      if (res.rows.length === 0) {
        return await interaction.editReply({ content: '❌ File not found.' });
      }

      const file = res.rows[0];
      if (file.owner_discord_id !== interaction.user.id) {
        return await interaction.editReply({ content: '❌ You can only extend your own files.' });
      }

      if (file.status !== 'completed') {
        return await interaction.editReply({ content: '❌ This file is no longer active.' });
      }

      // If file was already expired, extending it reclaims active quota: check capacity
      const isCurrentlyExpired = new Date(file.expires_at) <= new Date();
      if (isCurrentlyExpired) {
        const storageInfo = await services.userService.getUserStorage(interaction.user.id);
        const fileSize = parseInt(file.size_bytes, 10);
        if (storageInfo.usedBytes + fileSize > storageInfo.quotaBytes) {
          return await interaction.editReply({
            content: '❌ Extending this expired file would exceed your active storage quota.',
          });
        }
      }

      const maxAllowedFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days max from now
      const currentExpiry = new Date(file.expires_at).getTime();
      const newExpiryTime = Math.min(
        maxAllowedFuture.getTime(),
        Math.max(Date.now(), currentExpiry) + addSeconds * 1000
      );
      const newExpiresAt = new Date(newExpiryTime);
      const newDeleteAfter = new Date(newExpiresAt.getTime() + 60 * 60 * 1000);

      await services.pool.query(
        'UPDATE files SET expires_at = $1, delete_after = $2 WHERE id = $3',
        [newExpiresAt, newDeleteAfter, file.id]
      );

      await interaction.editReply({
        content: `✅ File \`${file.original_filename}\` extended. New expiration: **${newExpiresAt.toLocaleString()}**.`,
      });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ Extension failed: ${err.message}` });
    }
  },
};
