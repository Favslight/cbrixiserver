import axios from "axios";
import { pool } from "../../config/db";
import { requireUser } from "../auth/user.auth";
import { FastifyReply } from "fastify";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export const initializePaystackPayment = async (
    email: string,
  amount: number,
  reference: string
) => {

console.log({
  //email,
  amount,
  paystackAmount: Math.round(amount * 100),
  reference
});
    
  const res = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      email,
      amount: Math.round(amount * 100),
      reference
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log({
  email,
  amount,
  paystackAmount: Math.round(amount * 100),
  reference
});

  return res.data.data;
};

export const verifyPaystackPayment = async (reference: string) => {

  const res = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`
      }
    }
  );

  return res.data.data;
};