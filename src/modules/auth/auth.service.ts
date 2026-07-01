import { pool } from "../../config/db";
import { hashPassword, comparePassword } from "../../common/utils/password";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendEmail } from "../email/email.service";
import { resetPasswordTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";
import { ensureCbrillianceVerificationColumns } from "../users/cbrillianceVerification.service";
//import { createNotification } from "../notifications/notification.service";
//import { creditWallet, debitWallet, getAdminWallet } from "../wallets/wallet.engine";
//import { getUserWallet } from "../wallets/wallet.service";
//import { sendOTPEmail, sendResetPasswordEmail } from "../../common/utils/email";


const JWT_SECRET = process.env.USER_JWT_SECRET;
const PASSWORD_RESET_MESSAGE = "If that email exists, a password reset link has been sent.";

const hashResetToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const getFrontendUrl = () => {
  return (process.env.FRONTEND_URL || "https://cbrixi.com").replace(/\/$/, "");
};

/*const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
}*/

export const signupUser = async (payload: {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  username: string;
}) => {
  const { firstname, lastname, username, email, password } = payload;
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Check if email or username already exists
    const emailCheck = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );

    if (emailCheck.rowCount) {
      throw new Error("Email already exists");
    }

    const userResult = await client.query(
      `INSERT INTO users (firstname, lastname, username, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, firstname, lastname, username, email`,
      [firstname, lastname, username, email, passwordHash]
    );
    

    const user = userResult.rows[0];

    await client.query("COMMIT");

    

  return {
    ...user,
    message: "Signup successful. Login to continue."
  };

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/*export const verifyEmailOTP = async (email: string, otp: string) => {
  const { rows } = await pool.query(
    `SELECT id, email_otp, email_otp_expire
     FROM users
     WHERE email = $1 AND email_verified = false`,
    [email]
  );

  if (!rows.length) throw new Error("Invalid request");

  const user = rows[0];

  if (user.email_otp !== otp) throw new Error("Invalid OTP");
  if (new Date() > user.email_otp_expire) throw new Error("OTP expired");

  await pool.query(
    `UPDATE users
     SET email_verified = true,
         email_otp = NULL,
         email_otp_expire = NULL
     WHERE id = $1`,
    [user.id]
  );

  return { message: "Email verified successfully" };
};
*/

export const loginUser = async (payload: {
    email: string;
    password: string;
}) => {
    const { email, password } = payload;

    const result = await pool.query(`
        SELECT id, email, password_hash
        FROM users
        WHERE email = $1`,
    [email]);


    if (result.rowCount === 0) {
        throw new Error('Invalid Credentials');
    }

    const user = result.rows[0];

    const valid = await comparePassword(password, user.password_hash);

    if (!valid) {
        throw new Error('Invalid Credentials');
    }

    const token = jwt.sign(
        { id: user.id }, JWT_SECRET as any, {expiresIn: '7d'}
    );

    return { token };
}

export const getUserById = async (userId: string) => {
    await ensureCbrillianceVerificationColumns();

    const result = await pool.query(`
        SELECT
          id,
          firstname,
          lastname,
          username,
          email,
          cbrilliance_email,
          cbrilliance_email_verified,
          cbrilliance_email_verified_at,
          created_at
        FROM users
        WHERE id = $1`,
    [userId]);

    if (result.rowCount === 0) {
        throw new Error('User not found');
    }

    return result.rows[0];
}

export const updateUserProfile = async (
  userId: string,
  payload: {
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
  }
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Optional: check email uniqueness
    if (payload.email) {
      const emailCheck = await client.query(
        `SELECT id FROM users WHERE email = $1 AND id != $2`,
        [payload.email, userId]
      );

      if (emailCheck.rowCount) {
        throw new Error("Email already in use");
      }
    }

    // Optional: check username uniqueness
    if (payload.username) {
      const usernameCheck = await client.query(
        `SELECT id FROM users WHERE username = $1 AND id != $2`,
        [payload.username, userId]
      );

      if (usernameCheck.rowCount) {
        throw new Error("Username already taken");
      }
    }

    const result = await client.query(
      `
      UPDATE users
      SET
        firstname = COALESCE($1, firstname),
        lastname = COALESCE($2, lastname),
        username = COALESCE($3, username),
        email = COALESCE($4, email),
        updated_at = now()
      WHERE id = $5
      RETURNING id, firstname, lastname, username, email
      `,
      [
        payload.firstname ?? null,
        payload.lastname ?? null,
        payload.username ?? null,
        payload.email ?? null,
        userId
      ]
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};


export const logoutUser = async () => {
  return { message: "Logged out successfully" };
};

export const forgotPassword = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  const { rows } = await pool.query(
    `SELECT id, email, firstname FROM users WHERE LOWER(email) = LOWER($1)`,
    [normalizedEmail]
  );

  if (!rows.length) {
    return { message: PASSWORD_RESET_MESSAGE };
  }

  const user = rows[0];
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiry = new Date(Date.now() + 15 * 60 * 1000);

  await pool.query(
    `UPDATE users
     SET reset_token = $1,
         reset_token_expires = $2,
         updated_at = now()
     WHERE id = $3`,
    [tokenHash, expiry, user.id]
  );

  const resetLink = `${getFrontendUrl()}/reset-password?token=${token}`;

  await sendEmail(
    user.id,
    null,
    null,
    user.email,
    "Reset your Cbrixi password",
    resetPasswordTemplate(user.firstname ?? "there", resetLink),
    EmailType.PASSWORD_RESET
  );

  return { message: PASSWORD_RESET_MESSAGE };
};

export const resetPassword = async (token: string, newPassword: string) => {
  const tokenHash = hashResetToken(token.trim());

  const { rows } = await pool.query(
    `SELECT id, reset_token_expires
     FROM users
     WHERE reset_token = $1`,
    [tokenHash]
  );

  if (!rows.length) {
    throw new Error("Invalid or expired reset token");
  }

  const user = rows[0];

  if (!user.reset_token_expires || new Date() > user.reset_token_expires) {
    throw new Error("Invalid or expired reset token");
  }

  const passwordHash = await hashPassword(newPassword);

  await pool.query(
    `UPDATE users
     SET password_hash = $1,
         reset_token = NULL,
         reset_token_expires = NULL,
         updated_at = now()
     WHERE id = $2`,
    [passwordHash, user.id]
  );

  return { message: "Password reset successful" };
};


export const deleteUserAccount = async (userId: string) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Optional: ensure user exists
    const check = await client.query(
      `SELECT id FROM users WHERE id = $1`,
      [userId]
    );

    if (!check.rowCount) {
      throw new Error("User not found");
    }

    // Delete user (wallets, game history etc cascade if FK set)
    await client.query(
      `DELETE FROM users WHERE id = $1`,
      [userId]
    );

    await client.query("COMMIT");

    return { message: "Account deleted successfully" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};


/*export const getMyReferralInfo = async (userId: string) => {
  const { rows: [user] } = await pool.query(
    `SELECT referral_code, referral_count FROM users WHERE id = $1`,
    [userId]
  );

  const { rows: totalRefsRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM users WHERE referred_by = $1`,
    [userId]
  );

  const { rows: totalEarnedRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS totalEarned
     FROM referral_rewards
     WHERE referrer_id = $1`,
    [userId]
  );

  return {
    referralCode: user.referral_code,
    referralCount: user.referral_count,
    totalEarned: Number(totalEarnedRows[0].totalEarned),
  };
};

export const getMyReferralRewards = async (userId: string) => {
  const { rows } = await pool.query(
    `SELECT id, amount, referred_user_id, phase, created_at
     FROM referral_rewards
     WHERE referrer_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows;
};
*/

/*export const getMyReferralSummary = async (userId: string) => {
  // 1️⃣ Get user info including referral count
  const { rows: [user] } = await pool.query(
    `SELECT referral_code, referral_count
     FROM users
     WHERE id = $1`,
    [userId]
  );

  // 2️⃣ Get total earned
  const { rows: totalEarnedRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_earned
     FROM referral_rewards
     WHERE referrer_id = $1`,
    [userId]
  );

  const totalEarned = Number(totalEarnedRows[0].total_earned);

  // 3️⃣ Get detailed referral rewards with referred user's info
  const { rows: rewards } = await pool.query(
    `SELECT rr.id,
            rr.amount,
            rr.phase,
            rr.created_at,
            u.id AS referred_user_id,
            u.name AS referred_user_name,
            u.username AS referred_user_username
     FROM referral_rewards rr
     JOIN users u ON rr.referred_user_id = u.id
     WHERE rr.referrer_id = $1
     ORDER BY rr.created_at DESC`,
    [userId]
  );

  return {
    referralCode: user.referral_code,
    referralCount: user.referral_count,
    totalEarned,
    rewards,
  };
};


export const resendEmailOTP = async (email: string) => {
  const { rows } = await pool.query(
    `SELECT id, email_verified FROM users WHERE email = $1`,
    [email]
  );

  if (!rows.length) return; // don't reveal user existence

  const user = rows[0];

  if (user.email_verified) {
    throw new Error("Email already verified");
  }

  const otp = generateOTP();
  const expiry = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `UPDATE users SET email_otp = $1, email_otp_expires = $2 WHERE id = $3`,
    [otp, expiry, user.id]
  );

  await sendOTPEmail(email, otp);

  return { message: "OTP resent successfully" };
};*/
