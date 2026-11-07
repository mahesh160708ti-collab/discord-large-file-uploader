import { REST, Routes } from 'discord.js';
import { getConfig } from '../config/index.js';
import { uploadCommand } from './commands/upload.js';
import { filesCommand } from './commands/files.js';
import { infoCommand } from './commands/info.js';
import { deleteCommand } from './commands/delete.js';
import { extendCommand } from './commands/extend.js';
import { fileBanCommand } from './commands/fileBan.js';

export async function deploySlashCommands(config = getConfig()): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  const commandBodies = [
    uploadCommand.data.toJSON(),
    filesCommand.data.toJSON(),
    infoCommand.data.toJSON(),
    deleteCommand.data.toJSON(),
    extendCommand.data.toJSON(),
    fileBanCommand.data.toJSON(),
  ];

  console.log(`[DeployCommands] Registering ${commandBodies.length} application (/) commands...`);

  const data: any = await rest.put(
    Routes.applicationCommands(config.DISCORD_CLIENT_ID),
    { body: commandBodies }
  );

  console.log(`[DeployCommands] Successfully reloaded ${data.length} global application (/) commands.`);
}

// Allow direct CLI invocation via `npm run deploy-commands`
if (process.argv[1]?.endsWith('deployCommands.ts') || process.argv[1]?.endsWith('deployCommands.js')) {
  deploySlashCommands()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DeployCommands] Failed to register slash commands:', err);
      process.exit(1);
    });
}
