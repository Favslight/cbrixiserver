export const orderCreatedTemplate = (firstname: string, amount: number) => `
Hello ${firstname},

Your order has been created successfully.

Total Order Amount: ₦${amount}

Thank you.
`;

export const orderApprovedTemplate = (firstname: string, amount: number) => `
Hello ${firstname},
Your order has been approved by our admin team.

Total Order Amount: ₦${amount}

Thank you.
`;

export const orderRejectedTemplate = (firstname: string) => `
Hello ${firstname},
We regret to inform you that your order has been rejected by our admin team.

Please contact support for more information.
`;


export const paymentSuccessTemplate = (firstname: string, amount: number) => `
Hello ${firstname},

Your payment of ₦${amount} was received successfully.

Thank you for your payment.
`;

export const invoiceTemplate = (firstname: string, invoice: string, amount: number) => `
Hello ${firstname},

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