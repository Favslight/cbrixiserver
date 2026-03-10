import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { getAdminByEmail } from './admin.engine';

const JWT_SECRET = process.env.JWT_SECRET!;

export const adminLoginService = async (
    email : string,
    password : string
) => {
    const client = await pool.connect();

    try {
        const admin = await getAdminByEmail(client, email);

        if (!admin) {
            throw new Error('Admin user not found');
        }

        const valid = await bcrypt.compare(password, admin.password_hash);

        if (!valid) {
            throw new Error('Invalid password');
        }

        const token = jwt.sign(
            {
                id: admin.id,
                role: admin.role
            },
            JWT_SECRET!,
            {
                expiresIn: '9h'
            }
        )
        return{ 
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role
            }
        };
    } finally {
        client.release();
    }
}