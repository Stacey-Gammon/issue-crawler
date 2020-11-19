import { IssuesListForRepoResponseData } from "@octokit/types";
import { extractValue, findLabel } from "../utils";
import { ProjectInfo } from "./get_projects";
import { ReleaseStatus } from "./issue_doc";

export function extractReleaseStatus(raw: IssuesListForRepoResponseData[0], projectInfo?: ProjectInfo): ReleaseStatus {
  if (raw.state != 'open') {
    return ReleaseStatus.DONE;
  }

  // Eventually we may want to switch this to "Status:InProgress" or "Status:Blocked".
  if (findLabel(raw.labels, 'blocked')) {
    return ReleaseStatus.BLOCKED
  }

  // Two ways to indicate an issue is "in progress". Many teams use "in progress" project
  // columns. We'd like to support a "Status:InProgress" label as well, for the teams
  // that don't use project boards.
  const status = extractValue(raw.labels, 'Status');
  if (status === 'InProgress' ||
      projectInfo?.stage.toLowerCase().indexOf("progress")) {
    return ReleaseStatus.IN_PROGRESS;
  }

  // In the absense of all the above, consider the issue not started.
  return ReleaseStatus.NOT_STARTED;
} 