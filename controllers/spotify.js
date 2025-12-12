// /controllers/spotify.controller.js

const axios = require('axios');
// Si usas la librería 'base-64', asegúrate de importarla
// const base64 = require('base-64'); 

// ✅ Nota: Estas variables se obtienen de process.env cargadas por server.js
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID; 
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const TOKEN_URL = 'https://accounts.spotify.com/api/token';


exports.getAppAccessToken = async (req, res) => {
    
    // ⚠️ 1. DEPURACIÓN DE VARIABLES DE ENTORNO
    console.log('--- SPOTIFY TOKEN DEBUG ---');
    console.log(`DEBUG: Client ID Loaded: ${CLIENT_ID ? 'YES' : 'NO'} (Length: ${CLIENT_ID ? CLIENT_ID.length : 0})`);
    console.log(`DEBUG: Client Secret Loaded: ${CLIENT_SECRET ? 'YES' : 'NO'}`);
    console.log('---------------------------');
    
    // Si no están cargadas, detente aquí.
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(500).json({ 
            error: 'ENVIRONMENT_ERROR',
            details: 'Client ID o Client Secret no están cargados en el backend. Revisa tu archivo .env.'
        });
    }

    const credentials = `${CLIENT_ID}:${CLIENT_SECRET}`;
    
    // 2. Codificación Base64
    // Usamos Buffer.from() para entornos Node.js
    const base64Credentials = Buffer.from(credentials).toString('base64'); 
    
    // ⚠️ 2. DEPURACIÓN DE LA CADENA FINAL ENVIADA
    const authHeader = `Basic ${base64Credentials}`;
    console.log('DEBUG: Authorization Header SENT:');
    console.log(`-> ${authHeader}`);
    console.log('---------------------------');

    try {
        // 3. Solicitud POST servidor-a-servidor a Spotify
        const response = await axios.post(
            TOKEN_URL,
            'grant_type=client_credentials', 
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': authHeader, // Usamos la cadena depurada
                },
            }
        );
        
        // 4. Devolver el Access Token al frontend
        res.json(response.data); 

    } catch (error) {
        // ⚠️ 3. DEPURACIÓN DE LA RESPUESTA DE ERROR DE SPOTIFY
        const status = error.response ? error.response.status : 500;
        const errorData = error.response ? error.response.data : {};

        console.error('--- SPOTIFY API ERROR RECEIVED ---');
        console.error(`Status Code: ${status}`);
        console.error('Response Data:', errorData);
        console.error('----------------------------------');
        
        // Devolvemos el error al frontend para diagnóstico
        res.status(status).json({ 
            error: 'TOKEN_FETCH_FAILED',
            details: errorData,
            status: status
        });
    }
};