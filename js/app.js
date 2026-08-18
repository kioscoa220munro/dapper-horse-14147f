// ============================================
// APP PRINCIPAL
// ============================================

let data = { products: [], sales: [], moves: [], scans: [] };
let cart = [];
let currentQty = 1;
let isLoggedIn = false;
let currentUser = null;
let emailReporte = '';

// ============================================
// LOGIN CON GMAIL
// ============================================

function loginConGmail() {
    const error = document.getElementById('loginError');
    error.textContent = '';

    if (GOOGLE_CLIENT_ID === 'TU_CLIENT_ID_DE_GOOGLE.apps.googleusercontent.com') {
        error.textContent = '❌ Configurá el CLIENT ID de Google en config.js';
        return;
    }

    if (EMAIL_AUTORIZADO === 'tucorreo@gmail.com') {
        error.textContent = '❌ Configurá tu EMAIL AUTORIZADO en config.js';
        return;
    }

    if (typeof google !== 'undefined') {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            cancel_on_tap_outside: false
        });
        google.accounts.id.prompt();
    } else {
        error.textContent = '❌ Error al cargar Google Login. Recargá la página.';
    }
}

function handleCredentialResponse(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        const email = payload.email;
        const nombre = payload.name;
        const foto = payload.picture;

        if (!email) {
            document.getElementById('loginError').textContent = '❌ No se pudo obtener el email';
            return;
        }

        // VERIFICAR QUE SEA EL EMAIL AUTORIZADO
        if (email !== EMAIL_AUTORIZADO) {
            document.getElementById('loginError').textContent = '❌ Acceso denegado. Email no autorizado.';
            return;
        }

        // ✅ ACCESO CONCEDIDO
        currentUser = email;
        isLoggedIn = true;

        document.getElementById('userDisplay').textContent = nombre || email;
        if (foto) {
            document.getElementById('userAvatar').src = foto;
            document.getElementById('userAvatar').style.display = 'inline-block';
        }

        document.getElementById('loginOverlay').classList.add('hidden');
        loadData();
        renderAll();
        showToast('✅ ¡Bienvenido ' + (nombre || email) + '!', 'success');

    } catch (e) {
        document.getElementById('loginError').textContent = '❌ Error al procesar el login';
        console.error(e);
    }
}

function doLogout() {
    if (confirm('¿Cerrar sesión?')) {
        isLoggedIn = false;
        currentUser = null;
        document.getElementById('loginOverlay').classList.remove('hidden');
        document.getElementById('loginError').textContent = '';
        document.getElementById('userDisplay').textContent = '';
        document.getElementById('userAvatar').style.display = 'none';
        showToast('👋 Sesión cerrada', 'info');
    }
}

// ============================================
// DATA
// ============================================

function loadData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            data = parsed;
            if (!data.products) data.products = [];
            if (!data.sales) data.sales = [];
            if (!data.moves) data.moves = [];
            if (!data.scans) data.scans = [];
        } else {
            data.products = getDefaultProducts();
            data.sales = [];
            data.moves = [];
            data.scans = [];
        }
        const emailSaved = localStorage.getItem('a220_email_reporte');
        if (emailSaved) {
            emailReporte = emailSaved;
            const el = document.getElementById('emailReporte');
            if (el) el.value = emailSaved;
        }
    } catch (e) {
        data.products = getDefaultProducts();
        data.sales = [];
        data.moves = [];
        data.scans = [];
    }
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        renderAll();
    } catch (e) {
        showToast('❌ Error al guardar: ' + e.message, 'error');
    }
}

function saveConfig() {
    const email = document.getElementById('emailReporte').value.trim();
    if (email) {
        emailReporte = email;
        localStorage.setItem('a220_email_reporte', email);
        showToast('✅ Email guardado: ' + email, 'success');
    }
    saveGitHubConfig();
}

// ============================================
// FORMATOS
// ============================================

function money(n) {
    return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

function todayStr() {
    return new Date().toLocaleDateString('es-AR');
}

function dateTimeStr() {
    return new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR');
}

// ============================================
// NAVEGACIÓN
// ============================================

function showView(id, btn) {
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (isLoggedIn) renderAll();
}

// ============================================
// DASHBOARD
// ============================================

function renderDashboard() {
    if (!data || !data.products) return;
    const today = todayStr();
    const todays = data.sales.filter(s => s.date && s.date.startsWith(today));
    const total = todays.reduce((a, s) => a + (s.total || 0), 0);
    const units = todays.reduce((a, s) => a + (s.items ? s.items.reduce((b, i) => b + (i.qty || 0), 0) : 0), 0);

    document.getElementById('dVentas').textContent = money(total);
    document.getElementById('dProductos').textContent = data.products.length;
    document.getElementById('dBajo').textContent = data.products.filter(p => p.stock <= p.minStock).length;
    document.getElementById('dUnidades').textContent = units;

    const low = data.products.filter(p => p.stock <= p.minStock);
    document.getElementById('alertas').innerHTML = low.length ? low.map(p => '<div class="alert-item">⚠️ ' + p.name + ': ' + p.stock + ' uds</div>').join('') : 'Sin alertas.';

    const catSales = {};
    data.sales.forEach(s => {
        if (s.items) {
            s.items.forEach(i => {
                const p = data.products.find(x => x.id === i.id);
                const cat = p ? p.cat : 'Otros';
                catSales[cat] = (catSales[cat] || 0) + (i.total || 0);
            });
        }
    });
    const sorted = Object.entries(catSales).sort((a, b) => b[1] - a[1]);
    document.getElementById('categorySummary').innerHTML = sorted.length ? sorted.map(([cat, total]) =>
        '<div class="category-item"><span>' + cat + '</span><strong>' + money(total) + '</strong></div>'
    ).join('') : 'Sin ventas.';

    mostrarAnalisis();
}

function mostrarAnalisis() {
    const container = document.getElementById('analisisContainer');
    if (!container) return;

    const diarias = {};
    const productos = {};
    data.sales.forEach(s => {
        const dia = s.date.split(' ')[0];
        diarias[dia] = (diarias[dia] || 0) + (s.total || 0);
        if (s.items) {
            s.items.forEach(i => {
                productos[i.name] = (productos[i.name] || 0) + (i.qty || 0);
            });
        }
    });

    let html = '<div class="analisis-grid">';
    html += '<div><h4>📊 Ventas por día</h4>';
    const dias = Object.keys(diarias).sort().slice(-7);
    dias.forEach(dia => {
        html += `<div class="analisis-item"><span>${dia}</span><strong>${money(diarias[dia])}</strong></div>`;
    });
    html += '</div>';

    html += '<div><h4>📦 Top productos</h4>';
    const prods = Object.keys(productos).sort((a,b) => productos[b] - productos[a]).slice(0,5);
    prods.forEach(p => {
        html += `<div class="analisis-item"><span>${p}</span><strong>${productos[p]} uds</strong></div>`;
    });
    html += '</div></div>';

    const totalGeneral = Object.values(diarias).reduce((a,b) => a + b, 0);
    html += `<div class="analisis-total">💰 Total general: ${money(totalGeneral)}</div>`;

    container.innerHTML = html;
}

// ============================================
// PRODUCTOS
// ============================================

function renderProducts() {
    if (!data || !data.products) return;
    const search = document.getElementById('productSearch');
    const searchVal = search ? search.value.toLowerCase().trim() : '';
    const filtered = data.products.filter(p => p.name.toLowerCase().includes(searchVal) || (p.barcode && p.barcode.includes(searchVal)));

    const table = document.getElementById('productTable');
    if (!table) return;
    table.innerHTML = filtered.map(p => `
        <tr>
            <td>${p.image ? `<img src="${p.image}" class="product-image-thumb">` : '—'}</td>
            <td><strong>${p.name}</strong></td>
            <td><span class="badge badge-info">${p.cat}</span></td>
            <td>${money(p.price)}</td>
            <td class="${p.stock <= p.minStock ? 'stock-low' : 'stock-ok'}">${p.stock}</td>
            <td>
                <button class="btn btn-accent btn-xs" onclick="quickSell(${p.id})"><i class="fas fa-cart-plus"></i></button>
                <button class="btn btn-primary btn-xs" onclick="editProduct(${p.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-xs" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--l);">No hay productos</td></tr>';

    renderSelect();
    updatePreview();
}

function renderSelect() {
    const sel = document.getElementById('saleProduct');
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = data.products.map(p => `<option value="${p.id}">${p.name} — ${money(p.price)} — stock ${p.stock}</option>`).join('');
    if (val) sel.value = val;
    setPrice();
}

function setPrice() {
    const p = data.products.find(x => x.id == document.getElementById('saleProduct').value);
    const priceInput = document.getElementById('salePrice');
    if (p && priceInput) priceInput.value = p.price;
}

function updatePreview() {
    const id = parseInt(document.getElementById('saleProduct').value);
    const p = data.products.find(x => x.id === id);
    const preview = document.getElementById('productPreview');
    if (!preview) return;

    if (p) {
        document.getElementById('previewName').textContent = p.name;
        document.getElementById('previewPrice').textContent = money(p.price);
        const stockEl = document.getElementById('previewStock');
        stockEl.textContent = 'Stock: ' + p.stock;
        stockEl.className = 'product-stock' + (p.stock <= p.minStock ? ' low' : '');
        const imgEl = document.getElementById('productImage');
        if (p.image) { imgEl.innerHTML = `<img src="${p.image}">`; } else { imgEl.innerHTML = '<i class="fas fa-cube"></i>'; }
    } else {
        document.getElementById('previewName').textContent = 'Seleccioná un producto';
        document.getElementById('previewPrice').textContent = '$0';
        document.getElementById('previewStock').textContent = 'Stock: 0';
        document.getElementById('productImage').innerHTML = '<i class="fas fa-cube"></i>';
    }
}

document.getElementById('saleProduct').onchange = function() {
    setPrice();
    updatePreview();
};

function adjustQty(delta) {
    currentQty = Math.max(1, currentQty + delta);
    document.getElementById('qtyDisplay').textContent = currentQty;
    document.getElementById('saleQty').value = currentQty;
}

// ============================================
// PREVIEW IMAGEN
// ============================================

function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('pImagePreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
            document.getElementById('pImage').value = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// ============================================
// AGREGAR PRODUCTO
// ============================================

function addProduct() {
    const name = document.getElementById('pName').value.trim();
    const cat = document.getElementById('pCat').value.trim() || 'General';
    const price = Number(document.getElementById('pPrice').value);
    const stock = Number(document.getElementById('pStock').value);
    const minStock = Number(document.getElementById('pMinStock').value) || 3;
    const barcode = document.getElementById('pBarcode').value.trim();
    const image = document.getElementById('pImage').value.trim();

    if (!name || price < 0 || stock < 0) {
        showToast('Completá los datos', 'error');
        return;
    }

    data.products.push({
        id: Date.now(),
        name, cat, price, stock, minStock,
        barcode: barcode || 'BAR' + Date.now().toString().slice(-8),
        image: image || ''
    });

    document.getElementById('pName').value = '';
    document.getElementById('pCat').value = '';
    document.getElementById('pPrice').value = '';
    document.getElementById('pStock').value = '';
    document.getElementById('pMinStock').value = '3';
    document.getElementById('pBarcode').value = '';
    document.getElementById('pImage').value = '';
    document.getElementById('pImagePreview').style.display = 'none';
    document.getElementById('pImageInput').value = '';

    save();
    showToast('✅ Producto agregado', 'success');
    playBeep();
}

function editProduct(id) {
    const p = data.products.find(x => x.id === id);
    if (!p) return;
    const name = prompt('Nombre:', p.name);
    if (name === null) return;
    const cat = prompt('Categoría:', p.cat) || 'General';
    const price = Number(prompt('Precio:', p.price));
    const stock = Number(prompt('Stock:', p.stock));
    const minStock = Number(prompt('Stock mínimo:', p.minStock));
    const barcode = prompt('Código de barras:', p.barcode || '');

    if (isNaN(price) || isNaN(stock) || isNaN(minStock)) {
        showToast('Valores inválidos', 'error');
        return;
    }

    p.name = name.trim();
    p.cat = cat.trim();
    p.price = price;
    p.stock = stock;
    p.minStock = minStock;
    p.barcode = barcode || p.barcode;
    save();
    showToast('✅ Producto actualizado', 'success');
}

function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    data.products = data.products.filter(p => p.id !== id);
    save();
    showToast('Producto eliminado', 'success');
}

// ============================================
// CARRITO
// ============================================

function addToCart() {
    const id = parseInt(document.getElementById('saleProduct').value);
    const qty = parseInt(document.getElementById('saleQty').value) || 1;
    const price = Number(document.getElementById('salePrice').value);
    const p = data.products.find(x => x.id === id);

    if (!p || qty < 1 || qty > p.stock) {
        showToast('Cantidad inválida o stock insuficiente', 'error');
        return;
    }

    const existing = cart.find(item => item.id === p.id);
    if (existing) {
        existing.qty += qty;
        existing.total = existing.qty * existing.price;
    } else {
        cart.push({ id: p.id, name: p.name, qty, price, total: qty * price });
    }

    renderCart();
    showToast(qty + 'x ' + p.name + ' agregado', 'success');
    playBeep();
    currentQty = 1;
    document.getElementById('qtyDisplay').textContent = '1';
    document.getElementById('saleQty').value = '1';
}

function renderCart() {
    const cartEl = document.getElementById('cart');
    if (!cartEl) return;
    cartEl.innerHTML = cart.map((i, n) => `
        <tr>
            <td>${i.name}</td>
            <td>${i.qty}</td>
            <td>${money(i.price)}</td>
            <td>${money(i.total)}</td>
            <td><button class="btn btn-danger btn-xs" onclick="removeFromCart(${n})"><i class="fas fa-times"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--l);">Carrito vacío</td></tr>';

    document.getElementById('cartTotal').textContent = money(cart.reduce((a, i) => a + i.total, 0));
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function calcularVuelto() {
    const total = cart.reduce((a, i) => a + i.total, 0);
    const pago = Number(document.getElementById('pagoEfectivo').value) || 0;
    const vuelto = pago - total;
    const display = document.getElementById('vueltoDisplay');
    if (vuelto >= 0) {
        display.textContent = money(vuelto);
        display.style.color = '#22c55e';
    } else {
        display.textContent = 'Faltan ' + money(Math.abs(vuelto));
        display.style.color = '#ef4444';
    }
}

function finishSale() {
    if (!cart.length) {
        showToast('No hay productos', 'error');
        return;
    }

    const now = dateTimeStr();
    const total = cart.reduce((a, i) => a + i.total, 0);
    const nombre = document.getElementById('clienteNombre').value.trim() || 'Sin cliente';
    const telefono = document.getElementById('clienteTelefono').value.trim() || '';

    cart.forEach(i => {
        const p = data.products.find(x => x.id === i.id);
        if (p) p.stock -= i.qty;
        data.moves.unshift({ 
            date: now, 
            product: i.name, 
            qty: i.qty, 
            total: i.total,
            cliente: nombre
        });
    });

    data.sales.unshift({ 
        date: now, 
        total, 
        items: [...cart],
        cliente: nombre,
        telefono: telefono
    });

    cart = [];
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteTelefono').value = '';
    document.getElementById('pagoEfectivo').value = '';
    document.getElementById('vueltoDisplay').textContent = '$0';
    save();
    showToast('💰 Venta registrada: ' + money(total), 'success');
    playBeep();

    if (emailReporte && emailReporte !== '') {
        enviarResumenVenta();
    }
}

// ============================================
// ENVIAR POR EMAIL
// ============================================

function enviarResumenVenta() {
    if (!cart.length) {
        showToast('No hay venta para enviar', 'error');
        return;
    }

    const total = cart.reduce((a, i) => a + i.total, 0);
    const items = cart.map(i => `${i.name} x${i.qty} = ${money(i.total)}`).join('\n');
    const cliente = document.getElementById('clienteNombre').value.trim() || 'Sin cliente';

    const mensaje = `
📋 RESUMEN DE VENTA
📅 ${dateTimeStr()}
👤 Cliente: ${cliente}

🛒 Productos:
${items}

💰 Total: ${money(total)}

✅ Venta registrada en A220 Pro
    `;

    const email = emailReporte || '';
    if (!email) {
        showToast('📧 Configurá un email en Sincronizar', 'info');
        return;
    }

    const subject = encodeURIComponent('📋 Resumen de venta - A220');
    const body = encodeURIComponent(mensaje);
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    showToast('📧 Abriendo email para enviar', 'success');
}

function quickSell(id) {
    const p = data.products.find(x => x.id === id);
    if (!p) return;
    const qty = Number(prompt('Cantidad de "' + p.name + '" (stock: ' + p.stock + '):', 1));
    if (!qty || qty < 1 || qty > p.stock) {
        showToast('Cantidad inválida', 'error');
        return;
    }

    const total = qty * p.price;
    const now = dateTimeStr();
    p.stock -= qty;
    data.moves.unshift({ date: now, product: p.name, qty, total, cliente: 'Venta rápida' });
    data.sales.unshift({ date: now, total, items: [{ id: p.id, name: p.name, qty, price: p.price, total }] });
    save();
    showToast('Venta rápida: ' + qty + 'x ' + p.name + ' = ' + money(total), 'success');
    playBeep();
}

// ============================================
// MOVIMIENTOS
// ============================================

function renderMoves() {
    const movesEl = document.getElementById('moves');
    if (!movesEl) return;
    movesEl.innerHTML = data.moves.map(m => `
        <tr>
            <td>${m.date}</td>
            <td>${m.product}</td>
            <td>${m.qty}</td>
            <td>${money(m.total)}</td>
            <td>${m.cliente || '—'}</td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--l);">No hay movimientos</td></tr>';
}

// ============================================
// RENDER TODO
// ============================================

function renderAll() {
    if (!isLoggedIn) return;
    renderDashboard();
    renderProducts();
    renderCart();
    renderMoves();
}

// ============================================
// TEMA
// ============================================

let darkMode = localStorage.getItem('a220_theme') === 'dark';

function toggleTheme() {
    darkMode = !darkMode;
    localStorage.setItem('a220_theme', darkMode ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    const icon = document.querySelector('.btn-icon i');
    if (icon) {
        icon.className = darkMode ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// ============================================
// TOAST
// ============================================

function showToast(msg, type) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0';
        setTimeout(() => t.remove(), 300); }, 3000);
}

// ============================================
// INICIO
// ============================================

document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
document.getElementById('clock').textContent = dateTimeStr();

setInterval(() => {
    document.getElementById('clock').textContent = dateTimeStr();
}, 1000);

console.log('🚀 A220 Pro v2.0');
console.log('📧 Email autorizado:', EMAIL_AUTORIZADO);
console.log('🔑 Google Client ID:', GOOGLE_CLIENT_ID.substring(0, 10) + '...');