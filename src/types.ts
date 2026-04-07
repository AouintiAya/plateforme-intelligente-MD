export interface Technology {
  name: string;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ProductData {
  title: string; // Internal title for the formation
  concept: string;
  target: string; // Pour qui
  why: string; // Pourquoi
  includes: string; // Ce que le concept inclut
  supports: string;
  format: string; // bootcamp / formation certifiante / formation diplômante
  duration: string;
  references: string;
  differentiation: string; // Différenciation Netinfo et DALL
  ecosystem: string; // Positionnement dans l’écosystème
  region: string; // Manual
  certifications: string; // Labels et certifications - Manual
  price: string; // Manual
  technologiesList?: Technology[];
}

export interface EfficiencyScores {
  title: number;
  concept: number;
  target: number;
  why: number;
  includes: number;
  supports: number;
  format: number;
  duration: number;
  references: number;
  differentiation: number;
  ecosystem: number;
}

export interface AnalysisAgentOutput {
  diagnostic: string;
  strengths: string[];
  weaknesses: string[];
  hypotheses: string[];
  risks: string[];
  questions: string[];
  efficiency: EfficiencyScores;
}

export interface Competitor {
  name: string;
  strengths: string[];
  weaknesses: string[];
  priceRange: string;
  url?: string;
}

export interface SearchAgentOutput {
  results: string;
  benchmarks: { name: string; price: string; source: string }[];
  competitors: Competitor[];
  competitiveness: string;
  trends: string[];
  opportunities: string[];
  threats: string[];
  groundingChunks?: { web: { uri: string; title: string } }[];
}

export interface CreationAgentOutput {
  correctedFiche: ProductData;
  marketingRecommendations: string[];
  contentConcepts: { type: string; description: string }[];
  campaignAdvice: string[];
}

export interface ValidationAgentOutput {
  decision: 'VALIDATED' | 'UPDATE_REQUIRED' | 'REFUSED';
  justification: string;
  finalFiche: ProductData;
  validatedRecommendations: string[];
}

export interface MarketingAgentOutput {
  socialMonitoring: {
    platform: string;
    latestPosts: { 
      author: string; 
      content: string; 
      date: string; 
      engagement: { likes: number; shares: number; comments: number };
      url: string;
      sentimentScore: number; // 0-100
    }[];
  }[];
  sentimentAnalysis: {
    overall: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    studentFeedback: string[];
    proFeedback: string[];
    score: number; // 0-100 (weighted average of posts)
    justification: string;
  };
  newsAndTrends: {
    title: string;
    description: string;
    source: string;
    url: string;
    sentimentScore: number;
  }[];
  contentRecommendations: {
    title: string;
    description: string;
    format: 'VIDEO' | 'POST' | 'ARTICLE' | 'WEBINAR';
    inspiredBySources: string[]; // List of URLs or titles from posts/trends
  }[];
}

export type AppMode = 'VALIDATION' | 'INTELLIGENCE';

export interface WorkflowState {
  id?: string;
  formationId?: string;
  mode: AppMode;
  step: 'INPUT' | 'ANALYSIS' | 'SEARCH' | 'CREATION' | 'VALIDATION' | 'MARKETING' | 'FINAL';
  productData: ProductData;
  intelligenceQuery?: string;
  analysis?: AnalysisAgentOutput;
  analysisId?: string;
  search?: SearchAgentOutput;
  creation?: CreationAgentOutput;
  validation?: ValidationAgentOutput;
  marketing?: MarketingAgentOutput;
  error?: string;
}
