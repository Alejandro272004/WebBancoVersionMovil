import { auth, db } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos de la interfaz
const txtIngresos = document.getElementById('stats-ingresos');
const txtGastos = document.getElementById('stats-gastos');
const txtAhorro = document.getElementById('stats-ahorro');
let miGrafico = null;

// Control de la sesión activa
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // =================================================================
    // 1. CALCULAR EL AHORRO NETO DESDE "HUCHAS_COMPARTIDAS" (Exacto al céntimo)
    // =================================================================
    // Buscamos en la colección real donde el usuario es miembro activo
    const huchasRef = collection(db, "huchas_compartidas");
    const qHuchas = query(huchasRef, where("miembros", "array-contains", user.uid));

    onSnapshot(qHuchas, (huchasSnapshot) => {
        let sumaTotalHuchas = 0;

        huchasSnapshot.forEach((huchaDoc) => {
            const huchaData = huchaDoc.data();

            // Accedemos al mapa de aportaciones usando tu ID exacto de usuario
            if (huchaData.aportaciones && huchaData.aportaciones[user.uid] !== undefined) {
                const miAporte = parseFloat(huchaData.aportaciones[user.uid]) || 0;
                sumaTotalHuchas += miAporte;
            }
        });

        // Pintamos el total real acumulado de todas tus huchas activas
        if (txtAhorro) {
            txtAhorro.textContent = `${sumaTotalHuchas.toFixed(2)}€`;
            txtAhorro.style.color = sumaTotalHuchas > 0 ? "#1a2a6c" : "#b21f1f";
        }
    });

    // =================================================================
    // 2. ESCUCHAR LOS MOVIMIENTOS (Filtro comercial mensual blindado)
    // =================================================================
    const movsRef = collection(db, "usuarios", user.uid, "movimientos");

    onSnapshot(movsRef, (snapshot) => {
        let ingresosTotales = 0;
        let gastosTotales = 0;

        const mesActual = new Date().getMonth();
        const añoActual = new Date().getFullYear();

        snapshot.forEach((docSnap) => {
            const mov = docSnap.data();

            let fechaMov = new Date();
            if (mov.fecha && typeof mov.fecha.toDate === 'function') {
                fechaMov = mov.fecha.toDate();
            } else if (mov.fecha) {
                fechaMov = new Date(mov.fecha);
            }

            // Filtrar únicamente los movimientos que pertenezcan al mes en curso
            if (fechaMov.getMonth() === mesActual && fechaMov.getFullYear() === añoActual) {
                const cantidad = parseFloat(mov.cantidad) || 0;
                const tipoMov = (mov.tipo || "").toLowerCase();
                const conceptoMov = (mov.concepto || "").toLowerCase();

                // 🚫 BLINDAJE TOTAL: Si el tipo o el concepto mencionan la hucha o devoluciones,
                // se salta el movimiento para que no altere los ingresos ni gastos de la cuenta corriente.
                if (
                    tipoMov.includes('hucha') ||
                    conceptoMov.includes('hucha') ||
                    conceptoMov.includes('devolución') ||
                    conceptoMov.includes('devolucion')
                ) {
                    return;
                }

                // Clasificación limpia de flujos comerciales ordinarios
                if (tipoMov === 'ingreso' || tipoMov === 'transferencia_recibida') {
                    ingresosTotales += cantidad;
                } else {
                    gastosTotales += cantidad;
                }
            }
        });

        // Pintar las tarjetas mensuales comerciales de la cuenta
        if (txtIngresos) txtIngresos.textContent = `${ingresosTotales.toFixed(2)}€`;
        if (txtGastos) txtGastos.textContent = `${gastosTotales.toFixed(2)}€`;

        // Renderizar o actualizar la gráfica circular
        renderizarGrafico(ingresosTotales, gastosTotales);
    });
});

// Función centralizada para dibujar el gráfico de Chart.js
function renderizarGrafico(ingresos, gastos) {
    const ctx = document.getElementById('graficoFinanzas');
    if (!ctx) return;

    if (miGrafico) {
        miGrafico.destroy();
    }

    const dataIngresos = ingresos === 0 && gastos === 0 ? 1 : ingresos;
    const dataGastos = ingresos === 0 && gastos === 0 ? 0 : gastos;

    const etiquetas = ingresos === 0 && gastos === 0 ? ['Sin movimientos', 'Sin movimientos'] : ['Ingresos', 'Gastos'];
    const colores = ingresos === 0 && gastos === 0 ? ['#e2e8f0', '#cbd5e0'] : ['#28a745', '#b21f1f'];

    miGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etiquetas,
            datasets: [{
                data: [dataIngresos, dataGastos],
                backgroundColor: colores,
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Poppins', size: 12 } }
                }
            }
        }
    });
}