export type RiskLevel = 'safe' | 'suspicious' | 'high';

export interface RiskResult {
  risk: RiskLevel;
  score: number;
  reasons: string[];
}

export interface ChatMessage {
  role: 'bot' | 'user';
  text: string;
}

export interface QuizQuestion {
  q: string;
  opts: string[];
  a: number;
  why: string;
}

export interface ScamAlert {
  title: string;
  text: string;
  level: 'High' | 'Medium';
}

export interface Testimonial {
  name: string;
  text: string;
}

export interface ForumTopic {
  t: string;
  r: number;
}

export interface KpiStat {
  label: string;
  value: string;
  delta: string;
  icon: string;
}

export interface TrendDataPoint {
  year: string;
  reported: number;
  prevented: number;
}

export interface ScamTypeSlice {
  name: string;
  value: number;
  color: string;
}
