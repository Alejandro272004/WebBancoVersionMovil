import { auth, db } from '../../../assets/js/config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- REFERENCIAS DE FORMULARIOS ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// --- LÓGICA DE INICIO DE SESIÓN ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = 'dashboard.html';
        } catch (error) {
            alert("Error al entrar: " + error.message);
        }
    });
}

// --- LÓGICA DE REGISTRO ---
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Intentando registrar usuario..."); // Para ver en F12

        const nombre = document.getElementById('reg-nombre').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Guardar perfil en Firestore
            await setDoc(doc(db, "usuarios", user.uid), {
                nombre: nombre,
                email: email,
                saldo: 0,
                fechaCreacion: new Date()
            });

            alert("¡Cuenta creada con éxito!");
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error("Error en registro:", error.code);
            alert("Error al registrar: " + error.message);
        }
    });
}