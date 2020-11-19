export const repo = "elastic/kibana";

export function getCheckoutDates() {
  return process.env.CHECKOUT_DATES ? process.env.CHECKOUT_DATES.split(', ') : [undefined]
}