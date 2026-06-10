// cookies.js
import { auth, db } from './config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function mostrarAvisoCookies() {
    const { isConfirmed } = await Swal.fire({
        title: 'Política de Cookies',
        html: `
            <p style="text-align: left; font-size: 14px; margin-bottom: 15px;">
                Usamos cookies propias y de terceros para mejorar tu experiencia y seguridad. 
                Debes aceptar o rechazar nuestra política para continuar.
            </p>
            <a href="politica-cookies.html" style="color: #1a2a6c; font-weight: bold; text-decoration: underline;">
                Leer política de cookies completa
            </a>
        `,
        icon: 'info',
        showDenyButton: true,
        confirmButtonText: 'Aceptar todas',
        denyButtonText: 'Rechazar',
        confirmButtonColor: '#1a2a6c',
        denyButtonColor: '#d33',
        allowOutsideClick: false, // OBLIGATORIO: Bloquea la navegación
        allowEscapeKey: false
    });

    // Guardamos la decisión en el perfil del usuario en Firestore
    if (auth.currentUser) {
        await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
            cookiesAceptadas: isConfirmed,
            fechaConsentimiento: new Date().toISOString()
        });
    }
}