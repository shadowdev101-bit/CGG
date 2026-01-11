import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } from 'discord.js';
import mineflayer from 'mineflayer';
import { startSmartAILoop } from '../utils/aiLoop.js';

export const activeBots = new Map(); // Map<userId, { bot, aiLoop, memory, overrideState }>

export default {
    name: 'setup-minemc',
    description: 'สร้างเมนู Setup สำหรับ Minecraft Java Bot',

    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('play_mc').setLabel('🎮 เล่น').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('stop_mc').setLabel('⛔ หยุด').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('status_mc').setLabel('📊 สถานะ').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('gather_mc').setLabel('⛏ ขุดเหมือง').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('build_mc').setLabel('🏠 สร้างบ้าน').setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({
                content: "🕹️ **ChatGPTGamer - Minecraft Java Setup**\nเลือกตัวเลือกด้านล่างเพื่อเริ่ม / หยุด / ตรวจสอบสถานะ bot ของคุณ:",
                components: [row]
            });
        }

        if (interaction.isButton()) {
            const userId = interaction.user.id;

            if (interaction.customId === 'play_mc') {
                if (activeBots.has(userId)) {
                    await interaction.reply({ content: '❌ คุณมีบอทกำลังเล่นอยู่แล้ว!', ephemeral: true });
                    return;
                }

                const modal = new ModalBuilder()
                    .setCustomId('mc_ip_modal')
                    .setTitle('🌐 เชื่อมต่อ Minecraft Java');

                const ipInput = new TextInputBuilder()
                    .setCustomId('server_ip')
                    .setLabel("กรอก IP เซิร์ฟเวอร์")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ตัวอย่าง: play.example.com')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(ipInput));
                await interaction.showModal(modal);
            }

            if (interaction.customId === 'stop_mc') {
                const userBotData = activeBots.get(userId);
                if (userBotData) {
                    const { bot, aiLoop } = userBotData;
                    clearInterval(aiLoop);
                    bot.quit();
                    activeBots.delete(userId);
                    await interaction.reply({ content: '🛑 บอทหยุดเรียบร้อย!', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ คุณยังไม่มีบอทที่กำลังเล่นอยู่', ephemeral: true });
                }
            }

            if (interaction.customId === 'status_mc') {
                const userBotData = activeBots.get(userId);
                if (userBotData) {
                    const { bot } = userBotData;
                    const nearbyMobs = Object.values(bot.entities)
                        .filter(e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 10)
                        .map(e => e.name);
                    const inventory = bot.inventory.items().map(i => i.name);

                    await interaction.reply({
                        content: `📊 **สถานะ Bot ของคุณ:**\n- ตำแหน่ง: ${bot.entity.position}\n- ม็อบใกล้เคียง: ${nearbyMobs.join(', ') || 'ไม่มี'}\n- Inventory: ${inventory.join(', ') || 'ว่าง'}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({ content: '❌ คุณยังไม่มีบอทที่กำลังเล่นอยู่', ephemeral: true });
                }
            }

            if (interaction.customId === 'gather_mc') {
                const userBotData = activeBots.get(userId);
                if (!userBotData) {
                    await interaction.reply({ content: '❌ คุณยังไม่มีบอทที่กำลังเล่นอยู่', ephemeral: true });
                    return;
                }
                userBotData.overrideState = 'gather';
                await interaction.reply({ content: '⛏ Bot ของคุณจะเริ่มขุดเหมืองแล้ว!', ephemeral: true });
            }

            if (interaction.customId === 'build_mc') {
                const userBotData = activeBots.get(userId);
                if (!userBotData) {
                    await interaction.reply({ content: '❌ คุณยังไม่มีบอทที่กำลังเล่นอยู่', ephemeral: true });
                    return;
                }
                userBotData.overrideState = 'buildShelter';
                await interaction.reply({ content: '🏠 Bot ของคุณจะเริ่มสร้างบ้านแล้ว!', ephemeral: true });
            }
        }

        if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'mc_ip_modal') {
            const serverIP = interaction.fields.getTextInputValue('server_ip');
            await interaction.reply({ content: `🔎 กำลังเชื่อมต่อกับ IP: ${serverIP} ...`, ephemeral: true });

            try {
                const bot = mineflayer.createBot({
                    host: serverIP,
                    port: 25565,
                    username: `ChatGPTGamer_${interaction.user.username}_${Math.floor(Math.random() * 1000)}`
                });

                const userBotData = {
                    bot,
                    overrideState: null,
                    memory: { players: {} },
                    aiLoop: null
                };

                userBotData.aiLoop = startSmartAILoop(bot, interaction.user.username, userBotData);

                activeBots.set(interaction.user.id, userBotData);

                bot.on('chat', async (username, message) => {
                    try {
                        if (username === bot.username) return;
                        if (!userBotData.memory.players[username]) {
                            userBotData.memory.players[username] = { relationship: 'neutral', chatHistory: [] };
                        }

                        const playerMemory = userBotData.memory.players[username];
                        playerMemory.chatHistory.push({ time: new Date().toISOString(), message });

                        const prompt = `
You are a Minecraft bot named ChatGPTGamer.
You remember each player you interact with.
Player: ${username}
Relationship: ${playerMemory.relationship}
Chat History: ${playerMemory.chatHistory.slice(-10).map(c => c.message).join(' | ')}

Now the player says: "${message}"
Reply in a friendly and Minecraft-themed way.
`;

                        const response = await openai.chat.completions.create({
                            model: 'gpt-4',
                            messages: [
                                { role: 'system', content: 'You are a Minecraft NPC that can remember players and interact naturally.' },
                                { role: 'user', content: prompt }
                            ],
                            temperature: 0.7
                        });

                        const reply = response.choices[0].message.content.trim();
                        bot.chat(reply);
                        playerMemory.chatHistory.push({ time: new Date().toISOString(), message: reply });

                        const logPath = `logs/${bot.username}.log`;
                        const logLine = `[${new Date().toISOString()}] CHAT <${username}>: ${message} BOT_REPLY: ${reply}\n`;
                        fs.appendFileSync(logPath, logLine);

                    } catch (err) {
                        console.error('ChatGPTGamer Chat Error:', err);
                    }
                });

                await interaction.followUp({ content: `✅ Bot ของคุณเชื่อมต่อและเริ่มเล่นอัตโนมัติ!`, ephemeral: true });

            } catch (err) {
                console.error(err);
                await interaction.followUp({ content: `❌ เกิดข้อผิดพลาดในการสร้างบอท`, ephemeral: true });
            }
        }
    }
};