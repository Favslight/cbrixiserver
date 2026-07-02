const money = (amount: number) => `NGN ${Number(amount).toLocaleString("en-NG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

export const orderCreatedTemplate = (
  firstname: string,
  amount: number,
  paymentMode = "FULL",
  depositAmount?: number,
  awaitingInstallmentApproval = paymentMode === "INSTALLMENT"
) => `
Hello ${firstname},

Your order has been created successfully.

Total Order Amount: ${money(amount)}
${paymentMode === "INSTALLMENT"
  ? awaitingInstallmentApproval
    ? `
Installment request status: Pending admin approval
Deposit required after approval: ${money(Number(depositAmount ?? 0))}

We will email you once your Cbrilliance email has been verified. Payment details will become available on your dashboard after approval.
`
    : `
Installment request status: Approved
Deposit to pay now: ${money(Number(depositAmount ?? 0))}

Please continue from your dashboard to make the deposit payment.
`
  : ""}

Thank you.
`;

export const orderApprovedTemplate = (
  firstname: string,
  amount: number,
  depositAmount: number,
  externalEmail?: string
) => `
Hello ${firstname},

Your installment order has been approved.

Verified Cbrilliance Email: ${externalEmail ?? "Not provided"}
Total Order Amount: ${money(amount)}
Deposit To Pay Now: ${money(depositAmount)}

Please continue from your dashboard to make the deposit payment. Your remaining balance and future installment dates will be shown there.

Thank you.
`;

export const orderRejectedTemplate = (firstname: string, externalEmail?: string) => `
Hello ${firstname},

Your installment order was rejected because the Cbrilliance email submitted for verification does not exist on the Cbrilliance portal.

Submitted Email: ${externalEmail ?? "Not provided"}

Please provide the correct Cbrilliance email or open an account on cbrilliance.io, then place the installment request again.
`;

export const paymentSuccessTemplate = (firstname: string, amount: number) => `
Hello ${firstname},

Your payment of ${money(amount)} was received successfully.

Thank you for your payment.
`;

export const invoiceTemplate = (firstname: string, invoice: string, amount: number) => `
Hello ${firstname},

Please make a bank transfer using the following details.

Invoice: ${invoice}
Amount: ${money(amount)}

Make sure you include the invoice number in your transfer description.
`;

export const installmentReminderTemplate = (
  name: string,
  amount: number,
  dueDate: string
) => `
Hello ${name},

This is a reminder that your installment payment of ${money(amount)} is due on ${dueDate}.

Please make payment before the due date to avoid penalties.
`;

export const resetPasswordTemplate = (firstname: string, resetLink: string) => `
Hello ${firstname},

We received a request to reset your Cbrixi password.

Use this link to create a new password:
${resetLink}

This link expires in 15 minutes. If you did not request this, you can ignore this email.
`;

export const referralBonusEarnedTemplate = (
  firstname: string,
  referredName: string,
  rewardAmount: number,
  purchaseAmount: number,
  percentage: number
) => `
Hello ${firstname},

You earned a referral bonus.

Referred Customer: ${referredName}
Confirmed Purchase Amount: ${money(purchaseAmount)}
Referral Percentage: ${percentage}%
Bonus Earned: ${money(rewardAmount)}

You can view your referral balance from your dashboard.
`;

export const referralPayoutRequestedTemplate = (
  firstname: string,
  amount: number,
  bankName: string,
  accountName: string,
  accountNumber: string
) => `
Hello ${firstname},

Your referral payout request has been received.

Amount Requested: ${money(amount)}
Bank Name: ${bankName}
Account Name: ${accountName}
Account Number: ${accountNumber}

We will notify you after admin sends the payout and approves the request.
`;

export const referralPayoutRequestedAdminTemplate = (
  userName: string,
  userEmail: string,
  amount: number,
  bankName: string,
  accountName: string,
  accountNumber: string
) => `
Hello Admin,

A referral payout request is pending.

User: ${userName}
Email: ${userEmail}
Amount: ${money(amount)}
Bank Name: ${bankName}
Account Name: ${accountName}
Account Number: ${accountNumber}

Please send the payout, then approve the request from the admin dashboard.
`;

export const referralPayoutApprovedTemplate = (
  firstname: string,
  amount: number
) => `
Hello ${firstname},

Your referral payout of ${money(amount)} has been approved.

Thank you.
`;
