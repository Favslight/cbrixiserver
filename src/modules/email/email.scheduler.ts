import cron from "node-cron";
import { pool } from "../../config/db";
import { sendEmail } from "./email.service";
import { installmentReminderTemplate } from "./email.templates";
import { EmailType } from "./email.types";

export const startInstallmentReminderJob = () => {

  cron.schedule("0 9 * * *", async () => {

    const result = await pool.query(`
      SELECT 
        i.id as installment_id,
        i.amount,
        i.due_date,
        o.id as order_id,
        u.id as user_id,
        u.email,
        u.firstname
      FROM installments i
      JOIN orders o ON o.id = i.order_id
      JOIN users u ON u.id = o.user_id
      WHERE i.status='PENDING'
      AND i.due_date = CURRENT_DATE + INTERVAL '3 days'
    `);

    for (const row of result.rows) {

      await sendEmail(
        row.user_id,
        row.order_id,
        row.installment_id,
        row.email,
        "Installment Payment Reminder",
        installmentReminderTemplate(
          row.firstname,
          row.amount,
          row.due_date
        ),
        EmailType.INSTALLMENT_REMINDER
      );

    }

  });

};