const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { postToFacebookGroups, getGroupInfos } = require('./puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fonction pour envoyer une notification WhatsApp via Evolution API
async function sendWhatsAppNotification(summary) {
  try {
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
    const data = {
      number: process.env.NOTIFICATION_PHONE,
      text: summary,
      delay: 1200,
      linkPreview: true
    };

    await axios.post(url, data, {
      headers: {
        'apikey': process.env.EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Notification WhatsApp envoyée.');
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la notification WhatsApp:', error.response ? error.response.data : error.message);
  }
}

// Configuration Multer pour l'upload d'images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Route pour lister les comptes disponibles
app.get('/api/accounts', (req, res) => {
  const sessionsDir = path.join(__dirname, 'fb_sessions');
  if (!fs.existsSync(sessionsDir)) {
    return res.json({ success: true, accounts: [] });
  }
  
  const accounts = fs.readdirSync(sessionsDir).filter(file => {
    return fs.statSync(path.join(sessionsDir, file)).isDirectory();
  });
  
  res.json({ success: true, accounts });
});

// Route pour poster sur Facebook
app.post('/api/post', upload.array('images', 10), async (req, res) => {
  try {
    const { description, groups, accountId } = req.body;
    const images = req.files ? req.files.map(file => file.path) : [];

    // Séparer les groupes par virgule OU par retour à la ligne
    const groupsArray = groups
      .split(/[,\n]/)
      .map(g => g.trim())
      .filter(g => g.length > 0);

    console.log(`Demande de publication reçue pour ${groupsArray.length} groupes avec le compte ${accountId}.`);

    // On lance le processus
    const results = await postToFacebookGroups({
      description,
      images,
      groups: groupsArray,
      accountId
    });

    // Préparer le résumé WhatsApp
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    let summary = `📢 *Rapport Auto-Poster Facebook*\n\n`;
    summary += `✅ Réussis : ${successCount}\n`;
    summary += `❌ Échecs : ${errorCount}\n`;
    summary += `📊 Total : ${results.length}\n\n`;
    
    if (errorCount > 0) {
      summary += `*Détails des erreurs :*\n`;
      results.filter(r => r.status === 'error').forEach(r => {
        summary += `- ${r.group}: ${r.error.substring(0, 50)}...\n`;
      });
    }

    // Envoyer le résumé
    await sendWhatsAppNotification(summary);

    res.json({ success: true, results });

  } catch (error) {
    console.error('Erreur:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// Route pour récupérer les infos des groupes
app.post('/api/scrape-groups', async (req, res) => {
    try {
      const { groups, accountId } = req.body;
      const groupsArray = groups
        .split(/[,\n]/)
        .map(g => g.trim())
        .filter(g => g.length > 0);
  
      console.log(`Demande de récupération d'infos pour ${groupsArray.length} groupes avec le compte ${accountId}.`);
  
      const results = await getGroupInfos(groupsArray, accountId);
      res.json({ success: true, results });
    } catch (error) {
      console.error('Erreur:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

// Route de nettoyage des uploads
app.post('/api/cleanup', (req, res) => {
  const uploadsDir = 'uploads/';
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      res.status(500).json({ success: false });
      return;
    }
    files.forEach(file => {
      fs.unlink(path.join(uploadsDir, file), err => {
        if (err) console.error(err);
      });
    });
    res.json({ success: true });
  });
});

const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

server.on('error', (err) => {
  console.error('❌ ERREUR SERVEUR:', err);
});

server.on('close', () => {
  console.log('⚠️ LE SERVEUR S\'EST FERMÉ');
});

process.on('uncaughtException', (err) => {
  console.error('❌ ERREUR NON CAPTURÉE:', err);
});
