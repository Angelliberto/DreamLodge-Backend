const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const tokenDoctor = (doctor) => {
    const sign = jwt.sign(
        {
            _id: doctor._id
        },
        JWT_SECRET,
        {
            expiresIn: "4h"
        }
    )
    return sign
}

const patientTokenSign = (patient) => {
    const patientSign = jwt.sign(
        {
            _id: patient._id || patient.id,
            role: "patient"
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
    return patientSign;
};

const adminToken = (admin) => {
    const sign = jwt.sign(
        {
            _id: admin._id,
            employeeId: admin.employeeId,
            role: "admin"
        },
        JWT_SECRET,
        {
            expiresIn: "4h"
        }
    )
    return sign
}

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error("Error verifying token:\n", error);
        return null;
    }
};

module.exports = {
    patientTokenSign,
    verifyToken, tokenDoctor, adminToken
};


