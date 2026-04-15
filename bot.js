require("dotenv").config(); // Asegúrate de que esto sea lo primero
const TelegramBot = require("node-telegram-bot-api");
const Database = require("better-sqlite3"); // Usamos SQLite para PC
const path = require("path");
const fs = require("fs");

// 🔐 Configuración
const TOKEN = process.env.TOKEN;
// Si no hay token, lanza error y DETIENE el bot antes de intentar conectar
if (!TOKEN) throw new Error("ERROR: No se encontró la variable TOKEN en el archivo .env");

const bot = new TelegramBot(TOKEN, { polling: true });

// 🗄️ Base de datos SQLite (Para uso local en PC)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, "bot_duplicados.db");
const db = new Database(dbPath);

// Inicializar tabla
db.exec(`
  CREATE TABLE IF NOT EXISTS archivos (
    chat_id INTEGER,
    file_unique_id TEXT,
    user_id INTEGER,
    username TEXT,
    fecha INTEGER,
    PRIMARY KEY (chat_id, file_unique_id)
  );
`);

const checkDuplicateStmt = db.prepare(
  "SELECT 1 FROM archivos WHERE chat_id = ? AND file_unique_id = ?",
);

const insertFileStmt = db.prepare(
  "INSERT INTO archivos (chat_id, file_unique_id, user_id, username, fecha) VALUES (?, ?, ?, ?, ?)",
);

const deleteFileStmt = db.prepare("DELETE FROM archivos WHERE chat_id = ?");
const countFilesStmt = db.prepare(
  "SELECT COUNT(*) as count FROM archivos WHERE chat_id = ?",
);

// 📋 Comando /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMsg = `👋 Anti-Duplicate Bot

🛡️ Running with a local database.

📄 Comandos:
/status - Shows unique files
/clean - Clears memory 
/info - Support the project`;

  bot.sendMessage(chatId, welcomeMsg);
});

// 📥 Manejador principal
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  if (!msg.from) return;
  if (!msg.document && !msg.photo && !msg.video) return;

  try {
    let fileUniqueId;
    if (msg.document) fileUniqueId = msg.document.file_unique_id;
    else if (msg.video) fileUniqueId = msg.video.file_unique_id;
    else if (msg.photo) {
      fileUniqueId = msg.photo[msg.photo.length - 1].file_unique_id;
    }

    const exists = checkDuplicateStmt.get(chatId, fileUniqueId);

    if (exists) {
      // 🔥 DUPLICADO
      try {
        if (!isGroup) {
          await bot.sendMessage(chatId, "🔁 Este archivo ya fue enviado anteriormente.");
        }
        await bot.deleteMessage(chatId, msg.message_id);
      } catch (err) {
        if (!isGroup) await bot.sendMessage(chatId, "⚠️ Duplicado detectado, sin permisos para borrar.");
      }
    } else {
      // ✅ NUEVO
      const username = msg.from.username || "";
      insertFileStmt.run(
        chatId,
        fileUniqueId,
        msg.from.id,
        username,
        Date.now(),
      );
      
      console.log(`[Nuevo] Chat: ${chatId}`);
      if (!isGroup) {
        await bot.sendMessage(chatId, "✅ Archivo recibido y registrado correctamente.");
      }
    }
  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
  }
});

// 📊 /estado
bot.onText(/\/estado/, (msg) => {
  const chatId = msg.chat.id;
  const row = countFilesStmt.get(chatId);
  bot.sendMessage(chatId, `📊 Tengo registrados ${row.count} archivos únicos.`);
});

// 🧹 /limpiar
bot.onText(/\/limpiar/, async (msg) => {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  if (isGroup) {
    const admins = await bot.getChatAdministrators(chatId);
    const isAdmin = admins.some((admin) => admin.user.id === msg.from.id);
    if (!isAdmin) return bot.sendMessage(chatId, "❌ Solo admins.");
  }

  const info = deleteFileStmt.run(chatId);
  bot.sendMessage(chatId, `🧹 Memoria limpiada.`);
});

// 💰 /info y /donar
const donarMsg = `<b>💖 If you’d like to help support and maintain the bot, you can make a donation here:</b>\n\n👉 Donation address: 0x14e71d490ce4b4952b88da683602024e37ddec07 (BSC - BEP20 network)."`;

bot.onText(/\/info/, (msg) => bot.sendMessage(msg.chat.id, donarMsg, { parse_mode: "HTML" }));
bot.onText(/\/donar/, (msg) => bot.sendMessage(msg.chat.id, donarMsg, { parse_mode: "HTML" }));

console.log("✅ Bot iniciado correctamente (Modo Local SQLite).");