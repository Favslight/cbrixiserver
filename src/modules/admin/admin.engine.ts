import { PoolClient } from "pg";

export const getAdminByEmail = async (
    client : PoolClient,
    email : string
) => {
    const res = await client.query(
        `SELECT id, email, password_hash, role
        FROM admin_users
        WHERE email = $1`,
        [email]
    )
    return res.rows[0];
}