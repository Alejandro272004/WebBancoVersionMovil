import { auth, db } from './config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const registerForm = document.getElementById('register-form');

function generarIBANBancario() {
    const entidad = "2100";
    const sucursal = "0414";
    const dc = "22";
    const cuenta = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return `ES${dc}${entidad}${sucursal}${cuenta}`;
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("📝 Formulario enviado");

        // 1. Captcha
        const captchaVerified = document.getElementById('captcha-verified').value;
        if (captchaVerified !== 'true') {
            Swal.fire({
                icon: 'warning',
                title: 'Verificación requerida',
                text: 'Debes marcar la casilla "No soy un robot" para continuar.',
                confirmButtonColor: '#1a2a6c'
            });
            return;
        }

        const nombre = document.getElementById('reg-nombre').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;

        console.log("📧 Email:", email, "| Nombre:", nombre);

        // 2. Validación contraseña
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!strongPasswordRegex.test(password)) {
            Swal.fire({
                icon: 'warning',
                title: 'Contraseña poco segura',
                text: 'Debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo (@$!%*?&).',
                confirmButtonColor: '#1a2a6c'
            });
            return;
        }

        try {
            console.log("🔥 Creando usuario en Firebase...");

            // 3. Crear usuario en Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("✅ Usuario creado:", user.uid);

            const nuevoIban = generarIBANBancario();

            // 4. Guardar perfil en Firestore
            await setDoc(doc(db, "usuarios", user.uid), {
                nombre: nombre,
                email: email,
                iban: nuevoIban,
                saldo: 50.00,
                fechaCreacion: new Date()
            });
            console.log("✅ Perfil guardado en Firestore");

            // 5. Movimiento de bienvenida
            const movRef = doc(collection(db, "usuarios", user.uid, "movimientos"));
            await setDoc(movRef, {
                cantidad: 50.00,
                concepto: "Regalo de Bienvenida BankFlow",
                fecha: new Date(),
                tipo: "ingreso"
            });
            console.log("✅ Movimiento de bienvenida creado");

            // 6. Redirigir directamente sin Swal para evitar bloqueos
            console.log("🚀 Redirigiendo a dashboard...");
            window.location.replace('dashboard.html');

        } catch (error) {
            console.error("❌ Error en registro:", error.code, error.message);

            // Resetear captcha
            const captchaCheck = document.getElementById('captcha-check');
            const captchaInput = document.getElementById('captcha-verified');
            if (captchaCheck) { captchaCheck.style.background = 'white'; captchaCheck.style.borderColor = '#aaa'; captchaCheck.innerHTML = ''; }
            if (captchaInput) captchaInput.value = 'false';

            let mensajeError = 'Hubo un problema al crear la cuenta.';
            if (error.code === 'auth/email-already-in-use') mensajeError = 'Este correo ya está en uso. Prueba con otro o inicia sesión.';
            if (error.code === 'auth/weak-password') mensajeError = 'La contraseña es demasiado débil.';
            if (error.code === 'auth/invalid-email') mensajeError = 'El formato del correo no es válido.';

            Swal.fire({ icon: 'error', title: 'Error', text: mensajeError, confirmButtonColor: '#1a2a6c' });
        }
    });
} else {
    console.error("❌ No se encontró #register-form");
}
