import "@fastify/jwt";
import { FastifyInstance, FastifyRequest } from "fastify";
import { int } from "zod";


declare module "fastify" {
    interface FastifyInstance {
        authenticate: any;
        adminAuthenticate: any;
    }

    interface FastifyRequest {
        admin?: {
            id: string;
            email: string;
            role: "ADMIN" | "MAIN_ADMIN" | "SUPER_ADMIN";
        }
    }

    interface FastifyRequest {
    user: {
      id: string;
      firstname: string;
      lastname: string;
      username: string;
      email: string;
    };
  }

    interface FastifyRequest {
    adminJwt: {
      verify: (request: FastifyRequest) => Promise<any>;
    };
  }

  interface FastifyRequest {
    user?: {
      id: string;
      external_user_id: string;
    };
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      id: string;
      email: string;
    };
  }
}