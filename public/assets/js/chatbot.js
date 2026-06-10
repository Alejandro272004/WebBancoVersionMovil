// chatbot.js
const GROQ_API_KEY = 'TU_API_KEY_AQUI'; // Pon tu API Key de Groq aquí

export async function enviarMensaje(pregunta, saldoActual) {
    const respuesta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `Eres el asistente oficial de BankFlow, una aplicación bancaria. El saldo actual del usuario es ${saldoActual}€.
Tu única función es responder preguntas relacionadas con BankFlow y servicios bancarios: transferencias, huchas de ahorro, saldo, movimientos, tarjetas, calendario de pagos, ajustes de cuenta y conceptos financieros básicos.
Si el usuario pregunta cualquier cosa que no esté relacionada con banca o finanzas (política, entretenimiento, programación, recetas, deportes, etc.), responde EXACTAMENTE con: "Solo puedo ayudarte con temas relacionados con BankFlow y servicios bancarios. ¿Tienes alguna duda sobre tu cuenta, transferencias o ahorros?"
No hagas excepciones. Responde siempre en español, de forma breve y profesional.`
                },
                { role: "user", content: pregunta }
            ]
        })
    });

    const data = await respuesta.json();
    return data.choices[0].message.content;
}