export type EnhancedDate = {
  time: string;
  weekday: string;
  weekday_number: number;
  hour_of_day: number;
}

export enum ReleaseStatus {
 DONE = "Done",
 IN_PROGRESS = "In progress",
 NOT_STARTED = "Not started",
 BLOCKED = "Blocked"
}

export interface IssueDoc {
  priority_num: number;
  is_team_dependency: boolean;
  is_project_dependency: boolean;
  is_internal_request: boolean;
  needed_for: Array<string>;
  priority?: string;
  teams: Array<string>;
  features: Array<string>;
  loe?: string;
  id: string;
  projects: Array<string>;
  project_board?: string;
  project_board_column?: string;
  project_board_column_order?: number;
  release_target?: string;
  original_release_target?: string;
  previous_release_target?: string;
  release_status: ReleaseStatus;
  for_release_status: boolean;
  in_progress: boolean;
  is_prioritized: boolean;
  is_tech_debt: boolean;
  last_crawled_at: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  // Issue number. "Id" above is not the issue number.
  number: number;
  url: string;
  comment_count: number;
  created_at?: EnhancedDate;
  updated_at?: EnhancedDate;
  closed_at?: EnhancedDate;
  user: string;
  body: string;
  labels: Array<string>;
  is_pullrequest: boolean;
  assignees: Array<string>,
  time_to_fix?: number,
} 

export const issueMapping = {
  'release_status': { type: 'keyword' },
  'release_target': { type: 'keyword' },
  'owner': { type: 'keyword' },
  'project_board': { type: 'keyword' },
  'project_board_column': { type: 'keyword' },
  'project_board_order': { type: 'number' },
  'url': { type: 'keyword' },
  'is_tech_debt': { type: 'boolean' },
  'priority': { type: 'keyword' },
  'repo': { type: 'keyword' },
  'state': { type: 'keyword' },
  'title': { type: 'keyword' },
  'user': { type: 'keyword' },
};