import { auth, db } from './config.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }

    // Cargar datos del perfil
    const userSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (!userSnap.exists()) return;
    const data = userSnap.data();

    // Rellenar info de cuenta
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('info-nombre', data.nombre || '—');
    setEl('info-email',  user.email  || '—');
    setEl('info-iban',   data.iban ? data.iban.replace(/(.{4})/g, '$1 ').trim() : '—');
    setEl('info-fecha',  data.fechaCreacion
        ? (data.fechaCreacion.toDate ? data.fechaCreacion.toDate().toLocaleDateString('es-ES') : new Date(data.fechaCreacion).toLocaleDateString('es-ES'))
        : '—');

    // Prellenar campo nombre
    const settingName = document.getElementById('setting-name');
    if (settingName) settingName.value = data.nombre || '';

    // ── Copiar IBAN ────────────────────────────────────────────────────────────
    const btnCopiar = document.getElementById('btn-copiar-iban-ajustes');
    if (btnCopiar && data.iban) {
        btnCopiar.addEventListener('click', () => {
            navigator.clipboard.writeText(data.iban).then(() => {
                Swal.fire({ icon: 'success', title: 'IBAN copiado', timer: 1200, showConfirmButton: false });
            });
        });
    }

    // ── Guardar nombre ─────────────────────────────────────────────────────────
    const btnNombre = document.getElementById('btn-guardar-nombre');
    if (btnNombre) {
        btnNombre.addEventListener('click', async () => {
            const nuevoNombre = (settingName?.value || '').trim();
            if (!nuevoNombre) {
                Swal.fire({ icon: 'warning', title: 'Campo vacío', text: 'Introduce un nombre válido.', confirmButtonColor: '#1a2a6c' });
                return;
            }
            try {
                await updateDoc(doc(db, "usuarios", user.uid), { nombre: nuevoNombre });
                setEl('info-nombre', nuevoNombre);
                Swal.fire({ icon: 'success', title: 'Nombre actualizado', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el nombre.', confirmButtonColor: '#1a2a6c' });
            }
        });
    }

    // ── Cambiar contraseña ─────────────────────────────────────────────────────
    const btnPassword = document.getElementById('btn-guardar-password');
    if (btnPassword) {
        btnPassword.addEventListener('click', async () => {
            const newPass    = document.getElementById('setting-password')?.value || '';
            const confirmPass = document.getElementById('setting-password-confirm')?.value || '';

            if (!newPass) {
                Swal.fire({ icon: 'warning', title: 'Campo vacío', text: 'Introduce una nueva contraseña.', confirmButtonColor: '#1a2a6c' });
                return;
            }
            if (newPass !== confirmPass) {
                Swal.fire({ icon: 'error', title: 'No coinciden', text: 'Las contraseñas no son iguales.', confirmButtonColor: '#1a2a6c' });
                return;
            }
            if (!strongPasswordRegex.test(newPass)) {
                Swal.fire({ icon: 'warning', title: 'Contraseña débil', text: 'Debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo (@$!%*?&).', confirmButtonColor: '#1a2a6c' });
                return;
            }

            // Reautenticar antes de cambiar la contraseña (requisito de Firebase)
            const { value: currentPass } = await Swal.fire({
                title: 'Confirma tu identidad',
                text: 'Introduce tu contraseña actual para continuar.',
                input: 'password',
                inputPlaceholder: 'Contraseña actual',
                showCancelButton: true,
                confirmButtonColor: '#1a2a6c',
                cancelButtonText: 'Cancelar'
            });
            if (!currentPass) return;

            try {
                const credential = EmailAuthProvider.credential(user.email, currentPass);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPass);

                document.getElementById('setting-password').value = '';
                document.getElementById('setting-password-confirm').value = '';
                Swal.fire({ icon: 'success', title: 'Contraseña actualizada', timer: 1800, showConfirmButton: false });
            } catch (e) {
                const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
                    ? 'La contraseña actual es incorrecta.'
                    : 'No se pudo actualizar la contraseña.';
                Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonColor: '#1a2a6c' });
            }
        });
    }

    // ── Cerrar sesión en todos los dispositivos ────────────────────────────────
    const btnCerrarAll = document.getElementById('btn-cerrar-sesion-all');
    if (btnCerrarAll) {
        btnCerrarAll.addEventListener('click', async () => {
            const result = await Swal.fire({
                icon: 'warning',
                title: '¿Cerrar todas las sesiones?',
                text: 'Se cerrará tu sesión en este y en todos los demás dispositivos.',
                showCancelButton: true,
                confirmButtonColor: '#b21f1f',
                cancelButtonText: 'Cancelar',
                confirmButtonText: 'Sí, cerrar todo'
            });
            if (!result.isConfirmed) return;

            await signOut(auth);
            window.location.replace('index.html');
        });
    }
});
