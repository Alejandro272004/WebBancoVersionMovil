import { auth } from './config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

console.log("✅ login.js cargado correctamente");

const loginForm = document.getElementById('login-form');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Sometiendo formulario...");

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Usuario logueado:", userCredential.user);

            Swal.fire({
                icon: 'success',
                title: '¡Hola de nuevo!',
                text: 'Accediendo a tu cuenta...',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                window.location.href = 'dashboard.html';
            });

        } catch (error) {
            console.error("Error detectado:", error.code, error.message);

            Swal.fire({
                icon: 'error',
                title: 'Error de acceso',
                text: 'Correo o contraseña incorrectos.',
                confirmButtonColor: '#1a2a6c'
            });
        }
    });
} else {
    console.error("❌ No se encontró el elemento #login-form en el HTML");
}
