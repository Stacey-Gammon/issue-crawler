
import { crawlStaticApi } from './crawl_static_api';

try {
  crawlStaticApi();
} catch (e) {
  console.error(e);
  process.exit(1);
}