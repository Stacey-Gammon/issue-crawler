
import { crawlContractApi } from './crawl_contract_api';

try {
  crawlContractApi();
} catch (e) {
  console.error(e);
  process.exit(1);
}