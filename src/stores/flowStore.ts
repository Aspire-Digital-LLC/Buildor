import { create } from 'zustand';
import type { Flow, FlowExecution } from '@/types';

interface FlowState {
  flows: Flow[];
  activeExecution: FlowExecution | null;
  setFlows: (flows: Flow[]) => void;
  setActiveExecution: (execution: FlowExecution | null) => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  flows: [],
  activeExecution: null,
  setFlows: (flows) => set({ flows }),
  setActiveExecution: (execution) => set({ activeExecution: execution }),
}));
