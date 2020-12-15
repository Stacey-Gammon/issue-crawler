
import { crawlContractReferences } from '../reference_crawler/contract_reference_crawler/crawl_contract_references';
import { crawlStaticReferences } from '../reference_crawler/static_reference_crawler/crawl_static_references';
import { crawlContractApi } from './contract_api_crawler/crawl_contract_api';
import { crawlStaticApi } from './static_api_crawler/crawl_static_api';

const filters: Array<string> = process.argv.length === 3 ?
[process.argv.pop()!] : ['public/plugin.ts', 'server/plugin.ts'];


const run = async () => {
  try {
    await crawlContractReferences({ fileFilters: filters });
    await crawlStaticReferences();
    await crawlStaticApi();
    await crawlContractApi();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();