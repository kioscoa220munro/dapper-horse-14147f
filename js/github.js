// ============================================
// GITHUB SYNC
// ============================================

let githubConfig = { user: '', repo: '', token: '' };

function loadGitHubConfig() {
    const saved = localStorage.getItem('a220_github_config');
    if (saved) {
        try {
            githubConfig = JSON.parse(saved);
            document.getElementById('githubUser').value = githubConfig.user || '';
            document.getElementById('githubRepo').value = githubConfig.repo || '';
            document.getElementById('githubToken').value = githubConfig.token || '';
        } catch (e) {}
    }
}

function saveGitHubConfig() {
    githubConfig.user = document.getElementById('githubUser').value.trim();
    githubConfig.repo = document.getElementById('githubRepo').value.trim();
    githubConfig.token = document.getElementById('githubToken').value.trim();
    if (!githubConfig.user || !githubConfig.repo || !githubConfig.token) {
        showToast('⚠️ Completá todos los campos', 'error');
        return;
    }
    localStorage.setItem('a220_github_config', JSON.stringify(githubConfig));
    showToast('✅ Configuración guardada', 'success');
    addSyncLog('✅ Configuración guardada');
}

function addSyncLog(msg) {
    const log = document.getElementById('syncLog');
    if (!log) return;
    const div = document.createElement('div');
    div.textContent = '🕐 ' + new Date().toLocaleTimeString() + ' - ' + msg;
    log.prepend(div);
    if (log.children.length > 20) log.removeChild(log.lastChild);
}

async function syncToGitHub() {
    if (!githubConfig.user || !githubConfig.repo || !githubConfig.token) {
        showToast('⚠️ Configurá GitHub primero', 'error');
        return;
    }

    // Usar el email del usuario para identificar el archivo
    const emailSafe = currentUser ? currentUser.replace(/[^a-zA-Z0-9]/g, '_') : 'usuario';
    const filename = emailSafe + '.json';
    const url = `https://api.github.com/repos/${githubConfig.user}/${githubConfig.repo}/contents/${filename}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    try {
        showToast('📤 Subiendo a GitHub...', 'info');
        addSyncLog('📤 Subiendo...');

        let sha = null;
        try {
            const r = await fetch(url, {
                headers: { 'Authorization': `token ${githubConfig.token}` }
            });
            if (r.ok) {
                const d = await r.json();
                sha = d.sha;
            }
        } catch (e) {}

        const body = {
            message: `Actualización A220 Pro - ${currentUser} - ${new Date().toLocaleString()}`,
            content: content,
            branch: 'main'
        };
        if (sha) body.sha = sha;

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            showToast('✅ Datos subidos a GitHub', 'success');
            addSyncLog('✅ Datos subidos correctamente');
            playBeep();
        } else {
            const error = await res.json();
            showToast('❌ Error al subir: ' + (error.message || 'Error desconocido'), 'error');
            addSyncLog('❌ Error: ' + (error.message || 'Error desconocido'));
        }
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
        addSyncLog('❌ Error: ' + e.message);
    }
}

async function syncFromGitHub() {
    if (!githubConfig.user || !githubConfig.repo || !githubConfig.token) {
        showToast('⚠️ Configurá GitHub primero', 'error');
        return;
    }

    const emailSafe = currentUser ? currentUser.replace(/[^a-zA-Z0-9]/g, '_') : 'usuario';
    const filename = emailSafe + '.json';
    const url = `https://api.github.com/repos/${githubConfig.user}/${githubConfig.repo}/contents/${filename}`;

    try {
        showToast('📥 Descargando desde GitHub...', 'info');
        addSyncLog('📥 Descargando...');

        const res = await fetch(url, {
            headers: { 'Authorization': `token ${githubConfig.token}` }
        });

        if (res.ok) {
            const file = await res.json();
            const content = decodeURIComponent(escape(atob(file.content)));
            const downloaded = JSON.parse(content);

            if (downloaded.products) {
                data = downloaded;
                save();
                showToast('✅ Datos descargados de GitHub', 'success');
                addSyncLog('✅ Datos descargados correctamente');
                playBeep();
            } else {
                showToast('⚠️ El archivo no tiene datos válidos', 'error');
                addSyncLog('⚠️ Datos inválidos');
            }
        } else if (res.status === 404) {
            showToast('⚠️ No hay datos en GitHub. Subí primero.', 'error');
            addSyncLog('⚠️ No hay datos en GitHub');
        } else {
            const error = await res.json();
            showToast('❌ Error al descargar: ' + (error.message || 'Error desconocido'), 'error');
            addSyncLog('❌ Error: ' + (error.message || 'Error desconocido'));
        }
    } catch (e) {
        showToast('❌ Error: ' + e.message, 'error');
        addSyncLog('❌ Error: ' + e.message);
    }
}