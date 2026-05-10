/**
 * Construye el prompt largo del chat (contexto + obras + instrucciones finales).
 */
function buildChatFullPrompt(
  userMessage,
  systemPrompt,
  conversationHistory,
  toolResults
) {
  let contextText = `${systemPrompt}\n\n`;
  const hist = conversationHistory || [];
  if (hist.length) {
    contextText += "Historial de conversación:\n";
    for (const msg of hist.slice(-14)) {
      const role = msg.role || "";
      const content = msg.content || "";
      const label = role === "user" ? "Usuario" : "Asistente";
      contextText += `- ${label}: ${content}\n`;
    }
    contextText += "\n";
  }

  const aw = toolResults.artworks || {};
  if (aw.data && aw.data.length > 0) {
    const artworks = aw.data;
    contextText += `Obras encontradas en la base de datos de Dream Lodge (${artworks.length} resultados):\n`;
    for (let i = 0; i < Math.min(artworks.length, 10); i += 1) {
      const artwork = artworks[i];
      let line = `${i + 1}. ${artwork.title} (${artwork.category})`;
      if (artwork.creator) line += ` - Por ${artwork.creator}`;
      if (artwork.year) line += ` (${artwork.year})`;
      const desc = artwork.description || "";
      if (desc) line += `\n   ${desc.slice(0, 200)}`;
      if (artwork.rating != null) line += `\n   Calificación: ${artwork.rating}/10`;
      contextText += `${line}\n`;
    }
    contextText +=
      "\nIMPORTANTE: Estas obras están en la base de datos de Dream Lodge. Preséntalas de manera atractiva y específica, mencionando detalles relevantes.\n\n";
  }

  const one = toolResults.artwork || {};
  if (one.data) {
    const artwork = one.data;
    contextText += "Información sobre la obra solicitada:\n";
    contextText += `Título: ${artwork.title}\n`;
    contextText += `Categoría: ${artwork.category}\n`;
    if (artwork.creator) contextText += `Creador: ${artwork.creator}\n`;
    if (artwork.year) contextText += `Año: ${artwork.year}\n`;
    if (artwork.description) contextText += `Descripción: ${artwork.description}\n`;
    if (artwork.rating != null) contextText += `Calificación: ${artwork.rating}/10\n`;
    contextText += "\n";
  }

  const oc = toolResults.oceanResults || {};
  if (oc.data) {
    contextText +=
      "El usuario ha completado su perfil de personalidad OCEAN. Puedes hacer recomendaciones personalizadas.\n\n";
  }

  const fav = toolResults.favorites || {};
  const fd = fav.data;
  if (fd) {
    const flist = Array.isArray(fd) ? fd : [fd];
    if (flist.length) {
      contextText += `Obras favoritas del usuario (${flist.length}):\n`;
      for (const x of flist.slice(0, 5)) {
        contextText += `- ${x.title || x.artworkId}\n`;
      }
      contextText += "\n";
    }
  }

  let fullPrompt = `${contextText}Mensaje del usuario: ${userMessage}\n\n`;

  if (aw.data && aw.data.length > 0) {
    fullPrompt += `INSTRUCCIONES IMPORTANTES:
- Has encontrado ${aw.data.length} obra(s) en la base de datos.
- Preséntalas de manera atractiva y específica, mencionando título, creador, año y categoría.
- Explica brevemente por qué cada obra podría interesarle al usuario.
`;
    if (oc.data) {
      fullPrompt +=
        "- Conecta las recomendaciones con su perfil de personalidad OCEAN si es relevante.\n";
    }
    fullPrompt +=
      "- Si hay muchas obras, menciona las 3-5 más relevantes y ofrece mostrar más si quiere.\n";
    fullPrompt +=
      "- Sé entusiasta y específico, evita listas genéricas.\n\n";
  } else if (oc.data) {
    fullPrompt += `INSTRUCCIONES IMPORTANTES:
- El usuario tiene un perfil de personalidad OCEAN disponible.
- Haz recomendaciones personalizadas basándote en sus rasgos de personalidad.
- Sé específico: menciona géneros, estilos o tipos de contenido que se alineen con su perfil.
- Explica brevemente por qué estas recomendaciones encajan con su personalidad.
- Si no tienes obras específicas en la base de datos, usa tu conocimiento general para sugerir contenido conocido.
- NUNCA digas "no tengo información" - siempre ofrece algo útil.

`;
  } else if (fd && Array.isArray(fd) && fd.length > 0) {
    fullPrompt += `INSTRUCCIONES IMPORTANTES:
- Conoces los gustos del usuario a través de sus ${fd.length} favorito(s).
- Haz recomendaciones similares o complementarias basándote en sus favoritos.
- Sé específico: menciona obras concretas, géneros o estilos relacionados.
- Si no tienes obras específicas en la base, usa tu conocimiento para sugerir contenido conocido que sea similar.

`;
  } else {
    fullPrompt += `INSTRUCCIONES IMPORTANTES:
- Responde siempre con algo útil y específico.
- NUNCA digas "no pude encontrar", "no pude satisfacer tu solicitud" o "no entendí" como mensaje principal.
- Interpreta la intención aunque haya typos o escritura informal.
- Si no tienes datos en la base de datos, usa tu conocimiento general para sugerir contenido conocido, géneros o estilos.
- Sé proactivo: ofrece opciones concretas o haz preguntas útiles para refinar la búsqueda.
- Mantén un tono amigable y entusiasta.

`;
  }

  const umTrim = String(userMessage || "").trim();
  const isVeryShortMsg = umTrim.length > 0 && umTrim.length <= 28;
  const isAffirmation =
    /^(s[ií]|ok|vale|sip|yeah|yes|perfecto|claro|eso|eso mismo|eso es|dap)\.?$/i.test(umTrim);

  fullPrompt +=
    "Responde de manera natural, conversacional y útil. Sé específico y evita respuestas genéricas o vagas.";
  fullPrompt +=
    "\nNo repitas párrafos enteros ya dichos en el historial como si fuera una respuesta nueva: avanza la conversación o pregunta qué cambiar.";
  fullPrompt +=
    "\nCompleta cada respuesta hasta el final (termina cada frase; no cortes a mitad de enunciado).";

  if (isVeryShortMsg || isAffirmation) {
    fullPrompt +=
      `\nNOTA IMPORTANTE PARA ESTE TURNO: el usuario escribió "${umTrim}" (mensaje muy breve): responde en proporción breve (2–4 frases máximo si no hay un pedido explícito largo); no rearranques desde cero con saludos ni explicaciones LGTBQ+ largas si el contexto ya lo cubrió.`;
    if (hist.length >= 2) {
      fullPrompt +=
        " Si antes ya recomendaste, ofrece un matiz nuevo (ej. subgénero / tono / plataforma / época) o una sola nueva sugerencia, no repetir el mismo pack.";
    }
  }

  return fullPrompt;
}

module.exports = { buildChatFullPrompt };
