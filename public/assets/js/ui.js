// assets/js/ui.js

export function actualizarInterfazSaldo(data) {
    const elSaldo = document.getElementById('main-balance');
    const elNombre = document.getElementById('user-name');

    if (elSaldo) elSaldo.innerText = `${data.saldo.toFixed(2)}€`;
    if (elNombre) elNombre.innerText = `Hola, ${data.nombre}`;
}

export function actualizarListaMovimientos(movimientos) {
    console.log("Pintando movimientos...", movimientos);
    // Aquí va la lógica para llenar la tabla y el calendario
}

// Lógica de navegación (mostrar/ocultar secciones)
export function mostrarVista(vistaId) {
    // ... tu lógica anterior para ocultar/mostrar divs ...
}

// Hacemos que la navegación sea accesible desde el HTML
window.navegar = mostrarVista;