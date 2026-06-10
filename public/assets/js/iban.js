// Función rápida para asignar IBAN a un usuario existente
async function asignarIban() {
    const userRef = doc(db, "usuarios", auth.currentUser.uid);
    const nuevoIban = "ES" + Math.floor(Math.random() * 10000000000000000000000);
    await updateDoc(userRef, { iban: nuevoIban });
    alert("Tu nuevo IBAN es: " + nuevoIban);
}