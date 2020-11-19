import { getIndexName } from "../es_utils";

export const repo = "elastic/kibana";

export const checkoutDates: Array<string | undefined> = [
   undefined,
];

export const apiIndexName = getIndexName('api', repo);

if (process.env.CHECKOUT_DATES) {
  const dates = process.env.CHECKOUT_DATES.split(',');
  checkoutDates.push(...dates);
}
