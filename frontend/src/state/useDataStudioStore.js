import { create } from 'zustand'

/**
 * Enterprise global state foundation.
 * This store decouples UI modules from AI and data orchestration state.
 */
export const useDataStudioStore = create((set) => ({
  ai: {
    runtime: 'idle',
    lastRoute: null,
    lastModel: null,
    lastError: null,
  },
  datasets: {
    active: [],
    semanticProfileByTable: {},
    relationshipGraph: [],
  },
  memory: {
    recentPrompts: [],
    recentQueries: [],
    pinnedInsights: [],
  },

  setAiRuntime: (runtime) => set((state) => ({
    ai: { ...state.ai, runtime },
  })),

  setAiRoute: ({ route, model }) => set((state) => ({
    ai: {
      ...state.ai,
      lastRoute: route || null,
      lastModel: model || null,
      lastError: null,
    },
  })),

  setAiError: (message) => set((state) => ({
    ai: {
      ...state.ai,
      lastError: message || 'Unknown AI error',
      runtime: 'error',
    },
  })),

  setActiveDatasets: (tables) => set((state) => ({
    datasets: {
      ...state.datasets,
      active: tables || [],
    },
  })),

  setSemanticProfile: (tableName, profile) => set((state) => ({
    datasets: {
      ...state.datasets,
      semanticProfileByTable: {
        ...state.datasets.semanticProfileByTable,
        [tableName]: profile,
      },
    },
  })),

  setRelationshipGraph: (edges) => set((state) => ({
    datasets: {
      ...state.datasets,
      relationshipGraph: Array.isArray(edges) ? edges : [],
    },
  })),

  pushPromptMemory: (prompt) => set((state) => {
    const next = [prompt, ...state.memory.recentPrompts.filter((p) => p !== prompt)].slice(0, 30)
    return { memory: { ...state.memory, recentPrompts: next } }
  }),

  pushQueryMemory: (sql) => set((state) => {
    const next = [sql, ...state.memory.recentQueries.filter((q) => q !== sql)].slice(0, 50)
    return { memory: { ...state.memory, recentQueries: next } }
  }),

  pinInsight: (insight) => set((state) => ({
    memory: {
      ...state.memory,
      pinnedInsights: [insight, ...state.memory.pinnedInsights].slice(0, 20),
    },
  })),
}))
