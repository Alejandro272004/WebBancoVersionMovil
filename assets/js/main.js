import { auth, db } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- LÓGICA DE MENÚ MÓVIL (CORREGIDA) ---
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.querySelector('.menu-toggle');

    // 1. Lógica para ABRIR Y CERRAR con el botón hamburguesa
    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que el clic se propague y se cierre inmediatamente
            sidebar.classList.toggle('active');
        });
    }

    // 2. Lógica para CERRAR AUTOMÁTICAMENTE al hacer clic en un enlace (en móvil)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            // Solo ejecuta el cierre si estamos en modo móvil (menos de 1024px)
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('active');
            }
        });
    });

    // 3. (EXTRA) Cierra el menú al hacer clic FUERA de la sidebar (mejora de UX)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && sidebar.classList.contains('active')) {
            // Si el clic no fue dentro de la sidebar ni en el botón hamburguesa
            if (!sidebar.contains(e.target) && e.target !== menuToggle) {
                sidebar.classList.remove('active');
            }
        }
    });
});

// --- LÓGICA DE USUARIO Y FIREBASE (Mantenida intacta) ---
const userNameDisplay = document.getElementById('user-name');
const userBalanceDisplay = document.getElementById('user-balance');
const dashboardIbanDisplay = document.getElementById('dashboard-iban');
const btnLogout = document.getElementById('btn-logout');

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (userNameDisplay || userBalanceDisplay || dashboardIbanDisplay) {
            onSnapshot(doc(db, "usuarios", user.uid), (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    if (userNameDisplay) userNameDisplay.innerText = data.nombre;
                    if (userBalanceDisplay) userBalanceDisplay.innerText = `${data.saldo.toFixed(2)}€`;

                    // Inyectar el IBAN formateado discretamente en el Dashboard si existe el campo
                    if (dashboardIbanDisplay && data.iban) {
                        dashboardIbanDisplay.innerText = data.iban.replace(/(.{4})/g, '$1 ').trim();
                    }
                }
            });
        }
    } else {
        // Redirigir a index.html si no hay sesión
        window.location.href = 'index.html';
    }
});

if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        Swal.fire({
            title: '¿Cerrar sesión?',
            text: "Tendrás que volver a entrar para ver tus datos.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#1a2a6c',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, salir',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                signOut(auth).then(() => {
                    window.location.href = 'index.html';
                });
            }
        });
    });
}