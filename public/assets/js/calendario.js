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

    // A) Procesar cobros de suscripciones y aportaciones de huchas del propio usuario
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

                    // CONTROL FINANCIERO: Cancelar si no hay fondos disponibles
                    if (miSaldoActual < pago.cantidad) {
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
                            transaction.set(misMovs, { cantidad: pago.cantidad, concepto: pago.concepto, tipo: 'hucha_ingreso', fecha: new Date() });
                        }
                    }
                    else if (pago.tipo === 'pago_directo') {
                        transaction.update(userRef, { saldo: miSaldoActual - pago.cantidad });
                        const misMovs = doc(collection(db, "usuarios", uid, "movimientos"));
                        transaction.set(misMovs, { cantidad: pago.cantidad, concepto: pago.concepto, tipo: 'gasto', fecha: new Date() });
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

                            // CONTROL FINANCIERO CRUCIAL: Bloquear transferencia si no hay saldo suficiente
                            if (miSaldoActual < tx.cantidad) {
                                transaction.update(txRef, { estado: "fallido_sin_saldo" });
                                return;
                            }

                            // Modificar saldos de forma segura
                            transaction.update(userRef, { saldo: miSaldoActual - tx.cantidad });
                            transaction.update(destRef, { saldo: saldoDestinatarioActual + tx.cantidad });

                            // Insertar extracto en el historial del Emisor
                            const misMovs = doc(collection(db, "usuarios", uid, "movimientos"));
                            transaction.set(misMovs, { cantidad: tx.cantidad, concepto: tx.concepto, tipo: 'transferencia_enviada', fecha: new Date() });

                            // Insertar extracto en el historial del Receptor
                            const susMovs = doc(collection(db, "usuarios", destDoc.id, "movimientos"));
                            transaction.set(susMovs, { cantidad: tx.cantidad, concepto: tx.concepto, tipo: 'transferencia_recibida', fecha: new Date() });

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
    pagosGlobales = pagosGlobales.filter(p => p.origen !== 'tx_global');

    // Si no hay email no podemos buscar transferencias recibidas, pero sí renderizamos
    if (!miEmailGlobal) {
        renderizarCalendario();
        renderizarListaPagosLateral();
        return;
    }

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
                    categoria: 'Transferencias',
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

            let colorPunto = '#28a745';
            if (tienePendientes) colorPunto = '#ff9800';
            if (esIngresoProgramado && tienePendientes) colorPunto = '#007bff';

            const indicador = document.createElement('span');
            indicador.style.cssText = `width: 6px; height: 6px; background: ${colorPunto}; border-radius: 50%; position: absolute; bottom: 6px;`;
            celdaDia.appendChild(indicador);

            celdaDia.style.background = tienePendientes ? (esIngresoProgramado ? "#eef7ff" : "#fffdf0") : "#f0fff4";
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

        let badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#e8f5e9; color:#2e7d32; margin-left:5px;">Ejecutado</span>`;
        if (pago.estado === 'pendiente') {
            badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#fff3e0; color:#ef6c00; margin-left:5px;">Programado</span>`;
        } else if (pago.estado === 'fallido_sin_saldo') {
            badgeEstado = `<span style="font-size:0.7rem; padding: 2px 6px; border-radius:10px; background:#ffebee; color:#c62828; margin-left:5px;">Sin Saldo</span>`;
        }

        const esSignoPositivo = pago.tipo === 'ingreso_programado';
        const colorTextoCantidad = esSignoPositivo ? "#007bff" : borderColor;
        const textoSigno = esSignoPositivo ? "+" : "-";

        item.style.cssText = `display: flex; justify-content: space-between; align-items: center; background: #fdfdfd; padding: 10px 12px; border-left: 4px solid ${borderColor}; border-radius: 4px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);`;

        // Renderizado dinámico del botón de acción
        let botonAccionHTML = `
            <button class="btn-borrar-pago" data-id="${pago.id}" data-origen="${pago.origen}" style="background: none; border: none; color: #ccc; cursor: pointer; transition: color 0.2s;" title="Eliminar este evento">
                <i class="fas fa-times-circle"></i>
            </button>
        `;

        // Si es una suscripción activa y pendiente, añadimos el disparador de baja en lote
        if (pago.categoria === 'Suscripciones' && pago.estado === 'pendiente') {
            botonAccionHTML = `
                <button class="btn-cancelar-suscripcion" data-concepto="${pago.concepto}" style="background: none; border: none; color: #e53e3e; cursor: pointer; margin-right: 5px; transition: color 0.2s;" title="Dar de baja suscripción completa">
                    <i class="fas fa-link-slash"></i>
                </button>
                ${botonAccionHTML}
            `;
        }

        item.innerHTML = `
            <div>
                <strong style="color: #333; font-size: 0.9rem; display: block;">${pago.concepto} ${badgeEstado}</strong>
                <span style="font-size: 0.75rem; color: #777;"><i class="far fa-calendar"></i> Día ${diaPago} - ${pago.categoria}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: ${colorTextoCantidad}; font-weight: 700; font-size: 0.95rem;">${textoSigno}${pago.cantidad.toFixed(2)}€</span>
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

// --- 4. MENU DE OPCIONES POR DIA ---
async function abrirMenuOpcionesDia(fechaDestino) {
    const { value: opcion } = await Swal.fire({
        title: '¿Qué operación deseas programar?',
        text: `Día seleccionado: ${fechaDestino.split('-').reverse().join('/')}`,
        icon: 'question',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#1a2a6c',
        input: 'select',
        inputOptions: {
            'recordatorio': '📅 Solo Recordatorio Visual',
            'transferencia': '💸 Programar Transferencia diferida',
            'hucha': '🐷 Programar Aporte automático a Hucha',
            'suscripcion': '📺 Registrar Suscripción Mensual'
        },
        inputPlaceholder: 'Selecciona una acción',
        inputValidator: (value) => { if (!value) return 'Debes seleccionar una opción'; }
    });

    if (opcion === 'recordatorio') abrirModalNuevoPago(fechaDestino);
    if (opcion === 'transferencia') abrirModalTransferenciaCalendario(fechaDestino);
    if (opcion === 'hucha') abrirModalHuchaCalendario(fechaDestino);
    if (opcion === 'suscripcion') abrirModalSuscripcionCalendario(fechaDestino);
}

// --- 5. MODALES DE CAPTURA ---
async function abrirModalNuevoPago(fechaDestino) {
    const { value: formValues } = await Swal.fire({
        title: `Programar Recordatorio`,
        html: `<input id="pago-concepto" class="swal2-input" placeholder="Concepto"><input id="pago-cantidad" type="number" class="swal2-input" placeholder="Importe (€)">`,
        preConfirm: () => {
            const concepto = document.getElementById('pago-concepto').value.trim();
            const cantidad = document.getElementById('pago-cantidad').value.trim();
            if (!concepto || !cantidad) { Swal.showValidationMessage('Campos requeridos'); return false; }
            return { concepto, cantidad: parseFloat(cantidad), categoria: 'Recordatorio', tipo: 'fijo', estado: 'fijo' };
        }
    });
    if (formValues) addDoc(collection(db, "usuarios", auth.currentUser.uid, "calendario"), { ...formValues, fecha: fechaDestino, timestamp: new Date() });
}

async function abrirModalTransferenciaCalendario(fechaDestino) {
    const miUser = auth.currentUser;
    const { value: formValues } = await Swal.fire({
        title: `Programar Envío de Dinero`,
        html: `
            <input id="tx-email" type="email" class="swal2-input" placeholder="Email del amigo">
            <input id="tx-cantidad" type="number" step="0.01" class="swal2-input" placeholder="Importe (€)">
            <input id="tx-concepto" class="swal2-input" placeholder="Concepto">
        `,
        preConfirm: () => {
            const email = document.getElementById('tx-email').value.trim().toLowerCase();
            const cantidad = document.getElementById('tx-cantidad').value.trim();
            const concepto = document.getElementById('tx-concepto').value.trim() || 'Transferencia programada';
            if (!email || !cantidad) { Swal.showValidationMessage('Rellena los campos obligatorios'); return false; }
            return { email, cantidad: parseFloat(cantidad), concepto };
        }
    });

    if (!formValues) return;

    try {
        Swal.fire({ title: 'Buscando cuenta...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const destQuery = query(collection(db, "usuarios"), where("email", "==", formValues.email));
        const destSnapshot = await getDocs(destQuery);
        if (destSnapshot.empty) throw "No existe ningún usuario registrado con ese email.";

        if (formValues.email === miEmailGlobal) throw "No puedes programarte envíos a ti mismo.";

        await addDoc(collection(db, "transferencias_programadas"), {
            emisorUid: miUser.uid,
            emisorEmail: miEmailGlobal,
            destinatarioEmail: formValues.email,
            cantidad: formValues.cantidad,
            concepto: formValues.concepto,
            fecha: fechaDestino,
            estado: 'pendiente',
            timestamp: new Date()
        });

        Swal.fire('Agendado con éxito', 'La operación se procesará de forma automática en la fecha seleccionada.', 'success');
        cargarTransferenciasGlobalesRealTime(miUser.uid);
    } catch(err) {
        Swal.fire('Error al programar', err.toString(), 'error');
    }
}

async function abrirModalHuchaCalendario(fechaDestino) {
    const miUid = auth.currentUser.uid;
    const q = query(collection(db, "huchas_compartidas"), where("miembros", "array-contains", miUid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        Swal.fire('Aviso', 'No tienes huchas colectivas asignadas.', 'info');
        return;
    }

    let huchasMap = {};
    querySnapshot.forEach(docSnap => { huchasMap[docSnap.id] = docSnap.data().nombre; });

    const { value: huchaId } = await Swal.fire({ title: 'Selecciona la hucha', input: 'select', inputOptions: huchasMap });
    if (!huchaId) return;

    const { value: cantidadRaw } = await Swal.fire({ title: 'Cantidad a ahorrar ese día', input: 'number' });
    if (!cantidadRaw || parseFloat(cantidadRaw) <= 0) return;

    await addDoc(collection(db, "usuarios", miUid, "calendario"), {
        concepto: `Ahorro Auto: ${huchasMap[huchaId]}`,
        cantidad: parseFloat(cantidadRaw),
        huchaId: huchaId,
        tipo: 'hucha_ingreso',
        categoria: 'Ahorros',
        estado: 'pendiente',
        fecha: fechaDestino,
        timestamp: new Date()
    });
    Swal.fire('Guardado', 'Aporte agendado.', 'success');
}

async function abrirModalSuscripcionCalendario(fechaDestino) {
    const { value: formValues } = await Swal.fire({
        title: `Programar Suscripción Recurrente`,
        html: `
            <input id="sub-concepto" class="swal2-input" placeholder="Servicio (ej: Netflix, Spotify)">
            <input id="sub-cantidad" type="number" step="0.01" class="swal2-input" placeholder="Importe (€/mes)">
        `,
        preConfirm: () => {
            const concepto = document.getElementById('sub-concepto').value.trim();
            const cantidad = document.getElementById('sub-cantidad').value.trim();
            if (!concepto || !cantidad) { Swal.showValidationMessage('Completa los campos'); return false; }
            return { concepto, cantidad: parseFloat(cantidad) };
        }
    });

    if (!formValues) return;

    const uid = auth.currentUser.uid;
    const partesFecha = fechaDestino.split('-');
    let añoInicio = parseInt(partesFecha[0]);
    let mesInicio = parseInt(partesFecha[1]) - 1;
    let diaFijo = partesFecha[2];

    try {
        Swal.fire({ title: 'Expandiendo suscripción anual...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        for (let i = 0; i < 12; i++) {
            let fechaIteracion = new Date(añoInicio, mesInicio + i, parseInt(diaFijo));
            let fechaDestinoMensual = `${fechaIteracion.getFullYear()}-${String(fechaIteracion.getMonth() + 1).padStart(2, '0')}-${String(fechaIteracion.getDate()).padStart(2, '0')}`;

            await addDoc(collection(db, "usuarios", uid, "calendario"), {
                concepto: `Suscripción: ${formValues.concepto}`,
                cantidad: formValues.cantidad,
                tipo: 'pago_directo',
                categoria: 'Suscripciones',
                estado: 'pendiente',
                fecha: fechaDestinoMensual,
                timestamp: new Date()
            });
        }
        Swal.fire('Suscripción Lista', 'Guardado para todos los meses de manera independiente.', 'success');
    } catch(e) { Swal.fire('Error', e.toString(), 'error'); }
}

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

// Render inicial para mostrar la estructura del mes aunque Firebase tarde en responder
renderizarCalendario();
