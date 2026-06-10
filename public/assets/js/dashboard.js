import { db, auth } from './config.js';
import { doc, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

console.log("📦 dashboard.js cargado");

const transactionsList = document.getElementById('transactions-list');

function cargarDatosUsuario(uid) {
    console.log("📡 Escuchando datos de usuario UID:", uid);
    const userRef = doc(db, "usuarios", uid);

    onSnapshot(userRef, (docSnap) => {
        console.log("🔥 onSnapshot disparado. Existe:", docSnap.exists());

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("📋 Datos recibidos:", data);

            const saldo = typeof data.saldo === 'number' ? data.saldo : 0;

            const userNameEl = document.getElementById('user-name');
            const userBalanceEl = document.getElementById('user-balance');

            console.log("🎯 user-name el:", userNameEl);
            console.log("🎯 user-balance el:", userBalanceEl);

            if (userNameEl) {
                userNameEl.innerText = data.nombre || 'Usuario';
                console.log("✅ Nombre pintado:", data.nombre);
            } else {
                console.error("❌ No se encontró #user-name en el DOM");
            }

            if (userBalanceEl) {
                userBalanceEl.innerText = `${saldo.toFixed(2)}€`;
                console.log("✅ Saldo pintado:", saldo);
            } else {
                console.error("❌ No se encontró #user-balance en el DOM");
            }
        } else {
            console.error("❌ El documento del usuario NO existe en Firestore para UID:", uid);
        }
    }, (error) => {
        console.error("❌ Error en onSnapshot de usuario:", error);
    });
}

function cargarMovimientos(uid) {
    if (!transactionsList) return;

    const movimientosRef = collection(db, "usuarios", uid, "movimientos");
    const q = query(movimientosRef, orderBy("fecha", "desc"), limit(5));

    onSnapshot(q, (snapshot) => {
        transactionsList.innerHTML = '';

        if (snapshot.empty) {
            transactionsList.innerHTML = '<p class="empty-msg">No hay movimientos recientes.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const mov = docSnap.data();
            const fecha = mov.fecha ? mov.fecha.toDate().toLocaleDateString('es-ES') : 'Reciente';
            const esIngreso = mov.tipo === 'ingreso' || mov.tipo === 'transferencia_recibida';
            const signo = esIngreso ? '+' : '-';
            const claseMonto = esIngreso ? 'positive' : 'negative';

            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.innerHTML = `
                <div class="trans-info">
                    <strong>${mov.concepto || 'Operación Bancaria'}</strong>
                    <span>${fecha}</span>
                </div>
                <div class="trans-amount ${claseMonto}">
                    ${signo}${parseFloat(mov.cantidad || 0).toFixed(2)}€
                </div>
            `;
            transactionsList.appendChild(item);
        });
    }, (error) => {
        console.error("❌ Error cargando movimientos:", error);
    });
}

onAuthStateChanged(auth, (user) => {
    console.log("🔐 onAuthStateChanged en dashboard.js. User:", user ? user.uid : "null");
    if (user) {
        cargarDatosUsuario(user.uid);
        cargarMovimientos(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});
