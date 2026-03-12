// src/modules/userAuth/userAuth.service.ts
/*import axios from "axios";
import jwt from "jsonwebtoken";
import { pool } from "../../config/db";

const KNOWRIST_API = "https://api.knowrist.com/auth/login";

export const loginUser = async (email: string, password: string) => {

  console.log("LOGIN PAYLOAD:", { email, password });

  const response = await axios.post(
    KNOWRIST_API,
    { email, password },
    { headers: { "Content-Type": "application/json" } }
  );

  console.log("KNOWRIST RESPONSE:", response.data);

  const knowristToken = response.data.token;

  const profileResponse = await axios.get(
  "https://api.knowrist.com/auth/profile",
  {
    headers: {
      Authorization: `Bearer ${knowristToken}`
    }
  }
);

const externalUser = profileResponse.data;

  if (!knowristToken) {
    throw new Error("Invalid credentials");
  }

  // decode knowrist token
  const decoded: any = jwt.decode(knowristToken);

  const externalId = decoded.id;

  if (!externalId) {
    throw new Error("Invalid user data");
  }

  // check local user
  let user = await pool.query(
  `SELECT * FROM users WHERE external_user_id=$1`,
  [externalId]
);

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
      externalUser.name,
      externalUser.username,
      externalUser.email
    ]
  );

}

  const localUser = user.rows[0];

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
};*/