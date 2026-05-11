# Plan Détaillé - Système Automatique de Publication Facebook Groups

## Architecture du Projet
- **Backend**: Node.js + Express + Puppeteer (sur VPS)
- **Frontend**: Interface web HTML/CSS/JS simple
- **Stockage**: Uploads temporaires d'images
- **Automatisation**: Puppeteer pour l'interaction avec Facebook

---

## Étape 1: Configuration du VPS

### 1.1 Installation de Node.js et npm
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 1.2 Installation des dépendances système pour Puppeteer
```bash
sudo apt-get update
sudo apt-get install -y \
  chromium-browser \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils
```

### 1.3 Installation de Git (optionnel)
```bash
sudo apt-get install -y git
```

### ✅ Tests de validation Étape 1
```bash
# Test Node.js
node --version  # Doit afficher v18.x.x ou supérieur

# Test npm
npm --version   # Doit afficher une version

# Test Chromium
chromium-browser --version  # Doit afficher une version
```

---

## Étape 2: Structure du Projet

### 2.1 Création du répertoire du projet
```bash
mkdir -p ~/facebook-auto-poster
cd ~/facebook-auto-poster
```

### 2.2 Initialisation du projet Node.js
```bash
npm init -y
```

### 2.3 Installation des dépendances npm
```bash
npm install express puppeteer multer dotenv cors
```

### 2.4 Structure des dossiers
```
facebook-auto-poster/
├── server.js              # Serveur Express principal
├── puppeteer.js           # Script d'automatisation Facebook
├── package.json
├── .env                   # Variables d'environnement
├── public/                # Fichiers statiques
│   ├── index.html        # Interface web
│   ├── style.css         # Styles
│   └── script.js         # Logique frontend
└── uploads/              # Uploads temporaires d'images
```

### 2.5 Création des dossiers
```bash
mkdir -p public uploads
```

### ✅ Tests de validation Étape 2
```bash
# Vérifier la structure
ls -la ~/facebook-auto-poster/
# Doit afficher: package.json, public/, uploads/

# Vérifier les dépendances installées
cat package.json | grep dependencies
# Doit afficher: express, puppeteer, multer, dotenv, cors
```

---

## Étape 3: Configuration du Backend Express

### 3.1 Créer le fichier `.env`
```bash
nano .env
```

Contenu:
```env
PORT=3000
NODE_ENV=production
# Facebook credentials (optionnel - pour login automatique)
FB_EMAIL=votre_email@example.com
FB_PASSWORD=votre_mot_de_passe
```

### 3.2 Créer le fichier `server.js`
```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { postToFacebookGroups } = require('./puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Route pour poster sur Facebook
app.post('/api/post', upload.array('images', 10), async (req, res) => {
  try {
    const { description, groups } = req.body;
    const images = req.files.map(file => file.path);

    const groupsArray = groups.split(',').map(g => g.trim());

    const result = await postToFacebookGroups({
      description,
      images,
      groups: groupsArray
    });

    res.json({ success: true, result });
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

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
```

### ✅ Tests de validation Étape 3
```bash
# Démarrer le serveur
node server.js
# Doit afficher: "Serveur démarré sur le port 3000"

# Test depuis un autre terminal
curl http://localhost:3000
# Doit retourner le contenu de index.html (ou 404 si pas encore créé)

# Arrêter le serveur avec Ctrl+C
```

---

## Étape 4: Interface Web Frontend

### 4.1 Créer `public/index.html`
```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facebook Auto Poster</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>📤 Facebook Auto Poster</h1>
        
        <form id="postForm">
            <div class="form-group">
                <label for="description">Description du post</label>
                <textarea id="description" name="description" rows="4" required></textarea>
            </div>
            
            <div class="form-group">
                <label for="images">Images (jusqu'à 10)</label>
                <input type="file" id="images" name="images" multiple accept="image/*">
                <div id="imagePreview"></div>
            </div>
            
            <div class="form-group">
                <label for="groups">Groupes Facebook (séparés par des virgules)</label>
                <textarea id="groups" name="groups" rows="3" placeholder="groupe1, groupe2, groupe3" required></textarea>
            </div>
            
            <button type="submit" id="submitBtn">🚀 Poster sur Facebook</button>
        </form>
        
        <div id="status" class="status"></div>
    </div>
    
    <script src="script.js"></script>
</body>
</html>
```

### 4.2 Créer `public/style.css`
```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.container {
    background: white;
    padding: 40px;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 600px;
    width: 100%;
}

h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
}

.form-group {
    margin-bottom: 20px;
}

label {
    display: block;
    margin-bottom: 8px;
    color: #555;
    font-weight: 600;
}

textarea, input[type="file"] {
    width: 100%;
    padding: 12px;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
}

textarea:focus {
    outline: none;
    border-color: #667eea;
}

#imagePreview {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
}

#imagePreview img {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 8px;
}

button {
    width: 100%;
    padding: 15px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
}

button:hover {
    transform: translateY(-2px);
}

button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.status {
    margin-top: 20px;
    padding: 15px;
    border-radius: 8px;
    display: none;
}

.status.success {
    background: #d4edda;
    color: #155724;
    display: block;
}

.status.error {
    background: #f8d7da;
    color: #721c24;
    display: block;
}

.status.loading {
    background: #d1ecf1;
    color: #0c5460;
    display: block;
}
```

### 4.3 Créer `public/script.js`
```javascript
document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    const status = document.getElementById('status');
    
    submitBtn.disabled = true;
    status.className = 'status loading';
    status.textContent = '⏳ Publication en cours...';
    
    const formData = new FormData();
    formData.append('description', document.getElementById('description').value);
    formData.append('groups', document.getElementById('groups').value);
    
    const imageInput = document.getElementById('images');
    for (let i = 0; i < imageInput.files.length; i++) {
        formData.append('images', imageInput.files[i]);
    }
    
    try {
        const response = await fetch('/api/post', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            status.className = 'status success';
            status.textContent = '✅ Publication réussie!';
        } else {
            status.className = 'status error';
            status.textContent = '❌ Erreur: ' + result.error;
        }
    } catch (error) {
        status.className = 'status error';
        status.textContent = '❌ Erreur: ' + error.message;
    }
    
    submitBtn.disabled = false;
});

// Prévisualisation des images
document.getElementById('images').addEventListener('change', function(e) {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    
    for (let i = 0; i < this.files.length; i++) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            preview.appendChild(img);
        };
        reader.readAsDataURL(this.files[i]);
    }
});
```

### ✅ Tests de validation Étape 4
```bash
# Démarrer le serveur
node server.js

# Ouvrir dans un navigateur
# http://vps-ip:3000
# Doit afficher le formulaire avec:
# - Champ description
# - Upload d'images
# - Champ groupes
# - Bouton "Poster sur Facebook"
```

---

## Étape 5: Script Puppeteer pour Facebook

### 5.1 Créer `puppeteer.js`
```javascript
const puppeteer = require('puppeteer');

async function postToFacebookGroups({ description, images, groups }) {
    const browser = await puppeteer.launch({
        headless: false, // Mettre à true pour production
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    
    // Configuration de la taille de la fenêtre
    await page.setViewport({ width: 1280, height: 800 });
    
    const results = [];
    
    try {
        // Naviguer vers Facebook
        await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
        
        // Attendre que l'utilisateur se connecte (ou implémenter login automatique)
        console.log('Veuillez vous connecter à Facebook dans le navigateur ouvert...');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        // Pour chaque groupe
        for (const groupName of groups) {
            console.log(`Publication dans le groupe: ${groupName}`);
            
            try {
                // Rechercher le groupe
                await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(groupName)}`, { waitUntil: 'networkidle2' });
                
                // Cliquer sur le premier groupe trouvé
                await page.waitForSelector('a[href*="/groups/"]', { timeout: 10000 });
                await page.click('a[href*="/groups/"]');
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
                
                // Cliquer sur le champ de publication
                await page.waitForSelector('div[role="textbox"]', { timeout: 10000 });
                await page.click('div[role="textbox"]');
                
                // Ajouter la description
                await page.keyboard.type(description);
                
                // Ajouter des images si présentes
                if (images.length > 0) {
                    // Cliquer sur le bouton d'ajout de photo
                    const photoButton = await page.$('div[aria-label*="Photo"]');
                    if (photoButton) {
                        await photoButton.click();
                        
                        // Uploader chaque image
                        for (const imagePath of images) {
                            const fileInput = await page.$('input[type="file"]');
                            if (fileInput) {
                                await fileInput.uploadFile(imagePath);
                                await page.waitForTimeout(2000);
                            }
                        }
                    }
                }
                
                // Publier
                await page.keyboard.press('Enter');
                
                results.push({
                    group: groupName,
                    status: 'success',
                    message: 'Publié avec succès'
                });
                
                console.log(`✅ Publié dans ${groupName}`);
                
                // Attendre entre les posts pour éviter d'être bloqué
                await page.waitForTimeout(5000);
                
            } catch (error) {
                results.push({
                    group: groupName,
                    status: 'error',
                    message: error.message
                });
                console.error(`❌ Erreur pour ${groupName}:`, error.message);
            }
        }
        
    } catch (error) {
        console.error('Erreur générale:', error);
        throw error;
    } finally {
        await browser.close();
    }
    
    return results;
}

module.exports = { postToFacebookGroups };
```

### ✅ Tests de validation Étape 5
```bash
# Test du script Puppeteer
node -e "
const { postToFacebookGroups } = require('./puppeteer');
postToFacebookGroups({
    description: 'Test post',
    images: [],
    groups: ['test group']
}).then(console.log).catch(console.error);
"
# Doit ouvrir un navigateur Chrome et naviguer vers Facebook
```

---

## Étape 6: Sécurisation et Déploiement

### 6.1 Installation de PM2 pour la gestion des processus
```bash
sudo npm install -g pm2
```

### 6.2 Démarrage du serveur avec PM2
```bash
pm2 start server.js --name facebook-poster
pm2 save
pm2 startup
```

### 6.3 Configuration du firewall (UFW)
```bash
sudo ufw allow 3000/tcp
sudo ufw enable
```

### 6.4 (Optionnel) Configuration de Nginx comme reverse proxy
```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/facebook-poster
```

Configuration Nginx:
```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activer le site:
```bash
sudo ln -s /etc/nginx/sites-available/facebook-poster /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### ✅ Tests de validation Étape 6
```bash
# Vérifier PM2
pm2 status
# Doit afficher: facebook-poster | online

# Vérifier le serveur
curl http://localhost:3000
# Doit retourner le contenu HTML

# Vérifier Nginx (si configuré)
curl http://votre-domaine.com
# Doit afficher l'interface web
```

---

## Étape 7: Tests Intégraux

### 7.1 Test de l'interface web
1. Ouvrir `http://vps-ip:3000` dans un navigateur
2. Remplir le formulaire avec:
   - Description: "Test de publication"
   - Images: Uploader 1-2 images de test
   - Groupes: "Groupe de test 1, Groupe de test 2"
3. Cliquer sur "Poster sur Facebook"
4. Vérifier que le navigateur Puppeteer s'ouvre et navigue vers Facebook

### 7.2 Test de l'upload d'images
```bash
# Créer une image de test
echo "Test" > test.txt
mv test.txt test.jpg

# Tester l'upload via curl
curl -X POST -F "images=@test.jpg" -F "description=Test" -F "groups=test" http://localhost:3000/api/post
```

### 7.3 Test de la publication Facebook
- Vérifier que les posts apparaissent dans les groupes spécifiés
- Vérifier que les images sont bien uploadées
- Vérifier que la description est correcte

### ✅ Tests de validation Étape 7
- ✅ Interface web accessible et fonctionnelle
- ✅ Upload d'images fonctionne
- ✅ Puppeteer ouvre Facebook et se connecte
- ✅ Posts publiés dans les groupes spécifiés
- ✅ Images attachées correctement
- ✅ Description affichée correctement

---

## Étape 8: Maintenance et Monitoring

### 8.1 Logs PM2
```bash
pm2 logs facebook-poster
```

### 8.2 Redémarrage automatique en cas de crash
```bash
pm2 startup
pm2 save
```

### 8.3 Nettoyage régulier des uploads
Ajouter un cron job:
```bash
crontab -e
```
Ajouter:
```
0 3 * * * rm -rf /home/user/facebook-auto-poster/uploads/*
```

### ✅ Tests de validation Étape 8
```bash
# Vérifier les logs
pm2 logs facebook-poster --lines 50
# Doit afficher les logs du serveur

# Vérifier le cron
crontab -l
# Doit afficher le job de nettoyage
```

---

## Notes Importantes

### ⚠️ Avertissements Facebook
- Facebook peut détecter et bloquer les comptes utilisant l'automatisation
- Utiliser avec prudence et respecter les conditions d'utilisation
- Ajouter des délais entre les publications pour éviter d'être flaggé
- Ne pas poster trop de contenu en peu de temps

### 🔐 Sécurité
- Ne jamais commit les credentials dans le code
- Utiliser des variables d'environnement pour les sensibles
- Ajouter une authentification pour l'accès à l'interface web
- Utiliser HTTPS en production

### 🚀 Améliorations Possibles
- Login automatique avec credentials stockés
- Système de queue pour les posts
- Historique des publications
- Scheduling des posts (poster à des heures spécifiques)
- Support pour les vidéos
- Interface multi-utilisateurs
