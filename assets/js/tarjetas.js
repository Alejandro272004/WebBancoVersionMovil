import { auth, db } from './config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "usuarios", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();

                const ibanPuro = data.iban || "ES0000000000000000000000";
                // Añade los espacios estéticos cada 4 dígitos para que se vea real en la tarjeta
                const ibanFormateado = ibanPuro.replace(/(.{4})/g, '$1 ').trim();

                const ibanElem = document.getElementById('user-iban');
                const nameElem = document.getElementById('user-name');
                const saldoElem = document.getElementById('user-saldo');

                if (ibanElem) ibanElem.innerText = ibanFormateado;
                if (nameElem) nameElem.innerText = (data.nombre || "Titular").toUpperCase();
                if (saldoElem) {
                    const saldoReal = data.saldo !== undefined ? data.saldo : 0;
                    saldoElem.innerText = `${saldoReal.toFixed(2)} €`;
                }

                // Botón de copiado rápido
                const btnCopiar = document.getElementById('btn-copiar-iban');
                if (btnCopiar) {
                    const btnClonado = btnCopiar.cloneNode(true);
                    btnCopiar.parentNode.replaceChild(btnClonado, btnCopiar);

                    btnClonado.addEventListener('click', () => {
                        navigator.clipboard.writeText(ibanPuro).then(() => {
                            Swal.fire({
                                icon: 'success',
                                title: '¡Copiado!',
                                text: 'IBAN guardado sin espacios.',
                                timer: 1500,
                                showConfirmButton: false
                            });
                        });
                    });
                }
            }
        } catch (error) {
            console.error("Error al cargar tarjeta:", error);
        }
    } else {
        window.location.href = 'index.html';
    }
});