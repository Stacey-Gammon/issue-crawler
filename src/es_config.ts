import { ClientOptions } from "@elastic/elasticsearch";

if (!process.env.GITHUB_OAUTH_TOKEN || !process.env.ES_HOST || !process.env.ES_AUTH || !process.env.ES_USERNAME || !process.env.ES_PASSWORD) {
	throw new Error('You need to specify GITHUB_OAUTH_TOKEN, ES_HOST and ES_AUTH env variables.');
}

export const elasticsearchEnv: ClientOptions = {
	auth: {
	  username: process.env.ES_USERNAME,
	  password: process.env.ES_PASSWORD
  },
  node: process.env.ES_HOST
};
