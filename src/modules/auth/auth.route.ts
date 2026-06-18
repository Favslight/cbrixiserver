import { FastifyInstance } from "fastify";
import {
  signupUser,
  loginUser,
  updateUserProfile,
  getUserById,
  logoutUser,
  forgotPassword,
  resetPassword
} from "./auth.service";

export const authRoutes = async (app: FastifyInstance) => {

  app.post("/signup", async (request, reply) => {
    const user = await signupUser(request.body as any);
    reply.code(201).send(user);
  });


  app.post("/login", async (request, reply) => {
    const result = await loginUser(request.body as any);
    reply.send(result);
  });

  app.post("/forgot-password", async (request, reply) => {
    const { email } = request.body as { email?: string };

    if (!email || typeof email !== "string") {
      return reply.code(400).send({ message: "Email is required" });
    }

    const result = await forgotPassword(email);
    return reply.send(result);
  });

  app.post("/reset-password", async (request, reply) => {
    const { token, password } = request.body as {
      token?: string;
      password?: string;
    };

    if (!token || typeof token !== "string") {
      return reply.code(400).send({ message: "Reset token is required" });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return reply.code(400).send({
        message: "Password must be at least 8 characters"
      });
    }

    const result = await resetPassword(token, password);
    return reply.send(result);
  });

  app.get("/profile",
  { preHandler: [app.authenticate] }, 
  async (request, reply) => {
    const userId = request.user.id;
    const result = await getUserById(userId);
    reply.send(result);
  }
);

app.put(
  "/profile",
  { preHandler: [app.authenticate] },
  async (request, reply) => {
    const userId = request.user.id;

    const { firstname, lastname, username, email } = request.body as {
      firstname?: string;
      lastname?: string;
      username?: string;
      email?: string;
    };

    const updatedUser = await updateUserProfile(userId, {
      firstname,
      lastname,
      username,
      email
    });

    return reply.send({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });
  }
);

app.post(
  "/logout",
  { preHandler: [app.authenticate] },
  async () => {
    return logoutUser();
  }
);
}
