import { auth, db } from './assets/js/config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();

            // Inyectamos los datos reales de Firestore en los IDs
            const ibanElem = document.getElementById('user-iban');
            const nameElem = document.getElementById('user-name');
            const saldoElem = document.getElementById('user-saldo');

            if (ibanElem) ibanElem.innerText = data.iban || "SIN IBAN ASIGNADO";
            if (nameElem) nameElem.innerText = data.nombre ? data.nombre.toUpperCase() : "USUARIO";
            if (saldoElem) saldoElem.innerText = `${data.saldo.toFixed(2)} €`;
        }
    }
});