import React, { createContext, useContext, useReducer } from "react";
import type { Project, Plan, Task, Message, AgentProfile, Repository, WsEvent } from "../types";

interface AppState {
  projects: Project[];
  currentProject: Project | null;
  repositories: Repository[];
  plan: Plan | null;
  tasks: Task[];
  messages: Message[];
  agentProfiles: AgentProfile[];
  streamingToken: string;
  isStreaming: boolean;
}

type Action =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SET_CURRENT_PROJECT"; project: Project }
  | { type: "SET_REPOSITORIES"; repositories: Repository[] }
  | { type: "ADD_REPOSITORY"; repository: Repository }
  | { type: "REMOVE_REPOSITORY"; id: string }
  | { type: "SET_PLAN"; plan: Plan }
  | { type: "SET_TASKS"; tasks: Task[] }
  | { type: "UPDATE_TASK"; task_id: string; update: Partial<Task> }
  | { type: "SET_MESSAGES"; messages: Message[] }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "SET_AGENT_PROFILES"; profiles: AgentProfile[] }
  | { type: "APPEND_TOKEN"; token: string }
  | { type: "COMMIT_STREAMING_MESSAGE" }
  | { type: "WS_EVENT"; event: WsEvent };

const initialState: AppState = {
  projects: [],
  currentProject: null,
  repositories: [],
  plan: null,
  tasks: [],
  messages: [],
  agentProfiles: [],
  streamingToken: "",
  isStreaming: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PROJECTS":
      return { ...state, projects: action.projects };
    case "SET_CURRENT_PROJECT":
      return { ...state, currentProject: action.project };
    case "SET_REPOSITORIES":
      return { ...state, repositories: action.repositories };
    case "ADD_REPOSITORY":
      return { ...state, repositories: [...state.repositories, action.repository] };
    case "REMOVE_REPOSITORY":
      return { ...state, repositories: state.repositories.filter((r) => r.id !== action.id) };
    case "SET_PLAN":
      return { ...state, plan: action.plan };
    case "SET_TASKS":
      return { ...state, tasks: action.tasks };
    case "UPDATE_TASK":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.task_id ? { ...t, ...action.update } : t
        ),
      };
    case "SET_MESSAGES":
      return { ...state, messages: action.messages };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_AGENT_PROFILES":
      return { ...state, agentProfiles: action.profiles };
    case "APPEND_TOKEN":
      return { ...state, streamingToken: state.streamingToken + action.token, isStreaming: true };
    case "COMMIT_STREAMING_MESSAGE":
      if (!state.streamingToken) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `stream-${Date.now()}`,
            project_id: state.currentProject?.id ?? "",
            role: "assistant",
            content: state.streamingToken,
            created_at: new Date().toISOString(),
          },
        ],
        streamingToken: "",
        isStreaming: false,
      };
    case "WS_EVENT": {
      const ev = action.event;
      if (ev.type === "chat_token") {
        return { ...state, streamingToken: state.streamingToken + ev.content, isStreaming: true };
      }
      if (ev.type === "plan_draft") {
        return { ...state, plan: ev.plan };
      }
      if (ev.type === "task_status") {
        return {
          ...state,
          tasks: state.tasks.map((t) =>
            t.id === ev.task_id ? { ...t, status: ev.status } : t
          ),
        };
      }
      return state;
    }
    default:
      return state;
  }
}

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<React.Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export const useAppState = () => useContext(AppStateContext);
export const useAppDispatch = () => useContext(AppDispatchContext);
