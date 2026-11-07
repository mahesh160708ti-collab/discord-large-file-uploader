import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import pg from 'pg';
import { S3StorageService } from '../../storage/s3.js';
import { AppConfig } from '../../config/index.js';

export const deleteCommand = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete one of your uploaded files immediately')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('public_id')
        .setDescription('The unique file ID you want to delete')
        .setRequired(true)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    services: { pool: pg.Pool; storage: S3StorageService; config: AppConfig }
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
          content: '❌ You can only delete your own uploaded files.',
        });
      }

      // Mark deleted in DB
      await services.pool.query(
        "UPDATE files SET status = 'deleted', deleted_at = NOW(), delete_after = NOW() WHERE id = $1",
        [file.id]
      );

      // Delete from storage
      try {
        await services.storage.deleteObject(file.storage_key);
        await services.pool.query('UPDATE files SET storage_deleted = TRUE WHERE id = $1', [file.id]);
      } catch (err) {
        console.error('Storage deletion failed, background worker will retry:', err);
      }

      await interaction.editReply({
        content: `✅ File \`${file.original_filename}\` has been permanently deleted and its link deactivated.`,
      });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ Deletion failed: ${err.message}` });
    }
  },
};
