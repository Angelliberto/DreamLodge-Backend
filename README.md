# Dream Lodge — Backend

API REST de **Dream Lodge**, plataforma de descubrimiento cultural personalizado. El backend integra múltiples catálogos (cine, música, literatura, arte visual y videojuegos), gestiona perfiles de usuario y ofrece recomendaciones y chat asistido por IA con Google Gemini.

## Características principales

- **Autenticación de usuarios**: registro, login JWT, OAuth con Google, verificación de email y recuperación de contraseña.
- **Obras culturales**: catálogo, favoritos, pendientes, vistos, dislikes y búsqueda de obras similares.
- **Búsqueda global**: consulta unificada en TMDB, Spotify, IGDB, Google Books, Met Museum y Cleveland Museum of Art.
- **Feed personalizado**: curación y reranking de contenido basado en el perfil artístico del usuario (OCEAN).
- **Chat con IA**: conversaciones persistentes, streaming de respuestas y herramientas de agente (Gemini).
- **Test OCEAN**: almacenamiento de resultados de personalidad y generación de descripciones artísticas.
- **Integraciones externas**: Spotify, IGDB, TMDB, Google Books, Pinata (IPFS) y enriquecimiento de descripciones con IA.

## Stack tecnológico

| Tecnología | Uso |
|---|---|
| Node.js + Express 5 | Servidor HTTP y API REST |
| MongoDB + Mongoose | Base de datos NoSQL |
| Google Gemini | Chat, embeddings y enriquecimiento de contenido |
| JWT + Passport | Autenticación y sesiones |
| Swagger (OpenAPI 3) | Documentación interactiva de la API |
| Jest + Supertest | Tests automatizados |

## Requisitos previos

- [Node.js](https://nodejs.org/) 18 o superior
- [MongoDB](https://www.mongodb.com/) (local o Atlas)
- Cuentas y API keys de los servicios externos que vayas a usar (ver variables de entorno)



### Endpoints de sistema

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Estado de la API |
| `GET` | `/health` | Health check (usado en despliegue Koyeb) |
| `GET` | `/api-docs` | Documentación Swagger |
| `GET` | `/reset-password-redirect` | Página de redirección para deep link de la app móvil |

## Estructura del proyecto

```
Dream Lodge - BackEnd/
├── app.js                  # Punto de entrada, CORS, rutas y shutdown
├── config/
│   ├── mongo.js            # Conexión a MongoDB
│   └── contentLocaleConfig.js
├── controllers/            # Lógica de endpoints HTTP
├── docs/
│   └── swagger.js          # Configuración OpenAPI
├── middleware/
│   ├── session.js          # authUser (JWT)
│   ├── googleAuth.js       # Passport Google OAuth
│   └── mcpInternalAuth.js
├── models/nosql/           # Esquemas Mongoose
├── routes/                 # Rutas (auto-registradas en /api/<nombre>)
├── services/
│   ├── ai/                 # Chat, feed, embeddings, Gemini
│   ├── integrations/       # Clientes TMDB, Spotify, IGDB, etc.
│   ├── persistence/        # Persistencia de chat
│   └── search/             # Búsqueda global
├── scripts/                # Scripts de mantenimiento
├── test/                   # Tests con Jest
├── utils/                  # Helpers (JWT, validación, IPFS, email)
└── validators/             # Validaciones express-validator
```

Las rutas se registran automáticamente desde `routes/index.js`: cada archivo en `routes/` se monta bajo `/api/<nombre-del-archivo>`.

## API — Módulos principales

Todas las rutas de negocio están bajo el prefijo `/api`.

| Módulo | Base | Descripción |
|---|---|---|
| **Users** | `/api/users` | Registro, login, perfil, Google OAuth, reset de contraseña |
| **Artworks** | `/api/artworks` | Obras, listas del usuario, similares, traducción y enriquecimiento |
| **Feed** | `/api/feed` | Feed personalizado, estado y rebuild |
| **Chat** | `/api/chat` | Mensajes, streaming, conversaciones y recomendaciones |
| **Global Search** | `/api/globalSearch` | Búsqueda unificada multi-fuente |
| **Ocean** | `/api/ocean` | Test de personalidad OCEAN y perfil artístico |
| **Spotify** | `/api/spotify` | Token de acceso de la app |
| **IGDB** | `/api/IGDB` | Búsqueda de videojuegos |
| **Internal** | `/api/internal` | Endpoints internos protegidos (MCP) |

### Autenticación

Los endpoints protegidos requieren el header:

```
Authorization: Bearer <token_jwt>
```

El token se obtiene al registrarse o iniciar sesión en `/api/users/login` o `/api/users/register`.


## Licencia

Proyecto privado — Dream Lodge.

