import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function startSmartAILoop(bot, username, userBotData) {
    const logPath = path.join(process.cwd(), 'logs', `${username}.log`);
    if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const interval = setInterval(async () => {
        if (!bot || bot.isDead) return clearInterval(interval);

        try {
            const position = bot.entity.position;
            const hp = bot.health;
            const nearbyMobs = Object.values(bot.entities)
                .filter(e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 10)
                .map(e => ({ name: e.name, distance: e.position.distanceTo(bot.entity.position) }));

            const inventory = bot.inventory.items().map(i => i.name);

            // ---------- State Machine ----------
            let state = 'idle';
            if (userBotData.overrideState) state = userBotData.overrideState;
            else if (hp < 10 && inventory.includes('cooked_beef')) state = 'eat';
            else if (nearbyMobs.length > 0 && nearbyMobs.some(m => m.distance < 3)) state = 'fight';
            else if (position.y < 50 && inventory.includes('iron_pickaxe')) state = 'gather';
            else if (!bot.findBlock({ matching: 'planks' })) state = 'buildShelter';

            const prompt = `
Current state: ${state}
Nearby players: ${Object.keys(userBotData.memory.players).join(', ')}
Player memory: ${JSON.stringify(userBotData.memory.players)}

Decide next action: move, mine, attack, eat, build shelter.
Respond only in one line command.
`;

            const response = await openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are a Minecraft bot that can play autonomously and safely.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            });

            const action = response.choices[0].message.content.trim();
            executeSmartAction(bot, action);

            const logLine = `[${new Date().toISOString()}] Pos:${position} HP:${hp} State:${state} Action:${action}\n`;
            fs.appendFileSync(logPath, logLine);

        } catch (err) {
            console.error('Smart AI Loop error:', err);
        }
    }, 5000);

    return interval;
}

export function executeSmartAction(bot, action) {
    ['forward', 'back', 'left', 'right', 'jump'].forEach(k => bot.setControlState(k, false));

    if (!action) return;
    action = action.toLowerCase();

    if (action.includes('move forward')) bot.setControlState('forward', true);
    if (action.includes('move backward')) bot.setControlState('back', true);
    if (action.includes('move left')) bot.setControlState('left', true);
    if (action.includes('move right')) bot.setControlState('right', true);
    if (action.includes('jump')) bot.setControlState('jump', true);

    if (action.startsWith('mine ')) {
        const blockName = action.split('mine ')[1];
        const block = bot.findBlock({ matching: blockName });
        if (block) bot.dig(block).catch(() => {});
    }

    if (action.startsWith('attack ')) {
        const mobName = action.split('attack ')[1];
        const mob = Object.values(bot.entities).find(e => e.type === 'mob' && e.name === mobName);
        if (mob) bot.attack(mob);
    }

    if (action.startsWith('eat ')) {
        const itemName = action.split('eat ')[1];
        const item = bot.inventory.items().find(i => i.name === itemName);
        if (item) bot.equip(item, 'hand').then(() => bot.consume()).catch(() => {});
    }

    if (action.includes('build shelter')) {
        const block = bot.findBlock({ matching: 'planks', maxDistance: 5 });
        if (block) bot.placeBlock(block, bot.entity).catch(() => {});
    }
}