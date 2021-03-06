import { crawlContractReferences } from './crawl_contract_references';

const filters: Array<string> = process.argv.length === 3 ?
[process.argv.pop()!] : ['public/plugin.ts', 'server/plugin.ts'];

try {
  crawlContractReferences({ fileFilters: filters });
} catch (e) {
  process.exit(1);
}