require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg"); // Línea clave para Postgres
const http = require("http"); // Necesario para el truco de Render

// 🔐 Configuración
const TOKEN = process.env.TOKEN;
if (!TOKEN) throw new Error("No se ha definido el TOKEN en el archivo .env");

const bot = new TelegramBot(TOKEN, { polling: true });

// 🗄️ Conexión a PostgreSQL (Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 🗄️ Inicializar Tabla
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS archivos (
        chat_id BIGINT,
        file_unique_id TEXT,
        user_id BIGINT,
        username TEXT,
        fecha BIGINT,
        PRIMARY KEY (chat_id, file_unique_id)
      );
    `);
    console.log("✅ Base de datos Postgres conectada y lista.");
  } catch (err) {
    console.error("Error conectando a DB:", err);
  }
};

initDb();

// 📋 Comando /start (INGLÉS)
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMsg = `👋 <b>Hi! I'm your chat guardian.</b>

My mission is to ensure you never see the same file twice. If I spot a duplicate, I'll delete it instantly!

📄 <b>Available Commands:</b>
/status - Shows unique files saved
/clean - Clears my memory (Admins only)
/info - Support the project`;

  bot.sendMessage(chatId, welcomeMsg, { parse_mode: "HTML" });
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

    const res = await pool.query(
      'SELECT 1 FROM archivos WHERE chat_id = $1 AND file_unique_id = $2',
      [chatId, fileUniqueId]
    );

    if (res.rows.length > 0) {
      // 🔥 ES DUPLICADO
      try {
        if (!isGroup) {
          await bot.sendMessage(chatId, "🔁 This file was already sent before.");
        }
        await bot.deleteMessage(chatId, msg.message_id);
      } catch (err) {
        if (!isGroup) await bot.sendMessage(chatId, "⚠️ Duplicate detected, but I can't delete it.");
      }
    } else {
      // ✅ ES NUEVO
      const username = msg.from.username || "";
      await pool.query(
        'INSERT INTO archivos (chat_id, file_unique_id, user_id, username, fecha) VALUES ($1, $2, $3, $4, $5)',
        [chatId, fileUniqueId, msg.from.id, username, Date.now()]
      );

      console.log(`[Nuevo] Chat: ${chatId}`);
      if (!isGroup) {
        await bot.sendMessage(chatId, "✅ File received and registered successfully.");
      }
    }
  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
  }
});

// 📊 Comando /status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const res = await pool.query('SELECT COUNT(*) as count FROM archivos WHERE chat_id = $1', [chatId]);
    bot.sendMessage(chatId, `📊 I have registered ${res.rows[0].count} unique files.`);
  } catch (err) {
    bot.sendMessage(chatId, "Error getting status.");
  }
});

// 🧹 Comando /clean
bot.onText(/\/clean/, async (msg) => {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  if (isGroup) {
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const isAdmin = admins.some((admin) => admin.user.id === msg.from.id);
      if (!isAdmin) return bot.sendMessage(chatId, "❌ Admins only.");
    } catch (err) {
      return bot.sendMessage(chatId, "⚠️ Error verifying admin.");
    }
  }

  try {
    const res = await pool.query('DELETE FROM archivos WHERE chat_id = $1', [chatId]);
    bot.sendMessage(chatId, `🧹 Memory cleaned. Records deleted: ${res.rowCount}`);
  } catch (err) {
    bot.sendMessage(chatId, "Error cleaning memory.");
  }
});

// 💰 Comando /info
bot.onText(/\/info/, (msg) => {
  const mensaje = `
<b>💖 Help maintain the Bot!</b>
This bot runs on Render with a secure database.
If you like it, consider supporting the project.

👉 <a href="AQUI_TU_ENLACE">Donate here</a>
  `;
  bot.sendMessage(msg.chat.id, mensaje, { parse_mode: "HTML" });
});

bot.onText(/\/donar/, (msg) => {
  const mensaje = `<b>💖 Thanks for considering supporting!</b>\n\n👉 <a href="AQUI_TU_ENLACE">Donate here</a>`;
  bot.sendMessage(msg.chat.id, mensaje, { parse_mode: "HTML" });
});

// 🌐 TRUCO PARA RENDER (WEB SERVICE GRATUITO)
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running.');
});

server.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT} (Render Trick)`);
  console.log("✅ Bot iniciado correctamente (Postgres Mode).");
});


