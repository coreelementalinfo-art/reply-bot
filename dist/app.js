"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const telegraf_1 = require("telegraf");
const googleapis_1 = require("googleapis");
dotenv.config();
const bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
const GROUP_ID = Number(process.env.GROUP_ID);
const SPREADSHEET_ID = process.env.SHEET_ID;
const auth = new googleapis_1.google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = googleapis_1.google.sheets({ version: "v4", auth });
function getKyivTime() {
    return new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Kyiv",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date());
}
function getContent(ctx) {
    if (ctx.message?.text)
        return ctx.message.text;
    if (ctx.message?.photo)
        return "[Фото]";
    if (ctx.message?.video)
        return "[Видео]";
    if (ctx.message?.document)
        return "[Документ]";
    return "[Сообщение]";
}
async function saveToSheet(data) {
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "A:F",
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [[
                    getKyivTime(),
                    data.name,
                    String(data.userId),
                    data.message,
                    "Новый",
                    data.telegram,
                ]],
        },
    });
}
async function updateSheetStatus(userId, status) {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "A:F",
        });
        const rows = res.data.values || [];
        let rowIndex = -1;
        for (let i = rows.length - 1; i >= 0; i--) {
            if (String(rows[i]?.[2]).trim() === String(userId)) {
                rowIndex = i + 1;
                break;
            }
        }
        if (rowIndex === -1)
            return;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `E${rowIndex}`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[status]],
            },
        });
    }
    catch (e) {
        console.log("SHEETS ERROR:", e);
    }
}
bot.on("message", async (ctx) => {
    try {
        if (!ctx.from || !ctx.chat)
            return;
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const text = ctx.message?.text;
        if (!text)
            return;
        if (chatId !== GROUP_ID) {
            const name = ctx.from.first_name || "Client";
            const username = ctx.from.username;
            const profile = username ? `@${username}` : `ID:${userId}`;
            const message = `━━━━━━━━━━━━━━
🕒 ${getKyivTime()}
👤 ${name}
🆔 ${userId}
🔗 ${profile}

📦 ${text}

📊 Статус: 🔵 Новый
━━━━━━━━━━━━━━
ID:${userId}`;
            await ctx.telegram.sendMessage(GROUP_ID, message, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🟡 В работе", callback_data: `work_${userId}` },
                            { text: "🟢 Закрыто", callback_data: `done_${userId}` },
                        ],
                        [{ text: "🔴 Отказ", callback_data: `reject_${userId}` }],
                    ],
                },
            });
            await saveToSheet({
                name,
                userId,
                message: text,
                telegram: profile,
            });
            await ctx.reply("Дякуємо! Менеджер скоро зв’яжется з вами.");
            return;
        }
        const reply = ctx.message?.reply_to_message;
        if (!reply)
            return;
        const match = reply.text?.match(/ID:(\d+)/);
        if (!match)
            return;
        const targetUser = Number(match[1]);
        await ctx.telegram.sendMessage(targetUser, text);
    }
    catch (e) {
        console.log("ERROR:", e);
    }
});
bot.action(/work_(\d+)/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    const msg = ctx.callbackQuery.message;
    try {
        await ctx.editMessageText(msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🟡 В работе"), { reply_markup: msg.reply_markup });
    }
    catch { }
    await updateSheetStatus(userId, "В работе");
    await ctx.answerCbQuery("В работе");
});
bot.action(/done_(\d+)/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    const msg = ctx.callbackQuery.message;
    try {
        await ctx.editMessageText(msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🟢 Закрыто"), { reply_markup: msg.reply_markup });
    }
    catch { }
    await updateSheetStatus(userId, "Закрыто");
    await ctx.answerCbQuery("Закрыто");
});
bot.action(/reject_(\d+)/, async (ctx) => {
    const userId = Number(ctx.match[1]);
    const msg = ctx.callbackQuery.message;
    try {
        await ctx.editMessageText(msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🔴 Отказ"), { reply_markup: msg.reply_markup });
    }
    catch { }
    await updateSheetStatus(userId, "Отказ");
    await ctx.answerCbQuery("Отказ");
});
bot.launch();
console.log("🚀 CRM FIXED STABLE VERSION RUNNING");
