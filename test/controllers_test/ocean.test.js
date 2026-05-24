const request = require('supertest');
const mongoose = require('mongoose');

jest.spyOn(mongoose, 'startSession').mockRejectedValue(
    new Error('Transactions unavailable in test environment')
);

jest.mock('../../services/ai', () => ({
    isGeminiConfigured: jest.fn(() => true),
    generateArtisticDescription: jest.fn().mockResolvedValue({
        profile: 'Explorador creativo',
        description: 'Perfil artístico generado para testing',
        recommendations: ['Arte contemporáneo', 'Cine de autor'],
        suggestedWorks: []
    })
}));

const app = require('../../app');
const { UserModel, OceanModel } = require('../../models');
const { encryptPassword } = require('../../utils/handlePassword');
const { tokenSign } = require('../../utils/handleJwt');
const ai = require('../../services/ai');

describe('ocean', () => {

    const baseUrl = '/api/ocean';

    let token = "";
    let userId = "";

    const scores = {
        openness: {
            total: 4.2
        },
        conscientiousness: {
            total: 3.8
        },
        extraversion: {
            total: 3.5
        },
        agreeableness: {
            total: 4.1
        },
        neuroticism: {
            total: 2.4
        }
    };

    beforeAll(async () => {
        await OceanModel.deleteMany({});
        await UserModel.deleteMany({
            email: 'oceanuser@test.com'
        });

        const password = await encryptPassword('HolaMundo.01');

        const user = await UserModel.create({
            name: 'Ocean User',
            email: 'oceanuser@test.com',
            password,
            validated_email: true
        });

        userId = user._id.toString();
        token = tokenSign(user);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await OceanModel.deleteMany({});
        await UserModel.deleteMany({
            email: 'oceanuser@test.com'
        });

        await mongoose.connection.close();
    });

    it('should save ocean test results', async () => {
        const response = await request(app)
            .post(baseUrl)
            .auth(token, { type: 'bearer' })
            .send({
                entityType: 'user',
                entityId: userId,
                scores,
                totalScore: 18,
                testType: 'quick',
                responseScale: 'ipip_1_5',
                scoreMetric: 'ipip_mean_1_5'
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Resultados del test guardados correctamente');
        expect(response.body.data.entityType).toEqual('user');
        expect(response.body.data.entityId).toEqual(userId);
        expect(response.body.data.testType).toEqual('quick');
        expect(response.body.data.responseScale).toEqual('ipip_1_5');
        expect(response.body.data.scoreMetric).toEqual('ipip_mean_1_5');
        expect(response.body.data.totalScore).toEqual(18);
        expect(response.body.data.dimensions.openness).toEqual(4.2);
        expect(response.body.data.scores.openness.total).toEqual(4.2);
    });

    it('should get ocean test results by entity type and entity id', async () => {
        const response = await request(app)
            .get(`${baseUrl}/user/${userId}`)
            .auth(token, { type: 'bearer' })
            .set('Accept', 'application/json')
            .expect(200);
        
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data[0].entityType).toEqual('user');
        expect(response.body.data[0].entityId).toEqual(userId);
        expect(response.body.data[0].testType).toEqual('quick');
        expect(response.body.data[0].dimensions.openness).toEqual(4.2);
    });

    it('should get all ocean test results from a user', async () => {
        const response = await request(app)
            .get(`${baseUrl}/user/${userId}`)
            .auth(token, { type: 'bearer' })
            .set('Accept', 'application/json')
            .expect(200);

        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data[0].entityType).toEqual('user');
        expect(response.body.data[0].entityId).toEqual(userId);
        expect(response.body.data[0].scores.openness.total).toEqual(4.2);
    });

    it('should update ocean test results', async () => {
        const response = await request(app)
            .post(baseUrl)
            .auth(token, { type: 'bearer' })
            .send({
                entityType: 'user',
                entityId: userId,
                scores: {
                    openness: {
                        total: 4.8
                    },
                    conscientiousness: {
                        total: 4.0
                    },
                    extraversion: {
                        total: 3.1
                    },
                    agreeableness: {
                        total: 4.3
                    },
                    neuroticism: {
                        total: 2.0
                    }
                },
                totalScore: 18.2,
                testType: 'quick',
                responseScale: 'ipip_1_5',
                scoreMetric: 'ipip_mean_1_5'
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Resultados del test guardados correctamente');
        expect(response.body.data.entityType).toEqual('user');
        expect(response.body.data.entityId).toEqual(userId);
        expect(response.body.data.scores.openness.total).toEqual(4.8);
        expect(response.body.data.totalScore).toEqual(18.2);
    });

    it('should generate artistic description', async () => {
        const response = await request(app)
            .post(`${baseUrl}/user/${userId}/artistic-description`)
            .auth(token, { type: 'bearer' })
            .send({})
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Descripción artística generada correctamente');
        expect(response.body.data.profile).toEqual('Explorador creativo');
        expect(response.body.data.description).toEqual('Perfil artístico generado para testing');
        expect(response.body.data._meta.promptVersion).toEqual('v5-no-genre-object');
        expect(response.body.regenerated).toBe(true);

        expect(ai.generateArtisticDescription).toHaveBeenCalled();
    });

    it('should get artistic description from storage when it already exists', async () => {
        const response = await request(app)
            .post(`${baseUrl}/user/${userId}/artistic-description`)
            .auth(token, { type: 'bearer' })
            .send({})
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Descripción artística obtenida desde almacenamiento');
        expect(response.body.data.profile).toEqual('Explorador creativo');
        expect(response.body.regenerated).toBe(false);
    });

    it('should not save ocean test results without token', async () => {
        const response = await request(app)
            .post(baseUrl)
            .send({
                entityType: 'user',
                entityId: userId,
                scores,
                totalScore: 18
            })
            .set('Accept', 'application/json')
            .expect(401);

        expect(response.body).toBeTruthy();
    });

    it('should not save ocean test results with invalid entity type', async () => {
        const response = await request(app)
            .post(baseUrl)
            .auth(token, { type: 'bearer' })
            .send({
                entityType: 'movie',
                entityId: userId,
                scores,
                totalScore: 18
            })
            .set('Accept', 'application/json')
            .expect(400);

        expect(response.body).toBeTruthy();
    });

    it('should not save ocean test results with invalid scores', async () => {
        const response = await request(app)
            .post(baseUrl)
            .auth(token, { type: 'bearer' })
            .send({
                entityType: 'user',
                entityId: userId,
                scores: {
                    openness: {
                        total: 4.2
                    }
                },
                totalScore: 4.2
            })
            .set('Accept', 'application/json')
            .expect(400);

        expect(response.body).toBeTruthy();
    });

    it('should delete ocean test results', async () => {
        const response = await request(app)
            .delete(`${baseUrl}/user/${userId}`)
            .auth(token, { type: 'bearer' })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Resultados del test eliminados correctamente');
    });

    it('should not get deleted ocean test results', async () => {
        const response = await request(app)
            .get(`${baseUrl}/user/${userId}`)
            .auth(token, { type: 'bearer' })
            .set('Accept', 'application/json')
            .expect(200);
        expect(response.body).toBeTruthy();
    });
});