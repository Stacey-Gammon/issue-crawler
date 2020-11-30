export const repo = "elastic/kibana";

export function getCheckoutDates() {
  return process.env.CHECKOUT_DATES ? process.env.CHECKOUT_DATES.split(',').map(d => d.trim()) : [undefined]
}

