const { PROMPT_TMDB_SPAIN_CINE_TITLE_RULE, pickVideoGameExplorationAxes } = require("./agentUtils");

function scoreBand(v) {
  const n = Number(v) || 0;
  if (n >= 3.8) return "alta";
  if (n <= 2.2) return "baja";
  return "media";
}

function scoreDetailBand(v) {
  const n = Number(v) || 0;
  if (n < 1.8) return "muy-baja";
  if (n <= 2.2) return "baja";
  if (n < 3.0) return "media-baja";
  if (n < 3.8) return "media-alta";
  if (n < 4.4) return "alta";
  return "muy-alta";
}

function facetValue(scores, traitKey, facetKey) {
  const trait = scores?.[traitKey];
  if (!trait || typeof trait !== "object") return null;
  const raw = trait[facetKey];
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatFacetLine(scores, traitKey, facetKey, label) {
  const v = facetValue(scores, traitKey, facetKey);
  if (v == null) return null;
  return `${label}: ${v.toFixed(2)} (${scoreBand(v)})`;
}

const FACET_DETAIL_LABELS = {
  "muy-baja": "muy-baja",
  baja: "baja",
  "media-baja": "media-baja",
  "media-alta": "media-alta",
  alta: "alta",
  "muy-alta": "muy-alta",
};

const FACET_PROMPT_RULES = {
  apertura: {
    "muy-baja": "lenguaje claro, estructura lineal, simbolismo mínimo y entrada inmediata.",
    baja: "base familiar con narrativa clara y baja ambiguedad.",
    "media-baja": "base familiar con una capa de rareza controlada.",
    "media-alta": "exploración formal moderada con ambiguedad legible.",
    alta: "propuesta experimental, simbólica y no lineal.",
    "muy-alta": "riesgo formal extremo, ruptura de convenciones y alta abstracción.",
  },
  responsabilidad: {
    "muy-baja": "caos intencional, improvisación y ruptura fuerte de reglas.",
    baja: "energía cruda y progresión flexible con poco apego a método.",
    "media-baja": "alterna orden y desorden con foco en sorpresa.",
    "media-alta": "estructura clara con libertad parcial y reto medio.",
    alta: "precisión formal, patrones, lógica y consistencia sistémica.",
    "muy-alta": "optimización, mastery, alta exigencia de método y control.",
  },
  extraversion: {
    "muy-baja": "intimista, contemplativo y de baja estimulación social.",
    baja: "escala pequeña, ritmo lento y foco interno.",
    "media-baja": "social selectivo con energía contenida.",
    "media-alta": "mezcla introspección con picos sociales moderados.",
    alta: "energía social alta, ritmo dinámico y alta interacción.",
    "muy-alta": "máxima expresividad social y alto impulso performativo.",
  },
  amabilidad: {
    "muy-baja": "fricción moral intensa, ironía dura y personajes ásperos.",
    baja: "conflicto interpersonal y decisiones moralmente grises.",
    "media-baja": "empatía selectiva con tensión narrativa.",
    "media-alta": "calidez parcial con conflicto moderado.",
    alta: "cooperación, ternura, cuidado y esperanza.",
    "muy-alta": "prosocialidad extrema, reconciliación y soporte emocional.",
  },
  neuroticismo: {
    "muy-baja": "serenidad alta, regulación emocional firme y atmósfera estable.",
    baja: "calma, foco y baja reactividad emocional.",
    "media-baja": "sensibilidad moderada con control afectivo.",
    "media-alta": "vulnerabilidad mayor y tensión psicológica recurrente.",
    alta: "catarsis emocional marcada e intensidad afectiva.",
    "muy-alta": "alta carga emocional, ansiedad dramática y picos afectivos.",
  },
};

// Calibración de matiz por faceta + banda. No son repertorio final.
const FACET_VIDEOGAME_EXAMPLES = {
  apertura: {
    "muy-baja":
      "Tetris — reglas mínimas; Super Mario Bros — plataforma lineal clásica; Candy Crush Saga — bucle inmediato.",
    baja:
      "Portal — acertijos guiados con narración clara; Uncharted 2 — blockbuster cinematográfico legible; Minecraft (supervivencia guiada) — metas concretas.",
    "media-baja":
      "The Legend of Zelda: Breath of the Wild — open world familiar con curiosidad; Hollow Knight — metroidvania con mapa progresivo; Portal 2 — spin conocido con más capas.",
    "media-alta":
      "Outer Wilds — bucle y exploración no convencional; Death Stranding — logística y metáfora arriesgada; Subnautica — descubrimiento y tensión controlada.",
    alta:
      "Return of the Obra Dinn — investigación no lineal; Her Story — narrativa fragmentada; Hypnospace Outlaw — interfaz como tema.",
    "muy-alta":
      "Immortality — interfaz fílmica experimental; Eliza — diálogo sobre IA con estructura rara; The Stanley Parable — metanarrativa extrema.",
  },
  responsabilidad: {
    "muy-baja":
      "Goat Simulator — física caótica; Untitled Goose Game — reglas como sugerencia; Saints Row IV — sandbox irreverente.",
    baja:
      "Just Cause 3 — explosiones y libertad loca; No Man's Sky (modo creativo/zen) — metas abiertas; Skate 3 — flow improvisado.",
    "media-baja":
      "Slay the Spire — runs variables con reglas claras; Hades — progresión flexible entre intentos; Rogue Legacy — bucles con sorpresa.",
    "media-alta":
      "Dark Souls — patrones duros pero aprendibles; Monster Hunter: World — caza con rutinas claras; Celeste — plataformas exigentes por salas.",
    alta:
      "Factorio — líneas y optimización; Into the Breach — táctica cerrada y precisa; Opus Magnum — puzzle de ensamblaje sistémico.",
    "muy-alta":
      "Kerbal Space Program — simulación orbital; Chess Ultra — precisión pura; Baba Is You — reglas como objeto de diseño.",
  },
  extraversion: {
    "muy-baja":
      "Firewatch — solo y contemplativo; Gone Home — escala doméstica; Everybody's Gone to the Rapture — mapa vacío y contemplativo.",
    baja:
      "Journey — encuentros escasos y meditativos; Shadow of the Colossus — aislamiento épico; ABZÛ — flotación solitaria.",
    "media-baja":
      "It Takes Two — co-op elegido; Deep Rock Galactic — squad cuando quieres; Divinity: Original Sin 2 — party opcional.",
    "media-alta":
      "Sea of Thieves — crew flexible; Monster Hunter Rise — caza solo o en grupo; Destiny 2 — mix misiones solo/grupo.",
    alta:
      "Rocket League — equipos y ritmo; Mario Kart 8 Deluxe — multijugador social; Overwatch 2 — roles y comunicación.",
    "muy-alta":
      "Fall Guys — masivo y performativo; Jackbox Party Pack — improvisación grupal; Among Us — deducción social alta.",
  },
  amabilidad: {
    "muy-baja":
      "Spec Ops: The Line — choque moral duro; This War of Mine — supervivencia despiadada; Hotline Miami — violencia cruda.",
    baja:
      "The Witcher 3 — decisiones grises; Papers, Please — dilemas burocráticos; Disco Elysium — ética cínica con carisma.",
    "media-baja":
      "Detroit: Become Human — ramas morales tensas; The Last of Us Part II — empatía y conflicto; Frostpunk — líder ante dilemas.",
    "media-alta":
      "Life is Strange — vínculos con conflicto; Spiritfarer — duelo con calidez; Coffee Talk — tensión conversacional suave.",
    alta:
      "Animal Crossing: New Horizons — cuidado e isla; Stardew Valley — cooperación rural; A Short Hike — ternura sin moralina.",
    "muy-alta":
      "Kind Words (lo fi chill beats to write to) — apoyo anónimo; Sky: Children of the Light — gestos prosociales; Chicory: A Colorful Tale — cuidado como mecánica.",
  },
  neuroticismo: {
    "muy-baja":
      "Alto's Adventure — ritmo calmado; Unpacking — orden sereno; PowerWash Simulator — regulación casi meditativa.",
    baja:
      "Euro Truck Simulator 2 — viaje estable; Stardew Valley — rutina reconfortante; A Short Hike — descanso afectivo.",
    "media-baja":
      "Night in the Woods — melancolía juvenil contenida; Oxenfree — tensión sobrenatural moderada; Coffee Talk — conflicto bajo lluvia.",
    "media-alta":
      "Silent Hill 2 — angustia psicológica sostenida; Inside — incomodidad controlada; Limbo — tensión visual.",
    alta:
      "Hellblade: Senua's Sacrifice — vulnerabilidad sensorial; Fran Bow — inquietud onírica; NieR: Automata — duelo y vértigo narrativo.",
    "muy-alta":
      "OMORI — picos afectivos intensos; Darkwood — ansiedad survival; Cry of Fear — carga emocional extrema.",
  },
};

const FACET_MUSIC_EXAMPLES = {
  apertura: {
    "muy-baja":
      "The Beatles — Let It Be (tradición melódica clara); ABBA — Dancing Queen (estructura pop legible); Adele — Easy On Me (balada clásica).",
    baja:
      "Coldplay — Viva la Vida (accesible con color tímbrico); Phoebe Bridgers — Motion Sickness (indie directo); The Killers — Mr. Brightside (himno de forma familiar).",
    "media-baja":
      "Tame Impala — The Less I Know The Better (psicodelia pop accesible); Mitski — Nobody (alternativo emotivo legible); Arcade Fire — Wake Up (épica indie con ancla melódica).",
    "media-alta":
      "FKA twigs — cellophane (textura y riesgo controlado); Bjork — Hyperballad (experimental emotivo entendible); James Blake — Retrograde (minimalismo híbrido).",
    alta:
      "Arca — Piel (diseño sonoro arriesgado); SOPHIE — Immaterial (deconstrucción pop); Autechre — Rae (abstracción electrónica).",
    "muy-alta":
      "Scott Walker — The Escape (ruptura formal extrema); Tim Hecker — Virginal II (ambient abstracto radical); Merzbow — Pulse Demon (límite de ruido estructurado).",
  },
  responsabilidad: {
    "muy-baja":
      "The Stooges — I Wanna Be Your Dog (crudeza directa); Nirvana — Territorial Pissings (impulso bruto); Death Grips — Punk Weight (caos intencional).",
    baja:
      "The White Stripes — Seven Nation Army (energía sencilla); IDLES — Never Fight a Man with a Perm (ataque frontal); The Libertines — Time for Heroes (desorden controlado).",
    "media-baja":
      "Arctic Monkeys — Do I Wanna Know? (groove firme con flexibilidad); Gorillaz — Feel Good Inc. (producción híbrida sin rigidez); Rosalía — BAGDAD (pop mutante legible).",
    "media-alta":
      "Kendrick Lamar — DNA. (arquitectura compleja con impulso); Radiohead — 15 Step (detalle y libertad); St. Vincent — Digital Witness (estructura sofisticada).",
    alta:
      "Steely Dan — Aja (meticulosidad de arreglo); Snarky Puppy — Lingus (precisión de ensemble); Tool — Schism (diseño rítmico exigente).",
    "muy-alta":
      "Johann Sebastian Bach — The Art of Fugue (lógica compositiva extrema); Meshuggah — Bleed (métrica milimétrica); Igor Stravinsky — The Rite of Spring (arquitectura avanzada).",
  },
  extraversion: {
    "muy-baja":
      "Nick Drake — Pink Moon (intimidad máxima); Sufjan Stevens — Fourth of July (confesional); Agnes Obel — Riverside (recogimiento contemplativo).",
    baja:
      "Bon Iver — Holocene (escala contenida); Daughter — Youth (energía baja sensible); Cigarettes After Sex — Apocalypse (atmósfera reservada).",
    "media-baja":
      "The National — Bloodbuzz Ohio (tensión social moderada); Lorde — Liability (interior con alcance pop); Beach House — Space Song (sueño compartible sin estridencia).",
    "media-alta":
      "Florence + The Machine — Dog Days Are Over (catarsis con introspección); LCD Soundsystem — All My Friends (social e íntimo); Billie Eilish — bad guy (performativo con control).",
    alta:
      "Dua Lipa — Levitating (energía de pista); Daft Punk — One More Time (celebración colectiva); The Weeknd — Blinding Lights (pulso social alto).",
    "muy-alta":
      "Beyonce — BREAK MY SOUL (máxima performance social); Charli xcx — Vroom Vroom (impulso hiperexpresivo); BTS — Dynamite (himno de interacción masiva).",
  },
  amabilidad: {
    "muy-baja":
      "Nine Inch Nails — Closer (fricción agresiva); Eminem — The Way I Am (confrontación directa); Swans — Screen Shot (intensidad áspera).",
    baja:
      "Pulp — Common People (ironía social afilada); Kanye West — Black Skinhead (tensión frontal); PJ Harvey — Rid of Me (aspereza emocional).",
    "media-baja":
      "Lana Del Rey — A&W (ambivalencia afectiva); The Smiths — Heaven Knows I'm Miserable Now (cinismo melódico); Interpol — Obstacle 1 (distancia emocional).",
    "media-alta":
      "Frank Ocean — Ivy (empatía con herida); Lord Huron — The Night We Met (calidez triste); Silvana Estrada — Te Guardo (ternura con tensión).",
    alta:
      "Bill Withers — Lean On Me (cuidado directo); Hozier — Cherry Wine (humanidad íntima); Natalia Lafourcade — Hasta la Raíz (afecto reparador).",
    "muy-alta":
      "The Beatles — All You Need Is Love (unión explícita); Coldplay — Fix You (consuelo prosocial); Louis Armstrong — What a Wonderful World (reconciliación afectiva).",
  },
  neuroticismo: {
    "muy-baja":
      "Brian Eno — An Ending (Ascent) (regulación serena); Khruangbin — Friday Morning (calma estable); Tycho — Awake (equilibrio emocional).",
    baja:
      "Norah Jones — Don't Know Why (suavidad reguladora); Jack Johnson — Better Together (reposo afectivo); Men I Trust — Show Me How (melancolía ligera).",
    "media-baja":
      "The xx — Intro (tensión suave); Phoebe Bridgers — Kyoto (fragilidad controlada); Vetusta Morla — Copenhague (carga emocional media).",
    "media-alta":
      "Radiohead — How to Disappear Completely (ansiedad elegíaca); Bjork — Jóga (intensidad vulnerable); Portishead — Roads (drama contenido).",
    alta:
      "Jeff Buckley — Grace (catarsis poderosa); Fiona Apple — Paper Bag (vulnerabilidad explícita); Lingua Ignota — PENNSYLVANIA FURNACE (descarga emocional).",
    "muy-alta":
      "Mount Eerie — Real Death (duelo extremo); Xiu Xiu — I Luv the Valley OH! (quiebre afectivo); Diamanda Galás — Let My People Go (intensidad límite).",
  },
};

const FACET_CINEMA_EXAMPLES = {
  apertura: {
    "muy-baja":
      "The King's Speech — biopic clásico; Hidden Figures — estructura inspiracional clara; Green Book — drama de fórmula legible.",
    baja:
      "The Social Network — narrativa accesible con estilo; Spotlight — periodismo lineal sólido; Argo — thriller clásico eficaz.",
    "media-baja":
      "Whiplash — intensidad formal accesible; Ex Machina — sci-fi de ideas con ancla narrativa; Prisoners — tensión controlada.",
    "media-alta":
      "Arrival — sci-fi emocional no lineal moderada; Her — intimidad conceptual; Enemy — ambigüedad legible.",
    alta:
      "Synecdoche, New York — estructura fractal; Mulholland Drive — ambigüedad autoral; Holy Motors — metamorfosis formal.",
    "muy-alta":
      "Last Year at Marienbad — ruptura temporal extrema; Dog Star Man — vanguardia abstracta; Inland Empire — deriva narrativa radical.",
  },
  responsabilidad: {
    "muy-baja":
      "Mad Max (1979) — energía cruda; Clerks — improvisación expresiva; Enter the Void — deriva sensorial.",
    baja:
      "Spring Breakers — caos pop; Uncut Gems — ansiedad desbordada; Trainspotting — pulso desordenado con identidad.",
    "media-baja":
      "Birdman — virtuosismo flexible; Good Time — urgencia con control parcial; Drive — orden estético con impulso.",
    "media-alta":
      "Zodiac — método y tensión; Michael Clayton — estructura precisa con respiración; Children of Men — planificación inmersiva.",
    alta:
      "The Godfather — arquitectura narrativa rigurosa; Parasite — precisión de guion/montaje; The Prestige — diseño mecánico.",
    "muy-alta":
      "2001: A Space Odyssey — control formal total; A Separation — precisión dramática extrema; Army of Shadows — ejecución metódica.",
  },
  extraversion: {
    "muy-baja":
      "Columbus — contemplación íntima; Paterson — baja estimulación social; Winter Light — interioridad extrema.",
    baja:
      "Aftersun — memoria íntima; Manchester by the Sea — escala emocional contenida; First Reformed — aislamiento moral.",
    "media-baja":
      "Lost in Translation — social mínimo; Carol — intimidad relacional; In the Mood for Love — vínculo contenido.",
    "media-alta":
      "La La Land — intimidad y espectáculo; Frances Ha — pulso social moderado; The Worst Person in the World — alternancia social-interna.",
    alta:
      "The Grand Budapest Hotel — dinamismo coral; Knives Out — interacción constante; Little Miss Sunshine — energía grupal.",
    "muy-alta":
      "Everything Everywhere All at Once — maximalismo expresivo; Babylon — hiperestímulo social; Climax — intensidad colectiva total.",
  },
  amabilidad: {
    "muy-baja":
      "Nightcrawler — cinismo extremo; Funny Games — fricción moral dura; There Will Be Blood — dureza relacional.",
    baja:
      "Gone Girl — conflicto áspero; No Country for Old Men — frialdad ética; The Lobster — ironía cruel.",
    "media-baja":
      "Blue Valentine — empatía rota; Marriage Story — fricción humana intensa; Incendies — afecto bajo tensión.",
    "media-alta":
      "Minari — cuidado con conflicto; Roma — ternura sobria; The Florida Project — humanidad en entorno hostil.",
    alta:
      "Little Women — cooperación afectiva; Captain Fantastic — vínculo familiar; Paddington 2 — calidez explícita.",
    "muy-alta":
      "It's a Wonderful Life — humanismo pleno; Cinema Paradiso — ternura comunitaria; Shoplifters — cuidado como resistencia.",
  },
  neuroticismo: {
    "muy-baja":
      "My Neighbor Totoro — regulación afectiva; Perfect Days — serenidad cotidiana; Koyaanisqatsi (tramos contemplativos) — trance visual.",
    baja:
      "Before Sunrise — tono cálido estable; Once — intimidad regulada; The Straight Story — calma narrativa.",
    "media-baja":
      "Lady Bird — vulnerabilidad amable; Her — melancolía suave; Call Me by Your Name — tensión afectiva medida.",
    "media-alta":
      "Black Swan — presión psicológica; The Babadook — angustia con control; Melancholia — carga emocional sostenida.",
    alta:
      "Requiem for a Dream — catarsis oscura; Shame — tensión interna intensa; Persona — fractura emocional.",
    "muy-alta":
      "Irreversible — intensidad límite; Possession (1981) — desborde afectivo; Come and See — trauma extremo.",
  },
};

const FACET_LITERATURE_EXAMPLES = {
  apertura: {
    "muy-baja":
      "El viejo y el mar — prosa clara; La isla del tesoro — aventura lineal; El alquimista — simbolismo simple.",
    baja:
      "Orgullo y prejuicio — estructura clásica; Matar a un ruiseñor — narrativa accesible; El guardián entre el centeno — voz directa.",
    "media-baja":
      "Rebeca — atmósfera con forma clásica; Nunca me abandones — sci-fi sobria; Ensayo sobre la ceguera — alegoría legible.",
    "media-alta":
      "La carretera — minimalismo denso; Pedro Páramo — capas narrativas; Pálido fuego — juego formal moderado.",
    alta:
      "Rayuela — estructura abierta; La casa de hojas — experimento tipográfico; Si una noche de invierno un viajero — metaliteratura.",
    "muy-alta":
      "Finnegans Wake — ruptura total del lenguaje; Tristram Shandy — forma radical; El innombrable — disolución narrativa extrema.",
  },
  responsabilidad: {
    "muy-baja":
      "En la carretera — impulso errante; Factótum — crudeza desordenada; Trópico de Cáncer — flujo caótico.",
    baja:
      "Miedo y asco en Las Vegas — deriva frenética; Pregúntale al polvo — vitalidad impulsiva; Post Office — estructura suelta.",
    "media-baja":
      "Alta fidelidad — orden flexible; Los detectives salvajes — expansión con eje; Kafka en la orilla — lógica parcialmente abierta.",
    "media-alta":
      "Crimen y castigo — arquitectura sólida; Expiación — control formal con libertad; El nombre de la rosa — sistema narrativo robusto.",
    alta:
      "Madame Bovary — precisión estructural; Middlemarch — diseño social metódico; Los miserables — ingeniería de trama amplia.",
    "muy-alta":
      "En busca del tiempo perdido — arquitectura monumental; Ulises — sistema formal extremo; La montaña mágica — precisión conceptual alta.",
  },
  extraversion: {
    "muy-baja":
      "Diario del subsuelo — interioridad cruda; El extranjero — distanciamiento íntimo; La campana de cristal — voz introspectiva.",
    baja:
      "Stoner — vida interior contenida; Siddhartha — búsqueda interna; El túnel — perspectiva cerrada.",
    "media-baja":
      "Norwegian Wood — socialidad moderada; La elegancia del erizo — intimidad compartida; Nunca me abandones — vínculo contenido.",
    "media-alta":
      "La amiga estupenda — intimidad y tejido social; Middlesex — voz personal con alcance coral; Tokio blues — alternancia interna-social.",
    alta:
      "Cien años de soledad — alta interacción comunitaria; Los Buddenbrook — red familiar amplia; Los hermanos Karamázov — debate social intenso.",
    "muy-alta":
      "Guerra y paz — escala coral máxima; Los demonios — choque ideológico colectivo; Manhattan Transfer — pulso urbano multitudinario.",
  },
  amabilidad: {
    "muy-baja":
      "American Psycho — crueldad extrema; Meridiano de sangre — violencia áspera; Las benévolas — fricción moral radical.",
    baja:
      "Lolita — ambigüedad ética dura; Correcciónes — fricción familiar; El talentoso Sr. Ripley — empatía baja.",
    "media-baja":
      "Nunca me abandones — ternura con dureza; Desgracia — ambivalencia moral; La broma — ironía afectiva.",
    "media-alta":
      "La ridícula idea de no volver a verte — cuidado y duelo; Olive Kitteridge — humanidad con aspereza; Hamnet — afecto bajo tensión.",
    alta:
      "Mujercitas — cooperación afectiva; Anne of Green Gables — calidez sostenida; El viento en los sauces — vínculo amable.",
    "muy-alta":
      "Un hombre llamado Ove — reparación emocional; El club de los milagros de la piel — compasión explícita; El principito — humanismo esencial.",
  },
  neuroticismo: {
    "muy-baja":
      "Walden — serenidad reflexiva; Siddhartha — calma espiritual; El libro del desasosiego (pasajes contemplativos) — tono regulado.",
    baja:
      "El barón rampante — ligereza estable; El curioso incidente del perro a medianoche — control emocional narrativo; El lector — melancolía suave.",
    "media-baja":
      "Tokio blues — vulnerabilidad moderada; La tregua — afecto contenido; Nada — tensión íntima dosificada.",
    "media-alta":
      "Las olas — inestabilidad sensible; Mrs Dalloway — ansiedad interior; La campana de cristal — fragilidad sostenida.",
    alta:
      "Crimen y castigo — tormenta moral; El ruido y la furia — desborde psicológico; Carta de una desconocida — intensidad emocional.",
    "muy-alta":
      "Los sufrimientos del joven Werther — catarsis extrema; Hamlet — espiral afectiva máxima; Diario de un loco — crisis psicológica límite.",
  },
};

const MUSIC_RULES = {
  apertura:
    "Apertura: baja=estructura tradicional y melodía clara; media-baja=alternativo accesible; media-alta=híbridos y texturas menos obvias; alta/muy-alta=experimental, avant-pop o ambient abstracto.",
  responsabilidad:
    "Responsabilidad: baja=crudeza espontánea; media-baja=groove flexible; media-alta=producción cuidada con libertad; alta/muy-alta=arreglos meticulosos y composición compleja.",
  extraversion:
    "Extraversión: baja=íntimo/acústico; media-baja=energía media; media-alta=alternancia introspectiva-bailable; alta/muy-alta=alta energía, himnos y performance social.",
  amabilidad:
    "Amabilidad: baja=letra filosa/irónica; media-baja=ambivalencia; media-alta=calidez con tensión; alta/muy-alta=empatía, ternura y unión.",
  neuroticismo:
    "Neuroticismo: baja=calma reguladora; media-baja=melancolía suave; media-alta=tensión emocional notable; alta/muy-alta=catarsis intensa y vulnerabilidad explícita.",
};

const CINEMA_RULES = {
  apertura:
    "Apertura: baja=narrativa clásica y legible; media-baja=convención con giro; media-alta=lenguaje visual más arriesgado; alta/muy-alta=estructura no lineal y apuesta autoral.",
  responsabilidad:
    "Responsabilidad: baja=energía cruda e impredecible; media-baja=ritmo flexible; media-alta=estructura sólida con libertad; alta/muy-alta=guion preciso, montaje metódico y diseño formal.",
  extraversion:
    "Extraversión: baja=drama íntimo y foco interno; media-baja=social contenido; media-alta=balance intimidad-espectáculo; alta/muy-alta=dinamismo colectivo y alto pulso social.",
  amabilidad:
    "Amabilidad: baja=fricción moral y personajes ásperos; media-baja=empatía selectiva; media-alta=humanidad con tensión; alta/muy-alta=calidez, cooperación y reparación.",
  neuroticismo:
    "Neuroticismo: baja=tono estable y regulado; media-baja=melancolía controlada; media-alta=tensión psicológica frecuente; alta/muy-alta=catarsis emocional intensa.",
};

const LITERATURE_RULES = {
  apertura:
    "Apertura: baja=prosa clara y lineal; media-baja=forma clásica con innovación leve; media-alta=capas simbólicas moderadas; alta/muy-alta=experimentación formal y ambigüedad rica.",
  responsabilidad:
    "Responsabilidad: baja=voz espontánea y borde caótico; media-baja=estructura flexible; media-alta=arquitectura narrativa coherente; alta/muy-alta=estructura precisa, lógica interna y alta densidad de diseño.",
  extraversion:
    "Extraversión: baja=introspección profunda; media-baja=escala interpersonal contenida; media-alta=alterna mundo interno y social; alta/muy-alta=novelas corales y alta interacción social.",
  amabilidad:
    "Amabilidad: baja=cinismo, ironía y conflicto ético duro; media-baja=ambivalencia afectiva; media-alta=empatía parcial; alta/muy-alta=compasión, vínculos y cuidado.",
  neuroticismo:
    "Neuroticismo: baja=serenidad reflexiva; media-baja=tensión leve y controlada; media-alta=vulnerabilidad psicológica marcada; alta/muy-alta=intensidad emocional y catarsis.",
};

const VISUAL_ART_RULES = {
  apertura:
    "Apertura: baja=figuración accesible; media-baja=lenguaje tradicional con desviaciones; media-alta=abstracción parcial y concepto moderado; alta/muy-alta=alto riesgo conceptual y ruptura estética.",
  responsabilidad:
    "Responsabilidad: baja=gestualidad cruda y caos expresivo; media-baja=orden parcial; media-alta=composición clara con libertad; alta/muy-alta=geometría, precisión técnica y control compositivo.",
  extraversion:
    "Extraversión: baja=obra íntima y contemplativa; media-baja=presencia social discreta; media-alta=equilibrio entre introspección y exhibición; alta/muy-alta=obra performativa, pública e inmersiva.",
  amabilidad:
    "Amabilidad: baja=fricción política/moral y aspereza visual; media-baja=ambivalencia afectiva; media-alta=calidez moderada; alta/muy-alta=humanismo, ternura y cooperación simbólica.",
  neuroticismo:
    "Neuroticismo: baja=atmósfera estable y reguladora; media-baja=melancolía contenida; media-alta=tensión expresiva constante; alta/muy-alta=descarga emocional intensa.",
};

const CATEGORY_RULE_BLOCKS = [
  { heading: "VIDEOJUEGOS", rules: null },
  { heading: "MÚSICA", rules: MUSIC_RULES },
  { heading: "CINE", rules: CINEMA_RULES },
  { heading: "LITERATURA", rules: LITERATURE_RULES },
  { heading: "ARTE-VISUAL", rules: VISUAL_ART_RULES },
];

function spanishOceanDimensionsFromTotals(totals) {
  return [
    ["apertura", Number(totals.o) || 0],
    ["responsabilidad", Number(totals.c) || 0],
    ["extraversion", Number(totals.e) || 0],
    ["amabilidad", Number(totals.a) || 0],
    ["neuroticismo", Number(totals.n) || 0],
  ];
}

function dominantFacetFromDimensions(dimensions) {
  const sorted = [...dimensions].sort((a, b) => b[1] - a[1]);
  const [key, value] = sorted[0] || ["no_disponible", 0];
  return { key, value };
}

function topFacetKeys(dimensions, count = 1) {
  return [...(dimensions || [])]
    .sort((a, b) => (Number(b?.[1]) || 0) - (Number(a?.[1]) || 0))
    .slice(0, Math.max(1, count))
    .map(([key]) => key);
}

function stablePickOneExample(rawExamples, seed) {
  const options = String(rawExamples || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!options.length) return "";
  let hash = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length];
}

function formatFacetExamplesBlock(dimensions, examplesByFacet, heading, targetLabel, seedSalt = "") {
  const selected = topFacetKeys(dimensions, 1);
  const lines = selected.map((key) => {
    const value = dimensions.find(([k]) => k === key)?.[1] ?? 0;
    const detail = scoreDetailBand(value);
    const rawExamples =
      examplesByFacet[key]?.[detail] || examplesByFacet[key]?.["media-baja"] || "";
    const ex = stablePickOneExample(rawExamples, `${seedSalt}|${heading}|${key}|${detail}`);
    const label = FACET_DETAIL_LABELS[detail] || detail;
    return `  - ${key} (${label}): ${ex}`;
  });
  return (
    `- ${heading} (facetas dominantes): ejemplos de matiz, NO repertorio.\n` +
    `  Usa estos ejemplos como calibración y prioriza ${targetLabel} alternativos con encaje OCEAN.\n` +
    `  No repitas estos ejemplos por defecto; úsalos solo para entender la vibra.\n` +
    `${lines.join("\n")}`
  );
}

function formatCategoryRuleSections(dimensions, seedSalt = "") {
  const dimKeys = dimensions.map(([key]) => key);
  return CATEGORY_RULE_BLOCKS.map(({ heading, rules }) => {
    if (heading === "VIDEOJUEGOS") {
      return formatFacetExamplesBlock(
        dimensions,
        FACET_VIDEOGAME_EXAMPLES,
        "VIDEOJUEGOS",
        "títulos",
        seedSalt
      );
    }
    if (heading === "MÚSICA") {
      return formatFacetExamplesBlock(
        dimensions,
        FACET_MUSIC_EXAMPLES,
        "MÚSICA",
        "artistas/obras",
        seedSalt
      );
    }
    if (heading === "CINE") {
      return formatFacetExamplesBlock(
        dimensions,
        FACET_CINEMA_EXAMPLES,
        "CINE",
        "películas/directores",
        seedSalt
      );
    }
    if (heading === "LITERATURA") {
      return formatFacetExamplesBlock(
        dimensions,
        FACET_LITERATURE_EXAMPLES,
        "LITERATURA",
        "autores/obras",
        seedSalt
      );
    }
    return `- Reglas para ${heading} (aplican según nivel actual por faceta):\n${dimKeys
      .map((k) => `  - ${rules[k]}`)
      .join("\n")}`;
  }).join("\n");
}

function buildCompactFacetPrompt(dimensions, dominantFacet, seedSalt = "") {
  const dimLines = dimensions.map(([key, value]) => {
    const detail = scoreDetailBand(value);
    const current = Number(value || 0).toFixed(2);
    const rule = FACET_PROMPT_RULES[key]?.[detail] || FACET_PROMPT_RULES[key]?.media || "";
    return `- ${key}: ${current} (${FACET_DETAIL_LABELS[detail] || detail}) => ${rule}`;
  });

  return `TRADUCCIÓN OCEAN (compacta, obligatoria):
${dimLines.join("\n")}
- Faceta dominante prioritaria: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}).
${formatCategoryRuleSections(dimensions, seedSalt)}
- Usa esta lógica en mecánicas/ritmo/tono, no solo estética.
- Distingue media-baja de media-alta y evita recomendaciones clónicas.`;
}

const KEY_SUBFACET_SPECS = [
  ["openness", "imagination", "Apertura/imaginación"],
  ["conscientiousness", "orderliness", "Responsabilidad/meticulosidad"],
  ["conscientiousness", "perfectionism", "Responsabilidad/perfeccionismo"],
  ["extraversion", "sociability", "Extraversión/sociabilidad"],
  ["agreeableness", "empathy", "Amabilidad/empatía"],
  ["neuroticism", "calmness", "Neuroticismo/calma"],
];

function collectKeySubfacetLines(scores) {
  return KEY_SUBFACET_SPECS.map(([traitKey, facetKey, label]) =>
    formatFacetLine(scores, traitKey, facetKey, label)
  ).filter(Boolean);
}

function buildOceanFacetInterpretation(scores, totals, seedSalt = "") {
  const dimensions = spanishOceanDimensionsFromTotals(totals);
  const dominantFacet = dominantFacetFromDimensions(dimensions);
  const keySubfacets = collectKeySubfacetLines(scores);
  const compactRules = buildCompactFacetPrompt(dimensions, dominantFacet, seedSalt);
  return { compactRules, keySubfacets };
}

const MECHANICAL_LINE_BY_BAND = {
  c: {
    alta:
      "Responsabilidad ALTA: prioriza sistemas complejos, metódicos y obras con estructuras arquitectónicas (diseño, precisión, lógica interna).",
    baja:
      "Responsabilidad BAJA: prioriza energía cruda, improvisación y ruptura de reglas sin forzar rigidez formal.",
    media:
      "Responsabilidad MEDIA: alterna orden y libertad; evita solo obras hiperclásicas o solo caos extremo.",
  },
  n: {
    alta:
      'Neuroticismo ALTO: prioriza alta resolución emocional y catarsis (vulnerabilidad, tensión psicológica), no solo "obras tristes" genéricas.',
    baja: "Neuroticismo BAJO: puedes incluir obras serenas y reguladoras sin forzar melodrama constante.",
    media:
      "Neuroticismo MEDIO: mezcla tensión afectiva moderada con respiros; evita un solo registro emocional.",
  },
};

function mechanicalCurationLines(c, n) {
  const bc = scoreBand(c);
  const bn = scoreBand(n);
  return [MECHANICAL_LINE_BY_BAND.c[bc], MECHANICAL_LINE_BY_BAND.n[bn]];
}

const NEGATIVE_ANTIPATTERNS = {
  o: {
    alta:
      'Apertura ALTA: NO llenes la lista solo con remakes, blockbusters de fórmula o "obras raras" vacías sin sustancia; la rareza debe ir acompañada de intención clara.',
    baja:
      "Apertura BAJA: NO fuerces vanguardia ilegible, metaficción constante ni formalismo extremo como mayoría; respeta necesidad de anclas narrativas o melódicas.",
    media:
      'Apertura MEDIA: NO polarices todo entre catálogo mainstream y experimentación inaccesible; evita el cliché de mezcla "de manual" sin matices.',
  },
  c: {
    alta:
      "Responsabilidad ALTA: NO propongas como eje obras caóticas sin sistema, sin reglas internas ni progresión comprensible en la mayoría de entradas.",
    baja:
      "Responsabilidad BAJA: NO satures de simulación milimétrica, puzzles ultra-rígidos o narrativas hiper-controladas sin respiradero creativo.",
    media:
      'Responsabilidad MEDIA: NO caigas en "solo orden" o "solo caos"; evita listas que ignoren el equilibrio entre método y libertad.',
  },
  e: {
    alta:
      "Extraversión ALTA: NO te quedes solo en íntimo, lento y de baja estimulación social en la mayoría de candidatos; evita monotonía contemplativa.",
    baja:
      "Extraversión BAJA: NO priorices solo multijugador ruidoso, maximalismo social o alto bombardeo performativo sin pausas introspectivas.",
    media:
      "Extraversión MEDIA: NO uses solo un registro (fiesta continua o ermitaño total); alterna mal la escala social.",
  },
  a: {
    alta:
      "Amabilidad ALTA: NO abuses de crueldad gratuita, humillación voyerista, cinismo fácil ni conflictos resueltos solo con sarcasmo duro.",
    baja:
      "Amabilidad BAJA: NO rellenes con fábulas edulcoradas, moralina ingenua ni arcos de redención forzada y complacientes en exceso.",
    media:
      'Amabilidad MEDIA: NO homogeneices todo a "bondad light" ni todo a fricción cínica; evita tono único en toda la tanda.',
  },
  n: {
    alta:
      'Neuroticismo ALTO: NO suavices el feed a catálogo solo "zen/bienestar" ni trivialices emociones fuertes con soluciones genéricas.',
    baja:
      "Neuroticismo BAJO: NO conviertas la lista en maratón de tragedia, terror psicológico o ansiedad constante sin respiros reguladores.",
    media:
      "Neuroticismo MEDIO: NO mezcles solo melodrama barato ni solo frialdad emocional; evita ausencia de arco afectivo creíble.",
  },
};

function negativeCurationLines(o, c, e, a, n) {
  return [
    NEGATIVE_ANTIPATTERNS.o[scoreBand(o)],
    NEGATIVE_ANTIPATTERNS.c[scoreBand(c)],
    NEGATIVE_ANTIPATTERNS.e[scoreBand(e)],
    NEGATIVE_ANTIPATTERNS.a[scoreBand(a)],
    NEGATIVE_ANTIPATTERNS.n[scoreBand(n)],
  ];
}

function entropyBucketCounts(targetTotal) {
  const safe = Math.round(targetTotal * 0.2);
  const niche = Math.round(targetTotal * 0.5);
  return { safe, niche, risk: targetTotal - safe - niche };
}

function formatSubfacetBlockForPrompt(keySubfacets) {
  if (!keySubfacets.length) {
    return "   (sin subfacetas numéricas; infiere con cuidado desde los totales OCEAN.)";
  }
  return keySubfacets.map((line) => `   ${line}`).join("\n");
}

function buildAdaptiveRulesFromTest(o, c, e, a, n) {
  const rules = [];
  if (o >= 3.8) {
    rules.push(
      "Apertura muy alta: sube riesgo formal real (no solo etiqueta \"experimental\") y evita obras demasiado obvias."
    );
  } else if (o <= 2.2) {
    rules.push("Apertura baja: privilegia accesibilidad y anclas claras; el riesgo debe ser minoritario.");
  }
  if (c >= 3.8) {
    rules.push("Responsabilidad alta: prioriza obras con estructura, método y progresión interna legible.");
  } else if (c <= 2.2) {
    rules.push("Responsabilidad baja: deja espacio a energía cruda e improvisación sin sobrecargar de rigidez.");
  }
  if (e >= 3.8) {
    rules.push("Extraversión alta: evita una lista excesivamente íntima/lenta; añade piezas de pulso social.");
  } else if (e <= 2.2) {
    rules.push("Extraversión baja: evita saturar con propuestas hiper-sociales o performativas.");
  }
  if (a >= 3.8) {
    rules.push("Amabilidad alta: prioriza calidez, cooperación y reparación emocional sin caer en moralina.");
  } else if (a <= 2.2) {
    rules.push("Amabilidad baja: tolera aspereza y fricción ética, evitando sentimentalismo forzado.");
  }
  if (n >= 3.8) {
    rules.push("Neuroticismo alto: habilita catarsis y vulnerabilidad intensa; evita el sesgo exclusivamente zen.");
  } else if (n <= 2.2) {
    rules.push("Neuroticismo bajo: prioriza regulación y equilibrio; evita saturación de angustia extrema.");
  }
  return rules;
}

function buildArtisticProfileExtra(artisticProfile) {
  if (!artisticProfile || typeof artisticProfile !== "object") return "";
  const prof = String(artisticProfile.profile || "").trim();
  const desc = String(artisticProfile.description || "").trim().slice(0, 500);
  return `\nPerfil artístico existente: ${prof}\n${desc}\n`;
}

function diversityPromptSalt() {
  return Math.random().toString(36).substring(2, 10);
}

function feedEntityIdFromOceanResult(oceanResult) {
  if (!oceanResult || typeof oceanResult !== "object") return undefined;
  return oceanResult.entityId != null ? oceanResult.entityId : oceanResult.entity_id;
}

function buildPersonalizedFeedCuratorPrompt({
  o,
  c,
  e,
  a,
  n,
  oceanFingerprint,
  artExtra,
  rulesText,
  facetInterpretation,
  keySubfacets,
  targetCandidates,
}) {
  const { safe: nEntropySafe, niche: nEntropyNiche, risk: nEntropyRisk } = entropyBucketCounts(
    targetCandidates
  );
  const subfacetBlock = formatSubfacetBlockForPrompt(keySubfacets);
  const adaptiveRules = buildAdaptiveRulesFromTest(o, c, e, a, n);
  const mechanicalLines = mechanicalCurationLines(c, n);
  const negativeLines = negativeCurationLines(o, c, e, a, n);
  const diversitySalt = diversityPromptSalt();
  const gameAxes = pickVideoGameExplorationAxes(oceanFingerprint, 2);
  const gameAxisA = gameAxes[0] || "(eje no disponible)";
  const gameAxisB = gameAxes[1] || "(eje no disponible)";
  const oceanCombinationLine = `Combinación global OCEAN prioritaria: O:${o.toFixed(2)} + C:${c.toFixed(
    2
  )} + E:${e.toFixed(2)} + A:${a.toFixed(2)} + N:${n.toFixed(2)}.`;
  const gameOpennessRule =
    o >= 3.2
      ? "Apertura O ≥ 3.2: en videojuegos, cero títulos de la lista de megablocks globalizados (Witcher 3, BOTW, GTA V, Minecraft, Fortnite, FIFA, Call of Duty, Elden Ring, Cyberpunk 2077, RDR2, BG3, Mario Odyssey, Among Us, Apex, LoL, TLoU, Horizon FW, Starfield, Valorant, Genshin, WoW, Hogwarts Legacy, Diablo IV, RE4 remake, CS2, PUBG salvo nombres parciales en títulos distintos); elige alternativas de mecánica parecida pero menos masificadas."
      : o < 2.4
        ? "Apertura O < 2.4: puedes incluir como máximo 2 megatítulos de esa familia si encajan de verdad con el perfil; el resto debe ser catálogo menos obvio."
        : "Apertura media: como máximo 1 megatítulo de esa familia; prioriza variedad de estudio, época y plataforma.";

  const sections = [
    "Rol: Curador cultural. Objetivo: discovery personalizado con sesgo a nicho real y diversidad; no inventes obras.",
    [
      "### PERFIL",
      `- OCEAN: O:${o.toFixed(2)}, C:${c.toFixed(2)}, E:${e.toFixed(2)}, A:${a.toFixed(2)}, N:${n.toFixed(2)}`,
      `- Huella: ${oceanFingerprint}`,
      artExtra.trim() ? artExtra.trim() : null,
      `- Diferenciación obligatoria: ${rulesText}`,
    ]
      .filter(Boolean)
      .join("\n"),
    [
      "### REGLAS NÚCLEO",
      "1) Evita listas obvias y convergencia entre usuarios; prioriza long-tail verificable.",
      `2) Videojuegos: al menos 6 candidatos alineados con ambos ejes: (1) ${gameAxisA} (2) ${gameAxisB}. ${gameOpennessRule}`,
      "3) Música: al menos 6 candidatos con justificación explícita y no genérica para este perfil.",
      "4) En videojuegos y música, cada oceanFitReason debe explicar encaje por combinación de rasgos (interacción entre al menos 2 dimensiones OCEAN) y no por un rasgo aislado.",
      "5) Subfacetas disponibles:",
      subfacetBlock,
      "5.1) Los ejemplos incluidos en este prompt son solo calibración de vibra, NO repertorio objetivo.",
      "5.2) Evita copiar títulos de ejemplo; como máximo 1 candidato total puede coincidir literalmente con esos ejemplos.",
      `6) Genera exactamente ${targetCandidates} candidatos en cinco categorías (cine, musica, literatura, videojuegos, arte-visual), balanceadas cuando sea posible.`,
      `   - ${nEntropySafe} obras "seguras" (alto encaje OCEAN, popularidad media).`,
      `   - ${nEntropyNiche} obras de nicho (alto encaje, baja popularidad / indie / autor).`,
      `   - ${nEntropyRisk} "apuestas de riesgo" (desafían al usuario pero encajan en apertura o neuroticismo del perfil).`,
      "7) Lógica mecánica (no solo estética):",
      mechanicalLines.map((x) => `   - ${x}`).join("\n"),
      "8) Prohibido puntuar solo por rasgo individual: decide cada recomendación por patrón total del perfil (trade-offs entre O, C, E, A, N).",
      `9) ${oceanCombinationLine}`,
    ].join("\n"),
    adaptiveRules.length
      ? `### AJUSTE DINÁMICO POR TEST OCEAN\n${adaptiveRules.map((x) => `- ${x}`).join("\n")}`
      : "",
    `### ANTI-PATRONES (NO SATURAR)\n${negativeLines.map((x) => `   - ${x}`).join("\n")}`,
    `### REGLAS POR FACETA/CATEGORÍA\n${facetInterpretation}`,
    [
      "### CONTEXTO",
      "Sin búsqueda web. Usa solo conocimiento interno.",
      "Títulos/creadores reales y buscables.",
      PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
    ].join("\n"),
    `### FORMATO DE SALIDA (JSON ESTRICTO)
Devuelve solo este objeto JSON:
{"candidates":[{"category":"cine|musica|literatura|videojuegos|arte-visual","title":"Título en español de España (TMDB es-ES) u original si no hay traducción","creator":"Autor/Director/Estudio","genreHint":"Subgénero hiper-específico (ej. post-punk báltico, slow cinema distópico)","oceanFitReason":"Justificación breve basada en combinación global OCEAN (al menos 2 rasgos interactuando)"}]}`,
    `Random seed de diversidad: ${diversitySalt}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

module.exports = {
  buildArtisticProfileExtra,
  buildOceanFacetInterpretation,
  buildPersonalizedFeedCuratorPrompt,
  feedEntityIdFromOceanResult,
};

