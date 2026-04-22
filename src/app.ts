import * as dotenv from "dotenv";
import { Telegraf } from "telegraf";
import { google } from "googleapis";

dotenv.config();

// ================== BOT ==================
const bot = new Telegraf(process.env.BOT_TOKEN!);
const GROUP_ID = Number(process.env.GROUP_ID!);
const SPREADSHEET_ID = process.env.SHEET_ID!;

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

// ================== STATUS ==================
function formatStatus(status: string) {
  if (status === "В работе") return "🟡 В работе";
  if (status === "Закрыто") return "🟢 Закрыто";
  if (status === "Отказ") return "🔴 Отказ";
  return "🔵 Новый";
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

// ================== UPDATE SHEET STATUS ==================
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

// ================== BOT MESSAGE ==================
bot.on("message", async (ctx: any) => {
  if (!ctx.from || !ctx.chat) return;
  if (ctx.chat.id === GROUP_ID) return;

  const userId = ctx.from.id;
  const name = ctx.from.first_name || "Client";
  const username = ctx.from.username;
  const profile = username ? `@${username}` : `ID:${userId}`;

  const text = getContent(ctx);

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
});

// ================== SAFE BUTTONS (NO CRASH UI) ==================
bot.action(/work_(\d+)/, async (ctx) => {
  const userId = Number(ctx.match[1]);

  try {
    const msg = ctx.callbackQuery.message as any;

    await ctx.editMessageText(
      msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🟡 В работе"),
      { reply_markup: msg.reply_markup }
    );
  } catch (e) {
    console.log("EDIT ERROR:", e);
  }

  await updateSheetStatus(userId, "В работе");
  await ctx.answerCbQuery("В работе");
});

bot.action(/done_(\d+)/, async (ctx) => {
  const userId = Number(ctx.match[1]);

  try {
    const msg = ctx.callbackQuery.message as any;

    await ctx.editMessageText(
      msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🟢 Закрыто"),
      { reply_markup: msg.reply_markup }
    );
  } catch (e) {
    console.log("EDIT ERROR:", e);
  }

  await updateSheetStatus(userId, "Закрыто");
  await ctx.answerCbQuery("Закрыто");
});

bot.action(/reject_(\d+)/, async (ctx) => {
  const userId = Number(ctx.match[1]);

  try {
    const msg = ctx.callbackQuery.message as any;

    await ctx.editMessageText(
      msg.text.replace(/📊 Статус:.*/, "📊 Статус: 🔴 Отказ"),
      { reply_markup: msg.reply_markup }
    );
  } catch (e) {
    console.log("EDIT ERROR:", e);
  }

  await updateSheetStatus(userId, "Отказ");
  await ctx.answerCbQuery("Отказ");
});

// ================== START ==================
bot.launch();

console.log("🚀 CRM FINAL STABLE BUILD READY");