// Gestion des onglets
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// --- LOGIQUE AUTO POSTER ---
const accountSelect = document.getElementById('accountId');
const newAccountDiv = document.getElementById('newAccountDiv');
const addNewAccountBtn = document.getElementById('addNewAccount');

// Charger les comptes au démarrage
async function loadAccounts() {
    try {
        const response = await fetch('/api/accounts');
        const data = await response.json();
        if (data.success) {
            accountSelect.innerHTML = '';
            data.accounts.forEach(acc => {
                const option = document.createElement('option');
                option.value = acc;
                option.textContent = acc.charAt(0).toUpperCase() + acc.slice(1);
                accountSelect.appendChild(option);
            });
        }
    } catch (e) { console.error("Erreur chargement comptes", e); }
}
loadAccounts();

addNewAccountBtn.addEventListener('click', () => {
    newAccountDiv.style.display = newAccountDiv.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    const status = document.getElementById('status');
    
    let selectedAccount = accountSelect.value;
    const newAccountName = document.getElementById('newAccountName').value.trim();
    
    if (newAccountDiv.style.display !== 'none' && newAccountName) {
        selectedAccount = newAccountName;
    }

    submitBtn.disabled = true;
    status.className = 'status loading';
    status.textContent = '⏳ Publication en cours... Le processus peut prendre plusieurs minutes.';
    
    const formData = new FormData();
    formData.append('description', document.getElementById('description').value);
    formData.append('groups', document.getElementById('groups').value);
    formData.append('accountId', selectedAccount);
    
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
            status.textContent = '✅ Session terminée ! Un rapport a été envoyé sur WhatsApp.';
            loadAccounts(); // Recharger la liste si un nouveau compte a été créé
            newAccountDiv.style.display = 'none';
            document.getElementById('newAccountName').value = '';
        } else {
            status.className = 'status error';
            status.textContent = '❌ Erreur: ' + result.error;
        }
    } catch (error) {
        status.className = 'status error';
        status.textContent = '❌ Erreur réseau: ' + error.message;
    } finally {
        submitBtn.disabled = false;
    }
});

// --- LOGIQUE SCRAPER ---
let lastScrapeResults = [];
document.getElementById('scrapeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const scrapeBtn = document.getElementById('scrapeBtn');
    const status = document.getElementById('status');
    const resultsDiv = document.getElementById('scrapeResults');
    const tbody = document.querySelector('#resultsTable tbody');
    
    scrapeBtn.disabled = true;
    status.className = 'status loading';
    status.textContent = '🔍 Récupération des noms des groupes en cours...';
    tbody.innerHTML = '';
    resultsDiv.style.display = 'none';

    try {
        const response = await fetch('/api/scrape-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                groups: document.getElementById('scrapeGroups').value,
                accountId: accountSelect.value
            })
        });
        const data = await response.json();
        
        if (data.success) {
            lastScrapeResults = data.results;
            data.results.forEach(res => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${res.id}</td><td>${res.name}</td>`;
                tbody.appendChild(tr);
            });
            resultsDiv.style.display = 'block';
            status.className = 'status success';
            status.textContent = `✅ Infos récupérées pour ${data.results.length} groupes.`;
        } else {
            status.className = 'status error';
            status.textContent = '❌ Erreur Scraper: ' + data.error;
        }
    } catch (error) {
        status.className = 'status error';
        status.textContent = '❌ Erreur réseau: ' + error.message;
    } finally {
        scrapeBtn.disabled = false;
    }
});

// Export JSON
document.getElementById('downloadJson').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastScrapeResults, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "groupes_facebook.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});

// Prévisualisation des images
document.getElementById('images').addEventListener('change', function(e) {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    if (this.files) {
        Array.from(this.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    }
});
