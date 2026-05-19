const request = require('supertest');

jest.mock('axios');

const axios = require('axios');
const app = require('../../app');
const mongoose = require('mongoose');

describe('internal mcp', () => {

    const baseUrl = '/api/internal';
    const internalSecret = 'test-internal-secret';

    beforeAll(() => {
        process.env.MCP_INTERNAL_SECRET = internalSecret;
        process.env.TMDB_API_KEY = 'tmdb_test_key';
        process.env.SPOTIFY_CLIENT_ID = 'spotify_client_id_test';
        process.env.SPOTIFY_CLIENT_SECRET = 'spotify_client_secret_test';
        process.env.IGDB_CLIENT_ID = 'igdb_client_id_test';
        process.env.IGDB_CLIENT_SECRET = 'igdb_client_secret_test';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        delete process.env.MCP_INTERNAL_SECRET;
        delete process.env.TMDB_API_KEY;
        delete process.env.SPOTIFY_CLIENT_ID;
        delete process.env.SPOTIFY_CLIENT_SECRET;
        delete process.env.IGDB_CLIENT_ID;
        delete process.env.IGDB_CLIENT_SECRET;

        await mongoose.connection.close();
    });

    it('should get media catalog credentials', async () => {
        axios.post
            .mockResolvedValueOnce({
                data: {
                    access_token: 'spotify_access_token_test',
                    expires_in: 3600
                }
            })
            .mockResolvedValueOnce({
                data: {
                    access_token: 'igdb_access_token_test',
                    expires_in: 7200
                }
            });

        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('X-MCP-Internal-Secret', internalSecret)
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(response.body.tmdbApiKey).toEqual('tmdb_test_key');
        expect(response.body.spotifyAccessToken).toEqual('spotify_access_token_test');
        expect(response.body.spotifyExpiresIn).toEqual(3600);
        expect(response.body.igdbAccessToken).toEqual('igdb_access_token_test');
        expect(response.body.igdbClientId).toEqual('igdb_client_id_test');
        expect(response.body.igdbExpiresIn).toEqual(7200);
    });

    it('should not get media catalog credentials without internal secret', async () => {
        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('Accept', 'application/json')
            .expect(403);
        expect(response.body).toBeTruthy();
    });

    it('should not get media catalog credentials with invalid internal secret', async () => {
        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('X-MCP-Internal-Secret', 'wrong-secret')
            .set('Accept', 'application/json')
            .expect(403);

        expect(response.body).toBeTruthy();
    });

    it('should return null spotify credentials when spotify env variables are missing', async () => {
        delete process.env.SPOTIFY_CLIENT_ID;
        delete process.env.SPOTIFY_CLIENT_SECRET;

        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'igdb_access_token_test',
                expires_in: 7200
            }
        });

        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('X-MCP-Internal-Secret', internalSecret)
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(response.body.tmdbApiKey).toEqual('tmdb_test_key');
        expect(response.body.spotifyAccessToken).toEqual(null);
        expect(response.body.spotifyExpiresIn).toEqual(null);
        expect(response.body.igdbAccessToken).toEqual('igdb_access_token_test');
        expect(response.body.igdbClientId).toEqual('igdb_client_id_test');
        expect(response.body.igdbExpiresIn).toEqual(7200);

        process.env.SPOTIFY_CLIENT_ID = 'spotify_client_id_test';
        process.env.SPOTIFY_CLIENT_SECRET = 'spotify_client_secret_test';
    });

    it('should return null igdb credentials when igdb env variables are missing', async () => {
        delete process.env.IGDB_CLIENT_ID;
        delete process.env.IGDB_CLIENT_SECRET;

        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'spotify_access_token_test',
                expires_in: 3600
            }
        });

        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('X-MCP-Internal-Secret', internalSecret)
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(response.body.tmdbApiKey).toEqual('tmdb_test_key');
        expect(response.body.spotifyAccessToken).toEqual('spotify_access_token_test');
        expect(response.body.spotifyExpiresIn).toEqual(3600);
        expect(response.body.igdbAccessToken).toEqual(null);
        expect(response.body.igdbClientId).toEqual(null);
        expect(response.body.igdbExpiresIn).toEqual(null);

        process.env.IGDB_CLIENT_ID = 'igdb_client_id_test';
        process.env.IGDB_CLIENT_SECRET = 'igdb_client_secret_test';
    });

    it('should return null spotify credentials when spotify request fails', async () => {
        axios.post
            .mockRejectedValueOnce({
                response: {
                    data: {
                        error: 'invalid_client'
                    }
                }
            })
            .mockResolvedValueOnce({
                data: {
                    access_token: 'igdb_access_token_test',
                    expires_in: 7200
                }
            });

        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('X-MCP-Internal-Secret', internalSecret)
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(response.body.spotifyAccessToken).toEqual(null);
        expect(response.body.spotifyExpiresIn).toEqual(null);
        expect(response.body.igdbAccessToken).toEqual('igdb_access_token_test');
        expect(response.body.igdbExpiresIn).toEqual(7200);
    });

    it('should return null igdb credentials when twitch request fails', async () => {
        axios.post
            .mockResolvedValueOnce({
                data: {
                    access_token: 'spotify_access_token_test',
                    expires_in: 3600
                }
            })
            .mockRejectedValueOnce({
                response: {
                    data: {
                        message: 'invalid client'
                    }
                }
            });

        const response = await request(app)
            .get(`${baseUrl}/mcp/media-catalog-credentials`)
            .set('X-MCP-Internal-Secret', internalSecret)
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.ok).toBe(true);
        expect(response.body.spotifyAccessToken).toEqual('spotify_access_token_test');
        expect(response.body.spotifyExpiresIn).toEqual(3600);
        expect(response.body.igdbAccessToken).toEqual(null);
        expect(response.body.igdbExpiresIn).toEqual(null);
    });
});