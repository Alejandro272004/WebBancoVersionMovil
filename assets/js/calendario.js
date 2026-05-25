import { db, auth } from './config.js';
import { collection, addDoc, onSnapshot, query, deleteDoc, doc, runTransaction, getDocs, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos de la interfaz
const monthYearText = document.getElementById('calendar-month-year');
const daysGrid = document.getElementById('calendar-days-grid');
const listaPagosContenedor = document.getElementById('lista-pagos-mes');
const btnPrev = document.getElementById('btn-prev-month');
const btnNext = document.getElementById('btn-next-month');

let fechaActual = new Date();
let pagosGlobales = [];
let miEmailGlobal = "";

const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Control de Sesión Activa
auth.onAuthStateChanged(async (user) => {
    if (user) {
        miEmailGlobal = user.email ? user.email.toLowerCase() : "";
        // 1. Procesar primero operaciones pendientes con control estricto de saldo
        await procesarPagosProgramadosVencidos(user.uid);
        // 2. Escuchar en tiempo real para pintar la interfaz
        escucharPagosRealTime(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

// --- 0. MOTOR DE PROCESAMIENTO AUTOMÁTICO CON BLOQUEO DE SALDO INSUFICIENTE ---
async function procesarPagosProgramadosVencidos(uid) {
    const hoy = new Date();
    const hoyString = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const userRef = doc(db, "usuarios", uid);

    // A) Procesar cobros de suscripciones, aportaciones de huchas e inversiones pendientes
    const q = query(collection(db, "usuarios", uid, "calendario"), where("estado", "==", "pendiente"));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        const pago = docSnap.data();
        const pagoRef = doc(db, "usuarios", uid, "calendario", docSnap.id);

        if (pago.fecha <= hoyString) {
            try {
                await runTransaction(db, async (transaction) => {
                    const meSnap = await transaction.get(userRef);
                    const miSaldoActual = meSnap.data().saldo || 0;

                    // CONTROL FINANCIERO: Cancelar cobros salientes si no hay fondos disponibles
                    // Los ingresos programados pasan directamente sin validar saldo mínimo
                    if (pago.tipo !== 'ingreso_programado' && miSaldoActual < pago.cantidad) {
                        transaction.update(pagoRef, { estado: "fallido_sin_saldo" });
                        return;
                    }

                    if (pago.tipo === 'hucha_ingreso') {
                        const huchaRef = doc(db, "huchas_compartidas", pago.huchaId);
                        const huchaSnap = await transaction.get(huchaRef);

                        if (huchaSnap.exists()) {
                            const huchaData = huchaSnap.data();
                            const aportaciones = huchaData.aportaciones || {};
                            aportaciones[uid] = (aportaciones[uid] || 0) + pago.cantidad;

                            transaction.update(userRef, { saldo: miSaldoActual - pago.cantidad });
                            transaction.update(huchaRef, {
                                ahorrado: (huchaData.ahorrado || 0) + pago.cantidad,
                                aportaciones: aportaciones
                            });

                            const misMovs = doc(collection(db, "usuarios", uid, "movimientos"));
                            transaction.set(misMovs, {
                                cantidad: pago.cantidad,
                                concepto: pago.concepto,
                                tipo: 'hucha_ingreso',
                                fecha: new Date(),
                                detalles: pago.detalles || 'Aporte programado automático'
                            });
                        }
                    }
                    else if (pago.tipo === 'pago_directo' || pago.tipo === 'inversion') {
                        const subTipo = pago.tipo === 'inversion' ? 'gasto_inversion' : 'gasto';
                        transaction.update(userRef, { saldo: miSaldoActual - pago.cantidad });
                        const misMovs = doc(collection(db, "usuarios", uid, "movimientos"));
                        transaction.set(misMovs, {
                            cantidad: pago.cantidad,
                            concepto: pago.concepto,
                            tipo: subTipo,
                            fecha: new Date(),
                            detalles: pago.detalles || 'Cargo automático programado'
                        });
                    }
                    else if (pago.tipo === 'ingreso_programado') {
                        // Entrada de dinero planificada
                        transaction.update(userRef, { saldo: miSaldoActual + pago.cantidad });
                        const misMovs = doc(collection(db, "usuarios", uid, "movimientos"));
                        transaction.set(misMovs, {
                            cantidad: pago.cantidad,
                            concepto: pago.concepto,
                            tipo: 'ingreso',
                            fecha: new Date(),
                            detalles: pago.detalles || 'Ingreso recurrente depositado'
                        });
                    }

                    transaction.update(pagoRef, { estado: "ejecutado" });
                });
            } catch (err) { console.error("Error ejecutando pago automático:", err); }
        }
    }

    // B) Procesar transferencias globales en las que este usuario es el EMISOR
    if (miEmailGlobal) {
        const qTx = query(collection(db, "transferencias_programadas"), where("emisorUid", "==", uid), where("estado", "==", "pendiente"));
        const snapshotTx = await getDocs(qTx);

        for (const docSnap of snapshotTx.docs) {
            const tx = docSnap.data();
            const txRef = doc(db, "transferencias_programadas", docSnap.id);

            if (tx.fecha <= hoyString) {
                try {
                    const destQuery = query(collection(db, "usuarios"), where("email", "==", tx.destinatarioEmail));
                    const destSnapshot = await getDocs(destQuery);

                    if (!destSnapshot.empty) {
                        const destDoc = destSnapshot.docs[0];
                        const destRef = doc(db, "usuarios", destDoc.id);

                        await runTransaction(db, async (transaction) => {
                            const meSnap = await transaction.get(userRef);
                            const destSnap = await transaction.get(destRef);

                            const miSaldoActual = meSnap.data().saldo || 0;
                            const saldoDestinatarioActual = destSnap.data().saldo || 0;

                            if (miSaldoActual < tx.cantidad) {
                                transaction.update(txRef, { estado: "fallido_sin_saldo" });
                                return;
                            }

                            transaction.update(userRef, { saldo: miSaldoActual - tx.cantidad });
                            transaction.update(destRef, { saldo: saldoDestinatarioActual + tx.cantidad });

                            const misMovs = doc(collection(db, "usuarios", uid, "movimientos"));
                            transaction.set(misMovs, {
                                cantidad: tx.cantidad,
                                concepto: tx.concepto,
                                tipo: 'transferencia_enviada',
                                fecha: new Date(),
                                detalles: tx.detalles || 'Transferencia agendada ejecutada'
                            });

                            const susMovs = doc(collection(db, "usuarios", destDoc.id, "movimientos"));
                            transaction.set(susMovs, {
                                cantidad: tx.cantidad,
                                concepto: tx.concepto,
                                tipo: 'transferencia_recibida',
                                fecha: new Date(),
                                detalles: `Recibido mediante orden diferida de ${tx.emisorEmail}`
                            });

                            transaction.update(txRef, { estado: "ejecutado" });
                        });
                    } else {
                        await updateDoc(txRef, { estado: "fallido_sin_destinatario" });
                    }
                } catch(e) { console.error("Error liquidando transferencia programada:", e); }
            }
        }
    }
}

// --- 1. ESCUCHA EN TIEMPO REAL ---
function escucharPagosRealTime(uid) {
    const q = collection(db, "usuarios", uid, "calendario");

    onSnapshot(q, (snapshot) => {
        pagosGlobales = pagosGlobales.filter(p => p.origen === 'tx_global');

        snapshot.forEach((docSnap) => {
            pagosGlobales.push({ id: docSnap.id, origen: 'propio', ...docSnap.data() });
        });

        cargarTransferenciasGlobalesRealTime(uid);
    }, (error) => {
        console.error("Error en la lectura del calendario: ", error);
    });
}

function cargarTransferenciasGlobalesRealTime(uid) {
    if (!miEmailGlobal) return;

    pagosGlobales = pagosGlobales.filter(p => p.origen !== 'tx_global');

    const qTx = query(collection(db, "transferencias_programadas"));

    getDocs(qTx).then((snapshot) => {
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            if (data.emisorUid === uid || data.destinatarioEmail === miEmailGlobal) {
                let tipoCalculado = 'transferencia';
                let conceptoCalculado = data.concepto;

                if (data.destinatarioEmail === miEmailGlobal) {
                    tipoCalculado = 'ingreso_programado';
                    conceptoCalculado = `Recibirás de: ${data.emisorEmail}`;
                }

                pagosGlobales.push({
                    id: docSnap.id,
                    origen: 'tx_global',
                    concepto: conceptoCalculado,
                    cantidad: data.cantidad,
                    fecha: data.fecha,
                    tipo: tipoCalculado,
                    categoria: data.categoria || 'Transferencias',
                    detalles: data.detalles || 'Operación diferida de red',
                    estado: data.estado
                });
            }
        });

        // Eliminar duplicados
        const unicos = [];
        const map = new Map();
        for (const item of pagosGlobales) {
            if(!map.has(item.id)){ map.set(item.id, true); unicos.push(item); }
        }
        pagosGlobales = unicos;

        renderizarCalendario();
        renderizarListaPagosLateral();
    });
}

// --- 2. RENDERIZAR MATRIZ DEL CALENDARIO ---
function renderizarCalendario() {
    const año = fechaActual.getFullYear();
    const mes = fechaActual.getMonth();

    if(monthYearText) monthYearText.textContent = `${nombresMeses[mes]} ${año}`;
    if(!daysGrid) return;
    daysGrid.innerHTML = '';

    let primerDiaIndex = new Date(año, mes, 1).getDay() - 1;
    if (primerDiaIndex === -1) primerDiaIndex = 6;

    const totalDiasMes = new Date(año, mes + 1, 0).getDate();

    for (let i = 0; i < primerDiaIndex; i++) {
        daysGrid.appendChild(document.createElement('div'));
    }

    for (let dia = 1; dia <= totalDiasMes; dia++) {
        const celdaDia = document.createElement('div');
        celdaDia.style.cssText = "height: 45px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 500; background: #f8f9fa; color: #333; position: relative; transition: all 0.2s;";
        celdaDia.textContent = dia;

        const hoy = new Date();
        if (dia === hoy.getDate() && mes === hoy.getMonth() && año === hoy.getFullYear()) {
            celdaDia.style.background = "#e6f0fa";
            celdaDia.style.border = "1px solid #1a2a6c";
            celdaDia.style.color = "#1a2a6c";
            celdaDia.style.fontWeight = "700";
        }

        const fechaStringFormato = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const pagosDeEsteDia = pagosGlobales.filter(p => p.fecha === fechaStringFormato);

        if (pagosDeEsteDia.length > 0) {
            const tienePendientes = pagosDeEsteDia.some(p => p.estado === 'pendiente');
            const esIngresoProgramado = pagosDeEsteDia.some(p => p.tipo === 'ingreso_programado');
            const esInversion = pagosDeEsteDia.some(p => p.tipo === 'inversion');

            let colorPunto = '#28a745'; // Ejecutados por defecto
            if (tienePendientes) colorPunto = '#ff9800'; // Naranja: salidas normales
            if (esIngresoProgramado && tienePendientes) colorPunto = '#007bff'; // Azul: Entradas
            if (esInversion && tienePendientes) colorPunto = '#9c27b0'; // Morado: Inversiones

            const indicador = document.createElement('span');
            indicador.style.cssText = `width: 6px; height: 6px; background: ${colorPunto}; border-radius: 50%; position: absolute; bottom: 6px;`;
            celdaDia.appendChild(indicador);

            celdaDia.style.background = tienePendientes ? (esIngresoProgramado ? "#eef7ff" : (esInversion ? "#fbf0ff" : "#fffdf0")) : "#f0fff4";
        }

        celdaDia.addEventListener('click', () => abrirMenuOpcionesDia(fechaStringFormato));
        daysGrid.appendChild(celdaDia);
    }
}

// --- 3. LISTADO DE PAGOS LATERAL ---
function renderizarListaPagosLateral() {
    if(!listaPagosContenedor) return;

    const año = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const prefijoMesActual = `${año}-${mes}`;

    const pagosDelMes = pagosGlobales.filter(p => p.fecha.startsWith(prefijoMesActual));

    if (pagosDelMes.length === 0) {
        listaPagosContenedor.innerHTML = `<p style="color: #aaa; font-size: 0.9rem; text-align: center; margin-top: 30px;">No hay eventos planificados.</p>`;
        return;
    }

    pagosDelMes.sort((a, b) => a.fecha.localeCompare(b.fecha));
    listaPagosContenedor.innerHTML = '';

    pagosDelMes.forEach(pago => {
        const diaPago = pago.fecha.split('-')[2];
        const item = document.createElement('div');

        let borderColor = "#b21f1f";
        if (pago.tipo === 'transferencia') borderColor = "#ff9800";
        if (pago.tipo === 'hucha_ingreso') borderColor = "#28a745";
        if (pago.tipo === 'ingreso_programado') borderColor = "#007bff";
        if (pago.tipo === 'inversion') borderColor = "#9c27b0";

        let badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#e8f5e9; color:#2e7d32; margin-left:5px;">Ejecutado</span>`;
        if (pago.estado === 'pendiente') {
            badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#fff3e0; color:#ef6c00; margin-left:5px;">Programado</span>`;
        } else if (pago.estado === 'fallido_sin_saldo') {
            badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#ffebee; color:#c62828; margin-left:5px;">Sin Saldo</span>`;
        } else if (pago.estado === 'fijo') {
            badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#f1f3f4; color:#5f6368; margin-left:5px;">Nota</span>`;
        }

        const esSignoPositivo = pago.tipo === 'ingreso_programado';
        const colorTextoCantidad = esSignoPositivo ? "#007bff" : borderColor;
        const textoSigno = esSignoPositivo ? "+" : "-";

        // No pintar signos en recordatorios planos de cantidad cero
        const mostrarMoneda = pago.estado === 'fijo' && pago.cantidad === 0 ? '' : `${textoSigno}${pago.cantidad.toFixed(2)}€`;

        item.style.cssText = `display: flex; justify-content: space-between; align-items: center; background: #fdfdfd; padding: 10px 12px; border-left: 4px solid ${borderColor}; border-radius: 4px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);`;

        let botonAccionHTML = `
            <button class="btn-borrar-pago" data-id="${pago.id}" data-origen="${pago.origen}" style="background: none; border: none; color: #ccc; cursor: pointer; transition: color 0.2s;" title="Eliminar este evento">
                <i class="fas fa-times-circle"></i>
            </button>
        `;

        if (pago.categoria === 'Suscripciones' && pago.estado === 'pendiente') {
            botonAccionHTML = `
                <button class="btn-cancelar-suscripcion" data-concepto="${pago.concepto}" style="background: none; border: none; color: #e53e3e; cursor: pointer; margin-right: 5px; transition: color 0.2s;" title="Dar de baja suscripción completa">
                    <i class="fas fa-link-slash"></i>
                </button>
                ${botonAccionHTML}
            `;
        }

        item.innerHTML = `
            <div style="flex: 1; padding-right: 10px;">
                <strong style="color: #333; font-size: 0.9rem; display: block;">${pago.concepto} ${badgeEstado}</strong>
                <span style="font-size: 0.75rem; color: #777; display: block; margin-top: 1px;"><i class="far fa-calendar"></i> Día ${diaPago} - ${pago.categoria}</span>
                ${pago.detalles ? `<span style="font-size: 0.7rem; color: #999; font-style: italic; display: block; margin-top: 2px;">"${pago.detalles}"</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <span style="color: ${colorTextoCantidad}; font-weight: 700; font-size: 0.95rem;">${mostrarMoneda}</span>
                <div style="display: flex; align-items: center;">
                    ${botonAccionHTML}
                </div>
            </div>
        `;

        item.querySelector('.btn-borrar-pago').addEventListener('click', (e) => {
            e.stopPropagation();
            eliminarPago(pago.id, pago.origen);
        });

        const btnBaja = item.querySelector('.btn-cancelar-suscripcion');
        if (btnBaja) {
            btnBaja.addEventListener('click', (e) => {
                e.stopPropagation();
                const conceptoSuscripcion = btnBaja.getAttribute('data-concepto');
                darDeBajaSuscripcionCompleta(conceptoSuscripcion);
            });
        }

        listaPagosContenedor.appendChild(item);
    });
}

// --- 4. MENÚ DE OPCIONES POR DÍA EXPANSO ---
async function abrirMenuOpcionesDia(fechaDestino) {
    const { value: opcion } = await Swal.fire({
        title: 'Planificador de Eventos',
        text: `Día seleccionado: ${fechaDestino.split('-').reverse().join('/')}`,
        icon: 'info',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        confirmButtonColor: '#1a2a6c',
        input: 'select',
        inputOptions: {
            'recordatorio': 'Añadir Nota / Recordatorio Visual',
            'ingreso_prog': 'Planificar Ingreso Futuro (Nómina, Venta)',
            'transferencia': 'Programar Envío Diferido a un amigo',
            'hucha': 'Programar Aporte automático a Hucha',
            'suscripcion': 'Registrar Suscripción Recurrente',
            'inversion_prog': 'Configurar Inversión Periódica (Fondos, ETF)'
        },
        inputPlaceholder: '¿Qué operación deseas programar?',
        inputValidator: (value) => { if (!value) return 'Debes seleccionar una opción'; }
    });

    if (opcion === 'recordatorio') abrirModalNuevoPago(fechaDestino);
    if (opcion === 'ingreso_prog') abrirModalIngresoCalendario(fechaDestino);
    if (opcion === 'transferencia') abrirModalTransferenciaCalendario(fechaDestino);
    if (opcion === 'hucha') abrirModalHuchaCalendario(fechaDestino);
    if (opcion === 'suscripcion') abrirModalSuscripcionCalendario(fechaDestino);
    if (opcion === 'inversion_prog') abrirModalInversionCalendario(fechaDestino);
}

// --- 5. MODALES DE CAPTURA RICA ---

// A) NOTA / RECORDATORIO
async function abrirModalNuevoPago(fechaDestino) {
    const { value: formValues } = await Swal.fire({
        title: `Nuevo Recordatorio`,
        html: `
            <div style="text-align: left; font-family: 'Poppins', sans-serif;">
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Concepto o Título *</label>
                <input id="pago-concepto" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="Ej: Revisión del coche">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Importe Estimado (€) <span style="font-weight:400; color:#888;">(Opcional)</span></label>
                <input id="pago-cantidad" type="number" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="0.00" value="0">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Comentarios adicionales</label>
                <input id="pago-detalles" class="swal2-input" style="width:100%; margin:4px 0 0 0; height:38px;" placeholder="Anotaciones extra...">
            </div>
        `,
        focusConfirm: false,
        confirmButtonColor: '#1a2a6c',
        preConfirm: () => {
            const concepto = document.getElementById('pago-concepto').value.trim();
            const cantidad = document.getElementById('pago-cantidad').value.trim() || "0";
            const detalles = document.getElementById('pago-detalles').value.trim();
            if (!concepto) { Swal.showValidationMessage('El concepto es obligatorio'); return false; }
            return { concepto, cantidad: parseFloat(cantidad), detalles, categoria: 'Recordatorios', tipo: 'fijo', estado: 'fijo' };
        }
    });
    if (formValues) addDoc(collection(db, "usuarios", auth.currentUser.uid, "calendario"), { ...formValues, fecha: fechaDestino, timestamp: new Date() });
}

// B) INGRESO PROGRAMADO (NUEVO)
async function abrirModalIngresoCalendario(fechaDestino) {
    const { value: formValues } = await Swal.fire({
        title: `Planificar Entrada de Capital`,
        html: `
            <div style="text-align: left; font-family: 'Poppins', sans-serif;">
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Origen / Remitente *</label>
                <input id="ing-concepto" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="Ej: Nómina mensual, Cobro de alquiler">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Cantidad a percibir (€) *</label>
                <input id="ing-cantidad" type="number" step="0.01" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="0.00">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Categoría del Flujo</label>
                <select id="ing-cat" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px; display:block; font-size:0.9rem; padding:0 10px;">
                    <option value="Nómina">Nómina / Salario</option>
                    <option value="Ventas">Ventas e Intercambios</option>
                    <option value="Subvenciones">Becas o Ayudas</option>
                    <option value="Otros Ingresos">Otros Reintegros</option>
                </select>

                <label style="font-weight:600; font-size:0.85rem; color:#333;">Notas de seguimiento</label>
                <input id="ing-detalles" class="swal2-input" style="width:100%; margin:4px 0 0 0; height:38px;" placeholder="Detalles descriptivos...">
            </div>
        `,
        focusConfirm: false,
        confirmButtonColor: '#1a2a6c',
        preConfirm: () => {
            const concepto = document.getElementById('ing-concepto').value.trim();
            const cantidad = document.getElementById('ing-cantidad').value.trim();
            const categoria = document.getElementById('ing-cat').value;
            const detalles = document.getElementById('ing-detalles').value.trim();
            if (!concepto || !cantidad || parseFloat(cantidad) <= 0) { Swal.showValidationMessage('Rellena los valores obligatorios'); return false; }
            return { concepto: `Ingreso: ${concepto}`, cantidad: parseFloat(cantidad), categoria, detalles, tipo: 'ingreso_programado', estado: 'pendiente' };
        }
    });
    if (formValues) addDoc(collection(db, "usuarios", auth.currentUser.uid, "calendario"), { ...formValues, fecha: fechaDestino, timestamp: new Date() });
}

// C) TRANSFERENCIA DIFERIDA
async function abrirModalTransferenciaCalendario(fechaDestino) {
    const miUser = auth.currentUser;
    const { value: formValues } = await Swal.fire({
        title: `Giro Postal / Envío de Fondos`,
        html: `
            <div style="text-align: left; font-family: 'Poppins', sans-serif;">
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Email del Destinatario *</label>
                <input id="tx-email" type="email" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="amigo@correo.com">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Importe del Giro (€) *</label>
                <input id="tx-cantidad" type="number" step="0.01" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="0.00">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Concepto de envío</label>
                <input id="tx-concepto" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="Ej: Regalo de boda, Pago cena">

                <label style="font-weight:600; font-size:0.85rem; color:#333;">Mensaje / Nota privada</label>
                <input id="tx-detalles" class="swal2-input" style="width:100%; margin:4px 0 0 0; height:38px;" placeholder="Aparecerá en su extracto...">
            </div>
        `,
        focusConfirm: false,
        confirmButtonColor: '#1a2a6c',
        preConfirm: () => {
            const email = document.getElementById('tx-email').value.trim().toLowerCase();
            const cantidad = document.getElementById('tx-cantidad').value.trim();
            const concepto = document.getElementById('tx-concepto').value.trim() || 'Transferencia diferida';
            const detalles = document.getElementById('tx-detalles').value.trim();
            if (!email || !cantidad || parseFloat(cantidad) <= 0) { Swal.showValidationMessage('Campos requeridos incompletos'); return false; }
            return { email, cantidad: parseFloat(cantidad), concepto, detalles };
        }
    });

    if (!formValues) return;

    try {
        Swal.fire({ title: 'Validando credenciales...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const destQuery = query(collection(db, "usuarios"), where("email", "==", formValues.email));
        const destSnapshot = await getDocs(destQuery);
        if (destSnapshot.empty) throw "No existe ningún usuario registrado con ese email.";
        if (formValues.email === miEmailGlobal) throw "No puedes enviarte transferencias a ti mismo.";

        await addDoc(collection(db, "transferencias_programadas"), {
            emisorUid: miUser.uid,
            emisorEmail: miEmailGlobal,
            destinatarioEmail: formValues.email,
            cantidad: formValues.cantidad,
            concepto: formValues.concepto,
            detalles: formValues.detalles,
            categoria: 'Transferencias',
            fecha: fechaDestino,
            estado: 'pendiente',
            timestamp: new Date()
        });

        Swal.fire('Planificación Correcta', 'Fondos reservados para despacho automático el día fijado.', 'success');
        cargarTransferenciasGlobalesRealTime(miUser.uid);
    } catch(err) {
        Swal.fire('Error de Gestión', err.toString(), 'error');
    }
}

// D) APORTE A HUCHA
async function abrirModalHuchaCalendario(fechaDestino) {
    const miUid = auth.currentUser.uid;
    const q = query(collection(db, "huchas_compartidas"), where("miembros", "array-contains", miUid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        Swal.fire('Sin Fondos Comunes', 'No eres miembro de ninguna hucha compartida actualmente.', 'info');
        return;
    }

    let huchasMap = {};
    querySnapshot.forEach(docSnap => { huchasMap[docSnap.id] = docSnap.data().nombre; });

    const { value: huchaId } = await Swal.fire({
        title: 'Asignación de Fondos',
        input: 'select',
        inputOptions: huchasMap,
        inputPlaceholder: 'Elige la hucha de destino',
        confirmButtonColor: '#1a2a6c',
        inputValidator: (value) => { if (!value) return 'Debes seleccionar una hucha'; }
    });
    if (!huchaId) return;

    const { value: cantidadRaw } = await Swal.fire({
        title: 'Dotación del Aporte',
        input: 'number',
        inputAttributes: { step: '0.01', min: '0.01' },
        placeholder: 'Cantidad en €',
        confirmButtonColor: '#1a2a6c',
        inputValidator: (value) => { if (!value || parseFloat(value) <= 0) return 'Introduce una cantidad válida'; }
    });
    if (!cantidadRaw) return;

    await addDoc(collection(db, "usuarios", miUid, "calendario"), {
        concepto: `Ahorro Auto: ${huchasMap[huchaId]}`,
        cantidad: parseFloat(cantidadRaw),
        huchaId: huchaId,
        tipo: 'hucha_ingreso',
        categoria: 'Ahorros',
        estado: 'pendiente',
        detalles: `Inyección automatizada programada para el fondo común`,
        fecha: fechaDestino,
        timestamp: new Date()
    });
    Swal.fire('Objetivo Fijado', 'Depósito agendado para su ejecución.', 'success');
}

// E) SUSCRIPCIÓN MENSUAL (ANUALIZADA EN LOTES)
async function abrirModalSuscripcionCalendario(fechaDestino) {
    const { value: formValues } = await Swal.fire({
        title: `Pasarela de Suscripción Recurrente`,
        html: `
            <div style="text-align: left; font-family: 'Poppins', sans-serif;">
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Nombre de la Plataforma *</label>
                <input id="sub-concepto" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="Ej: Netflix, Prime Video, Spotify">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Tasa Mensual (€/mes) *</label>
                <input id="sub-cantidad" type="number" step="0.01" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="0.00">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Detalles de la Cuenta / Plan</label>
                <input id="sub-detalles" class="swal2-input" style="width:100%; margin:4px 0 0 0; height:38px;" placeholder="Ej: Plan Premium familiar">
            </div>
        `,
        focusConfirm: false,
        confirmButtonColor: '#1a2a6c',
        preConfirm: () => {
            const concepto = document.getElementById('sub-concepto').value.trim();
            const cantidad = document.getElementById('sub-cantidad').value.trim();
            const detalles = document.getElementById('sub-detalles').value.trim() || 'Renovación de tarifa contratada';
            if (!concepto || !cantidad || parseFloat(cantidad) <= 0) { Swal.showValidationMessage('Datos de facturación incompletos'); return false; }
            return { concepto, cantidad: parseFloat(cantidad), detalles };
        }
    });

    if (!formValues) return;

    const uid = auth.currentUser.uid;
    const partesFecha = fechaDestino.split('-');
    let añoInicio = parseInt(partesFecha[0]);
    let mesInicio = parseInt(partesFecha[1]) - 1;
    let diaFijo = partesFecha[2];

    try {
        Swal.fire({ title: 'Estructurando pasarela anual...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        for (let i = 0; i < 12; i++) {
            let fechaIteracion = new Date(añoInicio, mesInicio + i, parseInt(diaFFixed(diaFijo)));

            // Reparación por desborde de fin de mes
            if (fechaIteracion.getDate() !== parseInt(diaFijo)) {
                fechaIteracion = new Date(añoInicio, mesInicio + i + 1, 0);
            }

            let fechaDestinoMensual = `${fechaIteracion.getFullYear()}-${String(fechaIteracion.getMonth() + 1).padStart(2, '0')}-${String(fechaIteracion.getDate()).padStart(2, '0')}`;

            await addDoc(collection(db, "usuarios", uid, "calendario"), {
                concepto: `Suscripción: ${formValues.concepto}`,
                cantidad: formValues.cantidad,
                tipo: 'pago_directo',
                categoria: 'Suscripciones',
                estado: 'pendiente',
                detalles: formValues.detalles,
                fecha: fechaDestinoMensual,
                timestamp: new Date()
            });
        }
        Swal.fire('Suscripción Lista', 'Contrato expandido para los próximos 12 meses de manera independiente.', 'success');
    } catch(e) { Swal.fire('Error', e.toString(), 'error'); }
}

// F) INVERSIÓN PROGRAMADA (NUEVO)
async function abrirModalInversionCalendario(fechaDestino) {
    const { value: formValues } = await Swal.fire({
        title: `Plan de Inversión Periódica (DCA)`,
        html: `
            <div style="text-align: left; font-family: 'Poppins', sans-serif;">
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Activo / Fondo de Inversión *</label>
                <input id="inv-concepto" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="Ej: SP500, Plan de Pensiones, Bitcoin">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Aportación Periódica (€) *</label>
                <input id="inv-cantidad" type="number" step="0.01" class="swal2-input" style="width:100%; margin:4px 0 12px 0; height:38px;" placeholder="0.00">
                
                <label style="font-weight:600; font-size:0.85rem; color:#333;">Plataforma / Bróker</label>
                <input id="inv-detalles" class="swal2-input" style="width:100%; margin:4px 0 0 0; height:38px;" placeholder="Ej: Trade Republic, MyInvestor">
            </div>
        `,
        focusConfirm: false,
        confirmButtonColor: '#1a2a6c',
        preConfirm: () => {
            const concepto = document.getElementById('inv-concepto').value.trim();
            const cantidad = document.getElementById('inv-cantidad').value.trim();
            const detalles = document.getElementById('inv-detalles').value.trim() || 'Inversión recurrente automatizada';
            if (!concepto || !cantidad || parseFloat(cantidad) <= 0) { Swal.showValidationMessage('Completa los datos de la inversión'); return false; }
            return { concepto: `Inversión: ${concepto}`, cantidad: parseFloat(cantidad), detalles, categoria: 'Inversiones', tipo: 'inversion', estado: 'pendiente' };
        }
    });

    if (formValues) {
        addDoc(collection(db, "usuarios", auth.currentUser.uid, "calendario"), { ...formValues, fecha: fechaDestino, timestamp: new Date() });
        Swal.fire('Estrategia Guardada', 'Compra periódica configurada en el calendario.', 'success');
    }
}

// Auxiliar para parseo de enteros limpios
function diaFFixed(d) { return parseInt(d); }

// --- 6. ELIMINAR EVENTO INDIVIDUAL ---
async function eliminarPago(idPago, origen) {
    try {
        if (origen === 'tx_global') {
            await deleteDoc(doc(db, "transferencias_programadas", idPago));
            pagosGlobales = pagosGlobales.filter(p => p.id !== idPago);
            renderizarCalendario();
            renderizarListaPagosLateral();
        } else {
            await deleteDoc(doc(db, "usuarios", auth.currentUser.uid, "calendario", idPago));
        }
    } catch (e) { console.error("Error al borrar pago:", e); }
}

// --- 7. CANCELAR SUSCRIPCIÓN COMPLETA (BAJA EN LOTE) ---
async function darDeBajaSuscripcionCompleta(conceptoFull) {
    const uid = auth.currentUser.uid;
    const nombreServicio = conceptoFull.replace("Suscripción: ", "");

    const resultado = await Swal.fire({
        title: `¿Dar de baja ${nombreServicio}?`,
        text: `Se eliminarán todos los cobros pendientes programados para los próximos meses de este año.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, revocar suscripción',
        cancelButtonText: 'Mantenerla'
    });

    if (!resultado.isConfirmed) return;

    try {
        Swal.fire({ title: 'Cancelando servicio contratado...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const q = query(
            collection(db, "usuarios", uid, "calendario"),
            where("categoria", "==", "Suscripciones"),
            where("concepto", "==", conceptoFull),
            where("estado", "==", "pendiente")
        );

        const querySnapshot = await getDocs(q);
        const promesasBorrado = querySnapshot.docs.map(docSnap => deleteDoc(doc(db, "usuarios", uid, "calendario", docSnap.id)));

        await Promise.all(promesasBorrado);

        Swal.fire(
            'Suscripción Cancelada',
            `Te has dado de baja de ${nombreServicio} correctamente de cara a los siguientes meses.`,
            'success'
        );

    } catch (error) {
        console.error("Error al revocar la suscripción:", error);
        Swal.fire('Error', 'No se pudo procesar la baja en el servidor.', 'error');
    }
}

// --- 8. CONTROLES DE NAVEGACIÓN ---
if(btnPrev) {
    btnPrev.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() - 1);
        renderizarCalendario();
        renderizarListaPagosLateral();
    });
}
if(btnNext) {
    btnNext.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() + 1);
        renderizarCalendario();
        renderizarListaPagosLateral();
    });
}