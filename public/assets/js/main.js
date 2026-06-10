import { auth, db } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { mostrarAvisoCookies } from './cookies.js';
import { enviarMensaje } from './chatbot.js';

let saldoUsuario = 0;

// Solo gestiona: protección de ruta, cookies, chat y logout
// El nombre y saldo del dashboard los gestiona dashboard.js directamente
onAuthStateChanged(auth, (user) => {
    if (!user) {
        const pathname = window.location.pathname;
        const esPaginaPublica = pathname.includes('index.html') ||
                                pathname.includes('registro.html') ||
                                pathname === '/' ||
                                pathname.endsWith('/');
        if (!esPaginaPublica) {
            window.location.href = 'index.html';
        }
        return;
    }

    // Cargar saldo para usarlo en el chatbot, y gestionar cookies
    const userRef = doc(db, "usuarios", user.uid);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            saldoUsuario = typeof data.saldo === 'number' ? data.saldo : 0;

            // Cookies: solo mostrar si aún no ha decidido
            if (data.cookiesAceptadas === undefined) {
                setTimeout(() => mostrarAvisoCookies(), 800);
            }
        }
    });
});

// Chat
const btnToggle = document.getElementById('btn-chat-toggle');
const btnClose = document.getElementById('btn-close-chat');
const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (chatInput) {
    chatInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const texto = chatInput.value.trim();
            if (!texto) return;

            chatMessages.innerHTML += `<div class="msg-user"><b>Tú:</b> ${texto}</div>`;
            chatInput.value = '';

            const respuestaIA = await enviarMensaje(texto, saldoUsuario);
            chatMessages.innerHTML += `<div class="msg-ai"><b>BankFlow:</b> ${respuestaIA}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });
}

if (btnToggle) {
    btnToggle.addEventListener('click', () => {
        if (chatContainer) chatContainer.style.display = 'flex';
        btnToggle.style.display = 'none';
    });
}

if (btnClose) {
    btnClose.addEventListener('click', () => {
        if (chatContainer) chatContainer.style.display = 'none';
        if (btnToggle) btnToggle.style.display = 'block';
    });
}

// Logout
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'index.html';
        });
    });
}
