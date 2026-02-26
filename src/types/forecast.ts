export type ForecastRunListItemDto = {
  id: string;
  runTimeUtc: Date;
  runTimeMsk: Date;
  targetDate: Date;
  horizon: string;
  createdAt: Date;
  counts: {
    modelForecasts: number;
    consensuses: number;
    edgeSignals: number;
  };
};

export type EdgeSignalsSummaryDto = {
  totalSignals: number;
  betCount: number;
  noBetCount: number;
  avgEdge: number;
  topPositiveEdges: Array<{
    rangeKey: string;
    edge: number;
    recommendation: string;
  }>;
};
