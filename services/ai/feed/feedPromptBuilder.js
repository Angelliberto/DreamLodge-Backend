const {
  PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
} = require("../../../utils/ai/agentUtils");

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
  return `${label}: matiz ${scoreDetailBand(v)}`;
}

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

/** Referencias con título (ej. obra / disco / juego): misma forma que cine/literatura; el prompt muestra todas las anclas del matiz del rasgo. */
const FACET_GAME_EXAMPLES = {
  apertura: {
    "muy-baja":
      "Mario Kart 8 — reglas triviales claras; The Sims 4 (modo casual) — metas lineales obvias; FIFA (partido rápido) — formato cerrado reconocible.",
    baja:
      "Spiritfarer — tutorial cálido con temas serios contenidos; Stardew Valley — progresión accesible; Abzû — navegación simple y contemplativa.",
    "media-baja":
      "The Legend of Zelda: Breath of the Wild — mundo abierto con curva suave; Assassin's Creed Odyssey — exploración monumental accesible; Subnautica — descubrimiento guiado pero amplio.",
    "media-alta":
      "Disco Elysium — texto y sistema raros cohesionados; Hollow Knight — mapa implícito y diseño densos; Outer Wilds — bucle temporal y física lateral.",
    alta:
      "The Stanley Parable — metatexto jugable; Pony Island — ruptura formal con intención; Return of the Obra Dinn — deducción radical y austera.",
    "muy-alta":
      "The Witness — rejilla de puzzles casi filosofía; Frog Fractions — sátira de tutorial; Baba Is You — reescritura de reglas cada pantalla.",
  },
  responsabilidad: {
    "muy-baja":
      "Goat Simulator — física gag; Garry's Mod — caos sandbox sin objetivo impuesto;",
    baja:
      "Just Cause seríes — física exuberante improvisada; Teardown — demolition sandbox; Riders Republic — freestyle caótico.",
    "media-baja":
      "Hades — run con claridad pero variación alta; Rogue Legacy 2 — progres entre runs fluido; Vampire Survivors — reglas triviales ritmo alto.",
    "media-alta":
      "Monster Hunter Rise — combos aprendibles; Factorio — progres técnico legible; Civilization VI — tecnologías formales secuenciadas.",
    alta:
      "Into the Breach — puzzle táctico estrictísimo; Opus Magnum — optimización alambicada; Infinifactory — cadenas de producción micrométricas.",
    "muy-alta":
      "Kerbal Space Program — sim física y planificación brutal; Shenzhen I/O — programación assembler de rompecabezas industrial; Dominion (digital táctico muy metódico) — motor de combo numérico si el modelo lo tiene presente.",
  },
  extraversion: {
    "muy-baja":
      "Journey — encuentros mínimos; Firewatch — aislamiento en parque; The Long Dark — sobrevivencia solitaria larga.",
    baja:
      "What Remains of Edith Finch — narrativa cerrada íntima; Kentucky Route Zero — encuentros esporádicos; GRIS — plataforma emocional en silencio.",
    "media-baja":
      "It Takes Two — co-op no hostil cuando se desea cercanía contenida; Portal 2 (co-op) — puzles pareja sin estrés social; Untitled Goose Game — juguete social comedido.",
    "media-alta":
      "Destiny 2 — mix instancia/cooperación abierta; Sea of Thieves — tripulación opcional alta interacción; Deep Rock Galactic — squad compacto comunicativo.",
    alta:
      "Overwatch 2 — ritmo equipo competitivo; Rocket League — partidas cortas alta energía social; Fortnite (modos squad) — multitud performativa rápida.",
    "muy-alta":
      "Among Us — debate performativo alto; Fall Guys — party masivo frenético; Jackbox Party Pack — performance grupal cara al grupo.",
  },
  amabilidad: {
    "muy-baja":
      "Spec Ops: The Line — violencia con veredicto moral; Papers, Please — burocracia cruel; This War of Mine — sobrevivencia brutal.",
    baja:
      "The Last of Us Part II — conflicto vísceral gris; Bioshock — dilemas objeto de poder; Bioshock Infinite — patriotismo sangriento irónico.",
    "media-baja":
      "Heavy Rain — consecuencias familiares severas; Telltale The Walking Dead (temporada uno) — cuidado bajo crueldad mundo; NieR Automata — compasión bajo dystopía hierro.",
    "media-alta":
      "Unpacking — cuidado memoria objeto; Chicory: A Colorful Tale — arte como apoyo ajeno; A Short Hike — calidez paisaje pequeño.",
    alta:
      "Animal Crossing: New Horizons — cooperación hogar lentitud; Monument Valley II — vínculos madre-hijo en puzles; Cozy Grove — visitas rutina regenerativa.",
    "muy-alta":
      "TOEM — foto bondad urbana corta; Wandersong — bard cantar resolución pacífica; Kind Words (lo-fi chill beats) — epistolario sólo texto amable.",
  },
  neuroticismo: {
    "muy-baja":
      "A Short Hike (tramo final sereno) — baja pulsación tensión; Alba: A Wildlife Adventure — calma naturaleza; Monument Valley — puzles meditativos sin amenaza cronológica urgente.",
    baja:
      "Unpacking segunda pasada — melancolía suave contenida; Stardew Valley noches piano — ciclo día-noche reposado.; Coffee Talk — café charla regulación emocional mínimo conflicto físico.",
    "media-baja":
      "Life is Strange (episodio tonal melancólico) — tensión adolescente contenida.; Oxenfree — radios y amistad spooky leve.; Night in the Woods — depresión ciudad pequeña sin saltos scare.",
    "media-alta":
      "Silent Hill 2 — incomodidad psicológica sostenida.; Inside — hostilidad ambiente lateral.; SOMA — identidad corpórea angustiosa.",
    alta:
      "Hellblade: Senua's Sacrifice — psicosis auditiva visceral.; The Evil Within — terror acción pulsos altos narrativamente.; Layers of Fear (primero) — casa memoria trauma.",
    "muy-alta":
      "Visage — pacing terror doméstico extremo.; Detention — folklore y culpa colonial opresivos.; Eternal Darkness — inestabilidad narrativa perturbadora prolongada.; Not for everyone: Anatomy (video ensayo jugable indie) — incomodidad metatextual densa si modelo lo puede nombrar fielmente.",
  },
};

const FACET_MUSIC_EXAMPLES = {
  apertura: {
    "muy-baja":
      "Mozart — Réquiem fragmentos melodía cerrada conocida mundialmente; Óperas grabaciones clásicas mainstream (Bizet Carmen suite) — melodía frontal.",
    baja:
      "Norah Jones Come Away With Me — canciones pop-jazz línea clara.; Ed Sheeran + — estribillo directo reproducible guitarrístico mainstream.",
    "media-baja":
      "Alt-J An Awesome Wave — riff raros melodía navegable.; Florence + The Machine ceremonia quasi epica melodía alta legible.",
    "media-alta":
      "Radiohead Kid A — híbridos glitch melódicos ambiguos legibles tras escucha.; Björk Homogenic — electrónico orquestal lírica destilada pero no pop simple.",
    alta:
      "Aphex Twin Selected Ambient Works 85-92 — paisajes sin estribillo obvio cohesionados tonalmente.; Kraftwerk Computer World — repetición robótica autoral.",
    "muy-alta":
      "Autechre elseq 1-5 (extracto cualquier track largo aleatorio cohesion estética glitch) — disolución melodía habitual.; Merzbow — ruidismo extremo (referencia muy arriesgada; solo para muy alta radical).",
  },
  responsabilidad: {
    "muy-baja":
      "Patti Smith Horses improvisación punk declamatorio crudo vivo.; Velvet Underground Loaded tomas crudas batería laxa;",
    baja:
      "Arctic Mon Whatever People Say crudeza garage pulso humano;",
    "media-baja":
      "D'Angelo Voodoo grooves largos improvisación contenida soul;",
    "media-alta":
      "Fleetwood Mac Rumours pulido emocional y producción láser año 70;",
    alta:
      "Steely Dan Aja — jazz rock de estudio en capas obsesivamente pulidas;",
    "muy-alta":
      "Jacob Collier crazed harmony live loops capas virtuosísticas microtonal;",
  },
  extraversion: {
    "muy-baja":
      "Nick Drake Pink Moon guitarrero una sola voz;",
    baja:
      "Bon Iver For Emma acoustíco cuarto bedroom;",
    "media-baja":
      "Tame Impala Currents medio electropop medio psicodelia interiorizada;",
    "media-alta":
      "Talking Heads Speaking in Tongues funk conversacional sala grande;",
    alta:
      "Beyoncé Renaissance club energía alta performance disco;",
    "muy-alta":
      "Arca KiCk series maximalismo queer sonido y escena club hiper;",
  },
  amabilidad: {
    "muy-baja":
      "Eminem relapse letras filosas ironía brutal;",
    baja:
      "Bob Dylan Highway 61 letras mordientes narrativas;",
    "media-baja":
      "Father John Misty Pure Comedy ironía sentimentalismo crítico;",
    "media-alta":
      "Sufjan Stevens Carrie & Lowell ternura dolor matrimonio duelo;",
    alta:
      "The Beach Boys Pet Sounds armonías consuelo melodía alta;",
    "muy-alta":
      "Mister Rogers compilaciones voz cercanía reparadora (uso referencial tonal no infantilización usuario); Ladysmith Black Mambazo a capella comunidad;",
  },
  neuroticismo: {
    "muy-baja":
      "Brian Eno Ambient 1 Music for Airports;",
    baja:
      "Bill Evans Waltz for Debby calma reflexiva;",
    "media-baja":
      "Mazzy Star Fade Into You melancolía suave;",
    "media-alta":
      "Portishead Dummy tensión noir trip hop;",
    alta:
      "Radiohead OK Computer paranoia melodía alta presión;",
    "muy-alta":
      "Swans To Be Kind descarga repetitiva visceral;",
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

const GAME_RULES = {
  apertura:
    "Apertura: baja=mecánicas familiares, tutoriales claros y poca ambigüedad; media-baja=open world o sandbox accesible; media-alta=sistemas híbridos y curiosidad de diseño; alta/muy-alta=formalismo arriesgado, metanarrativa o reglas poco convencionales con intención clara.",
  responsabilidad:
    "Responsabilidad: baja=física caótica, sandbox irreverente o progresión flexible; media-baja=roguelike/ runs con reglas claras pero variación; media-alta=patrones duros aprendibles y progresión legible; alta/muy-alta=optimización, puzzles sistémicos o simulación con alta exigencia de método.",
  extraversion:
    "Extraversión: baja=experiencia solitaria, contemplativa o walking sim; media-baja=co-op opcional sin forzar multitud; media-alta=mix solo/grupo o roles sociales moderados; alta/muy-alta=multijugador competido, party o alta interacción performativa.",
  amabilidad:
    "Amabilidad: baja=conflicto moral duro o violencia con intención crítica; media-baja=dilemas grises tensos; media-alta=vínculos y cuidado con fricción; alta/muy-alta=cooperación, construcción amable o reparación emocional explícita.",
  neuroticismo:
    "Neuroticismo: baja=ritmo calmado y regulación casi meditativa; media-baja=melancolía o tensión leve; media-alta=miedo o incomodidad psicológica sostenida; alta/muy-alta=catarsis afectiva fuerte o ansiedad narrativa marcada.",
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
  { heading: "VIDEOJUEGOS", rules: GAME_RULES },
  { heading: "MÚSICA", rules: MUSIC_RULES },
  { heading: "CINE", rules: CINEMA_RULES },
  { heading: "LITERATURA", rules: LITERATURE_RULES },
  { heading: "ARTE-VISUAL", rules: VISUAL_ART_RULES },
];

const HEADING_CALIBRATION_EXAMPLES = {
  VIDEOJUEGOS: {
    dataset: FACET_GAME_EXAMPLES,
    abstractRules: GAME_RULES,
    targetLabel: "videojuegos reales verificables",
  },
  MÚSICA: {
    dataset: FACET_MUSIC_EXAMPLES,
    abstractRules: MUSIC_RULES,
    targetLabel: "grabaciones o artistas verificables",
  },
  CINE: {
    dataset: FACET_CINEMA_EXAMPLES,
    abstractRules: CINEMA_RULES,
    targetLabel: "películas/directores",
  },
  LITERATURA: {
    dataset: FACET_LITERATURE_EXAMPLES,
    abstractRules: LITERATURE_RULES,
    targetLabel: "autores/obras",
  },
};

const DIMENSION_LABEL_ES = {
  apertura: "Apertura",
  responsabilidad: "Responsabilidad",
  extraversion: "Extraversión",
  amabilidad: "Amabilidad",
  neuroticismo: "Neuroticismo",
};

/**
 * Parses lines like `Apertura: baja=…; media-baja=…; alta/muy-alta=…` into segments.
 */
function parseLegacyOceanRuleSegments(ruleLine) {
  const raw = String(ruleLine || "").trim();
  const colon = raw.indexOf(":");
  if (colon === -1) return { segments: {} };
  const body = raw.slice(colon + 1).trim();
  const segments = {};
  for (const part of body.split(";")) {
    const p = String(part || "").trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (k && v) segments[k] = v;
  }
  return { segments };
}

/** Devuelve el texto de baremo aplicable al matiz Likert-detail del perfil (un solo nivel por rasgo). */
function traitDiscoverySliceForDetail(ruleLine, detailBand) {
  const { segments } = parseLegacyOceanRuleSegments(ruleLine);
  const pick = (k) => (segments[k] ? String(segments[k]).trim() : "");

  switch (detailBand) {
    case "muy-baja":
      return pick("muy-baja") || pick("baja") || pick("media-baja");
    case "baja":
      return pick("baja") || pick("media-baja");
    case "media-baja":
      return pick("media-baja") || pick("baja") || pick("media-alta");
    case "media-alta":
      return pick("media-alta") || pick("media-baja") || pick("alta/muy-alta");
    case "alta":
    case "muy-alta":
      return pick("alta/muy-alta") || pick("alta") || pick("muy-alta") || pick("media-alta");
    default:
      return pick("media-alta") || pick("media-baja");
  }
}

function formatAbstractRulesFiltered(heading, rules, dimensions) {
  const lines = [];
  for (const [key, value] of dimensions) {
    const detail = scoreDetailBand(value);
    const full = rules[key];
    if (!full) continue;
    const slice = traitDiscoverySliceForDetail(full, detail);
    if (!slice) continue;
    const label = DIMENSION_LABEL_ES[key] || key;
    lines.push(`  - ${label} (${detail}): ${slice}`);
  }
  if (!lines.length) return "";
  return (
    `- **${heading}** — criterio por rasgo (matiz del perfil; demás niveles omitidos):\n` +
    lines.join("\n")
  );
}

/**
 * Una entrada por rasgo: criterio abstracto filtrado + referencias de tono en la misma viñeta (menos tokens, menos repetición).
 */
function formatCombinedCriterionAndAnchors(heading, abstractRules, examplesByFacet, dimensions, targetLabel) {
  const lines = [];
  for (const [key, value] of dimensions) {
    const detail = scoreDetailBand(value);
    const label = DIMENSION_LABEL_ES[key] || key;
    const full = abstractRules[key];
    const slice = full ? traitDiscoverySliceForDetail(full, detail) : "";
    const rawExamples =
      examplesByFacet[key]?.[detail] ||
      examplesByFacet[key]?.["media-baja"] ||
      examplesByFacet[key]?.["media-alta"] ||
      "";
    const refs = joinExampleAnchors(rawExamples);
    const parts = [];
    if (slice) parts.push(`Criterio: ${slice}`);
    if (refs) parts.push(`Referencias: ${refs}`);
    if (!parts.length) continue;
    lines.push(`  - ${label} (${detail}) — ${parts.join(" · ")}`);
  }
  if (!lines.length) return "";
  const labelHint = targetLabel ? ` Prioriza ${targetLabel}.` : "";
  return (
    `- **${heading}** — por rasgo: une criterio + anclas en cada línea.${labelHint}\n` +
    lines.join("\n")
  );
}

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
  const key = topFacetKeys(dimensions, 1)[0] || "no_disponible";
  const value = Number(dimensions.find(([k]) => k === key)?.[1]) || 0;
  return { key, value };
}

function topFacetKeys(dimensions, count = 1) {
  return [...(dimensions || [])]
    .sort((a, b) => (Number(b?.[1]) || 0) - (Number(a?.[1]) || 0))
    .slice(0, Math.max(1, count))
    .map(([key]) => key);
}

/** Todas las anclas separadas por `;` en la fuente; se muestran enteras para que el modelo las use como familia tonal. */
function joinExampleAnchors(rawExamples) {
  return String(rawExamples || "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" · ");
}

function formatCategoryRuleSections(dimensions, seedSalt = "") {
  void seedSalt;
  return CATEGORY_RULE_BLOCKS.map(({ heading, rules }) => {
    const cal = HEADING_CALIBRATION_EXAMPLES[heading];
    if (cal?.dataset && cal.abstractRules) {
      return formatCombinedCriterionAndAnchors(
        heading,
        cal.abstractRules,
        cal.dataset,
        dimensions,
        cal.targetLabel
      );
    }
    return formatAbstractRulesFiltered(heading, rules, dimensions);
  })
    .filter(Boolean)
    .join("\n\n");
}

function distinctiveSpanishTraitLine(dimensions) {
  const sorted = [...dimensions].sort(
    (a, b) => Math.abs(Number(b[1]) - 3) - Math.abs(Number(a[1]) - 3)
  );
  const top = sorted.slice(0, 2);
  if (!top.length) return "no_disponible";
  return top.map(([k, v]) => `${k} (${scoreDetailBand(v)})`).join(" | ");
}

function buildCompactFacetPrompt(dimensions, dominantFacet, seedSalt = "") {
  const dimLines = dimensions.map(([key, value]) => {
    const detail = scoreDetailBand(value);
    const rule = FACET_PROMPT_RULES[key]?.[detail] || "";
    return `- ${key} (${detail}) — qué buscar en las recomendaciones: ${rule}`;
  });
  const domDetail = scoreDetailBand(dominantFacet?.value ?? 0);

  return `TRADUCCIÓN OCEAN (compacta, obligatoria):
${dimLines.join("\n")}
- Faceta dominante prioritaria: ${dominantFacet?.key || "no_disponible"} (${domDetail}).
- Rasgos más distintivos (mayor alejamiento del equilibrio típico): ${distinctiveSpanishTraitLine(dimensions)} — prioriza diferenciación ahí sin ignorar interacciones con los demás.
${formatCategoryRuleSections(dimensions, seedSalt)}
- Aplica esta lógica en mecánica, ritmo y tono (no solo etiqueta superficial).
- Mantén variedad dentro del mismo perfil: equivalencias frescas mejor que repetir el mismo tipo de obra sin matices.`;
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

function formatSubfacetBlockForPrompt(keySubfacets) {
  if (!keySubfacets.length) {
    return "   (sin subfacetas detalladas; infiere con cuidado desde la traducción OCEAN del bloque siguiente.)";
  }
  return keySubfacets.map((line) => `   ${line}`).join("\n");
}

function diversityPromptSalt() {
  return Math.random().toString(36).substring(2, 10);
}

function feedEntityIdFromOceanResult(oceanResult) {
  if (!oceanResult || typeof oceanResult !== "object") return undefined;
  return oceanResult.entityId != null ? oceanResult.entityId : oceanResult.entity_id;
}

function buildPersonalizedFeedCuratorPrompt({
  rulesText,
  facetInterpretation,
  keySubfacets,
}) {
  const subfacetBlock = formatSubfacetBlockForPrompt(keySubfacets);
  const diversitySalt = diversityPromptSalt();

  const sections = [
    "Rol: Curador cultural. Objetivo: discovery personalizado inclusivo (desde repertorio más conocido hasta nicho verificable), sin sesgar solo a underground ni solo a mainstream; diversidad y encaje OCEAN; no inventes obras.",
    [
      "### REGLAS NÚCLEO",
      `Interpretación cualitativa del test (sin cifras); cura según este patrón:\n${rulesText}`,
      "1) Evita listas obvias y convergencia entre usuarios; prioriza long-tail verificable.",
      "2) Subfacetas disponibles:",
      subfacetBlock,
      "2.1) En cada categoría, las **Referencias** junto al **Criterio** son familia tonal: propón **obras reales equivalentes** en espíritu; no limites la salida a copiar esos títulos si hay opciones tan acertadas o más específicas.",
      "3) Prohibido optimizar solo un rasgo aislado: cada recomendación debe encajar en el patrón conjunto (trade-offs entre apertura, responsabilidad, extraversión, amabilidad y neuroticismo).",
      "4) No cites ni inventes cifras del test; trabaja solo con el significado de las bandas y reglas anteriores.",
    ].join("\n"),
    `### REGLAS POR FACETA/CATEGORÍA\n${facetInterpretation}`,
    [
      "### CONTEXTO",
      "Títulos/creadores reales y buscables.",
      PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
    ].join("\n"),
    `### FORMATO DE SALIDA (JSON ESTRICTO)
Devuelve solo este objeto JSON:
{"candidates":[{"category":"cine|musica|literatura|videojuegos|arte-visual","title":"Título en español de España (TMDB es-ES) u original si no hay traducción","creator":"Autor/Director/Estudio","genreHint":"Subgénero hiper-específico (ej. post-punk báltico, slow cinema distópico)"}]}`,
    `Random seed de diversidad: ${diversitySalt}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

module.exports = {
  buildOceanFacetInterpretation,
  buildPersonalizedFeedCuratorPrompt,
  feedEntityIdFromOceanResult,
};

