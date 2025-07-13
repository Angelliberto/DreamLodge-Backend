const axios = require('axios');
const FormData = require('form-data');

const uploadToPinata = async (fileBuffer, fileName) => {
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
    
    // Crear FormData
    const formData = new FormData();
    formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'image/jpeg'
    });
    
    // Añadir metadatos
    formData.append('pinataMetadata', JSON.stringify({
        name: fileName
    }));
    
    // Añadir opciones
    formData.append('pinataOptions', JSON.stringify({
        cidVersion: 0
    }));
    
    try {
        const response = await axios.post(url, formData, {
            headers: {
                ...formData.getHeaders(),
                'pinata_api_key': process.env.PINATA_KEY,
                'pinata_secret_api_key': process.env.PINATA_SECRET
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        return response.data;
    } catch (error) {
        console.error('Error al subir el archivo a Pinata:', error.response?.data || error.message);
        throw new Error(`Error al subir el archivo: ${error.response?.data?.error || error.message}`);
    }
};

module.exports = { uploadToPinata };