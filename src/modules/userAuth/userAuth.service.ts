import axios from "axios";
import jwt from "jsonwebtoken";
import { pool } from "../../config/db";

const KNOWRIST_API = "https://api.knowrist.com/auth/login";

export const loginUser = async (email: string, password: string) => {

  // Step 1: call external API
  const response = await axios.post(KNOWRIST_API, {
    email,
    password
  });

  const externalUser = response.data.user;

  if (!externalUser) {
    throw new Error("Invalid credentials");
  }

  const externalId = externalUser.id;

  // Step 2: check if user exists locally
  let user = await pool.query(
    `SELECT * FROM users WHERE external_user_id=$1`,
    [externalId]
  );

  // Step 3: create local user if not exists
  if (!user.rows[0]) {

    user = await pool.query(
      `
      INSERT INTO users
      (external_user_id, firstname, lastname, email)
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [
        externalId,
        externalUser.firstname,
        externalUser.lastname,
        externalUser.email
      ]
    );

  }

  const localUser = user.rows[0];

  // Step 4: create store token
  const token = jwt.sign(
    {
      id: localUser.id,
      external_user_id: externalId
    },
    process.env.USER_JWT_SECRET!,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: localUser
  };
};