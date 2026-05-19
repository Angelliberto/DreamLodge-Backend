const request = require('supertest');

jest.mock('../services/integrations/spotifyClient', () => ({
    getSpotifyClientCredentialsPayload: jest.fn()
}));

const app = require('../../app');
const mongoose = require('mongoose');

const { getSpotifyClientCredentialsPayload } = require('../../services/integrations/spotifyClient');

describe('spotify', () => {

    const baseUrl = '/api/spotify';

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    it('should get spotify app access token', async () => {
        getSpotifyClientCredentialsPayload.mockResolvedValue({
            access_token: 'spotify_access_token_test',
            token_type: 'Bearer',
            expires_in: 3600
        });

        const response = await request(app)
            .get(`${baseUrl}/token`)
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.access_token).toEqual('spotify_access_token_test');
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.expires_in).toEqual(3600);
    });

    it('should return environment error when spotify env variables are missing', async () => {
        getSpotifyClientCredentialsPayload.mockRejectedValue({
            code: 'SPOTIFY_ENV'
        });

        const response = await request(app)
            .get(`${baseUrl}/token`)
            .set('Accept', 'application/json')
            .expect(500);

        expect(response.body.error).toEqual('ENVIRONMENT_ERROR');
        expect(response.body.details).toEqual('Client ID o Client Secret no están cargados en el backend. Revisa tu archivo .env.');
    });

    it('should return spotify error status when token fetch fails', async () => {
        getSpotifyClientCredentialsPayload.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_client'
                }
            }
        });

        const response = await request(app)
            .get(`${baseUrl}/token`)
            .set('Accept', 'application/json')
            .expect(401);

        expect(response.body.error).toEqual('TOKEN_FETCH_FAILED');
        expect(response.body.details.error).toEqual('invalid_client');
        expect(response.body.status).toEqual(401);
    });

    it('should return 500 when token fetch fails without spotify response', async () => {
        getSpotifyClientCredentialsPayload.mockRejectedValue(new Error('Unexpected error'));

        const response = await request(app)
            .get(`${baseUrl}/token`)
            .set('Accept', 'application/json')
            .expect(500);

        expect(response.body.error).toEqual('TOKEN_FETCH_FAILED');
        expect(response.body.details).toEqual({});
        expect(response.body.status).toEqual(500);
    });
});