const request = require('supertest');

jest.mock('../../utils/sendMail', () => ({
    sendEmail: jest.fn().mockResolvedValue(true),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    generateVerificationCode: jest.fn(() => '123456')
}));

const app = require('../../app');
const { UserModel } = require('../../models');

describe('users', () => {

    const baseUrl = '/api/users';

    let token = "";
    let id = "";
    let resetToken = "";

    afterAll(async () => {
        await UserModel.deleteMany({
            email: {
                $in: [
                    'user25@test.com',
                    'noam@test.com'
                ]
            }
        });
    });

    it('should register a user', async () => {
        const response = await request(app)
            .post(`${baseUrl}/register`)
            .send({
                name: "Menganito",
                email: "user25@test.com",
                password: "HolaMundo.01",
                confirmPassword: "HolaMundo.01",
                birthdate: "2000-01-01"
            })
            .set('Accept', 'application/json')
            .expect(201);

        expect(response.body.user.email).toEqual('user25@test.com');
        expect(response.body.user.name).toEqual('Menganito');
        expect(response.body.user.validated_email).toBe(false);
        expect(response.body.message).toEqual('User registered. Please verify your email.');

        id = response.body.user._id;
    });

    it('should not login a user with unverified email', async () => {
        const response = await request(app)
            .post(`${baseUrl}/login`)
            .send({
                email: "user25@test.com",
                password: "HolaMundo.01"
            })
            .set('Accept', 'application/json')
            .expect(403);

        expect(response.body.message).toEqual('Email not verified');
    });

    it('should verify user email', async () => {
        const response = await request(app)
            .post(`${baseUrl}/verify-email`)
            .send({
                email: "user25@test.com",
                code: "123456"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Email verified successfully');
    });

    it('should login a user', async () => {
        const response = await request(app)
            .post(`${baseUrl}/login`)
            .send({
                email: "user25@test.com",
                password: "HolaMundo.01"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.user.email).toEqual('user25@test.com');

        token = response.body.token;
        id = response.body.user._id;
    });

    it('should update a user', async () => {
        const response = await request(app)
            .patch(`${baseUrl}/update`)
            .auth(token, { type: 'bearer' })
            .send({
                name: "Noam",
                email: "noam@test.com",
                birthdate: "2001-02-02"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.name).toEqual('Noam');
        expect(response.body.email).toEqual('noam@test.com');
    });

    it('should resend verification code to an unverified user', async () => {
        await UserModel.findByIdAndUpdate(id, {
            email: 'user25@test.com',
            validated_email: false
        });

        const response = await request(app)
            .post(`${baseUrl}/resend-verification-code`)
            .send({
                email: "user25@test.com"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Verification code sent');
    });

    it('should send password reset email', async () => {
        await UserModel.findByIdAndUpdate(id, {
            email: 'user25@test.com',
            validated_email: true
        });

        const response = await request(app)
            .post(`${baseUrl}/forgot-password`)
            .send({
                email: "user25@test.com"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Si el email existe, se enviará un correo con instrucciones para restablecer tu contraseña.');

        const user = await UserModel.findOne({ email: 'user25@test.com' });
        expect(user.resetPasswordToken).toBeTruthy();

        resetToken = user.resetPasswordToken;
    });

    it('should check password reset token', async () => {
        const response = await request(app)
            .get(`${baseUrl}/check-reset-token`)
            .query({ token: resetToken })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Valid password reset token');
    });

    it('should reset password', async () => {
        const response = await request(app)
            .post(`${baseUrl}/reset-password`)
            .send({
                token: resetToken,
                newPassword: "HolaMundo.02"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('Password reset successfully. You can now log in with your new password.');
    });

    it('should login a user with new password', async () => {
        const response = await request(app)
            .post(`${baseUrl}/login`)
            .send({
                email: "user25@test.com",
                password: "HolaMundo.02"
            })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.user.email).toEqual('user25@test.com');

        token = response.body.token;
    });

    it('should delete a user', async () => {
        const response = await request(app)
            .delete(`${baseUrl}/delete`)
            .auth(token, { type: 'bearer' })
            .set('Accept', 'application/json')
            .expect(200);

        expect(response.body.message).toEqual('User deleted');
    });
});