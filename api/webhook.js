// api/webhook.js - BOT AIRDROP DENGAN TOMBOL INTERAKTIF
const TelegramBot = require('node-telegram-bot-api');

// Ambil dari environment variables (diatur di Vercel)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Storage sementara (nanti bisa diganti KV Database)
let airdrops = [];
let masterMessageId = null;

// Fungsi untuk generate pesan master list
function generateMasterList() {
  if (airdrops.length === 0) {
    return '📋 *DAFTAR AIRDROP*\n\n_Belum ada airdrop. Kirim message dengan tag *new airdrop untuk menambahkan._';
  }
  
  let message = '📋 *DAFTAR AIRDROP TERBARU*\n\n';
  
  airdrops.forEach((airdrop, idx) => {
    message += `${idx + 1}. *${airdrop.name}*\n`;
    message += `   🚀 Start: ${airdrop.start}\n`;
    message += `   📝 ${airdrop.tasks.substring(0, 50)}...\n`;
    message += `   🔗 [Detail](${airdrop.link})\n`;
    message += `   📅 Added: ${airdrop.dateAdded}\n\n`;
  });
  
  const now = new Date().toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  message += `_Last update: ${now}_`;
  
  return message;
}

// Fungsi untuk generate inline keyboard (tombol)
function generateKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Refresh List', callback_data: 'refresh_list' },
        { text: '✏️ Edit Airdrop', callback_data: 'edit_menu' }
      ],
      [
        { text: '➕ Manual Add', callback_data: 'manual_add' },
        { text: '🗑️ Hapus Airdrop', callback_data: 'delete_menu' }
      ]
    ]
  };
}

// Parse info airdrop dari text message
function parseAirdropInfo(text) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  
  // Cari nama (baris setelah *new airdrop)
  const nameIndex = lines.findIndex(l => l.includes('*new airdrop')) + 1;
  const name = lines[nameIndex] || 'Unknown Airdrop';
  
  // Cari start date
  const startLine = lines.find(l => l.toLowerCase().includes('start'));
  const start = startLine ? startLine.split(':')[1]?.trim() : 'TBA';
  
  // Cari tasks (semua baris setelah "task" atau "tugas")
  const taskIndex = lines.findIndex(l => 
    l.toLowerCase().includes('task') || 
    l.toLowerCase().includes('tugas')
  );
  const tasks = taskIndex >= 0 ? lines.slice(taskIndex + 1).join('\n') : 'Tidak ada task';
  
  return { name, start, tasks };
}

// Fungsi utama untuk handle webhook
module.exports = async (req, res) => {
  // Cek method POST (dari Telegram)
  if (req.method !== 'POST') {
    return res.status(200).send('Bot is running');
  }

  const bot = new TelegramBot(BOT_TOKEN);
  const { message, channel_post, callback_query } = req.body;

  try {
    // HANDLE CHANNEL POST (message di channel)
    if (channel_post) {
      const msg = channel_post;
      
      // Detect tag "*new airdrop"
      if (msg.text && msg.text.includes('*new airdrop')) {
        // Parse info airdrop
        const { name, start, tasks } = parseAirdropInfo(msg.text);
        
        // Buat link ke message original
        const chatId = String(msg.chat.id).replace('-100', '');
        const username = msg.chat.username;
        const messageLink = username 
          ? `https://t.me/${username}/${msg.message_id}`
          : `https://t.me/c/${chatId}/${msg.message_id}`;
        
        // Tambah ke array airdrops
        airdrops.push({
          id: Date.now(), // ID unik
          name,
          start,
          tasks,
          link: messageLink,
          dateAdded: new Date().toLocaleDateString('id-ID')
        });
        
        // Generate message list
        const listMessage = generateMasterList();
        const keyboard = generateKeyboard();
        
        // Kirim atau update master list
        if (masterMessageId) {
          // Edit message yang sudah ada
          await bot.editMessageText(listMessage, {
            chat_id: CHANNEL_ID,
            message_id: masterMessageId,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: keyboard
          });
        } else {
          // Kirim message baru
          const sent = await bot.sendMessage(CHANNEL_ID, listMessage, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: keyboard
          });
          masterMessageId = sent.message_id;
        }
      }
    }
    
    // HANDLE CALLBACK QUERY (tombol dipencet)
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const messageId = callback_query.message.message_id;
      const data = callback_query.data;
      
      // Refresh list
      if (data === 'refresh_list') {
        const listMessage = generateMasterList();
        const keyboard = generateKeyboard();
        
        await bot.editMessageText(listMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: keyboard
        });
        
        await bot.answerCallbackQuery(callback_query.id, {
          text: '✅ List sudah direfresh!',
          show_alert: false
        });
      }
      
      // Menu edit
      if (data === 'edit_menu') {
        if (airdrops.length === 0) {
          await bot.answerCallbackQuery(callback_query.id, {
            text: '❌ Belum ada airdrop untuk diedit',
            show_alert: true
          });
          return res.status(200).send('OK');
        }
        
        // Bikin keyboard pilihan airdrop
        const editKeyboard = {
          inline_keyboard: [
            ...airdrops.map((airdrop, idx) => [{
              text: `${idx + 1}. ${airdrop.name}`,
              callback_data: `edit_${airdrop.id}`
            }]),
            [{ text: '« Kembali', callback_data: 'refresh_list' }]
          ]
        };
        
        await bot.editMessageText('✏️ *Pilih airdrop yang mau diedit:*', {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: editKeyboard
        });
        
        await bot.answerCallbackQuery(callback_query.id);
      }
      
      // Menu delete
      if (data === 'delete_menu') {
        if (airdrops.length === 0) {
          await bot.answerCallbackQuery(callback_query.id, {
            text: '❌ Belum ada airdrop untuk dihapus',
            show_alert: true
          });
          return res.status(200).send('OK');
        }
        
        const deleteKeyboard = {
          inline_keyboard: [
            ...airdrops.map((airdrop, idx) => [{
              text: `${idx + 1}. ${airdrop.name}`,
              callback_data: `delete_${airdrop.id}`
            }]),
            [{ text: '« Kembali', callback_data: 'refresh_list' }]
          ]
        };
        
        await bot.editMessageText('🗑️ *Pilih airdrop yang mau dihapus:*', {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: deleteKeyboard
        });
        
        await bot.answerCallbackQuery(callback_query.id);
      }
      
      // Handle delete airdrop
      if (data.startsWith('delete_')) {
        const airdropId = parseInt(data.replace('delete_', ''));
        const airdropIndex = airdrops.findIndex(a => a.id === airdropId);
        
        if (airdropIndex >= 0) {
          const deletedName = airdrops[airdropIndex].name;
          airdrops.splice(airdropIndex, 1);
          
          // Update master list
          const listMessage = generateMasterList();
          const keyboard = generateKeyboard();
          
          await bot.editMessageText(listMessage, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: keyboard
          });
          
          await bot.answerCallbackQuery(callback_query.id, {
            text: `✅ ${deletedName} berhasil dihapus!`,
            show_alert: false
          });
        }
      }
      
      // Handle edit airdrop (show options)
      if (data.startsWith('edit_')) {
        const airdropId = parseInt(data.replace('edit_', ''));
        const airdrop = airdrops.find(a => a.id === airdropId);
        
        if (airdrop) {
          const editOptionsKeyboard = {
            inline_keyboard: [
              [{ text: '🚀 Edit Start Date', callback_data: `editstart_${airdropId}` }],
              [{ text: '📝 Edit Tasks', callback_data: `edittasks_${airdropId}` }],
              [{ text: '📛 Edit Nama', callback_data: `editname_${airdropId}` }],
              [{ text: '« Kembali', callback_data: 'edit_menu' }]
            ]
          };
          
          const msg = `✏️ *Edit: ${airdrop.name}*\n\nPilih yang mau diedit:`;
          
          await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: editOptionsKeyboard
          });
          
          await bot.answerCallbackQuery(callback_query.id);
        }
      }
      
      // Manual add
      if (data === 'manual_add') {
        await bot.answerCallbackQuery(callback_query.id, {
          text: 'ℹ️ Untuk menambah airdrop, kirim message dengan format:\n\n*new airdrop\nNama Airdrop\nStart: DD/MM/YYYY\nTask: Deskripsi task',
          show_alert: true
        });
      }
    }
    
    // HANDLE COMMAND /list (backup)
    if (message && message.text === '/list') {
      const listMessage = generateMasterList();
      const keyboard = generateKeyboard();
      
      await bot.sendMessage(message.chat.id, listMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
    }
    
    return res.status(200).send('OK');
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(200).send('OK');
  }
};
