const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

/**
 * Script de publication automatique sur les groupes Facebook
 * @param {Object} data - { description, images, groups, accountId }
 */
async function postToFacebookGroups({ description, images, groups, accountId = 'principal' }) {
    console.log(`--- Démarrage de la publication Facebook (Compte: ${accountId}) ---`);
    
    // Chemin pour stocker la session utilisateur (cookies/cache)
    const userDataDir = path.join(__dirname, 'fb_sessions', accountId);

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-notifications',
            '--window-size=1920,1080',
            '--disable-dev-shm-usage'
        ],
        userDataDir: userDataDir
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultNavigationTimeout(120000); 

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const results = [];

    try {
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

        // 1. Accès à Facebook
        console.log('Navigation vers Facebook...');
        await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 120000 });
        
        console.log(`URL Actuelle : ${page.url()}`);
        await page.screenshot({ path: 'debug_render.png' });
        console.log('Capture d\'écran de debug enregistrée : debug_render.png');

        // Attendre que les polices soient prêtes pour un rendu correct
        await page.evaluateHandle('document.fonts.ready');

        // Vérification si on est déjà connecté
        let isLoggedIn = await page.evaluate(() => {
            const indicators = [
                'div[aria-label*="Compte"]', 
                'div[aria-label*="Account"]', 
                'div[aria-label*="Profil"]',
                'a[href*="/me/"]',
                '[aria-label*="Messenger"]',
                '[aria-label*="Notifications"]',
                '[role="navigation"]'
            ];
            return indicators.some(sel => document.querySelector(sel) !== null);
        });

        if (!isLoggedIn) {
            console.log('⚠️ État de connexion non détecté automatiquement.');
            console.log('⏳ Le script attend que vous soyez sur la page d\'accueil ou qu\'un élément de profil apparaisse...');
            
            try {
                // On attend l'un des indicateurs de connexion
                await page.waitForFunction(() => {
                    const indicators = [
                        'div[aria-label*="Compte"]', 
                        'div[aria-label*="Account"]', 
                        'div[aria-label*="Profil"]',
                        'a[href*="/me/"]',
                        '[aria-label*="Messenger"]',
                        '[aria-label*="Notifications"]'
                    ];
                    return indicators.some(sel => document.querySelector(sel) !== null);
                }, { timeout: 0 });
                console.log('✅ Connexion détectée !');
            } catch (e) {
                console.log('❌ Erreur ou interruption lors de l\'attente de connexion.');
                throw e;
            }
        } else {
            console.log('✅ Déjà connecté à Facebook.');
        }

        // 2. Traitement des groupes
        for (const groupInput of groups) {
            let groupUrl = "";
            
            try {
                // Déterminer si l'entrée est une URL, un ID ou un Nom
                const isUrl = groupInput.startsWith('http');
                const isId = /^\d+$/.test(groupInput);

                if (isUrl || isId) {
                    groupUrl = isUrl ? groupInput : `https://www.facebook.com/groups/${groupInput}/`;
                    console.log(`\nAccès direct au groupe via ${isUrl ? 'URL' : 'ID'} : ${groupUrl}`);
                } else {
                    console.log(`\nRecherche du groupe par nom : "${groupInput}"...`);
                    await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(groupInput)}`, { waitUntil: 'networkidle2', timeout: 90000 });
                    
                    await page.waitForSelector('a[href*="/groups/"][role="link"]', { timeout: 20000 });
                    
                    groupUrl = await page.evaluate((targetName) => {
                        const groupLinks = Array.from(document.querySelectorAll('a[role="link"]'))
                            .filter(l => l.href.includes('/groups/') && !l.href.includes('/user/') && !l.href.includes('search'));

                        const bestMatch = groupLinks.find(l => l.innerText.toLowerCase().includes(targetName.toLowerCase().substring(0, 5)));
                        return bestMatch ? bestMatch.href : (groupLinks[0] ? groupLinks[0].href : null);
                    }, groupInput);
                }

                if (!groupUrl) throw new Error("Impossible de déterminer l'URL du groupe.");

                // Nettoyage de l'URL pour être à la racine
                const urlObj = new URL(groupUrl);
                groupUrl = `${urlObj.origin}${urlObj.pathname}`;
                if (!groupUrl.endsWith('/')) groupUrl += '/';
                
                await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                // VÉRIFICATION : Est-on bien sur une page de groupe ?
                const isGroupPage = await page.evaluate(() => {
                    return window.location.href.includes('/groups/') && document.querySelector('h1') !== null;
                });

                if (!isGroupPage) {
                    throw new Error("La navigation n'a pas abouti sur une page de groupe valide.");
                }

                // 3. Création du post
                console.log('Ouverture du champ de publication...');
                await wait(6000);

                // On cherche le bouton "Exprimez-vous" spécifiquement dans le flux du groupe
                // On essaie de trouver le bouton qui est dans la colonne centrale (role="main")
                const openModal = async () => {
                    console.log('Analyse des boutons du flux pour trouver le champ de post...');
                    const btn = await page.evaluateHandle(() => {
                        const main = document.querySelector('div[role="main"]');
                        if (!main) return null;
                        const candidates = Array.from(main.querySelectorAll('div[role="button"], span'));
                        return candidates.find(el => {
                            const text = el.innerText ? el.innerText.toLowerCase() : '';
                            const isInvite = text.includes('inviter') || text.includes('invite');
                            const isPost = text.includes('exprimez-vous') || text.includes('write something') || text.includes('créer une publication') || text.includes('quelque chose');
                            return isPost && !isInvite && el.offsetHeight > 10;
                        });
                    });

                    if (btn && btn.asElement()) {
                        await btn.asElement().click();
                        console.log('✅ Clic sur le champ de publication réussi.');
                        return true;
                    }
                    return false;
                };

                const modalOpened = await openModal();
                if (!modalOpened) {
                     console.log('⚠️ Échec de détection précise, tentative de clic forcé sur la zone de post...');
                     await page.click('div[role="main"] div[role="button"]');
                }

                // Attendre l'apparition de la MODALE (role="dialog")
                console.log('Attente de la modale de création...');
                await page.waitForSelector('div[role="dialog"]', { timeout: 15000 });
                await wait(3000); 

                // Entrer la description
                console.log('Saisie de la description...');
                // On cible le textbox STRICTEMENT dans la modale avec plusieurs options
                const textboxSelectors = [
                    'div[role="dialog"] div[role="textbox"]',
                    'div[role="dialog"] [aria-label*="Exprimez-vous"]',
                    'div[role="dialog"] [aria-label*="Write something"]',
                    'div[role="dialog"] [aria-label*="quelque chose"]',
                    'div[role="dialog"] [contenteditable="true"]'
                ];

                let textboxFound = false;
                for (const selector of textboxSelectors) {
                    try {
                        const box = await page.waitForSelector(selector, { timeout: 5000 });
                        if (box) {
                            await box.focus();
                            await page.keyboard.type(description);
                            console.log(`Texte saisi via : ${selector}`);
                            textboxFound = true;
                            break;
                        }
                    } catch (e) {}
                }

                if (!textboxFound) {
                    throw new Error("Impossible de trouver le champ de texte dans la modale.");
                }

                // 4. Ajout des images
                if (images && images.length > 0) {
                    console.log(`Ajout de ${images.length} image(s)...`);
                    const fileInputSelector = 'div[role="dialog"] input[type="file"][accept*="image"]';
                    
                    // On essaie d'abord d'activer l'upload d'images si l'input n'est pas visible
                    const inputVisible = await page.$(fileInputSelector);
                    if (!inputVisible) {
                        // Chercher l'icône photo dans la modale
                        const photoIcon = await page.$('div[role="dialog"] div[aria-label*="Photo"], div[role="dialog"] div[aria-label*="Vidéo"]');
                        if (photoIcon) {
                            await photoIcon.click();
                            await wait(3000);
                        }
                    }

                    await page.waitForSelector(fileInputSelector, { timeout: 15000 });
                    const fileInput = await page.$(fileInputSelector);
                    const absolutePaths = images.map(img => path.resolve(img));

                    if (fileInput) {
                        try {
                            await fileInput.uploadFile(...absolutePaths);
                            console.log('Upload réussi.');
                        } catch (e) {
                            for (const img of absolutePaths) {
                                await fileInput.uploadFile(img);
                                await wait(1500);
                            }
                        }
                        // Important : attendre que les miniatures apparaissent
                        await wait(10000);
                    }
                }

                // 5. Publier
                console.log('Clic sur "Publier"...');
                
                // On s'assure que le bouton est prêt (pas grisé)
                await wait(2000);

                const publishBtn = await page.evaluateHandle(() => {
                    const modal = document.querySelector('div[role="dialog"]');
                    if (!modal) return null;
                    
                    const buttons = Array.from(modal.querySelectorAll('div[role="button"]'));
                    return buttons.find(b => {
                        const text = b.innerText.toLowerCase();
                        const label = (b.getAttribute('aria-label') || '').toLowerCase();
                        const isSubmit = text === 'publier' || text === 'post' || label === 'publier' || label === 'post';
                        // Vérifier que le bouton n'est pas désactivé (souvent aria-disabled="true")
                        const isDisabled = b.getAttribute('aria-disabled') === 'true';
                        return isSubmit && !isDisabled;
                    });
                });

                if (publishBtn && publishBtn.asElement()) {
                    await publishBtn.asElement().click();
                    console.log('Bouton Publier cliqué.');
                } else {
                    console.log('⚠️ Bouton non trouvé via evaluateHandle, tentative via sélecteur...');
                    await page.click('div[role="dialog"] div[aria-label="Publier"], div[role="dialog"] div[aria-label="Post"]').catch(() => {});
                }

                // Attendre que la modale disparaisse OU qu'un message d'erreur apparaisse
                console.log('Attente de la confirmation ou d\'une erreur...');
                
                const postStatus = await page.waitForFunction(() => {
                    const modal = document.querySelector('div[role="dialog"]');
                    const isClosed = modal === null;
                    
                    // Détection du blocage Spam
                    const bodyText = document.body.innerText.toLowerCase();
                    const isSpamBlocked = bodyText.includes('limitons le nombre de fois') || 
                                          bodyText.includes('votre publication va à l\'encontre') ||
                                          bodyText.includes('impossible de publier');
                    
                    if (isSpamBlocked) return 'SPAM_BLOCKED';
                    if (isClosed) return 'SUCCESS';
                    return false;
                }, { timeout: 45000, polling: 1000 }).catch(() => 'TIMEOUT');

                const statusValue = typeof postStatus.jsonValue === 'function' ? await postStatus.jsonValue() : postStatus;

                if (statusValue === 'SPAM_BLOCKED') {
                    throw new Error("Facebook a bloqué la publication (Limite de spam atteinte).");
                } else if (statusValue === 'TIMEOUT') {
                    console.log('⚠️ Timeout attente fermeture modale, vérification manuelle...');
                }
                
                await wait(5000);
                
                console.log(`✅ Publication terminée pour : ${groupInput}`);
                results.push({ group: groupInput, status: 'success' });

                // Délai humain plus long
                const delay = Math.floor(Math.random() * (45000 - 30000 + 1) + 30000);
                console.log(`Pause de sécurité de ${delay/1000}s...`);
                await wait(delay);

            } catch (err) {
                console.error(`❌ Erreur [${groupInput}]:`, err.message);
                // Prendre une capture d'écran pour le debug
                try {
                    await page.screenshot({ path: `error_${groupInput}.png` });
                } catch (e) {}
                results.push({ group: groupInput, status: 'error', error: err.message });
            }
        }

    } catch (globalError) {
        console.error('❌ Crash Puppeteer:', globalError);
        throw globalError;
    } finally {
        console.log('--- Session terminée ---');
        // On ne ferme pas le navigateur pour que tu puisses voir le résultat
    }

    return results;
}

/**
 * Récupère les noms des groupes à partir d'une liste d'IDs/URLs
 * @param {Array} groupInputs - Liste d'IDs ou URLs
 * @param {String} accountId - ID du compte à utiliser
 */
async function getGroupInfos(groupInputs, accountId = 'principal') {
    console.log(`--- Démarrage de la récupération d'infos pour ${groupInputs.length} groupes (Compte: ${accountId}) ---`);
    const userDataDir = path.join(__dirname, 'fb_sessions', accountId);
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-notifications', 
            '--window-size=1280,900',
            '--disable-blink-features=AutomationControlled'
        ],
        userDataDir: userDataDir,
        ignoreDefaultArgs: ['--enable-automation']
    });

    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 900 });
    page.setDefaultNavigationTimeout(120000);
    const results = [];

    try {
        await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
        await page.evaluateHandle('document.fonts.ready');
        
        for (const input of groupInputs) {
            let url = input.startsWith('http') ? input : `https://www.facebook.com/groups/${input}/`;
            console.log(`Récupération pour : ${url}`);
            
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                await page.evaluateHandle('document.fonts.ready');
                
                // Attendre que le titre (H1) soit présent
                await page.waitForSelector('h1', { timeout: 15000 });
                
                const name = await page.evaluate(() => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.innerText : 'Nom introuvable';
                });

                results.push({ id: input, name: name, status: 'success' });
                console.log(`✅ Trouvé : ${name}`);
            } catch (err) {
                console.error(`❌ Erreur pour ${input}:`, err.message);
                results.push({ id: input, name: 'Erreur', status: 'error', error: err.message });
            }
        }
    } finally {
        await browser.close();
    }
    return results;
}

module.exports = { postToFacebookGroups, getGroupInfos };
