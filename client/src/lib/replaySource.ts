export const DEMO3_FUNCTIONAL_REPLAY_URL = "/manus-storage/demo3-functional.replay_ddfec7bd.json";

export function replaySourceUrl(apiUrl: string, reportId: string | null) {
  return reportId ? `${apiUrl}/v1/replays/${reportId}` : DEMO3_FUNCTIONAL_REPLAY_URL;
}
