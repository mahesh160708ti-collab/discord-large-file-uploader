import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { UploadService } from '../../services/uploadService.js';
import { UserService } from '../../services/userService.js';

export const uploadCommand = {
  data: new SlashCommandBuilder()
    .setName('upload')
    .setDescription('Generate a temporary webpage to upload a large file directly to storage (up to 2 GB)')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('expires')
        .setDescription('How long the file should remain accessible before expiring')
        .addChoices(
          { name: '1 hour', value: '3600' },
          { name: '6 hours', value: '21600' },
          { name: '24 hours (Default)', value: '86400' },
          { name: '3 days', value: '259200' },
          { name: '7 days', value: '604800' },
          { name: '30 days', value: '2592000' }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName('max_downloads')
        .setDescription('Maximum download limit before the link deactivates (1 - 500)')
        .setMinValue(1)
        .setMaxValue(500)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('private')
        .setDescription('Keep the resulting download link private in your DM instead of posting in channel')
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    services: { uploadService: UploadService; userService: UserService }
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const storageInfo = await services.userService.getUserStorage(interaction.user.id);
      if (storageInfo.isBanned) {
        return await interaction.editReply({
          content: '❌ Your account is currently suspended from uploading files.',
        });
      }

      if (storageInfo.usedBytes >= storageInfo.quotaBytes) {
        return await interaction.editReply({
          content: `❌ You have reached your storage quota (${(storageInfo.quotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB). Delete existing files or wait for them to expire.`,
        });
      }

      const requestedSeconds = parseInt(interaction.options.getString('expires') || '86400', 10);
      const maxDownloads = interaction.options.getInteger('max_downloads') || 100;
      const isPrivate = interaction.options.getBoolean('private') || false;

      const session = await services.uploadService.createSession({
        ownerDiscordId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        requestedExpirationSeconds: requestedSeconds,
        maxDownloads,
        isPrivate,
      });

      const readableHours = (requestedSeconds / 3600).toFixed(0);

      await interaction.editReply({
        content: [
          `📤 **Upload your file here:** ${session.uploadUrl}`,
          `📦 **Maximum file size:** 2 GB`,
          `⏳ **Upload page expires in:** 15 minutes`,
          `⏱️ **File retention:** ${readableHours} hours (Max downloads: ${maxDownloads})`,
          isPrivate
            ? `🔒 **Delivery:** Private DM upon upload completion.`
            : `📢 **Delivery:** Link will be posted in this channel upon completion.`,
        ].join('\n'),
      });
    } catch (err: any) {
      await interaction.editReply({
        content: `❌ Failed to initialize upload session: ${err.message || 'Unknown error'}`,
      });
    }
  },
};
