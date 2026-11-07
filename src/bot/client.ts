import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  ActivityType,
} from 'discord.js';
import pg from 'pg';
import { AppConfig } from '../config/index.js';
import { UploadService, FileRecord, UploadSessionRecord } from '../services/uploadService.js';
import { UserService } from '../services/userService.js';
import { S3StorageService } from '../storage/s3.js';
import { uploadCommand } from './commands/upload.js';
import { filesCommand } from './commands/files.js';
import { infoCommand } from './commands/info.js';
import { deleteCommand } from './commands/delete.js';
import { extendCommand } from './commands/extend.js';
import { fileBanCommand } from './commands/fileBan.js';

export interface BotServices {
  pool: pg.Pool;
  uploadService: UploadService;
  userService: UserService;
  storage: S3StorageService;
  config: AppConfig;
}

export function createBotClient(config: AppConfig, services: BotServices): Client {
  // Least-privilege intents: no MessageContent or Presences
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const commands = new Map<string, any>([
    [uploadCommand.data.name, uploadCommand],
    [filesCommand.data.name, filesCommand],
    [infoCommand.data.name, infoCommand],
    [deleteCommand.data.name, deleteCommand],
    [extendCommand.data.name, extendCommand],
    [fileBanCommand.data.name, fileBanCommand],
  ]);

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, services);
    } catch (err: any) {
      console.error(`Error executing command ${interaction.commandName}:`, err);
      const replyFn = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
      await (interaction as any)[replyFn]({
        content: '❌ An internal error occurred while executing this command.',
        ephemeral: true,
      });
    }
  });

  client.once('ready', () => {
    client.user?.setPresence({
      status: 'online',
      activities: [{ name: '/upload (up to 2GB)', type: ActivityType.Watching }],
    });
    console.log(`[DiscordBot] Logged in as ${client.user?.tag} (${client.user?.id})`);
    console.log(`[DiscordBot] Active Servers (${client.guilds.cache.size}):`, 
      client.guilds.cache.map(g => `"${g.name}" [ID: ${g.id}]`).join(', ') || 'No servers joined yet!'
    );
  });

  client.on('guildCreate', (guild) => {
    console.log(`[DiscordBot] 🎉 Successfully added to server: "${guild.name}" [ID: ${guild.id}]!`);
  });

  return client;
}

export async function notifyUploadComplete(
  client: Client,
  file: FileRecord,
  session: UploadSessionRecord,
  baseUrl: string
): Promise<void> {
  const downloadUrl = `${baseUrl}/d/${file.public_id}`;
  const sizeMb = (parseInt(file.size_bytes, 10) / (1024 * 1024)).toFixed(2);
  const expiresFormatted = new Date(file.expires_at).toLocaleString();

  const embed = new EmbedBuilder()
    .setTitle('✅ File Uploaded Successfully')
    .setColor(0x10b981)
    .setDescription(`**File:** \`${file.original_filename}\`\n**Size:** ${sizeMb} MB\n**Download:** [Click to Download](${downloadUrl})\n**Expires:** ${expiresFormatted}`)
    .addFields(
      { name: 'Download Link', value: downloadUrl },
      { name: 'Max Downloads', value: String(file.max_downloads), inline: true },
      { name: 'Public ID', value: `\`${file.public_id}\``, inline: true }
    )
    .setTimestamp();

  // If private or not in a guild channel, send via DM
  if (session.is_private || !session.channel_id) {
    try {
      const user = await client.users.fetch(session.owner_discord_id);
      await user.send({ embeds: [embed] });
      return;
    } catch (err) {
      console.error('[notifyUploadComplete] Failed to deliver private DM to user:', err);
      return;
    }
  }

  // Attempt to send to originating channel
  try {
    const channel = await client.channels.fetch(session.channel_id);
    if (channel && channel.isTextBased()) {
      await (channel as TextChannel).send({
        content: `📤 <@${session.owner_discord_id}> uploaded **${file.original_filename}**:`,
        embeds: [embed],
      });
      return;
    }
  } catch (err) {
    console.warn('[notifyUploadComplete] Channel post failed, falling back to DM:', err);
  }

  // Fallback to user DM
  try {
    const user = await client.users.fetch(session.owner_discord_id);
    await user.send({ embeds: [embed] });
  } catch (dmErr) {
    console.error('[notifyUploadComplete] Both channel post and fallback DM failed:', dmErr);
  }
}
