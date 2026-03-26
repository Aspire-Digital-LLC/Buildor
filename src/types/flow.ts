export interface Flow {
  name: string;
  description: string;
  stages: Stage[];
}

export interface Stage {
  id: string;
  name: string;
  icon: string;
  model: 'opus' | 'sonnet' | 'haiku';
  description: string;
  requirements: string[];
  restrictions: string[];
  skills: string[];
  readContext: string[];
  autonomous: boolean;
  skippable: boolean;
  planMode: boolean;
  dependencies: string[];
  parallelOptional: string[];
}

export interface StageConfig {
  id: string;
  position: { x: number; y: number };
  data: Stage;
}

export interface StageConnection {
  source: string;
  target: string;
}

export type FlowExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface FlowExecution {
  flowName: string;
  status: FlowExecutionStatus;
  currentStage: string | null;
  completedStages: string[];
  failedStages: string[];
}
