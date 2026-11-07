import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import pg from 'pg';
import { S3StorageService } from '../../storage/s3.js';
import { AppConfig } from '../../config/index.js';

export const fileBanCommand = {
  data: new SlashCommandBuilder()
    .setName('file-ban')
    .setDescription('Moderator action: Immediately ban and delete a malicious or abusive file')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('public_id')
        .setDescription('The file ID to ban and eradicate')
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('ban_user')
        .setDescription('Also prohibit this uploader from uploading future files')
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    services: { pool: pg.Pool; storage: S3StorageService; config: AppConfig }
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const publicId = interaction.options.getString('public_id', true).trim();
      const banUser = interaction.options.getBoolean('ban_user') || false;

      const res = await services.pool.query('SELECT * FROM files WHERE public_id = $1', [publicId]);
      if (res.rows.length === 0) {
        return await interaction.editReply({ content: '❌ File not found.' });
      }

      const file = res.rows[0];

      // Authorization verification
      const isSuperAdmin = services.config.ADMIN_DISCORD_USER_IDS.includes(interaction.user.id);
      const isGuildMod =
        interaction.inGuild() &&
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
        file.guild_id === interaction.guildId;

      if (!isSuperAdmin && !isGuildMod) {
        return await interaction.editReply({
          content: '❌ You do not have permission to execute moderation bans.',
        });
      }

      // Mark file banned
      await services.pool.query(
        "UPDATE files SET status = 'banned', delete_after = NOW(), deleted_at = NOW() WHERE id = $1",
        [file.id]
      );

      // Ban user if requested
      if (banUser) {
        await services.pool.query('UPDATE users SET is_banned = TRUE WHERE discord_user_id = $1', [
          file.owner_discord_id,
        ]);
      }

      // Purge storage object
      try {
        await services.storage.deleteObject(file.storage_key);
      } catch (err) {
        console.error('Storage deletion failed during ban:', err);
      }

      await interaction.editReply({
        content: `🚨 File \`${file.original_filename}\` (\`${file.public_id}\`) has been banned and purged.${
          banUser ? ' Uploader account has been permanently blacklisted.' : ''
        }`,
      });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ Ban operation failed: ${err.message}` });
    }
  },
};
