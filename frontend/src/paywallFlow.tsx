import { createContext, useContext, useState, ReactNode } from "react";

export type MotivationAnswers = {
  why_now: string;
  biggest_obstacle: string;
  cost_of_inaction: string;
  deep_goal: string;
  determination: number; // 1..10
};

export const EMPTY_ANSWERS: MotivationAnswers = {
  why_now: "",
  biggest_obstacle: "",
  cost_of_inaction: "",
  deep_goal: "",
  determination: 7,
};

type PaywallFlowCtx = {
  answers: MotivationAnswers;
  setAnswers: (a: MotivationAnswers) => void;
};

const PaywallFlowContext = createContext<PaywallFlowCtx | undefined>(undefined);

export function PaywallFlowProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<MotivationAnswers>(EMPTY_ANSWERS);
  return (
    <PaywallFlowContext.Provider value={{ answers, setAnswers }}>
      {children}
    </PaywallFlowContext.Provider>
  );
}

export function usePaywallFlow() {
  const ctx = useContext(PaywallFlowContext);
  if (!ctx) throw new Error("usePaywallFlow must be inside PaywallFlowProvider");
  return ctx;
}
