export const repos = [
	'elastic/kibana',
  'elastic/kibana-team',
];

export const privateRepos = (process.env.PRIVATE_REPOS || '').split(',').filter(val => Boolean(val));

if (!process.env.GITHUB_OAUTH_TOKEN || !process.env.ES_HOST || !process.env.ES_AUTH) {
	throw new Error('You need to specify GITHUB_OAUTH_TOKEN, ES_HOST and ES_AUTH env variables.');
}

export const githubAuth = process.env.GITHUB_OAUTH_TOKEN;

export const elasticsearchEnv = {
	host: process.env.ES_HOST,
	httpAuth: process.env.ES_AUTH
};


export const codeRepos = [
  {
    repo: "elastic/kibana",
    checkouts: ["master"],
    
  }
];

if (!process.env.ES_HOST || !process.env.ES_AUTH) {
  throw new Error("You need to specify ES_HOST and ES_AUTH env variables.");
}
