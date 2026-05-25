import { auth, db } from './config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const registerForm = document.getElementById('register-form');

// Función interna para generar un IBAN ficticio español válido (ES + 22 dígitos)
function generarIBANBancario() {
    const entidad = "2100"; // Código ficticio de entidad
    const sucursal = "0414"; // Código ficticio de sucursal
    const dc = "22"; // Dígitos de control
    const cuenta = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return `ES${dc}${entidad}${sucursal}${cuenta}`;
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('reg-nombre').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        // --- VALIDACIÓN DE SEGURIDAD DE CONTRASEÑA ---
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

        if (!strongPasswordRegex.test(password)) {
            Swal.fire({
                icon: 'warning',
                title: 'Contraseña poco segura',
                text: 'Debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.',
                confirmButtonColor: '#1a2a6c'
            });
            return;
        }

        try {
            // 1. Crear el usuario en Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Fabricar el número de cuenta IBAN único
            const nuevoIban = generarIBANBancario();

            // 3. Crear el documento del usuario en la colección principal 'usuarios' con 50€ fijos
            await setDoc(doc(db, "usuarios", user.uid), {
                nombre: nombre,
                email: email,
                iban: nuevoIban,
                saldo: 50.00,
                fechaCreacion: new Date()
            });

            // 4. Crear el movimiento físico de regalo en su subcolección 'movimientos' para el Dashboard
            const movRef = doc(collection(db, "usuarios", user.uid, "movimientos"));
            await setDoc(movRef, {
                cantidad: 50.00,
                concepto: "Regalo de Bienvenida BankFlow",
                fecha: new Date(),
                tipo: "ingreso"
            });

            // 5. Alerta final con tu mensaje personalizado
            Swal.fire({
                icon: 'success',
                title: '¡Cuenta creada!',
                text: 'Gracias por confiar en BankFlow, toma 50€ de regalo',
                confirmButtonColor: '#1a2a6c',
                confirmButtonText: 'Entrar al Panel'
            }).then(() => {
                // Redirección directa al dashboard
                window.location.href = 'dashboard.html';
            });

        } catch (error) {
            console.error("Error en el registro:", error);
            if (error.code === 'auth/email-already-in-use') {
                Swal.fire({
                    icon: 'error',
                    title: 'Email registrado',
                    text: 'Este correo ya está en uso. Prueba con otro o inicia sesión.',
                    confirmButtonColor: '#1a2a6c'
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Hubo un problema',
                    text: error.message,
                    confirmButtonColor: '#1a2a6c'
                });
            }
        }
    });
}