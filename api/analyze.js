export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const { messages } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: { message: "La variable GROQ_API_KEY no está configurada en Vercel." } });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        max_tokens: 2048,
        temperature: 0.4,
        messages: messages,
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Analyze API Error:", error);
    return res.status(500).json({ error: { message: "Error interno conectando con Groq." } });
  }
}
