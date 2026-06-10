import { db, auth } from './config.js';
import { collection, addDoc, doc, onSnapshot, runTransaction, deleteDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const huchasGrid = document.getElementById('huchas-grid');
let unsubscribeHuchas = null;

// Control de sesión de Firebase
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarHuchasCompartidasRealTime(user.uid);
    } else {
        if (unsubscribeHuchas) unsubscribeHuchas();
        window.location.href = 'index.html';
    }
});

// --- 1. ESCUCHAR HUCHAS EN TIEMPO REAL ---
function cargarHuchasCompartidasRealTime(uid) {
    const q = query(collection(db, "huchas_compartidas"), where("miembros", "array-contains", uid));

    unsubscribeHuchas = onSnapshot(q, (snapshot) => {
        huchasGrid.innerHTML = `
            <div class="add-hucha-card" id="btn-nueva-hucha-dinamico">
                <i class="fas fa-plus-circle"></i>
                <p>Crear hucha compartida</p>
            </div>
        `;

        document.getElementById('btn-nueva-hucha-dinamico').addEventListener('click', abrirModalCrearHuchaCompartida);

        if (snapshot.empty) return;

        snapshot.forEach((docSnap) => {
            const hucha = docSnap.data();
            const id = docSnap.id;

            const tieneMeta = hucha.meta && hucha.meta > 0;
            const porcentaje = tieneMeta ? Math.min((hucha.ahorrado / hucha.meta) * 100, 100) : 0;

            const miAportacion = hucha.aportaciones && hucha.aportaciones[uid] ? hucha.aportaciones[uid] : 0;
            const esCreador = hucha.creador === uid;

            const huchaCard = document.createElement('div');
            huchaCard.className = 'hucha-card';
            huchaCard.style = "background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between; position: relative;";

            huchaCard.innerHTML = `
                ${esCreador ? `<button class="btn-eliminar-hucha" data-id="${id}" style="position: absolute; top: 15px; right: 15px; background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 1.1rem;"><i class="fas fa-trash"></i></button>` : ''}
                <div>
                    <h3 style="margin-top: 5px; color: #1a2a6c; font-size: 1.3rem; font-weight: 700;">${hucha.nombre}</h3>
                    <p style="font-size: 0.8rem; color: #777; margin-bottom: 5px;"><i class="fas fa-users"></i> Compartida (${hucha.miembros.length} pers.)</p>
                    <p style="font-size: 0.9rem; color: #666; margin: 4px 0;">
                        Total: <strong>${hucha.ahorrado.toFixed(2)}€</strong> ${tieneMeta ? `de ${hucha.meta.toFixed(2)}€` : '(Fondo abierto)'}
                    </p>
                    <p style="font-size: 0.8rem; color: #555; margin-bottom: 8px;">Tu aportación: <span style="color: #b21f1f; font-weight: bold;">${miAportacion.toFixed(2)}€</span></p>
                    
                    ${tieneMeta ? `
                        <div style="background: #e0e0e0; border-radius: 10px; height: 10px; width: 100%; margin: 15px 0 5px 0; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, #1a2a6c, #b21f1f); height: 100%; width: ${porcentaje}%; transition: width 0.5s ease;"></div>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: bold; color: #b21f1f;">${porcentaje.toFixed(0)}% completado</span>
                    ` : `
                        <div style="margin: 15px 0 5px 0; font-size: 0.8rem; font-weight: bold; color: #28a745;">
                            <i class="fas fa-infinity"></i> Sin límite de meta
                        </div>
                    `}
                </div>

                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn-ingresar" data-id="${id}" style="flex: 1; background: #1a2a6c; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fas fa-plus"></i> Ingresar</button>
                    <button class="btn-retirar" data-id="${id}" style="flex: 1; background: #efefef; color: #333; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fas fa-minus"></i> Retirar</button>
                </div>
            `;
            huchasGrid.appendChild(huchaCard);
        });

        asignarEventosTarjetas();
    });
}

function asignarEventosTarjetas() {
    document.querySelectorAll('.btn-ingresar').forEach(btn => {
        btn.addEventListener('click', (e) => solicitarCantidadHucha(e.currentTarget.dataset.id, true));
    });
    document.querySelectorAll('.btn-retirar').forEach(btn => {
        btn.addEventListener('click', (e) => solicitarCantidadHucha(e.currentTarget.dataset.id, false));
    });
    document.querySelectorAll('.btn-eliminar-hucha').forEach(btn => {
        btn.addEventListener('click', (e) => eliminarHuchaDoc(e.currentTarget.dataset.id));
    });
}

// --- 2. MODAL DINÁMICO CORREGIDO: INTERFAZ LIMPIA Y REMOCIÓN DE EMAILS ---
async function abrirModalCrearHuchaCompartida() {
    const { value: formValues } = await Swal.fire({
        title: 'Nueva Hucha Colectiva',
        html: `
            <div style="text-align: left; font-family: 'Poppins', sans-serif; padding: 0 5px;">
                <div style="margin-bottom: 15px;">
                    <label style="font-weight: 600; color: #333; display: block; margin-bottom: 5px;">Nombre de la hucha *</label>
                    <input id="hucha-nombre" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box;" placeholder="Ej: Viaje de Verano">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: 600; color: #333; display: block; margin-bottom: 5px;">Meta total (€)</label>
                    <span style="font-size: 0.8rem; color: #666; display: block; margin-bottom: 5px;">(Deja este campo vacío para fondos sin límite de dinero)</span>
                    <input id="hucha-meta" type="number" step="0.01" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box;" placeholder="Ej: 500 (Opcional)">
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-top: 1px solid #eee; padding-top: 15px;">
                    <label style="font-weight: 600; color: #333; margin: 0;">Invitados por Email</label>
                    <button type="button" id="btn-add-email-field" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-user-plus"></i> Añadir persona
                    </button>
                </div>
                
                <div id="emails-container" style="max-height: 200px; overflow-y: auto; padding-right: 5px;">
                    <div class="email-input-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <input class="swal2-input hucha-email-input" style="flex: 1; margin: 0; height: 42px; box-sizing: border-box;" type="email" placeholder="Email del participante 1">
                        <div style="width: 38px;"></div>
                    </div>
                </div>
            </div>
        `,
        focusConfirm: false,
        confirmButtonColor: '#1a2a6c',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            const container = document.getElementById('emails-container');

            document.getElementById('btn-add-email-field').addEventListener('click', () => {
                const totalCampos = container.getElementsByClassName('hucha-email-input').length + 1;

                const row = document.createElement('div');
                row.className = 'email-input-group';
                row.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 8px;";

                const nuevoInput = document.createElement('input');
                nuevoInput.className = 'swal2-input hucha-email-input';
                nuevoInput.style.cssText = "flex: 1; margin: 0; height: 42px; box-sizing: border-box;";
                nuevoInput.type = 'email';
                nuevoInput.placeholder = `Email del participante ${totalCampos}`;

                const btnEliminar = document.createElement('button');
                btnEliminar.type = 'button';
                btnEliminar.style.cssText = "background: #ff4d4d; color: white; border: none; width: 38px; height: 38px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;";
                btnEliminar.innerHTML = '<i class="fas fa-trash"></i>';

                btnEliminar.addEventListener('click', () => {
                    row.remove();
                    // SINTAXIS CORREGIDA AQUÍ (inputsRestantes sin espacio)
                    const inputsRestantes = container.getElementsByClassName('hucha-email-input');
                    for(let i = 0; i < inputsRestantes.length; i++) {
                        inputsRestantes[i].placeholder = `Email del participante ${i + 1}`;
                    }
                });

                row.appendChild(nuevoInput);
                row.appendChild(btnEliminar);
                container.appendChild(row);
                container.scrollTop = container.scrollHeight;
            });
        },
        preConfirm: () => {
            const nombre = document.getElementById('hucha-nombre').value.trim();
            const metaRaw = document.getElementById('hucha-meta').value.trim();
            const meta = metaRaw === "" ? 0 : parseFloat(metaRaw);

            const emailInputs = document.getElementsByClassName('hucha-email-input');
            const emails = [];
            for (let input of emailInputs) {
                const emailVal = input.value.trim().toLowerCase();
                if (emailVal !== "") {
                    emails.push(emailVal);
                }
            }

            if (!nombre) {
                Swal.showValidationMessage('El nombre de la hucha es obligatorio.');
                return false;
            }
            if (metaRaw !== "" && meta <= 0) {
                Swal.showValidationMessage('La meta debe ser un número positivo o dejarse en blanco.');
                return false;
            }

            return { nombre, meta, emails };
        }
    });

    if (formValues) {
        const { nombre, meta, emails } = formValues;
        const miUid = auth.currentUser.uid;
        let miembrosList = [miUid];

        try {
            Swal.fire({ title: 'Procesando invitaciones...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            for (const email of emails) {
                const q = query(collection(db, "usuarios"), where("email", "==", email));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const socioUid = querySnapshot.docs[0].id;
                    if (socioUid !== miUid && !miembrosList.includes(socioUid)) {
                        miembrosList.push(socioUid);
                    }
                } else {
                    Swal.fire('Error de Invitación', `No existe ninguna cuenta vinculada al correo: ${email}`, 'error');
                    return;
                }
            }

            let aportacionesIniciales = {};
            miembrosList.forEach(id => { aportacionesIniciales[id] = 0; });

            await addDoc(collection(db, "huchas_compartidas"), {
                nombre: nombre,
                meta: meta,
                ahorrado: 0,
                creador: miUid,
                miembros: miembrosList,
                aportaciones: aportacionesIniciales,
                fechaCreacion: new Date()
            });

            Swal.fire({ icon: 'success', title: '¡Hucha activa!', text: `Se ha configurado la hucha con ${miembrosList.length} participantes.`, confirmButtonColor: '#1a2a6c' });
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Error al procesar la creación de la hucha colectiva.', 'error');
        }
    }
}

async function solicitarCantidadHucha(huchaId, esIngreso) {
    const titulo = esIngreso ? 'Aportar saldo' : 'Retirar saldo';
    const { value: cantidad } = await Swal.fire({
        title: titulo,
        input: 'number',
        inputAttributes: { step: '0.01', min: '0.01' },
        showCancelButton: true,
        confirmButtonColor: '#1a2a6c',
        inputValidator: (value) => { if (!value || parseFloat(value) <= 0) return 'Introduce una cantidad válida'; }
    });

    if (cantidad) {
        gestionarDineroHuchaCompartida(huchaId, parseFloat(cantidad), esIngreso);
    }
}

// --- 3. MOTOR TRANSACCIONAL (METER / SACAR FONDOS) ---
async function gestionarDineroHuchaCompartida(huchaId, cantidad, esIngreso) {
    const userUid = auth.currentUser.uid;
    const userRef = doc(db, "usuarios", userUid);
    const huchaRef = doc(db, "huchas_compartidas", huchaId);
    const movimientosRef = collection(db, "usuarios", userUid, "movimientos");

    try {
        Swal.fire({ title: 'Conectando con la hucha...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const huchaSnap = await transaction.get(huchaRef);

            if (!userSnap.exists() || !huchaSnap.exists()) throw "Error de sincronización con la base de datos.";

            const huchaData = huchaSnap.data();
            const saldoUser = userSnap.data().saldo;
            const totalAhorradoHucha = huchaData.ahorrado;

            const aportaciones = huchaData.aportaciones || {};
            const loQueYoHeAportado = aportaciones[userUid] || 0;

            if (esIngreso) {
                if (saldoUser < cantidad) throw "No tienes suficiente saldo disponible en tu cuenta principal.";

                aportaciones[userUid] = loQueYoHeAportado + Math.abs(cantidad);

                transaction.update(userRef, { saldo: saldoUser - Math.abs(cantidad) });
                transaction.update(huchaRef, {
                    ahorrado: totalAhorradoHucha + Math.abs(cantidad),
                    aportaciones: aportaciones
                });

                transaction.set(doc(movimientosRef), {
                    cantidad: Math.abs(cantidad),
                    concepto: `Aportación Hucha: ${huchaData.nombre}`,
                    tipo: 'hucha_ingreso',
                    fecha: new Date(),
                    detalles: `Envío de fondos al objetivo común`
                });

            } else {
                const tieneMeta = huchaData.meta && huchaData.meta > 0;
                const completadaAl100 = tieneMeta ? (totalAhorradoHucha >= huchaData.meta) : false;

                if (tieneMeta && !completadaAl100) {
                    if (loQueYoHeAportado < cantidad) {
                        throw `Operación Bloqueada: La hucha no ha alcanzado la meta del 100%. Hasta entonces, solo puedes retirar tus propias aportaciones (Máx: ${loQueYoHeAportado.toFixed(2)}€). El dinero de los compañeros está protegido.`;
                    }
                } else {
                    if (totalAhorradoHucha < cantidad) throw "No queda tanto dinero disponible en la hucha.";
                }

                if (aportaciones[userUid] !== undefined) {
                    aportaciones[userUid] = Math.max(0, loQueYoHeAportado - cantidad);
                }

                transaction.update(userRef, { saldo: saldoUser + cantidad });
                transaction.update(huchaRef, {
                    ahorrado: totalAhorradoHucha - cantidad,
                    aportaciones: aportaciones
                });

                transaction.set(doc(movimientosRef), {
                    cantidad: cantidad,
                    concepto: `Retiro Hucha: ${huchaData.nombre}`,
                    tipo: 'hucha_reintegro',
                    fecha: new Date(),
                    detalles: (tieneMeta && completadaAl100) ? `Retiro de fondos (Meta 100% Conseguida)` : `Cancelación de aportación propia`
                });
            }
        });

        Swal.fire({ icon: 'success', title: '¡Transacción realizada!', text: 'El saldo se ha actualizado bajo los términos de seguridad.', confirmButtonColor: '#1a2a6c' });
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: e, confirmButtonColor: '#1a2a6c' });
    }
}

// --- 4. DISOLVER HUCHA CON DEVOLUCIÓN AUTOMÁTICA EN VERDE ---
async function eliminarHuchaDoc(huchaId) {
    const result = await Swal.fire({
        title: '¿Disolver hucha compartida?',
        text: "Al cerrar el fondo común, el dinero acumulado se devolverá automáticamente a la cuenta corriente de cada participante según lo que haya aportado.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, disolver y devolver fondos',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        Swal.fire({
            title: 'Devolviendo fondos...',
            text: 'Repartiendo los saldos e ingresándolos en las cuentas corrientes.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const huchaRef = doc(db, "huchas_compartidas", huchaId);

        await runTransaction(db, async (transaction) => {
            const huchaSnap = await transaction.get(huchaRef);
            if (!huchaSnap.exists()) throw "La hucha ya no existe.";

            const huchaData = huchaSnap.data();
            const aportaciones = huchaData.aportaciones || {};
            const miembros = huchaData.miembros || [];

            for (const uid of miembros) {
                const montoADevolver = aportaciones[uid] || 0;

                if (montoADevolver > 0) {
                    const userRef = doc(db, "usuarios", uid);
                    const userSnap = await transaction.get(userRef);

                    if (userSnap.exists()) {
                        const saldoActual = userSnap.data().saldo || 0;

                        transaction.update(userRef, { saldo: saldoActual + montoADevolver });

                        const movRef = doc(collection(db, "usuarios", uid, "movimientos"));
                        transaction.set(movRef, {
                            cantidad: montoADevolver,
                            concepto: `Devolución: ${huchaData.nombre}`,
                            tipo: 'ingreso',
                            fecha: new Date(),
                            detalles: `Fondo común disuelto por el creador. Reintegro automático.`
                        });
                    }
                }
            }

            transaction.delete(huchaRef);
        });

        Swal.fire({
            icon: 'success',
            title: 'Hucha disuelta',
            text: 'El fondo común ha sido eliminado y los saldos han sido devueltos a cada usuario.',
            confirmButtonColor: '#1a2a6c'
        });

    } catch (error) {
        console.error("Error al disolver hucha:", error);
        Swal.fire({
            icon: 'error',
            title: 'Error del sistema',
            text: 'No se pudo procesar la devolución de fondos: ' + error,
            confirmButtonColor: '#1a2a6c'
        });
    }
}
