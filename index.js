import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Map();
const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = await import(`./commands/${file}`);
    client.commands.set(command.default.name, command.default);
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && interaction.type !== 5) return;

    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const guilds = client.guilds.cache.map(g => g.id);
    for (const guildId of guilds) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.create({
            name: 'setup-minemc',
            description: 'สร้างเมนู Setup สำหรับ Minecraft Java Bot'
        });
    }
});

client.login(process.env.DISCORD_TOKEN);