import { auth, db } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, doc, updateDoc, increment, getDoc, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const transferForm = document.getElementById('transfer-form');

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    if (transferForm) {
        transferForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const destinatarioIbanRaw = document.getElementById('destinatario').value;
            const monto = parseFloat(document.getElementById('monto').value);
            const concepto = document.getElementById('concepto').value || "Transferencia Bancaria";

            // Limpiamos los espacios para que coincida con el string continuo de la BD
            const destinatarioIban = destinatarioIbanRaw.replace(/\s+/g, '').toUpperCase();

            if (isNaN(monto) || monto <= 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Importe no válido',
                    text: 'El importe debe ser mayor de 0.00 €.',
                    confirmButtonColor: '#1a2a6c'
                });
                return;
            }

            try {
                Swal.fire({
                    title: 'Procesando...',
                    text: 'Conectando con el servidor bancario.',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                const userRef = doc(db, "usuarios", user.uid);
                const userSnap = await getDoc(userRef);
                const userData = userSnap.data();

                if (userData.iban === destinatarioIban) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Operación denegada',
                        text: 'No puedes realizar una transferencia a tu propio IBAN.',
                        confirmButtonColor: '#1a2a6c'
                    });
                    return;
                }

                if (userData.saldo < monto) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Saldo insuficiente',
                        text: `Tu saldo actual es de ${userData.saldo.toFixed(2)} €.`,
                        confirmButtonColor: '#1a2a6c'
                    });
                    return;
                }

                // Ejecución de la query (ahora autorizada por la regla 'list')
                const q = query(collection(db, "usuarios"), where("iban", "==", destinatarioIban));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    Swal.fire({
                        icon: 'error',
                        title: 'IBAN no encontrado',
                        text: 'La cuenta de destino no pertenece a BankFlow.',
                        confirmButtonColor: '#1a2a6c'
                    });
                    return;
                }

                const destinatarioDoc = querySnapshot.docs[0];
                const destinatarioData = destinatarioDoc.data();
                const destinatarioRef = doc(db, "usuarios", destinatarioDoc.id);

                // Modificación de saldos
                await updateDoc(userRef, { saldo: increment(-monto) });
                await updateDoc(destinatarioRef, { saldo: increment(monto) });

                // Registro de auditoría en historiales privados
                await addDoc(collection(db, "usuarios", user.uid, "movimientos"), {
                    cantidad: monto,
                    concepto: `Envío: ${concepto}`,
                    tipo: 'transferencia_enviada',
                    fecha: new Date(),
                    detalles: `Para: ${destinatarioData.nombre}`
                });

                await addDoc(collection(db, "usuarios", destinatarioDoc.id, "movimientos"), {
                    cantidad: monto,
                    concepto: `Recibido: ${concepto}`,
                    tipo: 'transferencia_recibida',
                    fecha: new Date(),
                    detalles: `De: ${userData.nombre}`
                });

                Swal.fire({
                    icon: 'success',
                    title: '¡Transferencia enviada!',
                    text: `Se han enviado ${monto.toFixed(2)} € correctamente.`,
                    confirmButtonColor: '#1a2a6c'
                });

                transferForm.reset();

            } catch (error) {
                console.error("Error en transferencia:", error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error de procesamiento',
                    text: 'Hubo un problema al validar los permisos bancarios.',
                    confirmButtonColor: '#1a2a6c'
                });
            }
        });
    }
});