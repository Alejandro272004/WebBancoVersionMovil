import { auth, db } from './config.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    onAuthStateChanged, updateProfile, updatePassword,
    reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const settingName = document.getElementById('setting-name');
const settingAlias = document.getElementById('setting-alias');
const settingPhone = document.getElementById('setting-phone');
const settingCurrency = document.getElementById('setting-currency');
const settingCurrentPass = document.getElementById('setting-current-pass');
const settingNewPass = document.getElementById('setting-new-pass');

const btnSaveProfile = document.getElementById('btn-save-profile');
const btnSaveSecurity = document.getElementById('btn-save-security');

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (snap.exists()) {
        const data = snap.data();
        settingName.value = data.nombre || "";
        settingAlias.value = data.alias || "";
        settingPhone.value = data.telefono || "";
        settingCurrency.value = data.divisa || "EUR";
    }
});

btnSaveProfile?.addEventListener('click', async () => {
    const user = auth.currentUser;
    await updateDoc(doc(db, "usuarios", user.uid), {
        nombre: settingName.value,
        alias: settingAlias.value,
        telefono: settingPhone.value,
        divisa: settingCurrency.value
    });
    await updateProfile(user, { displayName: settingName.value });
    Swal.fire('Éxito', 'Perfil actualizado', 'success');
});

btnSaveSecurity?.addEventListener('click', async () => {
    const user = auth.currentUser;
    const pass = settingNewPass.value;
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

    if (!regex.test(pass)) {
        return Swal.fire('Error', 'La contraseña no cumple los requisitos de seguridad.', 'error');
    }

    try {
        Swal.showLoading();
        const cred = EmailAuthProvider.credential(user.email, settingCurrentPass.value);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, pass);
        Swal.fire('Correcto', 'Contraseña actualizada', 'success');
        settingCurrentPass.value = "";
        settingNewPass.value = "";
    } catch (e) {
        Swal.fire('Error', e.code === 'auth/wrong-password' ? 'Contraseña actual incorrecta' : 'Error al actualizar', 'error');
    }
});