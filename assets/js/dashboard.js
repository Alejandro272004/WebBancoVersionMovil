import { auth, db } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const transactionsList = document.getElementById('transactions-list');

// UN SOLO escuchador para todo el ciclo de vida del Dashboard
onAuthStateChanged(auth, (user) => {
    if (user) {
        // --- APARTADO 1: CARGAR ÚLTIMOS MOVIMIENTOS (Subcolección) ---
        const movimientosRef = collection(db, "usuarios", user.uid, "movimientos");
        const q = query(movimientosRef, orderBy("fecha", "desc"), limit(5));

        onSnapshot(q, (snapshot) => {
            if (!transactionsList) return;

            transactionsList.innerHTML = '';

            if (snapshot.empty) {
                transactionsList.innerHTML = '<p class="empty-msg">No hay movimientos recientes.</p>';
                return;
            }

            snapshot.forEach((doc) => {
                const mov = doc.data();

                // Controlamos si la fecha viene vacía o tarda en cargar de Firebase
                const fecha = mov.fecha ? mov.fecha.toDate().toLocaleDateString('es-ES') : 'Reciente';

                // Detectar si es ingreso o gasto por el tipo de operación
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
        });

    } else {
        // Si no hay sesión, patada y de vuelta al login
        window.location.href = 'index.html';
    }
});