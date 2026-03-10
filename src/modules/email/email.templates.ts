export const orderCreatedTemplate = (name: string, amount: number) => `
Hello ${name},

Your order has been created successfully.

Total Order Amount: ₦${amount}

Thank you.
`;

export const paymentSuccessTemplate = (name: string, amount: number) => `
Hello ${name},

Your payment of ₦${amount} was received successfully.

Thank you for your payment.
`;

export const invoiceTemplate = (name: string, invoice: string, amount: number) => `
Hello ${name},

Please make a bank transfer using the following details.

Invoice: ${invoice}
Amount: ₦${amount}

Make sure you include the invoice number in your transfer description.
`;

export const installmentReminderTemplate = (
  name: string,
  amount: number,
  dueDate: string
) => `
Hello ${name},

This is a reminder that your installment payment of ₦${amount} is due on ${dueDate}.

Please make payment before the due date to avoid penalties.
`;