import * as dotenv from "dotenv";
import express from "express";
import { Telegraf } from "telegraf";
import { google } from "googleapis";

dotenv.config();

// ================== BOT ==================
const bot = new Telegraf(process.env.BOT_TOKEN!);
const GROUP_ID = Number(process.env.GROUP_ID!);
const SPREADSHEET_ID = process.env.SHEET_ID!;

// ================== KEEP ALIVE SERVER ==================
const app = express();

app.get("/", (req, res) => {
  res.send("BOT IS ALIVE");
});

app.get("/status", (req, res) => {
  res.json({
    status: "alive",
    time: new Date().toISOString(),
  });
});

// FIX: TypeScript + Replit port fix
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("KEEP ALIVE SERVER RUNNING");
});

// ================== GOOGLE ==================
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ================== TIME ==================
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

// ================== HELPERS ==================
function getContent(ctx: any): string {
  if (ctx.message?.text) return ctx.message.text;
  if (ctx.message?.photo) return "[Фото]";
  if (ctx.message?.video) return "[Видео]";
  if (ctx.message?.document) return "[Документ]";
  return "[Сообщение]";
}

// ================== SAVE ==================
async function saveToSheet(data: any) {
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

// ================== UPDATE STATUS ==================
async function updateSheetStatus(userId: number, status: string) {
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

    if (rowIndex === -1) return;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `E${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[status]],
      },
    });

  } catch (e) {
    console.log("SHEETS ERROR:", e);
  }
}

// ================== MAIN LOGIC ==================
bot.on("message", async (ctx: any) => {
  try {
    if (!ctx.from || !ctx.chat) return;

    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const text = ctx.message?.text;
    if (!text) return;

    // CLIENT → GROUP
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

    // GROUP → USER
    const reply = ctx.message?.reply_to_message;
    if (!reply) return;

    const match = reply.text?.match(/ID:(\d+)/);
    if (!match) return;

    const targetUser = Number(match[1]);

    await ctx.telegram.sendMessage(targetUser, text);

  } catch (e) {
    console.log("ERROR:", e);
  }
});

// ================== STATUS BUTTONS ==================
bot.action(/work_(\d+)/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  const msg = ctx.callbackQuery.message as any;

  try {
    await ctx.editMessageText(
      msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🟡 В работе"),
      { reply_markup: msg.reply_markup }
    );
  } catch {}

  await updateSheetStatus(userId, "В работе");
  await ctx.answerCbQuery();
});

bot.action(/done_(\d+)/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  const msg = ctx.callbackQuery.message as any;

  try {
    await ctx.editMessageText(
      msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🟢 Закрыто"),
      { reply_markup: msg.reply_markup }
    );
  } catch {}

  await updateSheetStatus(userId, "Закрыто");
  await ctx.answerCbQuery();
});

bot.action(/reject_(\d+)/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  const msg = ctx.callbackQuery.message as any;

  try {
    await ctx.editMessageText(
      msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🔴 Отказ"),
      { reply_markup: msg.reply_markup }
    );
  } catch {}

  await updateSheetStatus(userId, "Отказ");
  await ctx.answerCbQuery();
});

// ================== START ==================
bot.launch();

console.log("🚀 CRM FIXED + KEEP ALIVE RUNNING");
