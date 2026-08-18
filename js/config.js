// ============================================
// CONFIGURACIÓN
// ============================================

// 📧 TU EMAIL AUTORIZADO (SOLO ESTE PUEDE ENTRAR)
// ⚠️ REEMPLAZÁ ESTE VALOR CON TU EMAIL
const EMAIL_AUTORIZADO = 'kiosco.a220@gmail.com';

// 🔑 CLIENTE ID DE GOOGLE
// ⚠️ REEMPLAZÁ ESTE VALOR CON EL TUYO
// Crearlo en: https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = '939192749315-chhqng50baio8koc839eu1quaatme0jm.apps.googleusercontent.com';

// 📦 CLAVE PARA LOCALSTORAGE
const STORAGE_KEY = 'a220_pro_data';

// 👤 DATOS POR DEFECTO DE GITHUB
const DEFAULT_GITHUB = {
    user: 'kioscoa220munro',
    repo: 'a220-data',
    token: ''
};

// 📦 PRODUCTOS INICIALES
function getDefaultProducts() {
    return [
        { id: 1, name: 'Agua 500 ml', cat: 'Bebidas', price: 1200, stock: 24, minStock: 3, barcode: '7791234567890', image: '' },
        { id: 2, name: 'Gaseosa', cat: 'Bebidas', price: 1800, stock: 18, minStock: 3, barcode: '7791234567891', image: '' },
        { id: 3, name: 'Yerba 500g', cat: 'Almacén', price: 3500, stock: 10, minStock: 3, barcode: '7791234567892', image: '' },
        { id: 4, name: 'Alfajor', cat: 'Golosinas', price: 1300, stock: 20, minStock: 3, barcode: '7791234567893', image: '' },
        { id: 5, name: 'Papas snack', cat: 'Snacks', price: 1700, stock: 15, minStock: 3, barcode: '7791234567894', image: '' },
        { id: 6, name: 'Cigarrillos', cat: 'Tabaco', price: 4000, stock: 10, minStock: 3, barcode: '7791234567895', image: '' },
        { id: 7, name: 'Helado palito', cat: 'Helados', price: 1800, stock: 12, minStock: 3, barcode: '7791234567896', image: '' }
    ];
}