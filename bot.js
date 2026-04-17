const { Pool } = require("pg");
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg"); // <-- ESTA ES LA LÍNEA CLAVE

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

// 📋 Comando /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMsg = `👋 ¡Bot Anti-Duplicados (Versión Render)!

🛡️ Base de datos en la nube. Tus datos están seguros.

📄 Comandos:
/estado - Muestra archivos únicos
/limpiar - Borra memoria (Admins)
/info - Apoya el proyecto`;

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

    const res = await pool.query(
      'SELECT 1 FROM archivos WHERE chat_id = $1 AND file_unique_id = $2',
      [chatId, fileUniqueId]
    );

    if (res.rows.length > 0) {
      // 🔥 ES DUPLICADO
      try {
        if (!isGroup) {
          await bot.sendMessage(chatId, "🔁 Este archivo ya fue enviado anteriormente.");
        }
        await bot.deleteMessage(chatId, msg.message_id);
      } catch (err) {
        if (!isGroup) await bot.sendMessage(chatId, "⚠️ Duplicado detectado, sin permisos para borrar.");
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
        await bot.sendMessage(chatId, "✅ Archivo recibido y registrado correctamente.");
      }
    }
  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
  }
});

// 📊 Comando /estado
bot.onText(/\/estado/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const res = await pool.query('SELECT COUNT(*) as count FROM archivos WHERE chat_id = $1', [chatId]);
    bot.sendMessage(chatId, `📊 Tengo registrados ${res.rows[0].count} archivos únicos.`);
  } catch (err) {
    bot.sendMessage(chatId, "Error obteniendo estado.");
  }
});

// 🧹 Comando /limpiar
bot.onText(/\/limpiar/, async (msg) => {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  if (isGroup) {
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const isAdmin = admins.some((admin) => admin.user.id === msg.from.id);
      if (!isAdmin) return bot.sendMessage(chatId, "❌ Solo admins.");
    } catch (err) {
      return bot.sendMessage(chatId, "⚠️ Error verificando admin.");
    }
  }

  try {
    const res = await pool.query('DELETE FROM archivos WHERE chat_id = $1', [chatId]);
    bot.sendMessage(chatId, `🧹 Memoria limpiada. Registros eliminados: ${res.rowCount}`);
  } catch (err) {
    bot.sendMessage(chatId, "Error limpiando memoria.");
  }
});

// 💰 Comando /info
bot.onText(/\/info/, (msg) => {
  const mensaje = `
<b>💖 ¡Ayuda a mantener el Bot!</b>
Este bot corre en Render con base de datos segura.
Si te gusta, considera apoyar el proyecto.

👉 <a href="AQUI_TU_ENLACE">Donar</a>
  `;
  bot.sendMessage(msg.chat.id, mensaje, { parse_mode: "HTML" });
});

bot.onText(/\/donar/, (msg) => {
  const mensaje = `<b>💖 ¡Gracias por considerar apoyar!</b>\n\n👉 <a href="AQUI_TU_ENLACE">Donar aquí</a>`;
  bot.sendMessage(msg.chat.id, mensaje, { parse_mode: "HTML" });
});

console.log("✅ Bot iniciado correctamente (Postgres Mode).");
