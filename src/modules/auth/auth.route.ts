import { FastifyInstance } from "fastify";
import { signupUser, loginUser, updateUserProfile, getUserById, logoutUser } from "./auth.service";

export const authRoutes = async (app: FastifyInstance) => {

  app.post("/signup", async (request, reply) => {
    const user = await signupUser(request.body as any);
    reply.code(201).send(user);
  });


  app.post("/login", async (request, reply) => {
    const result = await loginUser(request.body as any);
    reply.send(result);
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