export const repo = "elastic/kibana";

export const checkoutDates: Array<string | undefined> = [
   undefined,
];

if (process.env.CHECKOUT_DATES) {
  const dates = process.env.CHECKOUT_DATES.split(',');
  checkoutDates.push(...dates);
}
