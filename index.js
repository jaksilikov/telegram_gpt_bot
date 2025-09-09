/**
 * Telegram GPT Bot
 * ----------------
 * Telegram бот на Node.js с GPT4Free (BlackBox),
 * поддержкой истории чатов и возможностью установки админ-промта.
 * 
 * Author: Mukhtar Zhaksylykov
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const GPT4js = require('gpt4js');
const fs = require('fs');
const path = require('path');

// --- Настройки ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMINS = process.env.ADMINS ? process.env.ADMINS.split(',').map(id => parseInt(id)) : [];
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const HISTORY_LIMIT = 15; // сколько последних сообщений хранить для контекста

// --- Проверка токена ---
if (!BOT_TOKEN) {
    console.error("❌ Не указан BOT_TOKEN в .env");
    process.exit(1);
}

// --- Загрузка промтов ---
let prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf-8'));

// --- Загрузка истории чатов ---
let chatHistories = {};
if (fs.existsSync(HISTORY_FILE)) {
    chatHistories = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
}

// --- Настройки GPT4js ---
const options = {
    provider: "BlackBox",
    model: "BlackBox",
};
const provider = GPT4js.createProvider(options.provider);

// --- Создаем бота ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- Функции ---
function setAdminPrompt(newPrompt) {
    prompts.admin_prompt = newPrompt;
    fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
}

function addToHistory(chatId, role, content) {
    if (!chatHistories[chatId]) chatHistories[chatId] = [];
    chatHistories[chatId].push({ role, content });
    if (chatHistories[chatId].length > HISTORY_LIMIT) chatHistories[chatId].shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistories, null, 2));
}

function isAdmin(chatId) {
    return ADMINS.includes(chatId);
}

// --- Обработка сообщений ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // --- Команда админа для установки промта ---
    if (text.startsWith('/setprompt') && isAdmin(chatId)) {
        const newPrompt = text.replace('/setprompt', '').trim();
        if (!newPrompt) {
            bot.sendMessage(chatId, "⚠️ Укажите текст промта после команды.");
            return;
        }
        setAdminPrompt(newPrompt);
        bot.sendMessage(chatId, "✅ Новый промт установлен!");
        return;
    }

    // --- Системный промт ---
    const systemPrompt = prompts.admin_prompt || prompts.default;

    // --- Добавляем сообщение пользователя в историю ---
    addToHistory(chatId, 'user', text);

    // --- Формируем массив сообщений для GPT ---
    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistories[chatId]
    ];

    try {
        bot.sendChatAction(chatId, 'typing');
        const response = await provider.chatCompletion(messages, options);

        // --- Добавляем ответ бота в историю ---
        addToHistory(chatId, 'assistant', response);

        bot.sendMessage(chatId, response);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "❌ Ошибка при обработке запроса.");
    }
});

console.log("🤖 Бот запущен и работает!");
