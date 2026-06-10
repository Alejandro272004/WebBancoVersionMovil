import { db } from './config.js';
import { doc, onSnapshot, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function suscribirADatosUsuario(uid, callbackSaldo, callbackMovimientos) {
    const userRef = doc(db, "usuarios", uid);

    // Escuchar datos del perfil
    onSnapshot(userRef, (doc) => {
        if (doc.exists()) callbackSaldo(doc.data());
    });

    // Escuchar movimientos
    const q = query(collection(db, "usuarios", uid, "movimientos"), orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        const movimientos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callbackMovimientos(movimientos);
    });
}