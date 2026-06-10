import { auth, db } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

    // Escuchar la subcolección de movimientos del usuario en tiempo real
    const movsRef = collection(db, "usuarios", user.uid, "movimientos");

    onSnapshot(movsRef, (snapshot) => {
        let ingresosTotales = 0;
        let gastosTotales = 0;
        let ahorroNetoHucha = 0; // Tu variable acumuladora de la hucha

        // Obtener el mes y año actuales para filtrar las métricas mensuales
        const mesActual = new Date().getMonth();
        const añoActual = new Date().getFullYear();

        snapshot.forEach((docSnap) => {
            const mov = docSnap.data();

            // Convertir la marca de tiempo de Firebase de forma segura
            let fechaMov = new Date();
            if (mov.fecha && typeof mov.fecha.toDate === 'function') {
                fechaMov = mov.fecha.toDate();
            } else if (mov.fecha) {
                fechaMov = new Date(mov.fecha);
            }

            // Filtrar únicamente los movimientos que pertenezcan al mes en curso
            if (fechaMov.getMonth() === mesActual && fechaMov.getFullYear() === añoActual) {
                const cantidad = parseFloat(mov.cantidad) || 0;

                // CASO 1: Es un ingreso EN la hucha
                if (mov.tipo === 'hucha_ingreso') {
                    ahorroNetoHucha += cantidad;
                    // NO suma a ingresosTotales ni a gastosTotales, se queda solo en la hucha
                }
                // CASO 2: Es un retiro DE la hucha
                else if (mov.tipo === 'hucha_reintegro') {
                    ahorroNetoHucha -= cantidad;
                    // NO suma a ingresosTotales ni a gastosTotales
                }
                // CASO 3: Es un ingreso o transferencia recibida normal en cuenta corriente
                else if (mov.tipo === 'ingreso' || mov.tipo === 'transferencia_recibida') {
                    ingresosTotales += cantidad;
                }
                // CASO 4: Es un gasto o transferencia enviada normal de cuenta corriente
                else {
                    gastosTotales += cantidad;
                }
            }
        });

        // Control de seguridad por si se vacía o da negativo por cualquier limpieza en Firebase
        if (ahorroNetoHucha < 0) {
            ahorroNetoHucha = 0;
        }

        // Pintar los datos procesados en las tarjetas del HTML
        if (txtIngresos) txtIngresos.textContent = `${ingresosTotales.toFixed(2)}€`;
        if (txtGastos) txtGastos.textContent = `${gastosTotales.toFixed(2)}€`;
        if (txtAhorro) {
            txtAhorro.textContent = `${ahorroNetoHucha.toFixed(2)}€`;
            txtAhorro.style.color = ahorroNetoHucha > 0 ? "#1a2a6c" : "#b21f1f";
        }

        // Renderizar o actualizar la gráfica circular con los valores limpios
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