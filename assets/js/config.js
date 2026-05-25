import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB_n4gczraFF1vCGlKErDAXgP8BE0364zM",
    authDomain: "proyectofinaldegradoweb.firebaseapp.com",
    projectId: "proyectofinaldegradoweb",
    storageBucket: "proyectofinaldegradoweb.firebasestorage.app",
    messagingSenderId: "228747041427",
    appId: "1:228747041427:web:4c55257d154844227a4b66",
    measurementId: "G-BP9RL5G3JH"
};

// Inicializamos Firebase
const app = initializeApp(firebaseConfig);

// Exportamos las herramientas para usarlas en otros archivos
export const auth = getAuth(app);
export const db = getFirestore(app);