export const repo = "elastic/kibana";

export const checkoutDates: Array<string | undefined> = [
   undefined,
  //  "2020-11-01 00:00:00",
  //  "2020-10-01 00:00:00",
  //  "2020-09-01 00:00:00",
  //  "2020-08-01 00:00:00",
  //  "2020-07-01 00:00:00",
  //  "2020-06-01 00:00:00",
  //  "2020-05-01 00:00:00",
  //  "2020-04-01 00:00:00",
  //  "2020-03-01 00:00:00",
  //  "2020-02-01 00:00:00",
  //  "2020-01-01 00:00:00",
  //  "2019-06-01 00:00:00",
  // "2019-01-01 00:00:00",
];

if (process.env.CHECKOUT_DATES) {
  const dates = process.env.CHECKOUT_DATES.split(',');
  checkoutDates.push(...dates);
}
