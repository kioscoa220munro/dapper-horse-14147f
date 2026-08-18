// ============================================
// SCANNER CON BARCODEDETECTOR (MÁS RÁPIDO)
// ============================================

let scannerRunning = false;
let scanDebounce = false;
let scannerInterval = null;
let scannerStream = null;

function startScanner() {
    const container = document.getElementById('scannerContainer');
    const status = document.getElementById('scannerStatus');
    const view = document.querySelector('#scannerView');

    // Verificar soporte
    if (!('BarcodeDetector' in window)) {
        status.innerHTML = '❌ Tu navegador no soporta escaneo nativo. Usá Chrome o Edge.';
        return;
    }

    container.classList.add('active');
    status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando cámara...';

    // Limpiar vista previa
    view.innerHTML = '';

    // Acceder a la cámara
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    })
    .then(function(stream) {
        scannerStream = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        view.appendChild(video);
        video.play();

        status.innerHTML = '<i class="fas fa-camera"></i> Apuntá al código de barras';

        // Crear detector
        const detector = new BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'qr_code']
        });

        scannerRunning = true;
        scanDebounce = false;

        // Escanear cada 300ms
        scannerInterval = setInterval(function() {
            if (!scannerRunning || scanDebounce) return;

            detector.detect(video)
                .then(function(barcodes) {
                    if (barcodes.length > 0 && !scanDebounce) {
                        scanDebounce = true;
                        const code = barcodes[0].rawValue;
                        status.innerHTML = '✅ Código: ' + code;
                        playBeep();

                        // Buscar producto
                        const product = data.products.find(p => p.barcode === code);
                        if (product) {
                            document.getElementById('saleProduct').value = product.id;
                            updatePreview();
                            setPrice();
                            currentQty = 1;
                            document.getElementById('qtyDisplay').textContent = '1';
                            document.getElementById('saleQty').value = '1';

                            const qty = 1;
                            if (product.stock >= qty) {
                                const existing = cart.find(item => item.id === product.id);
                                if (existing) {
                                    existing.qty += qty;
                                    existing.total = existing.qty * existing.price;
                                } else {
                                    cart.push({
                                        id: product.id,
                                        name: product.name,
                                        qty: qty,
                                        price: product.price,
                                        total: product.price
                                    });
                                }
                                renderCart();
                                showToast('📷 ' + product.name + ' agregado', 'success');
                            } else {
                                showToast('⚠️ Stock insuficiente', 'error');
                            }

                            data.scans.unshift({
                                date: dateTimeStr(),
                                barcode: code,
                                product: product.name
                            });
                            save();

                            const log = document.getElementById('scanLog');
                            if (log) {
                                const div = document.createElement('div');
                                div.innerHTML = '<span>✅ ' + product.name + '</span><span class="time">' + dateTimeStr() + '</span>';
                                log.prepend(div);
                                if (log.children.length > 20) log.removeChild(log.lastChild);
                            }

                            setTimeout(stopScanner, 1500);
                        } else {
                            showToast('⚠️ Producto no encontrado: ' + code, 'error');
                            playErrorBeep();
                            setTimeout(function() {
                                scanDebounce = false;
                            }, 1000);
                        }
                    }
                })
                .catch(function(err) {
                    // Error de detección, se ignora
                });
        }, 300);

    })
    .catch(function(err) {
        status.innerHTML = '❌ Error al acceder a la cámara';
        console.error('Error:', err);
        showToast('❌ No se puede acceder a la cámara', 'error');
    });
}

function stopScanner() {
    scannerRunning = false;
    if (scannerInterval) {
        clearInterval(scannerInterval);
        scannerInterval = null;
    }
    if (scannerStream) {
        scannerStream.getTracks().forEach(function(track) {
            track.stop();
        });
        scannerStream = null;
    }
    document.getElementById('scannerContainer').classList.remove('active');
    const view = document.querySelector('#scannerView');
    if (view) view.innerHTML = '';
    const status = document.getElementById('scannerStatus');
    if (status) status.innerHTML = '<i class="fas fa-camera"></i> Apuntá al código de barras';
}

function toggleTorch() {
    showToast('🔦 Linterna', 'info');
    // La linterna no es soportada por BarcodeDetector nativamente
    // Se puede implementar con track.applyConstraints pero es complejo
}

function playBeep() {
    try {
        const ctx = new(window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
}

function playErrorBeep() {
    try {
        const ctx = new(window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 300;
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}